import { ensureEngagementSchema } from "./engagement-storage";

export type PlatformStudent = {
  id: string;
  name: string;
  gender: string;
  department: string;
  grade: string;
  className: string;
  phone: string;
  status: string;
  tags: string[];
  imported: boolean;
};

export type WorkflowCaseRow = {
  id: number;
  type: string;
  title: string;
  subject: string;
  stage: string;
  status: "open" | "waiting" | "closed";
  owner: string;
  note: string;
  createdAt: string;
  updatedAt: string;
};

export async function ensurePlatformSchema() {
  const db = await ensureEngagementSchema();
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS workflow_cases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      student_id TEXT,
      subject TEXT NOT NULL DEFAULT '',
      stage TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      owner_id TEXT,
      owner_name TEXT NOT NULL DEFAULT '负责老师',
      payload TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS student_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id TEXT NOT NULL,
      domain TEXT NOT NULL,
      title TEXT NOT NULL,
      summary TEXT,
      status TEXT NOT NULL DEFAULT 'recorded',
      happened_at TEXT NOT NULL,
      follow_up_at TEXT,
      owner_id TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_cases_type_status ON workflow_cases(type, status)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_cases_student ON workflow_cases(student_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_cases_owner_status ON workflow_cases(owner_id, status, updated_at)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_student_records_student_time ON student_records(student_id, happened_at)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_student_records_domain_status ON student_records(domain, status)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_student_records_owner_time ON student_records(owner_id, happened_at)"),
  ]);
  return db;
}

function displayStatus(value: string | null | undefined) {
  if (value === "follow_up") return "重点跟进";
  if (value === "assisting") return "帮扶中";
  return value && value !== "normal" ? value : "正常";
}

function tagsFromPayload(payload: string | null) {
  if (!payload) return [];
  try {
    const row = JSON.parse(payload) as Record<string, string>;
    return String(row.tags || "").split(/[、,，;；|/]/).map((tag) => tag.trim()).filter(Boolean);
  } catch { return []; }
}

export async function listPlatformStudents(teacherId: string): Promise<PlatformStudent[]> {
  const db = await ensurePlatformSchema();
  const students = await db.prepare(`SELECT s.student_no, s.name, s.department, s.grade, s.class_name, s.phone, s.status,
    r.payload_json FROM students s LEFT JOIN import_records r ON r.record_type = 'students' AND r.student_no = s.student_no
    WHERE s.counselor_id = ? ORDER BY s.class_name, s.student_no`).bind(teacherId).all<{
      student_no: string; name: string; department: string; grade: string; class_name: string; phone: string | null;
      status: string; payload_json: string | null;
    }>();
  const merged = new Map<string, PlatformStudent>();
  for (const row of students.results) {
    let payload: Record<string, string> = {};
    try { payload = row.payload_json ? JSON.parse(row.payload_json) as Record<string, string> : {}; } catch { payload = {}; }
    merged.set(row.student_no, {
      id: row.student_no, name: row.name, gender: payload.gender || "待补充", department: row.department || "待补充",
      grade: row.grade || row.student_no.slice(0, 4), className: row.class_name, phone: row.phone || "待补充",
      status: displayStatus(row.status), tags: tagsFromPayload(row.payload_json), imported: Boolean(row.payload_json),
    });
  }
  return [...merged.values()];
}

export async function getPlatformStudent(studentNo: string, teacherId: string) {
  const db = await ensurePlatformSchema();
  const student = (await listPlatformStudents(teacherId)).find((item) => item.id === studentNo);
  if (!student) return null;
  const [records, requests, imported, tasks] = await Promise.all([
    db.prepare("SELECT id, domain, title, summary, status, happened_at, follow_up_at, created_at FROM student_records WHERE student_id = ? AND owner_id = ? ORDER BY happened_at DESC LIMIT 80")
      .bind(studentNo, teacherId).all<Record<string, unknown>>(),
    db.prepare("SELECT id, category, title, summary, status, urgency, teacher_reply, created_at, updated_at FROM student_requests WHERE student_no = ? AND teacher_id = ? AND category != '对话额度重置' ORDER BY created_at DESC LIMIT 80")
      .bind(studentNo, teacherId).all<Record<string, unknown>>(),
    db.prepare("SELECT id, record_type, title, occurred_at, payload_json, review_status, updated_at FROM import_records WHERE student_no = ? AND record_type != 'students' AND source_job_id IN (SELECT id FROM import_jobs WHERE owner_teacher_id = ?) ORDER BY COALESCE(occurred_at, updated_at) DESC LIMIT 120")
      .bind(studentNo, teacherId).all<Record<string, unknown>>(),
    db.prepare("SELECT id, title, module, due_at, priority, status, created_at FROM tasks WHERE subject_id = ? AND owner_id = ? ORDER BY created_at DESC LIMIT 60")
      .bind(studentNo, teacherId).all<Record<string, unknown>>(),
  ]);
  return { student, records: records.results, requests: requests.results, imported: imported.results, tasks: tasks.results };
}

export async function listWorkflowCases(teacherId: string): Promise<WorkflowCaseRow[]> {
  const db = await ensurePlatformSchema();
  const rows = await db.prepare("SELECT id, type, title, subject, stage, status, owner_name, payload, created_at, updated_at FROM workflow_cases WHERE owner_id = ? ORDER BY CASE status WHEN 'open' THEN 0 WHEN 'waiting' THEN 1 ELSE 2 END, updated_at DESC LIMIT 300").bind(teacherId)
    .all<{ id: number; type: string; title: string; subject: string; stage: string; status: WorkflowCaseRow["status"]; owner_name: string; payload: string | null; created_at: string; updated_at: string }>();
  return rows.results.map((row) => ({
    id: row.id, type: row.type, title: row.title, subject: row.subject, stage: row.stage, status: row.status,
    owner: row.owner_name, note: (() => { try { return String((JSON.parse(row.payload || "{}") as { note?: string }).note || ""); } catch { return ""; } })(),
    createdAt: row.created_at, updatedAt: row.updated_at,
  }));
}

export async function createWorkflowCase(input: { type: string; title: string; subject?: string; stage?: string; note?: string; teacherId: string; teacherName: string }) {
  const db = await ensurePlatformSchema();
  const result = await db.prepare("INSERT INTO workflow_cases (type, title, subject, stage, payload, owner_id, owner_name) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .bind(input.type, input.title, input.subject || "", input.stage || "信息确认", JSON.stringify({ note: input.note || "" }), input.teacherId, input.teacherName).run();
  return db.prepare("SELECT * FROM workflow_cases WHERE id = ?").bind(Number(result.meta.last_row_id)).first();
}

export async function updateWorkflowCase(input: { id: number; teacherId: string; status?: WorkflowCaseRow["status"]; stage?: string }) {
  const db = await ensurePlatformSchema();
  await db.prepare("UPDATE workflow_cases SET status = COALESCE(?, status), stage = COALESCE(?, stage), updated_at = CURRENT_TIMESTAMP WHERE id = ? AND owner_id = ?")
    .bind(input.status || null, input.stage || null, input.id, input.teacherId).run();
  return db.prepare("SELECT * FROM workflow_cases WHERE id = ? AND owner_id = ?").bind(input.id, input.teacherId).first();
}

export async function deleteWorkflowCase(id: number, teacherId: string) {
  const db = await ensurePlatformSchema();
  const row = await db.prepare("SELECT id FROM workflow_cases WHERE id = ? AND owner_id = ?").bind(id, teacherId).first();
  if (!row) return false;
  await db.prepare("DELETE FROM workflow_cases WHERE id = ? AND owner_id = ?").bind(id, teacherId).run();
  return true;
}

export async function createStudentRecord(input: { studentId: string; domain: string; title: string; summary?: string; happenedAt?: string; followUpAt?: string; teacherId: string }) {
  const db = await ensurePlatformSchema();
  const student = (await listPlatformStudents(input.teacherId)).find((item) => item.id === input.studentId);
  if (!student) throw new Error("找不到对应学生，请先导入学生档案");
  const happenedAt = input.happenedAt || new Date().toISOString();
  const result = await db.prepare("INSERT INTO student_records (student_id, domain, title, summary, happened_at, follow_up_at, status, owner_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(input.studentId, input.domain, input.title, input.summary || "", happenedAt, input.followUpAt || null, input.followUpAt ? "follow_up" : "recorded", input.teacherId).run();
  return db.prepare("SELECT * FROM student_records WHERE id = ?").bind(Number(result.meta.last_row_id)).first();
}

export async function getPlatformReport(teacherId: string) {
  const db = await ensurePlatformSchema();
  const [students, requests, tasks, cases, records, docs] = await Promise.all([
    listPlatformStudents(teacherId),
    db.prepare("SELECT category, status, created_at, resolved_at, student_no FROM student_requests WHERE teacher_id = ? AND category != '对话额度重置'").bind(teacherId).all<{ category: string; status: string; created_at: string; resolved_at: string | null; student_no: string }>(),
    db.prepare("SELECT module, status, due_at, created_at FROM tasks WHERE owner_id = ?").bind(teacherId).all<{ module: string; status: string; due_at: string | null; created_at: string }>(),
    db.prepare("SELECT type, status, created_at, updated_at FROM workflow_cases WHERE owner_id = ?").bind(teacherId).all<{ type: string; status: string; created_at: string; updated_at: string }>(),
    db.prepare("SELECT domain, status, student_id, happened_at FROM student_records WHERE owner_id = ?").bind(teacherId).all<{ domain: string; status: string; student_id: string; happened_at: string }>(),
    db.prepare("SELECT category, review_status, created_at FROM source_documents WHERE visibility = 'global' OR owner_teacher_id = ?").bind(teacherId).all<{ category: string; review_status: string; created_at: string }>(),
  ]);
  const month = new Date().toISOString().slice(0, 7);
  const inMonth = (value: string | null) => Boolean(value?.startsWith(month));
  const resolved = requests.results.filter((item) => item.status === "resolved" && inMonth(item.resolved_at)).length
    + cases.results.filter((item) => item.status === "closed" && inMonth(item.updated_at)).length
    + tasks.results.filter((item) => item.status === "done" && inMonth(item.created_at)).length;
  const touched = new Set<string>([
    ...requests.results.filter((item) => inMonth(item.created_at)).map((item) => item.student_no),
    ...records.results.filter((item) => inMonth(item.happened_at)).map((item) => item.student_id),
  ]).size;
  const categories = new Map<string, number>();
  requests.results.forEach((item) => categories.set(item.category, (categories.get(item.category) || 0) + 1));
  cases.results.forEach((item) => categories.set(item.type, (categories.get(item.type) || 0) + 1));
  records.results.forEach((item) => categories.set(item.domain, (categories.get(item.domain) || 0) + 1));
  return {
    generatedAt: new Date().toISOString(), month, students: students.length, resolved, touched,
    pending: requests.results.filter((item) => item.status !== "resolved").length + tasks.results.filter((item) => item.status !== "done").length + cases.results.filter((item) => item.status !== "closed").length,
    knowledge: { total: docs.results.length, verified: docs.results.filter((item) => item.review_status === "verified").length },
    categories: [...categories.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
    classes: [...new Set(students.map((student) => student.className))].map((className) => ({ className, students: students.filter((student) => student.className === className).length, attention: students.filter((student) => student.className === className && student.status !== "正常").length })),
  };
}
