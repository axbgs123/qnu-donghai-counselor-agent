import { importDefinitions, type ImportRecordType } from "../../../lib/import-definitions";

export async function GET(request: Request) {
  const type = new URL(request.url).searchParams.get("type") as ImportRecordType | null;
  const definition = type ? importDefinitions[type] : null;
  if (!definition) return Response.json({ error: "unknown template type" }, { status: 400 });
  const header = definition.fields.map((field) => field.label).join(",");
  const content = `\uFEFF${header}\n`;
  return new Response(content, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(`${definition.label}导入模板.csv`)}` } });
}
