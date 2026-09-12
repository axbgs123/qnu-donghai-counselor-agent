import { env } from "cloudflare:workers";
import { ensureEngagementSchema } from "./engagement-storage";
import { ensureClassSchema, ensureTeacherClass } from "./class-storage";
import { studentNamePassword } from "./student-password";

export type AppRole = "admin" | "teacher" | "student";

export const teacherPermissionCatalog = [
  { id: "students.manage", label: "学生档案", description: "查看、导入和维护学生档案" },
  { id: "requests.manage", label: "学生诉求", description: "查看、处理和回复学生诉求" },
  { id: "workflows.manage", label: "事项流程", description: "创建和办理学生工作事项" },
  { id: "knowledge.manage", label: "知识与资料", description: "导入学校文件并维护知识库" },
  { id: "reports.view", label: "统计与总结", description: "查看统计并生成工作报告" },
  { id: "settings.ai", label: "模型设置", description: "配置智谱或 DeepSeek 模型" },
] as const;

export type TeacherPermission = typeof teacherPermissionCatalog[number]["id"];
export const allTeacherPermissions = teacherPermissionCatalog.map((item) => item.id);
export const AUTH_COOKIE = "qz_auth_session";
const SESSION_DAYS = 30;

export type AuthAccount = {
  id: string;
  username: string;
  role: AppRole;
  displayName: string;
  status: "active" | "disabled";
  permissions: string[];
  teacherId: string | null;
  studentNo: string | null;
  className: string | null;
};

type StoredAccount = {
  id: string;
  username: string;
  password_hash: string;
  role: AppRole;
  display_name: string;
  status: "active" | "disabled";
  permissions_json: string;
  teacher_id: string | null;
  student_no: string | null;
  class_name: string | null;
  created_at: string;
  updated_at: string;
};

function bytesToHex(bytes: Uint8Array) {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(value: string) {
  const bytes = new Uint8Array(value.length / 2);
  for (let index = 0; index < bytes.length; index += 1) bytes[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16);
  return bytes;
}

async function hashPassword(password: string, saltHex?: string) {
  const salt = saltHex ? hexToBytes(saltHex) : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: salt.buffer as ArrayBuffer, iterations: 60000 }, key, 256);
  return `${bytesToHex(salt)}:${bytesToHex(new Uint8Array(bits))}`;
}

async function passwordMatches(password: string, stored: string) {
  const [salt, expected] = stored.split(":");
  if (!salt || !expected) return false;
  const actual = (await hashPassword(password, salt)).split(":")[1];
  if (actual.length !== expected.length) return false;
  let difference = 0;
  for (let index = 0; index < actual.length; index += 1) difference |= actual.charCodeAt(index) ^ expected.charCodeAt(index);
  return difference === 0;
}

function toAccount(row: StoredAccount): AuthAccount {
  let permissions: string[] = [];
  try { permissions = JSON.parse(row.permissions_json || "[]") as string[]; } catch { permissions = []; }
  return {
    id: row.id,
    username: row.username,
    role: row.role,
    displayName: row.display_name,
    status: row.status,
    permissions,
    teacherId: row.teacher_id,
    studentNo: row.student_no,
    className: row.class_name,
  };
}

export async function ensureAuthSchema() {
  const db = await ensureEngagementSchema();
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS app_accounts (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL,
      display_name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      permissions_json TEXT NOT NULL DEFAULT '[]',
      teacher_id TEXT,
      student_no TEXT UNIQUE,
      class_name TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS app_sessions (
      token TEXT PRIMARY KEY,
      account_id TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_active_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (account_id) REFERENCES app_accounts(id)
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_accounts_role_status ON app_accounts(role, status)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_accounts_teacher_role ON app_accounts(teacher_id, role)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_sessions_account_expiry ON app_sessions(account_id, expires_at)"),
  ]);
  await ensureClassSchema();
  const admin = await db.prepare("SELECT id FROM app_accounts WHERE username = 'axbgs'").first();
  if (!admin) {
    const runtimeEnv = env as unknown as { ADMIN_INITIAL_PASSWORD?: string };
    const initialPassword = (runtimeEnv.ADMIN_INITIAL_PASSWORD ?? process.env.ADMIN_INITIAL_PASSWORD)?.trim();
    if (!initialPassword) {
      throw new Error("首次启动前必须配置 ADMIN_INITIAL_PASSWORD");
    }
    const passwordHash = await hashPassword(initialPassword);
    await db.prepare(`INSERT INTO app_accounts (id, username, password_hash, role, display_name, permissions_json)
      VALUES ('admin-axbgs', 'axbgs', ?, 'admin', '平台管理员', '[]')`).bind(passwordHash).run();
  }
  return db;
}

export function getSessionTokenFromRequest(request: Request) {
  const cookie = request.headers.get("cookie") ?? "";
  const value = cookie.split(";").map((item) => item.trim()).find((item) => item.startsWith(`${AUTH_COOKIE}=`));
  return value ? decodeURIComponent(value.slice(AUTH_COOKIE.length + 1)) : "";
}

export async function getAuthAccountByToken(token: string) {
  if (!token) return null;
  const db = await ensureAuthSchema();
  const row = await db.prepare(`SELECT a.* FROM app_sessions s JOIN app_accounts a ON a.id = s.account_id
    WHERE s.token = ? AND s.expires_at > CURRENT_TIMESTAMP AND a.status = 'active'`).bind(token).first<StoredAccount>();
  if (!row) return null;
  await db.prepare("UPDATE app_sessions SET last_active_at = CURRENT_TIMESTAMP WHERE token = ?").bind(token).run();
  return toAccount(row);
}

export async function getAuthAccountFromRequest(request: Request) {
  return getAuthAccountByToken(getSessionTokenFromRequest(request));
}

export function landingForRole(role: AppRole) {
  if (role === "admin") return "/admin";
  if (role === "student") return "/student";
  return "/";
}

export async function loginWithPassword(username: string, password: string) {
  const db = await ensureAuthSchema();
  const row = await db.prepare("SELECT * FROM app_accounts WHERE username = ?").bind(username.trim()).first<StoredAccount>();
  if (!row || row.status !== "active" || !await passwordMatches(password, row.password_hash)) return null;
  const token = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400000).toISOString();
  await db.batch([
    db.prepare("INSERT INTO app_sessions (token, account_id, expires_at) VALUES (?, ?, ?)").bind(token, row.id, expiresAt),
    db.prepare("DELETE FROM app_sessions WHERE expires_at <= CURRENT_TIMESTAMP"),
  ]);
  if (row.role === "student" && row.student_no) {
    await db.prepare("INSERT OR REPLACE INTO student_sessions (token, student_no, last_active_at) VALUES (?, ?, CURRENT_TIMESTAMP)")
      .bind(token, row.student_no).run();
  }
  return { token, account: toAccount(row), expiresAt };
}

export async function logoutSession(token: string) {
  if (!token) return;
  const db = await ensureAuthSchema();
  await db.batch([
    db.prepare("DELETE FROM app_sessions WHERE token = ?").bind(token),
    db.prepare("DELETE FROM student_sessions WHERE token = ?").bind(token),
  ]);
}

function cleanPermissions(values?: string[]) {
  const allowed = new Set<string>(allTeacherPermissions);
  return [...new Set((values ?? []).filter((value) => allowed.has(value)))];
}

export async function listTeacherAccounts() {
  const db = await ensureAuthSchema();
  const rows = await db.prepare(`SELECT a.*, COUNT(s.id) AS student_count FROM app_accounts a
    LEFT JOIN app_accounts s ON s.teacher_id = a.id AND s.role = 'student'
    WHERE a.role = 'teacher' GROUP BY a.id ORDER BY a.created_at DESC`).all<StoredAccount & { student_count: number }>();
  return rows.results.map((row) => ({ ...toAccount(row), studentCount: Number(row.student_count) }));
}

export async function createTeacherAccount(input: { username: string; password: string; displayName: string; permissions?: string[] }) {
  const db = await ensureAuthSchema();
  const passwordHash = await hashPassword(input.password);
  const id = `teacher-${crypto.randomUUID()}`;
  await db.prepare(`INSERT INTO app_accounts (id, username, password_hash, role, display_name, permissions_json)
    VALUES (?, ?, ?, 'teacher', ?, ?)`).bind(id, input.username.trim(), passwordHash, input.displayName.trim(), JSON.stringify(cleanPermissions(input.permissions))).run();
  return (await listTeacherAccounts()).find((item) => item.id === id) ?? null;
}

export async function updateTeacherAccount(input: { id: string; username: string; displayName: string; status: "active" | "disabled"; permissions?: string[]; password?: string }) {
  const db = await ensureAuthSchema();
  const existing = await db.prepare("SELECT id FROM app_accounts WHERE id = ? AND role = 'teacher'").bind(input.id).first();
  if (!existing) return null;
  if (input.password?.trim()) {
    await db.prepare(`UPDATE app_accounts SET username = ?, display_name = ?, status = ?, permissions_json = ?, password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
      .bind(input.username.trim(), input.displayName.trim(), input.status, JSON.stringify(cleanPermissions(input.permissions)), await hashPassword(input.password.trim()), input.id).run();
  } else {
    await db.prepare(`UPDATE app_accounts SET username = ?, display_name = ?, status = ?, permissions_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
      .bind(input.username.trim(), input.displayName.trim(), input.status, JSON.stringify(cleanPermissions(input.permissions)), input.id).run();
  }
  if (input.status === "disabled") {
    await db.batch([
      db.prepare("DELETE FROM student_sessions WHERE token IN (SELECT token FROM app_sessions WHERE account_id = ?)").bind(input.id),
      db.prepare("DELETE FROM app_sessions WHERE account_id = ?").bind(input.id),
    ]);
  }
  return (await listTeacherAccounts()).find((item) => item.id === input.id) ?? null;
}

export async function deleteTeacherAccount(id: string) {
  const db = await ensureAuthSchema();
  const student = await db.prepare("SELECT id FROM app_accounts WHERE teacher_id = ? AND role = 'student' LIMIT 1").bind(id).first();
  if (student) throw new Error("请先删除该教师名下的学生登录账号，再删除教师账号");
  await db.prepare("DELETE FROM app_sessions WHERE account_id = ?").bind(id).run();
  await db.prepare("DELETE FROM teacher_classes WHERE teacher_id = ?").bind(id).run();
  const result = await db.prepare("DELETE FROM app_accounts WHERE id = ? AND role = 'teacher'").bind(id).run();
  return Number(result.meta.changes) > 0;
}

export async function listStudentAccounts(teacherId: string) {
  const db = await ensureAuthSchema();
  const rows = await db.prepare("SELECT * FROM app_accounts WHERE role = 'student' AND teacher_id = ? ORDER BY class_name, student_no")
    .bind(teacherId).all<StoredAccount>();
  return rows.results.map(toAccount);
}

export async function listStudentAccountCandidates(teacherId: string) {
  const db = await ensureAuthSchema();
  const rows = await db.prepare(`SELECT s.student_no, s.name, s.class_name
    FROM students s
    WHERE s.counselor_id = ?
      AND NOT EXISTS (
        SELECT 1 FROM app_accounts a
        WHERE a.role = 'student' AND (a.student_no = s.student_no OR a.username = s.student_no)
      )
    ORDER BY s.class_name, s.student_no`).bind(teacherId).all<{ student_no: string; name: string; class_name: string }>();
  return rows.results;
}

export async function createAllStudentAccounts(teacherId: string) {
  const db = await ensureAuthSchema();
  const candidates = await listStudentAccountCandidates(teacherId);
  let created = 0;
  const failed: Array<{ studentNo: string; reason: string }> = [];

  for (const candidate of candidates) {
    try {
      await ensureTeacherClass(teacherId, { name: candidate.class_name });
      const passwordHash = await hashPassword(studentNamePassword(candidate.name));
      const result = await db.prepare(`INSERT OR IGNORE INTO app_accounts
        (id, username, password_hash, role, display_name, permissions_json, teacher_id, student_no, class_name)
        VALUES (?, ?, ?, 'student', ?, '[]', ?, ?, ?)`)
        .bind(`student-${crypto.randomUUID()}`, candidate.student_no, passwordHash, candidate.name, teacherId, candidate.student_no, candidate.class_name).run();
      if (Number(result.meta.changes) < 1) {
        failed.push({ studentNo: candidate.student_no, reason: "登录账号已存在" });
        continue;
      }
      await db.batch([
        db.prepare("UPDATE students SET counselor_id = ? WHERE student_no = ? AND (counselor_id IS NULL OR counselor_id = ?)")
          .bind(teacherId, candidate.student_no, teacherId),
        db.prepare(`INSERT INTO pilot_students (student_no, name, class_name) VALUES (?, ?, ?)
          ON CONFLICT(student_no) DO UPDATE SET name = excluded.name, class_name = excluded.class_name`)
          .bind(candidate.student_no, candidate.name, candidate.class_name),
      ]);
      created += 1;
    } catch (error) {
      failed.push({ studentNo: candidate.student_no, reason: error instanceof Error ? error.message : "创建失败" });
    }
  }

  return { created, skipped: failed.length, failed, students: await listStudentAccounts(teacherId) };
}

export async function createStudentAccount(teacherId: string, input: { studentNo: string; name: string; className: string; password: string }) {
  const db = await ensureAuthSchema();
  const studentNo = input.studentNo.trim();
  const name = input.name.trim();
  const className = input.className.trim();
  const teacherClass = await ensureTeacherClass(teacherId, { name: className });
  const id = `student-${crypto.randomUUID()}`;
  await db.batch([
    db.prepare(`INSERT INTO app_accounts (id, username, password_hash, role, display_name, permissions_json, teacher_id, student_no, class_name)
      VALUES (?, ?, ?, 'student', ?, '[]', ?, ?, ?)`).bind(id, studentNo, await hashPassword(input.password), name, teacherId, studentNo, className),
    db.prepare("INSERT INTO pilot_students (student_no, name, class_name) VALUES (?, ?, ?) ON CONFLICT(student_no) DO UPDATE SET name = excluded.name, class_name = excluded.class_name")
      .bind(studentNo, name, className),
    db.prepare(`INSERT INTO students (id, student_no, name, department, grade, class_name, community, building, room, status, counselor_id)
      VALUES (?, ?, ?, ?, ?, ?, '', '', '', 'normal', ?)
      ON CONFLICT(student_no) DO UPDATE SET name = excluded.name, class_name = excluded.class_name, counselor_id = excluded.counselor_id`)
      .bind(studentNo, studentNo, name, teacherClass?.department || "待补充", teacherClass?.grade || studentNo.slice(0, 4), className, teacherId),
  ]);
  return (await listStudentAccounts(teacherId)).find((item) => item.id === id) ?? null;
}

export async function updateStudentAccount(teacherId: string, input: { id: string; name: string; className: string; status: "active" | "disabled"; password?: string }) {
  const db = await ensureAuthSchema();
  const existing = await db.prepare("SELECT * FROM app_accounts WHERE id = ? AND teacher_id = ? AND role = 'student'").bind(input.id, teacherId).first<StoredAccount>();
  if (!existing?.student_no) return null;
  await ensureTeacherClass(teacherId, { name: input.className });
  if (input.password?.trim()) {
    await db.prepare("UPDATE app_accounts SET display_name = ?, class_name = ?, status = ?, password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .bind(input.name.trim(), input.className.trim(), input.status, await hashPassword(input.password.trim()), input.id).run();
  } else {
    await db.prepare("UPDATE app_accounts SET display_name = ?, class_name = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .bind(input.name.trim(), input.className.trim(), input.status, input.id).run();
  }
  await db.batch([
    db.prepare("UPDATE pilot_students SET name = ?, class_name = ? WHERE student_no = ?").bind(input.name.trim(), input.className.trim(), existing.student_no),
    db.prepare("UPDATE students SET name = ?, class_name = ? WHERE student_no = ?").bind(input.name.trim(), input.className.trim(), existing.student_no),
  ]);
  if (input.status === "disabled") {
    await db.batch([
      db.prepare("DELETE FROM student_sessions WHERE token IN (SELECT token FROM app_sessions WHERE account_id = ?)").bind(input.id),
      db.prepare("DELETE FROM app_sessions WHERE account_id = ?").bind(input.id),
    ]);
  }
  return (await listStudentAccounts(teacherId)).find((item) => item.id === input.id) ?? null;
}

export async function deleteStudentAccount(teacherId: string, id: string) {
  const db = await ensureAuthSchema();
  const existing = await db.prepare("SELECT id FROM app_accounts WHERE id = ? AND teacher_id = ? AND role = 'student'").bind(id, teacherId).first();
  if (!existing) return false;
  await db.batch([
    db.prepare("DELETE FROM student_sessions WHERE token IN (SELECT token FROM app_sessions WHERE account_id = ?)").bind(id),
    db.prepare("DELETE FROM app_sessions WHERE account_id = ?").bind(id),
    db.prepare("DELETE FROM app_accounts WHERE id = ?").bind(id),
  ]);
  return true;
}
