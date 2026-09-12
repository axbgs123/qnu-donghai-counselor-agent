import { ensureImportSchema, getImportDb } from "./import-storage";

export type PilotStudent = { student_no: string; name: string; class_name: string };
export type StudentRequestStatus = "new" | "processing" | "resolved";
export type StoredStudentMessage = {
  role: "student" | "assistant";
  text: string;
  resolution?: "resolved" | "unresolved";
  resolutionBy?: "assistant" | "teacher";
  kind?: "inquiry" | "message";
};

function parseStoredConversation(value: string): StoredStudentMessage[] {
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((message) => message && ["student", "assistant"].includes(message.role) && typeof message.text === "string");
  } catch {
    return [];
  }
}

function annotateMessageResolutions(messages: StoredStudentMessage[], requestStatus?: StudentRequestStatus) {
  return messages.map((message, index) => {
    if (message.role !== "student") return message;
    if (requestStatus === "resolved") return { ...message, resolution: "resolved" as const, resolutionBy: message.resolutionBy || "teacher" as const };
    if (message.resolution) return message;
    const following = messages.slice(index + 1, messages.findIndex((candidate, followingIndex) => followingIndex > index && candidate.role === "student") === -1
      ? messages.length
      : messages.findIndex((candidate, followingIndex) => followingIndex > index && candidate.role === "student"));
    const solvedByAssistant = following.some((candidate) => candidate.role === "assistant" && /标记为已解决|不会生成老师留言/.test(candidate.text));
    return solvedByAssistant
      ? { ...message, resolution: "resolved" as const, resolutionBy: "assistant" as const, kind: message.kind || "inquiry" as const }
      : { ...message, resolution: "unresolved" as const };
  });
}

function studentOriginals(messages: StoredStudentMessage[], onlyUnresolved = false) {
  return messages.filter((message) => message.role === "student" && (!onlyUnresolved || message.resolution !== "resolved"));
}

function buildStudentSummary(messages: StoredStudentMessage[], fallback = "") {
  const unresolved = studentOriginals(messages, true);
  const originals = unresolved.length ? unresolved : studentOriginals(messages);
  return originals.length
    ? originals.map((message, index) => `第${index + 1}次学生原话：${message.text.trim()}`).join("\n")
    : fallback.trim();
}

export async function ensureEngagementSchema() {
  const db = await ensureImportSchema();
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS pilot_students (
      student_no TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      class_name TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS student_sessions (
      token TEXT PRIMARY KEY,
      student_no TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_active_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (student_no) REFERENCES pilot_students(student_no)
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS student_requests (
      id TEXT PRIMARY KEY,
      teacher_id TEXT,
      student_no TEXT NOT NULL,
      student_name TEXT NOT NULL,
      class_name TEXT NOT NULL,
      category TEXT NOT NULL,
      title TEXT NOT NULL,
      summary TEXT NOT NULL,
      conversation_json TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'new',
      urgency TEXT NOT NULL DEFAULT 'normal',
      teacher_reply TEXT,
      reply_channel TEXT,
      message_count INTEGER NOT NULL DEFAULT 1,
      last_message_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      resolved_at TEXT
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS student_daily_usage (
      student_no TEXT NOT NULL,
      usage_date TEXT NOT NULL,
      turn_count INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (student_no, usage_date),
      FOREIGN KEY (student_no) REFERENCES pilot_students(student_no)
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS welcome_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL UNIQUE,
      description TEXT NOT NULL,
      due_at TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'published',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS welcome_completions (
      item_id INTEGER NOT NULL,
      student_no TEXT NOT NULL,
      completed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (item_id, student_no),
      FOREIGN KEY (item_id) REFERENCES welcome_items(id),
      FOREIGN KEY (student_no) REFERENCES pilot_students(student_no)
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      owner_id TEXT,
      title TEXT NOT NULL,
      module TEXT NOT NULL,
      due_at TEXT,
      priority TEXT NOT NULL DEFAULT 'normal',
      status TEXT NOT NULL DEFAULT 'todo',
      subject_type TEXT,
      subject_id TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_student_requests_status_created ON student_requests(status, created_at)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_student_requests_student ON student_requests(student_no, created_at)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_student_requests_class_status ON student_requests(class_name, status)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_sessions_student ON student_sessions(student_no)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_tasks_status_due ON tasks(status, due_at)"),
  ]);
  const requestColumns = await db.prepare("PRAGMA table_info(student_requests)").all<{ name: string }>();
  if (!requestColumns.results.some((column) => column.name === "teacher_id")) {
    await db.prepare("ALTER TABLE student_requests ADD COLUMN teacher_id TEXT").run();
  }
  if (!requestColumns.results.some((column) => column.name === "message_count")) {
    await db.prepare("ALTER TABLE student_requests ADD COLUMN message_count INTEGER NOT NULL DEFAULT 1").run();
  }
  if (!requestColumns.results.some((column) => column.name === "last_message_at")) {
    await db.prepare("ALTER TABLE student_requests ADD COLUMN last_message_at TEXT").run();
  }
  await db.prepare("UPDATE student_requests SET last_message_at = COALESCE(last_message_at, updated_at, created_at)").run();
  await db.prepare("CREATE INDEX IF NOT EXISTS idx_student_requests_teacher_status ON student_requests(teacher_id, status, created_at)").run();
  await db.prepare("CREATE INDEX IF NOT EXISTS idx_student_requests_student_active ON student_requests(student_no, teacher_id, status, last_message_at)").run();
  const authTable = await db.prepare("SELECT name FROM sqlite_schema WHERE type = 'table' AND name = 'app_accounts'").first();
  if (authTable) {
    await db.prepare(`UPDATE student_requests SET teacher_id = (
      SELECT teacher_id FROM app_accounts WHERE role = 'student' AND student_no = student_requests.student_no LIMIT 1
    ) WHERE teacher_id IS NULL`).run();
  }
  const resolutionMigration = await db.prepare("SELECT seed_key FROM platform_seed_state WHERE seed_key = 'student_request_message_resolution_v1'").first();
  if (!resolutionMigration) {
    const rows = await db.prepare("SELECT id, status, summary, conversation_json FROM student_requests").all<{
      id: string; status: StudentRequestStatus; summary: string; conversation_json: string;
    }>();
    for (const row of rows.results) {
      const annotated = annotateMessageResolutions(parseStoredConversation(row.conversation_json), row.status);
      await db.prepare("UPDATE student_requests SET conversation_json = ?, summary = ? WHERE id = ?")
        .bind(JSON.stringify(annotated), buildStudentSummary(annotated, row.summary), row.id).run();
    }
    await db.prepare("INSERT OR IGNORE INTO platform_seed_state (seed_key) VALUES ('student_request_message_resolution_v1')").run();
  }
  return db;
}

export async function verifyStudent(studentNo: string, name: string) {
  const db = await ensureEngagementSchema();
  let student = await db.prepare("SELECT student_no, name, class_name FROM pilot_students WHERE student_no = ? AND name = ?")
    .bind(studentNo.trim(), name.trim()).first<PilotStudent>();
  if (!student) {
    const imported = await db.prepare("SELECT student_no, name, class_name FROM students WHERE student_no = ? AND name = ?")
      .bind(studentNo.trim(), name.trim()).first<PilotStudent>();
    if (imported) {
      await db.prepare("INSERT OR IGNORE INTO pilot_students (student_no, name, class_name) VALUES (?, ?, ?)")
        .bind(imported.student_no, imported.name, imported.class_name).run();
      student = imported;
    }
  }
  if (!student) return null;
  const token = crypto.randomUUID();
  await db.prepare("INSERT INTO student_sessions (token, student_no) VALUES (?, ?)").bind(token, student.student_no).run();
  return { token, student };
}

export async function getStudentByToken(token: string) {
  if (!token) return null;
  const db = await ensureEngagementSchema();
  const student = await db.prepare(`SELECT p.student_no, p.name, p.class_name FROM student_sessions s
    JOIN pilot_students p ON p.student_no = s.student_no WHERE s.token = ?`)
    .bind(token).first<PilotStudent>();
  if (student) await db.prepare("UPDATE student_sessions SET last_active_at = CURRENT_TIMESTAMP WHERE token = ?").bind(token).run();
  return student;
}

function shanghaiDate() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

export async function getStudentDailyUsage(studentNo: string) {
  const db = await ensureEngagementSchema();
  const usageDate = shanghaiDate();
  const row = await db.prepare("SELECT turn_count FROM student_daily_usage WHERE student_no = ? AND usage_date = ?")
    .bind(studentNo, usageDate).first<{ turn_count: number }>();
  const used = Number(row?.turn_count ?? 0);
  return { usageDate, used, remaining: Math.max(0, 20 - used) };
}

export async function consumeStudentDailyTurn(studentNo: string) {
  const current = await getStudentDailyUsage(studentNo);
  if (current.used >= 20) return { ...current, allowed: false };
  const db = getImportDb();
  await db.prepare(`INSERT INTO student_daily_usage (student_no, usage_date, turn_count) VALUES (?, ?, 1)
    ON CONFLICT(student_no, usage_date) DO UPDATE SET turn_count = turn_count + 1, updated_at = CURRENT_TIMESTAMP`)
    .bind(studentNo, current.usageDate).run();
  const used = current.used + 1;
  return { usageDate: current.usageDate, used, remaining: 20 - used, allowed: true };
}

export async function getStudentHome(token: string) {
  const student = await getStudentByToken(token);
  if (!student) return null;
  const db = getImportDb();
  const items = await db.prepare(`SELECT w.id, w.title, w.description, w.due_at, w.status,
    CASE WHEN c.student_no IS NULL THEN 0 ELSE 1 END AS completed
    FROM welcome_items w LEFT JOIN welcome_completions c ON c.item_id = w.id AND c.student_no = ?
    WHERE w.status = 'published' ORDER BY w.sort_order`).bind(student.student_no).all<{
      id: number; title: string; description: string; due_at: string | null; status: string; completed: number;
    }>();
  const requests = await db.prepare("SELECT id, category, title, summary, status, urgency, teacher_reply, reply_channel, message_count, last_message_at, created_at, updated_at FROM student_requests WHERE student_no = ? ORDER BY COALESCE(last_message_at, updated_at, created_at) DESC LIMIT 20")
    .bind(student.student_no).all();
  const teacher = await db.prepare(`SELECT t.display_name FROM app_accounts s
    JOIN app_accounts t ON t.id = s.teacher_id
    WHERE s.role = 'student' AND s.student_no = ? LIMIT 1`).bind(student.student_no).first<{ display_name: string }>();
  const dailyUsage = await getStudentDailyUsage(student.student_no);
  return { student, teacherName: teacher?.display_name || "负责老师", welcomeItems: items.results, requests: requests.results, dailyUsage };
}

export async function setWelcomeCompletion(token: string, itemId: number, completed: boolean) {
  const student = await getStudentByToken(token);
  if (!student) return null;
  const db = getImportDb();
  if (completed) await db.prepare("INSERT OR IGNORE INTO welcome_completions (item_id, student_no) VALUES (?, ?)").bind(itemId, student.student_no).run();
  else await db.prepare("DELETE FROM welcome_completions WHERE item_id = ? AND student_no = ?").bind(itemId, student.student_no).run();
  return { completed };
}

export async function createStudentRequest(input: {
  token: string; category: string; title: string; summary: string; urgency: string;
  conversation: StoredStudentMessage[];
}) {
  const student = await getStudentByToken(input.token);
  if (!student) return null;
  const db = getImportDb();
  const hasAccounts = await db.prepare("SELECT name FROM sqlite_schema WHERE type = 'table' AND name = 'app_accounts'").first();
  const accountOwner = hasAccounts ? await db.prepare("SELECT teacher_id FROM app_accounts WHERE role = 'student' AND student_no = ? LIMIT 1")
    .bind(student.student_no).first<{ teacher_id: string | null }>() : null;
  const archivedOwner = await db.prepare("SELECT counselor_id FROM students WHERE student_no = ? LIMIT 1")
    .bind(student.student_no).first<{ counselor_id: string | null }>();
  const teacherId = accountOwner?.teacher_id || archivedOwner?.counselor_id || null;
  const incoming = annotateMessageResolutions(input.conversation);
  const incomingOriginals = studentOriginals(incoming);
  const faithfulSummary = buildStudentSummary(incoming, input.summary);
  if (input.category !== "对话额度重置") {
    const active = await db.prepare(`SELECT id, category, title, summary, conversation_json, urgency, message_count
      FROM student_requests
      WHERE student_no = ? AND teacher_id IS ? AND category != '对话额度重置'
        AND status IN ('new', 'processing')
        AND datetime(COALESCE(last_message_at, updated_at, created_at)) >= datetime('now', '-24 hours')
      ORDER BY datetime(COALESCE(last_message_at, updated_at, created_at)) DESC LIMIT 1`)
      .bind(student.student_no, teacherId).first<{
        id: string; category: string; title: string; summary: string; conversation_json: string; urgency: string; message_count: number;
      }>();
    if (active) {
      const previous = annotateMessageResolutions(parseStoredConversation(active.conversation_json));
      const combined = [...previous, ...incoming];
      const combinedOriginals = studentOriginals(combined);
      const combinedSummary = buildStudentSummary(combined, active.summary);
      await db.prepare(`UPDATE student_requests SET category = ?, title = ?, summary = ?, conversation_json = ?,
        status = 'new', urgency = ?, message_count = ?, last_message_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?`)
        .bind(input.category, input.title, combinedSummary, JSON.stringify(combined),
          active.urgency === "urgent" || input.urgency === "urgent" ? "urgent" : "normal",
          combinedOriginals.length, active.id).run();
      return { id: active.id, student, merged: true, messageCount: combinedOriginals.length };
    }
  }
  const id = `SQ-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
  await db.prepare(`INSERT INTO student_requests
    (id, teacher_id, student_no, student_name, class_name, category, title, summary, conversation_json, urgency, message_count, last_message_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`)
    .bind(id, teacherId, student.student_no, student.name, student.class_name, input.category, input.title, faithfulSummary,
      JSON.stringify(incoming), input.urgency || "normal", Math.max(1, incomingOriginals.length)).run();
  return { id, student, merged: false, messageCount: Math.max(1, incomingOriginals.length) };
}

export async function requestDailyUsageReset(token: string) {
  const student = await getStudentByToken(token);
  if (!student) return null;
  const db = getImportDb();
  const existing = await db.prepare("SELECT id FROM student_requests WHERE student_no = ? AND category = '对话额度重置' AND status IN ('new', 'processing') LIMIT 1")
    .bind(student.student_no).first<{ id: string }>();
  if (existing) return { id: existing.id, status: "new", duplicate: true };
  const usage = await getStudentDailyUsage(student.student_no);
  const created = await createStudentRequest({
    token,
    category: "对话额度重置",
    title: "申请重新计数学生端对话额度",
    summary: `学生申请重新计数，当前已使用${usage.used}/20轮。`,
    urgency: "normal",
    conversation: [{ role: "student", text: `申请重新计数学生端对话额度，当前已使用${usage.used}/20轮。` }],
  });
  return created ? { id: created.id, status: "new", duplicate: false } : null;
}

export async function decideDailyUsageReset(id: string, approved: boolean, teacherId: string) {
  const db = await ensureEngagementSchema();
  const item = await db.prepare("SELECT id, student_no, category FROM student_requests WHERE id = ? AND teacher_id = ?").bind(id, teacherId).first<{ id: string; student_no: string; category: string }>();
  if (!item || item.category !== "对话额度重置") return null;
  if (approved) {
    await db.prepare("UPDATE student_daily_usage SET turn_count = 0, updated_at = CURRENT_TIMESTAMP WHERE student_no = ? AND usage_date = ?")
      .bind(item.student_no, shanghaiDate()).run();
  }
  await db.prepare(`UPDATE student_requests SET status = 'resolved', teacher_reply = ?, reply_channel = 'system',
    updated_at = CURRENT_TIMESTAMP, resolved_at = CURRENT_TIMESTAMP WHERE id = ? AND teacher_id = ?`)
    .bind(approved ? "辅导员已批准，对话额度已重新计数。" : "辅导员暂未批准本次重新计数申请。", id, teacherId).run();
  return db.prepare("SELECT * FROM student_requests WHERE id = ? AND teacher_id = ?").bind(id, teacherId).first();
}

export async function listStudentRequests(filters: { status?: string; className?: string; teacherId?: string } = {}) {
  const db = await ensureEngagementSchema();
  if (!filters.teacherId) return { requests: [] as Record<string, unknown>[], metrics: { total: 0, new: 0, processing: 0, resolved: 0, classes: [] as string[] } };
  const [rows, metrics] = await Promise.all([
    db.prepare(`SELECT id, teacher_id, student_no, student_name, class_name, category, title, summary,
      status, urgency, teacher_reply, reply_channel, message_count, last_message_at, created_at, updated_at, resolved_at
      FROM student_requests WHERE teacher_id = ? AND (? = '' OR status = ?) AND (? = '' OR class_name = ?)
      ORDER BY CASE status WHEN 'new' THEN 0 WHEN 'processing' THEN 1 ELSE 2 END, COALESCE(last_message_at, updated_at, created_at) DESC LIMIT 300`)
      .bind(filters.teacherId, filters.status || "", filters.status || "", filters.className || "", filters.className || "").all<Record<string, unknown>>(),
    getStudentRequestMetrics(filters.teacherId),
  ]);
  return { requests: rows.results, metrics };
}

export async function getStudentRequestMetrics(teacherId: string) {
  const db = await ensureEngagementSchema();
  const [counts, classes] = await Promise.all([
    db.prepare(`SELECT COUNT(*) AS total,
      SUM(CASE WHEN status = 'new' THEN 1 ELSE 0 END) AS new_count,
      SUM(CASE WHEN status = 'processing' THEN 1 ELSE 0 END) AS processing_count,
      SUM(CASE WHEN status = 'resolved' THEN 1 ELSE 0 END) AS resolved_count
      FROM student_requests WHERE teacher_id = ? AND category != '对话额度重置'`)
      .bind(teacherId).first<{ total: number; new_count: number; processing_count: number; resolved_count: number }>(),
    db.prepare("SELECT DISTINCT class_name FROM student_requests WHERE teacher_id = ? AND category != '对话额度重置' AND class_name != '' ORDER BY class_name")
      .bind(teacherId).all<{ class_name: string }>(),
  ]);
  return {
    total: Number(counts?.total ?? 0),
    new: Number(counts?.new_count ?? 0),
    processing: Number(counts?.processing_count ?? 0),
    resolved: Number(counts?.resolved_count ?? 0),
    classes: classes.results.map((row) => row.class_name),
  };
}

export async function getStudentRequest(id: string, teacherId: string) {
  const db = await ensureEngagementSchema();
  return db.prepare("SELECT * FROM student_requests WHERE id = ? AND teacher_id = ? LIMIT 1").bind(id, teacherId).first<Record<string, unknown>>();
}

export async function updateStudentRequest(input: { id: string; teacherId: string; status: StudentRequestStatus; reply?: string; replyChannel?: string }) {
  const db = await ensureEngagementSchema();
  const current = await db.prepare("SELECT conversation_json FROM student_requests WHERE id = ? AND teacher_id = ?")
    .bind(input.id, input.teacherId).first<{ conversation_json: string }>();
  const conversation = current && input.status === "resolved"
    ? annotateMessageResolutions(parseStoredConversation(current.conversation_json), "resolved")
    : current ? annotateMessageResolutions(parseStoredConversation(current.conversation_json)) : [];
  await db.prepare(`UPDATE student_requests SET status = ?, teacher_reply = COALESCE(?, teacher_reply),
    reply_channel = COALESCE(?, reply_channel), updated_at = CURRENT_TIMESTAMP,
    conversation_json = ?, resolved_at = CASE WHEN ? = 'resolved' THEN CURRENT_TIMESTAMP ELSE resolved_at END WHERE id = ? AND teacher_id = ?`)
    .bind(input.status, input.reply?.trim() || null, input.replyChannel || null, JSON.stringify(conversation), input.status, input.id, input.teacherId).run();
  return db.prepare("SELECT * FROM student_requests WHERE id = ? AND teacher_id = ?").bind(input.id, input.teacherId).first();
}

export async function deleteStudentRequest(id: string, teacherId: string) {
  const db = await ensureEngagementSchema();
  const existing = await db.prepare("SELECT id FROM student_requests WHERE id = ? AND teacher_id = ?").bind(id, teacherId).first<{ id: string }>();
  if (!existing) return false;
  await db.prepare("DELETE FROM student_requests WHERE id = ? AND teacher_id = ?").bind(id, teacherId).run();
  return true;
}

export async function getWelcomeDashboard() {
  const db = await ensureEngagementSchema();
  const students = await db.prepare("SELECT student_no, name, class_name FROM pilot_students ORDER BY class_name, student_no").all<PilotStudent>();
  const items = await db.prepare("SELECT * FROM welcome_items ORDER BY sort_order").all<Record<string, unknown>>();
  const completions = await db.prepare("SELECT item_id, student_no, completed_at FROM welcome_completions").all<{ item_id: number; student_no: string }>();
  const completedByStudent = new Map<string, number>();
  completions.results.forEach((item) => completedByStudent.set(item.student_no, (completedByStudent.get(item.student_no) ?? 0) + 1));
  return {
    items: items.results,
    students: students.results.map((student) => ({ ...student, completed: completedByStudent.get(student.student_no) ?? 0, total: items.results.length })),
    metrics: {
      students: students.results.length,
      items: items.results.length,
      completed: completions.results.length,
      completionRate: students.results.length && items.results.length ? Math.round(completions.results.length / (students.results.length * items.results.length) * 100) : 0,
    },
  };
}

function tomorrowIsoDate() {
  const date = new Date(Date.now() + 86_400_000);
  return date.toISOString().slice(0, 10);
}

export async function createTasksFromNaturalLanguage(message: string, teacherId: string) {
  const db = await ensureEngagementSchema();
  const cleaned = message.replace(/^(帮我|请|添加|创建|记录)(一下)?/, "");
  const segments = cleaned.split(/(?:、|，|,|；|;|\n|我还要|还要|另外)/).map((item) => item.replace(/^(明天|今天|需要|去|处理|安排|推进)/, "").trim())
    .filter((item) => item.length >= 3).slice(0, 8);
  const dueAt = message.includes("明天") ? `${tomorrowIsoDate()}T09:00:00` : new Date().toISOString();
  const created: Array<{ id: number; title: string; module: string; priority: string; dueAt: string }> = [];
  for (const title of segments.length ? segments : [cleaned]) {
    const taskModule = /新生|迎新|志愿者/.test(title) ? "迎新工作" : /外宿|宿舍|住宿/.test(title) ? "学生事务" : /班干|班委|竞选/.test(title) ? "班团建设" : "个人待办";
    const priority = /新生|外宿|截止|紧急/.test(title) ? "important" : "normal";
    const result = await db.prepare("INSERT INTO tasks (owner_id, title, module, due_at, priority, status) VALUES (?, ?, ?, ?, ?, 'todo')")
      .bind(teacherId, title, taskModule, dueAt, priority).run();
    created.push({ id: Number(result.meta.last_row_id), title, module: taskModule, priority, dueAt });
  }
  return created;
}
