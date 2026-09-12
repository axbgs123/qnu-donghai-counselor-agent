import { detectImportType, importDefinitions, type ImportRecordType } from "../../../lib/import-definitions";
import { createImportJob } from "../../../lib/import-storage";
import { getAuthAccountFromRequest } from "../../../lib/auth-storage";

const MAX_FILE_SIZE = 20 * 1024 * 1024;
const MAX_ROWS = 10_000;

function cleanCell(value: unknown) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (value === null || value === undefined) return "";
  return typeof value === "object" ? JSON.stringify(value) : String(value).trim();
}

function uniqueHeaders(row: unknown[]) {
  const counts = new Map<string, number>();
  return row.map((value, index) => {
    const base = cleanCell(value) || `未命名列${index + 1}`;
    const count = (counts.get(base) ?? 0) + 1;
    counts.set(base, count);
    return count === 1 ? base : `${base}_${count}`;
  });
}

function findHeaderIndex(rows: unknown[][], fileName: string) {
  const candidates = rows.slice(0, 12).map((row, index) => {
    const headers = uniqueHeaders(row);
    const nonEmpty = headers.filter((header) => !header.startsWith("未命名列")).length;
    const detected = detectImportType(headers, fileName);
    return { index, score: nonEmpty + detected.confidence * 24 + detected.requiredMatched * 3 };
  });
  return candidates.sort((a, b) => b.score - a.score)[0]?.index ?? 0;
}

function rowsToObjects(rows: unknown[][], fileName: string) {
  const headerIndex = findHeaderIndex(rows, fileName);
  const headers = uniqueHeaders(rows[headerIndex] ?? []);
  const objects = rows.slice(headerIndex + 1).map((row, index) => ({
    rowNumber: headerIndex + index + 2,
    raw: Object.fromEntries(headers.map((header, columnIndex) => [header, cleanCell(row[columnIndex])])),
  })).filter(({ raw }) => Object.values(raw).some((value) => value !== ""));
  return { headerIndex: headerIndex + 1, headers, objects };
}

function parseJson(bytes: ArrayBuffer) {
  const text = new TextDecoder("utf-8").decode(bytes);
  const parsed = JSON.parse(text) as unknown;
  const array = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === "object"
      ? Object.values(parsed as Record<string, unknown>).find(Array.isArray) ?? [parsed]
      : [];
  const objects = array.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item));
  const headers = [...new Set(objects.flatMap((item) => Object.keys(item)))];
  return [{ name: "JSON数据", headerIndex: 1, headers, objects: objects.map((raw, index) => ({ rowNumber: index + 1, raw: Object.fromEntries(headers.map((header) => [header, cleanCell(raw[header])])) })) }];
}

function decodeDelimited(bytes: ArrayBuffer) {
  const utf8 = new TextDecoder("utf-8").decode(bytes);
  if (!utf8.includes("�")) return utf8;
  try { return new TextDecoder("gb18030").decode(bytes); } catch { return utf8; }
}

async function parseWorkbook(file: File, bytes: ArrayBuffer) {
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (extension === "json") return parseJson(bytes);
  const XLSX = await import("xlsx");
  const workbook = extension === "csv" || extension === "tsv" || extension === "txt"
    ? XLSX.read(decodeDelimited(bytes), { type: "string", cellDates: true })
    : XLSX.read(bytes, { type: "array", cellDates: true });
  return workbook.SheetNames.map((name) => {
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[name], { header: 1, defval: "", raw: false });
    return { name, ...rowsToObjects(matrix, file.name) };
  }).filter((sheet) => sheet.objects.length || sheet.headers.length);
}

export async function POST(request: Request) {
  try {
    const teacher = await getAuthAccountFromRequest(request);
    if (teacher?.role !== "teacher") return Response.json({ error: "仅教师可导入资料" }, { status: 403 });
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return Response.json({ error: "请选择需要导入的文件" }, { status: 400 });
    if (!file.size) return Response.json({ error: "文件内容为空" }, { status: 400 });
    if (file.size > MAX_FILE_SIZE) return Response.json({ error: "单个文件不能超过20MB" }, { status: 413 });
    const extension = file.name.split(".").pop()?.toLowerCase();
    if (!extension || !["xlsx", "xls", "csv", "tsv", "txt", "json"].includes(extension)) {
      return Response.json({ error: "当前支持 Excel、CSV、TSV、TXT 和 JSON 结构化文件" }, { status: 415 });
    }
    const bytes = await file.arrayBuffer();
    const sheets = await parseWorkbook(file, bytes);
    const totalRows = sheets.reduce((sum, sheet) => sum + sheet.objects.length, 0);
    if (!totalRows) return Response.json({ error: "没有识别到可导入的数据行" }, { status: 422 });
    if (totalRows > MAX_ROWS) return Response.json({ error: `单次最多导入 ${MAX_ROWS} 行，请拆分文件后重试` }, { status: 413 });
    const jobId = crypto.randomUUID();
    await createImportJob({
      id: jobId, ownerTeacherId: teacher.id, file, storageKey: null, sheetCount: sheets.length,
      rows: sheets.flatMap((sheet) => sheet.objects.map((row) => ({ sheetName: sheet.name, rowNumber: row.rowNumber, raw: row.raw }))),
    });
    return Response.json({
      job: { id: jobId, fileName: file.name, fileSize: file.size, totalRows, sheetCount: sheets.length, rawFileStored: false },
      sheets: sheets.map((sheet) => {
        const detected = detectImportType(sheet.headers, file.name);
        const definition = importDefinitions[detected.type as ImportRecordType];
        const missingRequired = definition.fields.filter((field) => field.required && !detected.mapping[field.key]).map((field) => field.label);
        return {
          name: sheet.name, headerRow: sheet.headerIndex, rowCount: sheet.objects.length, headers: sheet.headers,
          detectedType: detected.type, confidence: detected.confidence, mapping: detected.mapping,
          fields: definition.fields, missingRequired, preview: sheet.objects.slice(0, 8).map((row) => ({ rowNumber: row.rowNumber, values: row.raw })),
        };
      }),
      definitions: Object.values(importDefinitions).map(({ type, label, description, icon, fields }) => ({ type, label, description, icon, fields })),
    }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? `文件解析失败：${error.message}` : "文件解析失败" }, { status: 400 });
  }
}
