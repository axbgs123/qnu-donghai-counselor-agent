import {
  getExternalKey,
  importDefinitions,
  normalizeImportRow,
  validateImportRow,
  type ImportRecordType,
} from "../../../lib/import-definitions";
import { ensureImportSchema, getImportJob, getStagingRows, markImportCommitted, snapshotImportRecordVersions } from "../../../lib/import-storage";
import { createAllStudentAccounts, getAuthAccountFromRequest } from "../../../lib/auth-storage";
import { ensureTeacherClass } from "../../../lib/class-storage";

type CommitBody = {
  jobId?: string;
  sheetName?: string;
  recordType?: ImportRecordType;
  mapping?: Record<string, string>;
};

function titleFor(type: ImportRecordType, row: Record<string, string>) {
  return row.title || row.activityName || row.project || row.course || row.company || row.name || importDefinitions[type].label;
}

function occurredAtFor(row: Record<string, string>) {
  return row.occurredAt || row.happenedAt || row.date || row.awardedAt || row.updatedAt || row.dueAt || row.effectiveAt || null;
}

function studentStatus(value: string) {
  if (/重点|回访|预警/.test(value)) return "follow_up";
  if (/帮扶|就业|升学/.test(value)) return "assisting";
  return "normal";
}

export async function POST(request: Request) {
  try {
    const teacher = await getAuthAccountFromRequest(request);
    if (teacher?.role !== "teacher") return Response.json({ error: "仅教师可保存导入数据" }, { status: 403 });
    const body = await request.json() as CommitBody;
    if (!body.jobId || !body.sheetName || !body.recordType || !body.mapping) return Response.json({ error: "导入参数不完整" }, { status: 400 });
    const definition = importDefinitions[body.recordType];
    if (!definition) return Response.json({ error: "不支持的数据类型" }, { status: 400 });
    const missingMapping = definition.fields.filter((field) => field.required && !body.mapping?.[field.key]);
    if (missingMapping.length) return Response.json({ error: `请先映射必填字段：${missingMapping.map((field) => field.label).join("、")}` }, { status: 422 });
    const job = await getImportJob(body.jobId, teacher.id);
    if (!job) return Response.json({ error: "导入任务不存在或已过期" }, { status: 404 });
    const staging = await getStagingRows(body.jobId, body.sheetName);
    if (!staging.length) return Response.json({ error: "所选工作表没有可导入数据" }, { status: 404 });

    const seen = new Set<string>();
    const valid: Array<{ rowNumber: number; key: string; row: Record<string, string> }> = [];
    const errors: Array<{ rowNumber: number; messages: string[] }> = [];
    for (const staged of staging) {
      const raw = JSON.parse(staged.raw_json) as Record<string, unknown>;
      const row = normalizeImportRow(body.recordType, raw, body.mapping);
      const rowErrors = validateImportRow(body.recordType, row);
      const key = getExternalKey(body.recordType, row);
      if (key && seen.has(key)) rowErrors.push({ field: "_row", message: "文件内存在重复记录" });
      if (key) seen.add(key);
      if (rowErrors.length) errors.push({ rowNumber: staged.row_number, messages: rowErrors.map((item) => item.message) });
      else valid.push({ rowNumber: staged.row_number, key: body.recordType === "students" ? key : `${teacher.id}:${key}`, row });
    }
    if (!valid.length) return Response.json({ error: "没有通过校验的数据行", errors: errors.slice(0, 200) }, { status: 422 });

    const db = await ensureImportSchema();
    const existing = new Set<string>();
    for (let offset = 0; offset < valid.length; offset += 70) {
      const keys = valid.slice(offset, offset + 70).map((item) => item.key);
      const placeholders = keys.map(() => "?").join(",");
      const result = await db.prepare(`SELECT external_key FROM import_records WHERE record_type = ? AND external_key IN (${placeholders})`)
        .bind(body.recordType, ...keys).all<{ external_key: string }>();
      result.results.forEach((item) => existing.add(item.external_key));
    }
    await snapshotImportRecordVersions(body.recordType, valid.map((item) => item.key), body.jobId);

    for (let offset = 0; offset < valid.length; offset += 50) {
      const chunk = valid.slice(offset, offset + 50);
      const statements = chunk.map(({ rowNumber, key, row }) => db.prepare(`INSERT INTO import_records
        (record_type, external_key, student_no, student_name, title, class_name, occurred_at, payload_json, source_job_id, source_sheet, source_row, review_status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'verified')
        ON CONFLICT(record_type, external_key) DO UPDATE SET
          student_no = excluded.student_no,
          student_name = excluded.student_name,
          title = excluded.title,
          class_name = excluded.class_name,
          occurred_at = excluded.occurred_at,
          payload_json = excluded.payload_json,
          source_job_id = excluded.source_job_id,
          source_sheet = excluded.source_sheet,
          source_row = excluded.source_row,
          review_status = 'verified',
          updated_at = CURRENT_TIMESTAMP`)
        .bind(body.recordType, key, row.studentNo || null, row.name || null, titleFor(body.recordType!, row), row.className || null, occurredAtFor(row), JSON.stringify(row), body.jobId, body.sheetName, rowNumber));
      await db.batch(statements);
    }

    let accountCreation: Awaited<ReturnType<typeof createAllStudentAccounts>> | null = null;
    if (body.recordType === "students") {
      for (let offset = 0; offset < valid.length; offset += 70) {
        await db.batch(valid.slice(offset, offset + 70).map(({ row }) => db.prepare("DELETE FROM student_archive_blocks WHERE student_no = ?").bind(row.studentNo)));
      }
      for (let offset = 0; offset < valid.length; offset += 50) {
        const chunk = valid.slice(offset, offset + 50);
        await db.batch(chunk.map(({ row }) => db.prepare(`INSERT INTO students
          (id, student_no, name, department, grade, class_name, community, building, room, phone, status, counselor_id)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(student_no) DO UPDATE SET
            name = excluded.name,
            department = excluded.department,
            grade = excluded.grade,
            class_name = excluded.class_name,
            community = excluded.community,
            building = excluded.building,
            room = excluded.room,
            phone = excluded.phone,
            status = excluded.status,
            counselor_id = COALESCE(students.counselor_id, excluded.counselor_id)`)
          .bind(row.studentNo, row.studentNo, row.name, row.department || "待补充", row.grade || (/^20\d{2}/.test(row.studentNo) ? row.studentNo.slice(0, 4) : "待补充"), row.className, row.community || "待补充", row.building || "待补充", row.room || "待补充", row.phone || null, studentStatus(row.status), teacher.id)));
      }
      for (const item of new Map(valid.map(({ row }) => [row.className, row])).values()) {
        await ensureTeacherClass(teacher.id, { name: item.className, grade: item.grade, department: item.department });
      }
      accountCreation = await createAllStudentAccounts(teacher.id);
    }

    await markImportCommitted(body.jobId);
    const updated = valid.filter((item) => existing.has(item.key)).length;
    return Response.json({
      result: {
        jobId: body.jobId, sheetName: body.sheetName, recordType: body.recordType,
        total: staging.length, inserted: valid.length - updated, updated, skipped: errors.length,
        errors: errors.slice(0, 200), errorReportTruncated: errors.length > 200,
        accounts: accountCreation ? {
          created: accountCreation.created,
          skipped: accountCreation.skipped,
          failed: accountCreation.failed,
        } : undefined,
      },
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "保存导入数据失败" }, { status: 500 });
  }
}
