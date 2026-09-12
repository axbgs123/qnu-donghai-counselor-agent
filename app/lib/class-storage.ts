import { ensureEngagementSchema } from "./engagement-storage";

export type TeacherClass = {
  id: string;
  name: string;
  grade: string;
  department: string;
  studentCount: number;
  accountCount: number;
  createdAt: string;
  updatedAt: string;
};

export type ClassStudent = {
  studentNo: string;
  name: string;
  className: string;
  grade: string;
  department: string;
  accountId: string | null;
  accountStatus: "active" | "disabled" | null;
};

type StoredClass = {
  id: string;
  name: string;
  grade: string;
  department: string;
  student_count: number;
  account_count: number;
  created_at: string;
  updated_at: string;
};

export async function ensureClassSchema() {
  const db = await ensureEngagementSchema();
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS teacher_classes (
      id TEXT PRIMARY KEY,
      teacher_id TEXT NOT NULL,
      name TEXT NOT NULL,
      grade TEXT NOT NULL DEFAULT '',
      department TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(teacher_id, name)
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_teacher_classes_teacher ON teacher_classes(teacher_id, name)"),
  ]);
  return db;
}

function clean(value: string | undefined, maxLength = 80) {
  return (value ?? "").trim().slice(0, maxLength);
}

function mapClass(row: StoredClass): TeacherClass {
  return {
    id: row.id,
    name: row.name,
    grade: row.grade,
    department: row.department,
    studentCount: Number(row.student_count || 0),
    accountCount: Number(row.account_count || 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function ensureTeacherClass(teacherId: string, input: { name: string; grade?: string; department?: string }) {
  const db = await ensureClassSchema();
  const name = clean(input.name, 50);
  if (!name) throw new Error("班级名称不能为空");
  const grade = clean(input.grade, 20);
  const department = clean(input.department, 80);
  await db.prepare(`INSERT INTO teacher_classes (id, teacher_id, name, grade, department)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(teacher_id, name) DO UPDATE SET
      grade = CASE WHEN teacher_classes.grade = '' THEN excluded.grade ELSE teacher_classes.grade END,
      department = CASE WHEN teacher_classes.department = '' THEN excluded.department ELSE teacher_classes.department END,
      updated_at = CURRENT_TIMESTAMP`)
    .bind(`class-${crypto.randomUUID()}`, teacherId, name, grade, department).run();
  return db.prepare("SELECT id, teacher_id, name, grade, department, created_at, updated_at FROM teacher_classes WHERE teacher_id = ? AND name = ?")
    .bind(teacherId, name).first<{ id: string; teacher_id: string; name: string; grade: string; department: string; created_at: string; updated_at: string }>();
}

async function backfillTeacherClasses(teacherId: string) {
  const db = await ensureClassSchema();
  await db.prepare(`INSERT OR IGNORE INTO teacher_classes (id, teacher_id, name, grade, department)
    SELECT 'class-' || lower(hex(randomblob(16))), ?, class_name,
      COALESCE(MAX(NULLIF(grade, '')), ''), COALESCE(MAX(NULLIF(department, '')), '')
    FROM students
    WHERE counselor_id = ? AND TRIM(class_name) <> ''
    GROUP BY class_name`).bind(teacherId, teacherId).run();
  await db.prepare(`INSERT OR IGNORE INTO teacher_classes (id, teacher_id, name)
    SELECT 'class-' || lower(hex(randomblob(16))), ?, class_name
    FROM app_accounts
    WHERE teacher_id = ? AND role = 'student' AND TRIM(COALESCE(class_name, '')) <> ''
    GROUP BY class_name`).bind(teacherId, teacherId).run();
}

export async function getTeacherClassWorkspace(teacherId: string) {
  const db = await ensureClassSchema();
  await backfillTeacherClasses(teacherId);
  const [classRows, studentRows] = await Promise.all([
    db.prepare(`SELECT c.*,
      (SELECT COUNT(*) FROM students s WHERE s.counselor_id = c.teacher_id AND s.class_name = c.name) AS student_count,
      (SELECT COUNT(*) FROM app_accounts a WHERE a.teacher_id = c.teacher_id AND a.role = 'student' AND a.class_name = c.name) AS account_count
      FROM teacher_classes c WHERE c.teacher_id = ? ORDER BY c.grade DESC, c.name`)
      .bind(teacherId).all<StoredClass>(),
    db.prepare(`SELECT s.student_no, s.name, s.class_name, s.grade, s.department,
      a.id AS account_id, a.status AS account_status
      FROM students s
      LEFT JOIN app_accounts a ON a.student_no = s.student_no AND a.role = 'student' AND a.teacher_id = ?
      WHERE s.counselor_id = ?
      ORDER BY s.class_name, s.student_no`).bind(teacherId, teacherId).all<{
        student_no: string; name: string; class_name: string; grade: string; department: string;
        account_id: string | null; account_status: "active" | "disabled" | null;
      }>(),
  ]);
  return {
    classes: classRows.results.map(mapClass),
    students: studentRows.results.map((row) => ({
      studentNo: row.student_no,
      name: row.name,
      className: row.class_name,
      grade: row.grade,
      department: row.department,
      accountId: row.account_id,
      accountStatus: row.account_status,
    } satisfies ClassStudent)),
  };
}

export async function createTeacherClass(teacherId: string, input: { name: string; grade?: string; department?: string }) {
  const db = await ensureClassSchema();
  const name = clean(input.name, 50);
  if (!name) throw new Error("请填写班级名称");
  const duplicate = await db.prepare("SELECT id FROM teacher_classes WHERE teacher_id = ? AND name = ?").bind(teacherId, name).first();
  if (duplicate) throw new Error("该班级已经存在");
  const id = `class-${crypto.randomUUID()}`;
  await db.prepare("INSERT INTO teacher_classes (id, teacher_id, name, grade, department) VALUES (?, ?, ?, ?, ?)")
    .bind(id, teacherId, name, clean(input.grade, 20), clean(input.department, 80)).run();
  return (await getTeacherClassWorkspace(teacherId)).classes.find((item) => item.id === id) ?? null;
}

export async function updateTeacherClass(teacherId: string, input: { id: string; name: string; grade?: string; department?: string }) {
  const db = await ensureClassSchema();
  const existing = await db.prepare("SELECT id, name FROM teacher_classes WHERE id = ? AND teacher_id = ?")
    .bind(input.id, teacherId).first<{ id: string; name: string }>();
  if (!existing) return null;
  const name = clean(input.name, 50);
  if (!name) throw new Error("请填写班级名称");
  const duplicate = await db.prepare("SELECT id FROM teacher_classes WHERE teacher_id = ? AND name = ? AND id <> ?")
    .bind(teacherId, name, input.id).first();
  if (duplicate) throw new Error("该班级名称已经存在");
  const statements = [
    db.prepare("UPDATE teacher_classes SET name = ?, grade = ?, department = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND teacher_id = ?")
      .bind(name, clean(input.grade, 20), clean(input.department, 80), input.id, teacherId),
  ];
  if (existing.name !== name) {
    statements.push(
      db.prepare("UPDATE students SET class_name = ? WHERE counselor_id = ? AND class_name = ?").bind(name, teacherId, existing.name),
      db.prepare("UPDATE app_accounts SET class_name = ?, updated_at = CURRENT_TIMESTAMP WHERE teacher_id = ? AND role = 'student' AND class_name = ?").bind(name, teacherId, existing.name),
      db.prepare(`UPDATE pilot_students SET class_name = ? WHERE student_no IN (
        SELECT student_no FROM app_accounts WHERE teacher_id = ? AND role = 'student'
      ) AND class_name = ?`).bind(name, teacherId, existing.name),
      db.prepare("UPDATE student_requests SET class_name = ?, updated_at = CURRENT_TIMESTAMP WHERE teacher_id = ? AND class_name = ?").bind(name, teacherId, existing.name),
    );
  }
  await db.batch(statements);
  return (await getTeacherClassWorkspace(teacherId)).classes.find((item) => item.id === input.id) ?? null;
}

export async function deleteTeacherClass(teacherId: string, id: string) {
  const db = await ensureClassSchema();
  const existing = await db.prepare(`SELECT c.name,
    (SELECT COUNT(*) FROM students s WHERE s.counselor_id = c.teacher_id AND s.class_name = c.name) AS student_count,
    (SELECT COUNT(*) FROM app_accounts a WHERE a.teacher_id = c.teacher_id AND a.role = 'student' AND a.class_name = c.name) AS account_count
    FROM teacher_classes c WHERE c.id = ? AND c.teacher_id = ?`).bind(id, teacherId)
    .first<{ name: string; student_count: number; account_count: number }>();
  if (!existing) return false;
  if (Number(existing.student_count) > 0 || Number(existing.account_count) > 0) throw new Error("该班级仍有学生，请先在学生账号中调整班级后再删除");
  await db.prepare("DELETE FROM teacher_classes WHERE id = ? AND teacher_id = ?").bind(id, teacherId).run();
  return true;
}
