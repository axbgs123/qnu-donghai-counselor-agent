import { env } from "cloudflare:workers";
import type { AssistantCard, CapabilityResult } from "./assistant-capabilities";
import { importDefinitions, type ImportRecordType } from "./import-definitions";
import { deleteKnowledgeVectors, indexKnowledgeDocument, searchKnowledgeVectors, type KnowledgeAccess } from "./knowledge-vector";
import { welcomeArticles, welcomeArticleToKnowledgeText } from "./welcome-content";

type ImportEnv = { DB?: D1Database; FILES?: R2Bucket };

export type MaterialAnalysis = {
  title: string;
  category: string;
  documentType: "chat" | "notice" | "policy" | "student_material" | "meeting" | "form" | "report" | "other";
  summary: string;
  extractedText: string;
  people: string[];
  studentNos: string[];
  studentRecords: Array<{
    studentNo: string;
    name: string;
    className: string;
    department: string;
    grade: string;
    gender: string;
    phone: string;
    status: string;
    tags: string;
  }>;
  dates: Array<{ date: string; event: string }>;
  tasks: Array<{ title: string; owner: string; dueAt: string; relatedPeople: string[] }>;
  tags: string[];
  confidence: number;
  processingMethod: string;
  needsReview: boolean;
};

export type KnowledgeVisibility = "global" | "teacher_private";

export function classifyKnowledgeVisibility(analysis: MaterialAnalysis, fileName = "") {
  const text = `${fileName}\n${analysis.title}\n${analysis.category}\n${analysis.summary}\n${analysis.extractedText.slice(0, 12_000)}`;
  const privateSignals = [
    analysis.studentNos.length > 0,
    analysis.studentRecords.length > 0,
    analysis.documentType === "chat" || analysis.documentType === "student_material",
    /学生名单|学号|手机号|身份证|成绩|考勤|旷课|请假|谈心|谈话|家长|心理|个案|宿舍|班级通讯录|化工[12]班/.test(text),
  ];
  if (privateSignals.some(Boolean)) return { visibility: "teacher_private" as const, reason: "包含学生、班级或内部工作信息，建议仅上传教师使用" };
  const commonSignals = analysis.documentType === "policy" || analysis.documentType === "notice" || analysis.documentType === "form"
    || /学校|学院|规定|办法|通知|指南|流程|政策|办事|学籍|奖助|报到|军训|校历|就业/.test(text);
  if (commonSignals) return { visibility: "global" as const, reason: "属于制度、通知或通用办事资料，可供其他教师和学生问答" };
  return { visibility: "teacher_private" as const, reason: "未能确认是普遍适用资料，默认仅上传教师使用" };
}

export type StoredSourceDocument = {
  id: string;
  job_id: string;
  file_name: string;
  mime_type: string;
  extension: string;
  storage_key: string | null;
  owner_teacher_id: string | null;
  visibility: KnowledgeVisibility;
  visibility_reason: string | null;
  document_type: MaterialAnalysis["documentType"];
  title: string;
  category: string;
  summary: string;
  extracted_text: string;
  people_json: string;
  student_nos_json: string;
  dates_json: string;
  tasks_json: string;
  tags_json: string;
  processing_method: string;
  confidence: number;
  review_status: string;
  created_at: string;
  updated_at: string;
};

export type StoredImportJob = {
  id: string;
  file_name: string;
  file_size: number;
  mime_type: string;
  status: string;
  total_rows: number;
  sheet_count: number;
  created_at: string;
  committed_at: string | null;
  owner_teacher_id: string | null;
};

export type StoredStagingRow = {
  id: number;
  job_id: string;
  sheet_name: string;
  row_number: number;
  raw_json: string;
};

export type StoredImportRecord = {
  id: number;
  record_type: ImportRecordType;
  external_key: string;
  student_no: string | null;
  student_name: string | null;
  title: string | null;
  class_name: string | null;
  occurred_at: string | null;
  payload_json: string;
  review_status: string;
  updated_at: string;
};

function getImportEnv() {
  return env as unknown as ImportEnv;
}

export function getImportDb() {
  const db = getImportEnv().DB;
  if (!db) throw new Error("导入数据库暂不可用");
  return db;
}

export async function ensureImportSchema() {
  const db = getImportDb();
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS import_jobs (
      id TEXT PRIMARY KEY,
      owner_teacher_id TEXT,
      file_name TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      mime_type TEXT NOT NULL,
      storage_key TEXT,
      status TEXT NOT NULL DEFAULT 'analyzed',
      total_rows INTEGER NOT NULL DEFAULT 0,
      sheet_count INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      committed_at TEXT
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS import_staging_rows (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id TEXT NOT NULL,
      sheet_name TEXT NOT NULL,
      row_number INTEGER NOT NULL,
      raw_json TEXT NOT NULL,
      FOREIGN KEY (job_id) REFERENCES import_jobs(id)
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS import_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      record_type TEXT NOT NULL,
      external_key TEXT NOT NULL,
      student_no TEXT,
      student_name TEXT,
      title TEXT,
      class_name TEXT,
      occurred_at TEXT,
      payload_json TEXT NOT NULL,
      source_job_id TEXT NOT NULL,
      source_sheet TEXT NOT NULL,
      source_row INTEGER NOT NULL,
      review_status TEXT NOT NULL DEFAULT 'verified',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(record_type, external_key)
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS import_record_versions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      record_type TEXT NOT NULL,
      external_key TEXT NOT NULL,
      student_no TEXT,
      student_name TEXT,
      title TEXT,
      class_name TEXT,
      occurred_at TEXT,
      payload_json TEXT NOT NULL,
      source_job_id TEXT NOT NULL,
      source_sheet TEXT NOT NULL,
      source_row INTEGER NOT NULL,
      review_status TEXT NOT NULL,
      captured_by_job_id TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_import_jobs_created ON import_jobs(created_at)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_import_staging_job_sheet ON import_staging_rows(job_id, sheet_name, row_number)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_import_records_type_student ON import_records(record_type, student_no)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_import_records_student_name ON import_records(student_name)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_import_versions_key ON import_record_versions(record_type, external_key, id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_import_versions_jobs ON import_record_versions(source_job_id, captured_by_job_id)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS students (
      id TEXT PRIMARY KEY,
      student_no TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      department TEXT NOT NULL,
      grade TEXT NOT NULL,
      class_name TEXT NOT NULL,
      community TEXT NOT NULL,
      building TEXT NOT NULL,
      room TEXT NOT NULL,
      phone TEXT,
      status TEXT NOT NULL DEFAULT 'normal',
      counselor_id TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS student_archive_blocks (
      student_no TEXT PRIMARY KEY,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_students_building_room ON students(building, room)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS source_documents (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL UNIQUE,
      owner_teacher_id TEXT,
      visibility TEXT NOT NULL DEFAULT 'teacher_private',
      visibility_reason TEXT,
      file_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      extension TEXT NOT NULL,
      storage_key TEXT,
      document_type TEXT NOT NULL,
      title TEXT NOT NULL,
      category TEXT NOT NULL,
      summary TEXT NOT NULL,
      extracted_text TEXT NOT NULL,
      people_json TEXT NOT NULL DEFAULT '[]',
      student_nos_json TEXT NOT NULL DEFAULT '[]',
      dates_json TEXT NOT NULL DEFAULT '[]',
      tasks_json TEXT NOT NULL DEFAULT '[]',
      tags_json TEXT NOT NULL DEFAULT '[]',
      processing_method TEXT NOT NULL,
      confidence REAL NOT NULL DEFAULT 0,
      review_status TEXT NOT NULL DEFAULT 'verified',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (job_id) REFERENCES import_jobs(id)
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS document_chunks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      document_id TEXT NOT NULL,
      chunk_index INTEGER NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (document_id) REFERENCES source_documents(id),
      UNIQUE(document_id, chunk_index)
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS platform_seed_state (
      seed_key TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_source_documents_type_updated ON source_documents(document_type, updated_at)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_source_documents_title ON source_documents(title)"),
    db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_document_chunks_document_index ON document_chunks(document_id, chunk_index)"),
  ]);
  const jobColumns = await db.prepare("PRAGMA table_info(import_jobs)").all<{ name: string }>();
  if (!jobColumns.results.some((column) => column.name === "owner_teacher_id")) await db.prepare("ALTER TABLE import_jobs ADD COLUMN owner_teacher_id TEXT").run();
  const documentColumns = await db.prepare("PRAGMA table_info(source_documents)").all<{ name: string }>();
  if (!documentColumns.results.some((column) => column.name === "owner_teacher_id")) await db.prepare("ALTER TABLE source_documents ADD COLUMN owner_teacher_id TEXT").run();
  if (!documentColumns.results.some((column) => column.name === "visibility")) await db.prepare("ALTER TABLE source_documents ADD COLUMN visibility TEXT NOT NULL DEFAULT 'teacher_private'").run();
  if (!documentColumns.results.some((column) => column.name === "visibility_reason")) await db.prepare("ALTER TABLE source_documents ADD COLUMN visibility_reason TEXT").run();
  await db.batch([
    db.prepare("CREATE INDEX IF NOT EXISTS idx_import_jobs_owner_created ON import_jobs(owner_teacher_id, created_at)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_source_documents_access ON source_documents(visibility, owner_teacher_id, updated_at)"),
  ]);
  await db.prepare(`UPDATE source_documents SET owner_teacher_id = (
    SELECT owner_teacher_id FROM import_jobs WHERE import_jobs.id = source_documents.job_id
  ) WHERE owner_teacher_id IS NULL`).run();
  await seedBuiltInWelcomeKnowledge(db);
  return db;
}

export async function getRawImportFile(key: string) {
  return getImportEnv().FILES?.get(key) ?? null;
}

export async function createImportJob(input: {
  id: string;
  ownerTeacherId: string;
  file: Pick<File, "name" | "size" | "type">;
  storageKey: string | null;
  rows: Array<{ sheetName: string; rowNumber: number; raw: Record<string, unknown> }>;
  sheetCount: number;
}) {
  const db = await ensureImportSchema();
  await db.prepare("INSERT INTO import_jobs (id, owner_teacher_id, file_name, file_size, mime_type, storage_key, total_rows, sheet_count) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(input.id, input.ownerTeacherId, input.file.name, input.file.size, input.file.type || "application/octet-stream", input.storageKey, input.rows.length, input.sheetCount).run();
  for (let offset = 0; offset < input.rows.length; offset += 75) {
    const chunk = input.rows.slice(offset, offset + 75);
    await db.batch(chunk.map((row) => db.prepare("INSERT INTO import_staging_rows (job_id, sheet_name, row_number, raw_json) VALUES (?, ?, ?, ?)")
      .bind(input.id, row.sheetName, row.rowNumber, JSON.stringify(row.raw))));
  }
}

export async function listImportJobs(limit = 12, ownerTeacherId?: string) {
  const db = await ensureImportSchema();
  const result = ownerTeacherId
    ? await db.prepare("SELECT id, owner_teacher_id, file_name, file_size, mime_type, status, total_rows, sheet_count, created_at, committed_at FROM import_jobs WHERE owner_teacher_id = ? ORDER BY created_at DESC LIMIT ?").bind(ownerTeacherId, limit).all<StoredImportJob>()
    : { results: [] as StoredImportJob[] };
  return result.results;
}

export async function getImportJob(jobId: string, ownerTeacherId?: string) {
  const db = await ensureImportSchema();
  return ownerTeacherId
    ? db.prepare("SELECT id, owner_teacher_id, file_name, file_size, mime_type, status, total_rows, sheet_count, created_at, committed_at FROM import_jobs WHERE id = ? AND owner_teacher_id = ?").bind(jobId, ownerTeacherId).first<StoredImportJob>()
    : db.prepare("SELECT id, owner_teacher_id, file_name, file_size, mime_type, status, total_rows, sheet_count, created_at, committed_at FROM import_jobs WHERE id = ?").bind(jobId).first<StoredImportJob>();
}

export async function getStagingRows(jobId: string, sheetName: string) {
  const db = await ensureImportSchema();
  const result = await db.prepare("SELECT id, job_id, sheet_name, row_number, raw_json FROM import_staging_rows WHERE job_id = ? AND sheet_name = ? ORDER BY row_number")
    .bind(jobId, sheetName).all<StoredStagingRow>();
  return result.results;
}

export async function markImportCommitted(jobId: string) {
  const db = await ensureImportSchema();
  await db.prepare("UPDATE import_jobs SET status = 'committed', committed_at = CURRENT_TIMESTAMP WHERE id = ?").bind(jobId).run();
}

export async function deleteImportJob(jobId: string, ownerTeacherId?: string) {
  const db = await ensureImportSchema();
  const job = ownerTeacherId
    ? await db.prepare("SELECT id, storage_key, owner_teacher_id FROM import_jobs WHERE id = ? AND owner_teacher_id = ?").bind(jobId, ownerTeacherId).first<{ id: string; storage_key: string | null; owner_teacher_id: string | null }>()
    : await db.prepare("SELECT id, storage_key, owner_teacher_id FROM import_jobs WHERE id = ?").bind(jobId).first<{ id: string; storage_key: string | null; owner_teacher_id: string | null }>();
  if (!job) return false;
  const documents = await db.prepare("SELECT id FROM source_documents WHERE job_id = ?").bind(jobId).all<{ id: string }>();
  const currentRecords = await db.prepare("SELECT * FROM import_records WHERE source_job_id = ?").bind(jobId).all<StoredImportRecord & { source_job_id: string; source_sheet: string; source_row: number }>();
  for (const document of documents.results) {
    await deleteKnowledgeVectors(document.id);
    await db.prepare("DELETE FROM document_chunks WHERE document_id = ?").bind(document.id).run();
  }
  for (const record of currentRecords.results) {
    const previous = await db.prepare(`SELECT v.*, j.owner_teacher_id FROM import_record_versions v
      JOIN import_jobs j ON j.id = v.source_job_id
      WHERE v.record_type = ? AND v.external_key = ? AND v.source_job_id != ?
      ORDER BY v.id DESC LIMIT 1`).bind(record.record_type, record.external_key, jobId).first<StoredImportRecord & { source_job_id: string; source_sheet: string; source_row: number }>();
    if (previous) {
      await db.prepare(`UPDATE import_records SET student_no = ?, student_name = ?, title = ?, class_name = ?, occurred_at = ?,
        payload_json = ?, source_job_id = ?, source_sheet = ?, source_row = ?, review_status = ?, updated_at = CURRENT_TIMESTAMP
        WHERE record_type = ? AND external_key = ?`)
        .bind(previous.student_no, previous.student_name, previous.title, previous.class_name, previous.occurred_at, previous.payload_json,
          previous.source_job_id, previous.source_sheet, previous.source_row, previous.review_status, record.record_type, record.external_key).run();
      if (record.record_type === "students" && previous.student_no) await restoreStudentFromPayload(db, previous.student_no, previous.payload_json, (previous as typeof previous & { owner_teacher_id?: string }).owner_teacher_id || null);
    } else {
      await db.prepare("DELETE FROM import_records WHERE id = ?").bind(record.id).run();
      if (record.record_type === "students" && record.student_no) await db.prepare("DELETE FROM students WHERE student_no = ? AND counselor_id = ?").bind(record.student_no, job.owner_teacher_id).run();
    }
  }
  await db.batch([
    db.prepare("DELETE FROM source_documents WHERE job_id = ?").bind(jobId),
    db.prepare("DELETE FROM import_staging_rows WHERE job_id = ?").bind(jobId),
    db.prepare("DELETE FROM import_record_versions WHERE source_job_id = ? OR captured_by_job_id = ?").bind(jobId, jobId),
    db.prepare("DELETE FROM import_jobs WHERE id = ?").bind(jobId),
  ]);
  if (job.storage_key) await getImportEnv().FILES?.delete(job.storage_key);
  return true;
}

async function restoreStudentFromPayload(db: D1Database, studentNo: string, payloadJson: string, teacherId: string | null) {
  const row = JSON.parse(payloadJson) as Record<string, string>;
  await db.prepare(`INSERT INTO students (id, student_no, name, department, grade, class_name, community, building, room, phone, status, counselor_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(student_no) DO UPDATE SET name = excluded.name, department = excluded.department, grade = excluded.grade,
      class_name = excluded.class_name, community = excluded.community, building = excluded.building, room = excluded.room,
      phone = excluded.phone, status = excluded.status, counselor_id = COALESCE(excluded.counselor_id, students.counselor_id)`)
    .bind(studentNo, studentNo, row.name || "未命名学生", row.department || "待补充", row.grade || studentNo.slice(0, 4), row.className || "待补充",
      row.community || "待补充", row.building || "待补充", row.room || "待补充", row.phone || null, displayStudentStatus(row.status || "正常"), teacherId).run();
}

export async function snapshotImportRecordVersions(recordType: ImportRecordType, keys: string[], capturedByJobId: string) {
  if (!keys.length) return;
  const db = await ensureImportSchema();
  for (let offset = 0; offset < keys.length; offset += 60) {
    const chunk = keys.slice(offset, offset + 60);
    const placeholders = chunk.map(() => "?").join(",");
    await db.prepare(`INSERT INTO import_record_versions
      (record_type, external_key, student_no, student_name, title, class_name, occurred_at, payload_json, source_job_id,
       source_sheet, source_row, review_status, captured_by_job_id)
      SELECT record_type, external_key, student_no, student_name, title, class_name, occurred_at, payload_json, source_job_id,
       source_sheet, source_row, review_status, ? FROM import_records
      WHERE record_type = ? AND external_key IN (${placeholders}) AND source_job_id != ?`)
      .bind(capturedByJobId, recordType, ...chunk, capturedByJobId).run();
  }
}

export async function deleteTeacherStudentProfile(studentNo: string, teacherId: string) {
  const db = await ensureImportSchema();
  const owned = await db.prepare("SELECT id FROM students WHERE student_no = ? AND counselor_id = ? LIMIT 1").bind(studentNo, teacherId).first();
  if (!owned) return false;
  const tableRows = await db.prepare("SELECT name FROM sqlite_schema WHERE type = 'table'").all<{ name: string }>();
  const tables = new Set(tableRows.results.map((row) => row.name));
  const statements = [db.prepare("INSERT OR IGNORE INTO student_archive_blocks (student_no) VALUES (?)").bind(studentNo)];

  // 先删除所有会话与关联数据，最后再删账号及学生主记录，避免外键约束失败。
  if (tables.has("student_sessions")) statements.push(db.prepare("DELETE FROM student_sessions WHERE student_no = ?").bind(studentNo));
  if (tables.has("student_daily_usage")) statements.push(db.prepare("DELETE FROM student_daily_usage WHERE student_no = ?").bind(studentNo));
  if (tables.has("welcome_completions")) statements.push(db.prepare("DELETE FROM welcome_completions WHERE student_no = ?").bind(studentNo));
  if (tables.has("student_requests")) statements.push(db.prepare("DELETE FROM student_requests WHERE student_no = ? AND teacher_id = ?").bind(studentNo, teacherId));
  if (tables.has("student_records")) statements.push(db.prepare("DELETE FROM student_records WHERE student_id = ? AND owner_id = ?").bind(studentNo, teacherId));
  if (tables.has("tasks")) statements.push(db.prepare("DELETE FROM tasks WHERE subject_id = ? AND owner_id = ?").bind(studentNo, teacherId));
  if (tables.has("workflow_cases")) statements.push(db.prepare("DELETE FROM workflow_cases WHERE student_id = ? AND owner_id = ?").bind(studentNo, teacherId));
  if (tables.has("participation_records")) statements.push(db.prepare("DELETE FROM participation_records WHERE student_id = ?").bind(studentNo));
  if (tables.has("app_sessions") && tables.has("app_accounts")) statements.push(
    db.prepare("DELETE FROM app_sessions WHERE account_id IN (SELECT id FROM app_accounts WHERE student_no = ? AND teacher_id = ?)").bind(studentNo, teacherId));
  if (tables.has("app_accounts")) statements.push(
    db.prepare("DELETE FROM app_accounts WHERE student_no = ? AND teacher_id = ? AND role = 'student'").bind(studentNo, teacherId));
  statements.push(
    db.prepare("DELETE FROM import_records WHERE student_no = ?").bind(studentNo),
    db.prepare("DELETE FROM import_record_versions WHERE student_no = ?").bind(studentNo),
    db.prepare("DELETE FROM students WHERE student_no = ? AND counselor_id = ?").bind(studentNo, teacherId),
  );
  if (tables.has("pilot_students")) statements.push(db.prepare("DELETE FROM pilot_students WHERE student_no = ?").bind(studentNo));
  await db.batch(statements);
  return true;
}

export async function saveMaterialStudents(jobId: string, rows: MaterialAnalysis["studentRecords"], teacherId: string) {
  const db = await ensureImportSchema();
  const job = await getImportJob(jobId);
  if (!job) throw new Error("导入任务不存在或已过期");
  const unique = [...new Map(rows
    .map((row) => ({ ...row, studentNo: row.studentNo.trim(), name: row.name.trim(), className: row.className.trim() }))
    .filter((row) => /^[A-Za-z0-9_-]{5,24}$/.test(row.studentNo) && row.name && row.className)
    .map((row) => [row.studentNo, row])).values()];
  if (!unique.length) throw new Error("没有识别到同时包含学号、姓名和班级的学生记录");
  const existing = new Set<string>();
  for (let offset = 0; offset < unique.length; offset += 70) {
    const keys = unique.slice(offset, offset + 70).map((row) => row.studentNo);
    const placeholders = keys.map(() => "?").join(",");
    const found = await db.prepare(`SELECT external_key FROM import_records WHERE record_type = 'students' AND external_key IN (${placeholders})`)
      .bind(...keys).all<{ external_key: string }>();
    found.results.forEach((row) => existing.add(row.external_key));
  }
  await snapshotImportRecordVersions("students", unique.map((row) => row.studentNo), jobId);
  for (let offset = 0; offset < unique.length; offset += 70) {
    await db.batch(unique.slice(offset, offset + 70).map((row) => db.prepare("DELETE FROM student_archive_blocks WHERE student_no = ?").bind(row.studentNo)));
  }
  for (let offset = 0; offset < unique.length; offset += 40) {
    const chunk = unique.slice(offset, offset + 40);
    await db.batch(chunk.map((row, index) => {
      const normalized = {
        studentNo: row.studentNo,
        name: row.name,
        className: row.className,
        department: row.department || "待补充",
        grade: row.grade || (/^20\d{2}/.test(row.studentNo) ? row.studentNo.slice(0, 4) : "待补充"),
        gender: row.gender || "待补充",
        phone: row.phone || "",
        status: row.status || "正常",
        tags: row.tags || "文档智能识别",
      };
      return db.prepare(`INSERT INTO import_records
        (record_type, external_key, student_no, student_name, title, class_name, payload_json, source_job_id, source_sheet, source_row, review_status)
        VALUES ('students', ?, ?, ?, ?, ?, ?, ?, '智能拆分', ?, 'verified')
        ON CONFLICT(record_type, external_key) DO UPDATE SET
          student_name = excluded.student_name, title = excluded.title, class_name = excluded.class_name,
          payload_json = excluded.payload_json, source_job_id = excluded.source_job_id,
          source_sheet = excluded.source_sheet, source_row = excluded.source_row,
          review_status = 'verified', updated_at = CURRENT_TIMESTAMP`)
        .bind(normalized.studentNo, normalized.studentNo, normalized.name, normalized.name, normalized.className,
          JSON.stringify(normalized), jobId, offset + index + 1);
    }));
    await db.batch(chunk.map((row) => db.prepare(`INSERT INTO students
      (id, student_no, name, department, grade, class_name, community, building, room, phone, status, counselor_id)
      VALUES (?, ?, ?, ?, ?, ?, '待补充', '待补充', '待补充', ?, ?, ?)
      ON CONFLICT(student_no) DO UPDATE SET
        name = excluded.name, department = excluded.department, grade = excluded.grade,
        class_name = excluded.class_name, phone = excluded.phone, status = excluded.status,
        counselor_id = COALESCE(students.counselor_id, excluded.counselor_id)`)
      .bind(row.studentNo, row.studentNo, row.name, row.department || "待补充",
        row.grade || (/^20\d{2}/.test(row.studentNo) ? row.studentNo.slice(0, 4) : "待补充"),
        row.className, row.phone || null, displayStudentStatus(row.status || "正常"), teacherId)));
  }
  for (const item of new Map(unique.map((row) => [row.className, row])).values()) {
    await db.prepare(`INSERT INTO teacher_classes (id, teacher_id, name, grade, department)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(teacher_id, name) DO UPDATE SET
        grade = CASE WHEN teacher_classes.grade = '' THEN excluded.grade ELSE teacher_classes.grade END,
        department = CASE WHEN teacher_classes.department = '' THEN excluded.department ELSE teacher_classes.department END,
        updated_at = CURRENT_TIMESTAMP`)
      .bind(`class-${crypto.randomUUID()}`, teacherId, item.className, item.grade || "", item.department || "").run();
  }
  await markImportCommitted(jobId);
  const updated = unique.filter((row) => existing.has(row.studentNo)).length;
  return { total: rows.length, inserted: unique.length - updated, updated, skipped: rows.length - unique.length, errors: [] };
}

export type ImportedStudent = {
  id: string;
  name: string;
  gender: string;
  department: string;
  grade: string;
  className: string;
  community: string;
  room: string;
  phone: string;
  status: string;
  tags: string[];
  imported: true;
};

function displayStudentStatus(value: string) {
  if (/重点|回访|预警/.test(value)) return value || "重点跟进";
  if (/帮扶|就业|升学/.test(value)) return value || "就业帮扶";
  if (value === "follow_up") return "重点跟进";
  if (value === "assisting") return "就业帮扶";
  return value && value !== "normal" ? value : "正常";
}

function parseTags(value: string) {
  return value.split(/[、,，;；|/]/).map((tag) => tag.trim()).filter(Boolean);
}

function toImportedStudent(record: Pick<StoredImportRecord, "student_no" | "payload_json">): ImportedStudent | null {
  if (!record.student_no) return null;
  const row = JSON.parse(record.payload_json) as Record<string, string>;
  return {
    id: record.student_no,
    name: row.name || "未命名学生",
    gender: row.gender || "待补充",
    department: row.department || "待补充",
    grade: row.grade || (/^20\d{2}/.test(record.student_no) ? record.student_no.slice(0, 4) : "待补充"),
    className: row.className || "待补充",
    community: row.community || "待补充",
    room: [row.building, row.room].filter(Boolean).join(" ") || "待补充",
    phone: row.phone || "待补充",
    status: displayStudentStatus(row.status || "正常"),
    tags: parseTags(row.tags || "已导入"),
    imported: true,
  };
}

export async function listImportedStudents(limit = 1000) {
  const db = await ensureImportSchema();
  const result = await db.prepare("SELECT student_no, payload_json FROM import_records WHERE record_type = 'students' ORDER BY updated_at DESC LIMIT ?")
    .bind(limit).all<Pick<StoredImportRecord, "student_no" | "payload_json">>();
  return result.results.map(toImportedStudent).filter((student): student is ImportedStudent => student !== null);
}

export async function getImportedStudent(studentNo: string) {
  const db = await ensureImportSchema();
  const record = await db.prepare("SELECT student_no, payload_json FROM import_records WHERE record_type = 'students' AND student_no = ? LIMIT 1")
    .bind(studentNo).first<Pick<StoredImportRecord, "student_no" | "payload_json">>();
  return record ? toImportedStudent(record) : null;
}

function chunkText(text: string, size = 1800, overlap = 180) {
  const compact = text.replace(/\r/g, "").trim();
  if (!compact) return [];
  const chunks: string[] = [];
  for (let start = 0; start < compact.length && chunks.length < 420; start += size - overlap) {
    chunks.push(compact.slice(start, start + size));
  }
  return chunks;
}

const WELCOME_KNOWLEDGE_SEED = "welcome-knowledge-2026-v1";

async function seedBuiltInWelcomeKnowledge(db: D1Database) {
  const alreadyApplied = await db.prepare("SELECT seed_key FROM platform_seed_state WHERE seed_key = ?")
    .bind(WELCOME_KNOWLEDGE_SEED).first<{ seed_key: string }>();
  if (alreadyApplied) return;
  for (const article of welcomeArticles) {
    const jobId = `builtin-welcome-${article.slug}`;
    const documentId = `builtin-knowledge-${article.slug}`;
    const extractedText = welcomeArticleToKnowledgeText(article);
    const chunks = chunkText(extractedText);
    const fileName = `${article.shortTitle}.md`;
    await db.prepare(`INSERT OR IGNORE INTO import_jobs
      (id, owner_teacher_id, file_name, file_size, mime_type, storage_key, status, total_rows, sheet_count, committed_at)
      VALUES (?, 'admin-axbgs', ?, ?, 'text/markdown', NULL, 'committed', 1, 1, CURRENT_TIMESTAMP)`)
      .bind(jobId, fileName, new TextEncoder().encode(extractedText).byteLength).run();
    await db.prepare(`INSERT OR IGNORE INTO source_documents
      (id, job_id, owner_teacher_id, visibility, visibility_reason, file_name, mime_type, extension, storage_key,
       document_type, title, category, summary, extracted_text, people_json, student_nos_json, dates_json,
       tasks_json, tags_json, processing_method, confidence, review_status)
      VALUES (?, ?, 'admin-axbgs', 'global', '平台管理员整理并确认为2026级新生通用资料', ?, 'text/markdown', 'md', NULL,
       'notice', ?, ?, ?, ?, '[]', '[]', '[]', '[]', ?, '文字与图片人工核对整理', 1, 'verified')`)
      .bind(documentId, jobId, fileName, article.title, article.category, article.knowledgeSummary,
        extractedText, JSON.stringify(article.knowledgeTags)).run();
    await db.prepare("DELETE FROM document_chunks WHERE document_id = ?").bind(documentId).run();
    for (let offset = 0; offset < chunks.length; offset += 70) {
      await db.batch(chunks.slice(offset, offset + 70).map((content, index) =>
        db.prepare("INSERT INTO document_chunks (document_id, chunk_index, content) VALUES (?, ?, ?)")
          .bind(documentId, offset + index, content)));
    }
    await indexKnowledgeDocument({ documentId, title: article.title, ownerTeacherId: "admin-axbgs", visibility: "global", chunks });
  }
  await db.prepare("INSERT OR IGNORE INTO platform_seed_state (seed_key) VALUES (?)").bind(WELCOME_KNOWLEDGE_SEED).run();
}

export async function saveSourceDocument(input: {
  jobId: string;
  ownerTeacherId: string;
  visibility: KnowledgeVisibility;
  visibilityReason: string;
  fileName: string;
  mimeType: string;
  extension: string;
  storageKey: string | null;
  analysis: MaterialAnalysis;
}) {
  const db = await ensureImportSchema();
  const id = crypto.randomUUID();
  const analysis = input.analysis;
  await db.prepare(`INSERT INTO source_documents
    (id, job_id, owner_teacher_id, visibility, visibility_reason, file_name, mime_type, extension, storage_key, document_type, title, category, summary, extracted_text,
     people_json, student_nos_json, dates_json, tasks_json, tags_json, processing_method, confidence, review_status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(job_id) DO UPDATE SET
      owner_teacher_id = excluded.owner_teacher_id, visibility = excluded.visibility, visibility_reason = excluded.visibility_reason,
      document_type = excluded.document_type, title = excluded.title, category = excluded.category,
      summary = excluded.summary, extracted_text = excluded.extracted_text, people_json = excluded.people_json,
      student_nos_json = excluded.student_nos_json, dates_json = excluded.dates_json, tasks_json = excluded.tasks_json,
      tags_json = excluded.tags_json, processing_method = excluded.processing_method, confidence = excluded.confidence,
      review_status = excluded.review_status, updated_at = CURRENT_TIMESTAMP`)
    .bind(id, input.jobId, input.ownerTeacherId, input.visibility, input.visibilityReason, input.fileName, input.mimeType, input.extension, input.storageKey, analysis.documentType,
      analysis.title, analysis.category, analysis.summary, analysis.extractedText.slice(0, 180_000),
      JSON.stringify(analysis.people), JSON.stringify(analysis.studentNos), JSON.stringify(analysis.dates),
      JSON.stringify(analysis.tasks), JSON.stringify(analysis.tags), analysis.processingMethod, analysis.confidence,
      analysis.needsReview ? "needs_review" : "verified").run();
  const stored = await db.prepare("SELECT id FROM source_documents WHERE job_id = ?").bind(input.jobId).first<{ id: string }>();
  if (!stored) throw new Error("资料保存失败");
  await db.prepare("DELETE FROM document_chunks WHERE document_id = ?").bind(stored.id).run();
  const chunks = chunkText(analysis.extractedText);
  for (let offset = 0; offset < chunks.length; offset += 70) {
    await db.batch(chunks.slice(offset, offset + 70).map((content, index) => db.prepare("INSERT INTO document_chunks (document_id, chunk_index, content) VALUES (?, ?, ?)")
      .bind(stored.id, offset + index, content)));
  }
  const vector = await indexKnowledgeDocument({
    documentId: stored.id, title: analysis.title, ownerTeacherId: input.ownerTeacherId,
    visibility: input.visibility, chunks,
  });
  return { id: stored.id, chunkCount: chunks.length, vectorIndexed: vector.indexed, vectorWarning: vector.indexed ? null : vector.reason };
}

export async function getSourceDocument(id: string) {
  const db = await ensureImportSchema();
  return db.prepare("SELECT * FROM source_documents WHERE id = ?").bind(id).first<StoredSourceDocument>();
}

export async function listSourceDocuments(limit = 20, access?: KnowledgeAccess) {
  const db = await ensureImportSchema();
  if (!access) return [];
  const result = access.audience === "student"
    ? await db.prepare("SELECT * FROM source_documents WHERE visibility = 'global' AND review_status = 'verified' ORDER BY updated_at DESC LIMIT ?").bind(limit).all<StoredSourceDocument>()
    : await db.prepare("SELECT * FROM source_documents WHERE visibility = 'global' OR owner_teacher_id = ? ORDER BY updated_at DESC LIMIT ?").bind(access.teacherId, limit).all<StoredSourceDocument>();
  return result.results;
}

function safeArray<T>(value: string): T[] {
  try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed as T[] : []; } catch { return []; }
}

function materialTypeLabel(type: MaterialAnalysis["documentType"]) {
  return ({ chat: "聊天记录", notice: "通知公告", policy: "制度文件", student_material: "学生材料", meeting: "会议材料", form: "表单材料", report: "总结报告", other: "其他资料" } as const)[type];
}

const knowledgeTopicGroups = [
  ["学分绩点", "平均学分绩点", "绩点", "学分", "gpa", "课程学分", "课程成绩", "学业成绩"],
  ["选课", "补选", "退选", "退课", "课程选择"],
  ["补考", "重修", "缓考", "挂科", "不及格"],
  ["毕业", "结业", "肄业", "毕业资格", "毕业条件", "毕业要求", "准予毕业", "毕业证书", "修满学分", "取得规定的学分", "学位授予"],
  ["请假", "销假", "考勤", "旷课", "迟到", "早退"],
  ["奖学金", "助学金", "资助", "困难认定", "评优评先"],
  ["心理咨询", "心理中心", "心理预约", "心理服务"],
  ["学籍", "休学", "复学", "转专业", "保留学籍"],
] as const;

function expandedKnowledgeTerms(message: string) {
  const normalized = message.normalize("NFKC").toLowerCase();
  const terms = knowledgeTopicGroups.flatMap((group) => group.some((term) => normalized.includes(term)) ? [...group] : []);
  return [...new Set(terms.map((term) => term.toLowerCase()))];
}

function extractKnowledgeQueryTerms(message: string) {
  const normalized = message.normalize("NFKC").toLowerCase();
  const withoutNoise = normalized
    .replace(/泉州师范学院|学生手册|学校文件|校内文件|老师上传的|资料库里|知识库里|本科生|大学生|学生|同学|请问|麻烦问下|想了解|我想|我要|如果|关于|相关|里面|其中|需要|哪些|什么|怎样|怎么|如何|是否|能不能|可不可以|可以吗|可以|条件|流程|规定|要求|办法|办理|处理|问题|内容|情况|会受到|会有|满足|基本|一下/g, " ")
    .replace(/[的了吗呢吧呀啊？?，,。！!、；;：:\s]+/g, " ")
    .trim();
  const coreTerms = [
    ...withoutNoise.match(/[\u3400-\u9fff]{2,18}/g) ?? [],
    ...normalized.match(/[a-z0-9_-]{3,32}/g) ?? [],
  ];
  const expanded: string[] = [];
  for (const core of coreTerms) {
    expanded.push(core);
    if (/^[\u3400-\u9fff]+$/.test(core) && core.length > 3) {
      for (let size = 3; size >= 2; size -= 1) {
        for (let index = 0; index <= core.length - size; index += 1) expanded.push(core.slice(index, index + size));
      }
    }
  }
  const ignored = new Set(["学生", "老师", "学校", "大学", "事情", "这个", "那个", "之后", "之前", "时候", "以及", "或者", "进行"]);
  return {
    coreTerms: [...new Set(coreTerms)].filter((term) => !ignored.has(term)),
    terms: [...new Set(expanded)].filter((term) => !ignored.has(term)).slice(0, 28),
  };
}

type KnowledgeChunkMatch = { content: string; hits: number; relevance: number; direct: boolean };

async function searchKnowledgeChunksByTerms(terms: string[], strongTerms: string[], access: KnowledgeAccess) {
  if (!terms.length) return new Map<string, KnowledgeChunkMatch>();
  const db = await ensureImportSchema();
  const selectedTerms = terms.slice(0, 28);
  const termWhere = selectedTerms.map(() => "instr(lower(c.content), ?) > 0").join(" OR ");
  const accessWhere = access.audience === "student"
    ? "d.visibility = 'global' AND d.review_status = 'verified'"
    : "(d.visibility = 'global' OR d.owner_teacher_id = ?)";
  const statement = db.prepare(`SELECT c.document_id, c.content FROM document_chunks c
    JOIN source_documents d ON d.id = c.document_id
    WHERE ${accessWhere} AND (${termWhere})
    ORDER BY d.updated_at DESC, c.chunk_index ASC LIMIT 60`);
  const bindings = access.audience === "student" ? selectedTerms : [access.teacherId, ...selectedTerms];
  const rows = await statement.bind(...bindings).all<{ document_id: string; content: string }>();
  const best = new Map<string, KnowledgeChunkMatch>();
  for (const row of rows.results) {
    const body = row.content.toLowerCase();
    const hits = selectedTerms.filter((term) => body.includes(term)).length;
    const relevance = selectedTerms.reduce((score, term) => score + (body.includes(term) ? Math.min(8, term.length) : 0), 0);
    const direct = strongTerms.some((term) => body.includes(term));
    // 长问题可能偶然命中一个常见二元词；需命中完整主题短语，或至少两个拆分词才进入候选。
    if (!direct && hits < 2) continue;
    const current = best.get(row.document_id);
    if (!current || Number(direct) > Number(current.direct)
      || (direct === current.direct && (relevance > current.relevance || (relevance === current.relevance && hits > current.hits)))) {
      best.set(row.document_id, { content: row.content, hits, relevance, direct });
    }
  }
  return best;
}

export async function searchSourceDocuments(message: string, access: KnowledgeAccess): Promise<CapabilityResult | null> {
  try {
    const topicTerms = expandedKnowledgeTerms(message);
    const query = extractKnowledgeQueryTerms(message);
    // 完整问题短语和校务同义主题优先，中文二/三元拆词用于兜底；避免拆词过多挤掉“毕业/结业/学位”等关键概念。
    const retrievalTerms = [...new Set([...query.coreTerms, ...topicTerms, ...query.terms])];
    const strongTerms = [...new Set([...query.coreTerms, ...topicTerms])];
    const expandedQuery = retrievalTerms.length ? `${message}\n检索短语：${retrievalTerms.slice(0, 28).join("、")}` : message;
    const [documents, vectorMatches, termChunks] = await Promise.all([
      listSourceDocuments(180, access),
      searchKnowledgeVectors(expandedQuery, access, 16),
      searchKnowledgeChunksByTerms(retrievalTerms, strongTerms, access),
    ]);
    if (!documents.length) return null;
    const vectorByDocument = new Map<string, { score: number; content: string }>();
    vectorMatches.forEach((match) => {
      const current = vectorByDocument.get(match.documentId);
      if (!current || match.score > current.score) vectorByDocument.set(match.documentId, { score: match.score, content: match.content });
    });
    const normalized = message.replace(/[？?，,。！!、\s]/g, "").toLowerCase();
    const genericRecent = /刚才|最近|上传|word|pdf|截图|聊天|资料|文件/.test(message);
    const tokens = [...new Set([
      ...message.match(/[A-Za-z0-9_-]{4,24}/g) ?? [],
      ...message.split(/[\s，。；、？！,.;!?]+/).filter((token) => token.length >= 2),
    ].map((token) => token.toLowerCase()))];
    const ignoredBigrams = new Set(["什么", "怎么", "如何", "哪里", "哪儿", "多少", "多久", "是否", "能不", "可以", "需要", "时候", "时间", "规定", "资料", "材料", "学生", "学校", "老师", "申请"]);
    const chineseChars = [...normalized].filter((char) => /[\u3400-\u9fff]/.test(char));
    const chineseBigrams = [...new Set(chineseChars.slice(0, -1).map((char, index) => `${char}${chineseChars[index + 1]}`)
      .filter((token) => !ignoredBigrams.has(token)))];
    const minimumScore = access.audience === "student" ? 7 : 1;
    const candidates = documents.map((document, index) => {
      const people = safeArray<string>(document.people_json);
      const studentNos = safeArray<string>(document.student_nos_json);
      const vector = vectorByDocument.get(document.id);
      const termChunk = termChunks.get(document.id);
      // 专门的校务主题词允许回查完整文档分块；普通问题仍只检查最佳向量片段，防止长文偶然撞词。
      const searchableBody = termChunk?.content || vector?.content || document.extracted_text;
      const haystack = `${document.title}${document.category}${document.summary}${searchableBody}${people.join("")}${studentNos.join("")}`.replace(/\s/g, "").toLowerCase();
      const fullHaystack = `${document.title}${document.category}${document.summary}${document.extracted_text}${termChunk?.content || ""}`.replace(/\s/g, "").toLowerCase();
      let score = genericRecent ? Math.max(0, 12 - index) : 0;
      const exactMatch = normalized.length >= 2 && haystack.includes(normalized);
      const tokenHits = tokens.filter((token) => haystack.includes(token)).length;
      const bigramHits = chineseBigrams.filter((token) => haystack.includes(token)).length;
      const topicHits = topicTerms.filter((term) => fullHaystack.includes(term)).length;
      const queryHits = query.terms.filter((term) => haystack.includes(term)).length;
      const personHit = people.some((person) => message.includes(person));
      const studentNoHit = studentNos.some((studentNo) => message.includes(studentNo));
      if (exactMatch) score += 60;
      score += tokenHits * 14;
      score += Math.min(bigramHits, 6) * 8;
      score += Math.min(topicHits, 5) * 22;
      score += Math.min(queryHits, 8) * 10;
      if (termChunk?.direct) score += 36;
      if (personHit) score += 45;
      if (studentNoHit) score += 60;
      // 主题词来自有限的校务同义词表，可以单独作为强命中；普通短词仍要求至少两个二元词重合。
      const lexicalMatch = exactMatch || tokenHits > 0 || bigramHits >= 2 || topicHits > 0 || Boolean(termChunk) || personHit || studentNoHit;
      const relevantVector = vector && vector.score >= (access.audience === "student" ? 0.18 : 0.12)
        && (access.audience === "teacher" || lexicalMatch) ? vector : undefined;
      if (relevantVector) score += Math.round(relevantVector.score * 38);
      return { document, score, lexicalMatch, vectorExcerpt: termChunk?.content || relevantVector?.content };
    }).filter((item) => item.score >= minimumScore && (access.audience !== "student" || item.lexicalMatch))
      .sort((a, b) => b.score - a.score);
    const relativeCutoff = access.audience === "student" && candidates[0]
      ? Math.max(minimumScore, candidates[0].score * 0.75)
      : minimumScore;
    const ranked = candidates.filter((item) => item.score >= relativeCutoff).slice(0, 6);
    if (!ranked.length) return null;
    const evidence = ranked.slice(0, 3).map(({ document, vectorExcerpt }, index) => {
      const tasks = safeArray<MaterialAnalysis["tasks"][number]>(document.tasks_json);
      const hitTerms = [...query.coreTerms, ...topicTerms, ...query.terms, ...tokens];
      const hit = hitTerms.map((token) => document.extracted_text.toLowerCase().indexOf(token)).find((position) => position >= 0) ?? -1;
      const start = Math.max(0, hit > 100 ? hit - 100 : 0);
      const excerpt = (vectorExcerpt || document.extracted_text.slice(start, start + 420)).replace(/\s+/g, " ").trim();
      return `${index + 1}.《${document.title}》：${document.summary.slice(0, 220)}${tasks.length ? `；待办：${tasks.slice(0, 4).map((task) => task.title).join("、")}` : ""}${excerpt ? `；原文片段：${excerpt}` : ""}`;
    }).join("\n");
    const cards: AssistantCard[] = ranked.map(({ document }) => {
      const tasks = safeArray<MaterialAnalysis["tasks"][number]>(document.tasks_json);
      const people = safeArray<string>(document.people_json);
      return {
        type: "document",
        title: document.title,
        subtitle: `${materialTypeLabel(document.document_type)} · ${document.file_name}`,
        badge: document.visibility === "global" ? "通用资料" : "教师专用",
        href: `/knowledge?localFile=${encodeURIComponent(document.job_id)}`,
        rows: [
          { label: "摘要", value: document.summary.slice(0, 150) || "未生成摘要" },
          people.length ? { label: "涉及人员", value: people.slice(0, 6).join("、") } : null,
          tasks.length ? { label: "识别待办", value: tasks.slice(0, 3).map((task) => task.title).join("；") } : null,
        ].filter((row): row is { label: string; value: string } => row !== null),
      };
    });
    return {
      tool: "search_source_documents",
      answer: `从已确认的 Word、PDF、截图等资料中找到 ${ranked.length} 份相关内容。\n${evidence}\n原文件只保留在上传教师的本机文件库，可在同一台电脑的知识库中核对。`,
      cards,
      actions: [{ label: "继续上传资料", href: "/imports", primary: true }],
      suggestions: ["提取这些资料中的待办", "按学生姓名继续查询", "根据资料起草通知"],
    };
  } catch {
    return null;
  }
}

const typeKeywords: Array<[ImportRecordType, string[]]> = [
  ["students", ["导入的学生", "学生档案", "学生名单"]],
  ["academic_warning", ["学业", "成绩", "挂科", "学分", "预警"]], ["attendance", ["考勤", "旷课", "迟到", "请假"]],
  ["funding", ["奖助", "资助", "奖学金", "困难认定", "评优"]], ["employment", ["就业", "升学", "毕业去向"]],
  ["participation", ["四个100%", "运动", "竞赛", "社团", "志愿"]], ["student_record", ["谈心", "谈话", "回访", "家校沟通"]],
  ["workflow", ["流程", "事项", "台账"]], ["knowledge", ["知识", "制度", "文件", "资料"]],
];

export async function searchImportedRecords(message: string, teacherId: string): Promise<CapabilityResult | null> {
  try {
    const db = await ensureImportSchema();
    const studentNo = message.match(/[A-Za-z0-9_-]{6,24}/)?.[0];
    const requestedType = typeKeywords.find(([, keywords]) => keywords.some((keyword) => message.includes(keyword)))?.[0];
    const all = await db.prepare(`SELECT id, record_type, external_key, student_no, student_name, title, class_name, occurred_at, payload_json, review_status, updated_at
      FROM import_records WHERE source_job_id IN (SELECT id FROM import_jobs WHERE owner_teacher_id = ?)
      ORDER BY updated_at DESC LIMIT 250`).bind(teacherId).all<StoredImportRecord>();
    const directMatches = all.results.filter((record) => (studentNo && record.student_no === studentNo) || (record.student_name && message.includes(record.student_name)));
    const matches = (directMatches.length ? directMatches : all.results.filter((record) => {
      if (requestedType && record.record_type === requestedType) return true;
      return message.includes("导入数据") || message.includes("刚才导入") || message.includes("上传的数据");
    })).slice(0, 8);
    if (!matches.length) return null;
    const cards: AssistantCard[] = matches.map((record) => {
      const payload = JSON.parse(record.payload_json) as Record<string, string>;
      const definition = importDefinitions[record.record_type];
      return {
        type: record.record_type === "students" ? "student" : record.record_type === "knowledge" ? "document" : "task",
        title: record.student_name || record.title || payload.activityName || payload.project || definition.label,
        subtitle: `${definition.label}${record.student_no ? ` · ${record.student_no}` : ""}${record.class_name ? ` · ${record.class_name}` : ""}`,
        badge: "已导入",
        href: record.record_type === "students" && record.student_no ? `/students/${record.student_no}` : undefined,
        rows: Object.entries(payload).filter(([, value]) => value).slice(0, 3).map(([key, value]) => ({ label: definition.fields.find((item) => item.key === key)?.label ?? key, value })),
      };
    });
    return {
      tool: "search_imported_records",
      answer: `从已确认导入的数据中找到 ${matches.length} 条相关记录，结果保留原文件名、工作表和行号来源；原件只在上传教师电脑本地保存。`,
      cards,
      actions: [{ label: "继续导入资料", href: "/imports", primary: true }],
      suggestions: ["查看最近导入记录", "按学生姓名继续查询"],
    };
  } catch {
    return null;
  }
}
