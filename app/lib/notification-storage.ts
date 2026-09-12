import { ensureEngagementSchema } from "./engagement-storage";

export type TeacherNotification = {
  key: string;
  type: "request" | "task" | "document";
  title: string;
  detail: string;
  href: string;
  createdAt: string;
  read: boolean;
};

export async function ensureNotificationSchema() {
  const db = await ensureEngagementSchema();
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS notification_reads (
      teacher_id TEXT NOT NULL,
      notification_key TEXT NOT NULL,
      read_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (teacher_id, notification_key)
    )`),
    db.prepare("DELETE FROM notification_reads WHERE read_at < datetime('now', '-30 days')"),
  ]);
  return db;
}

export async function listTeacherNotifications(teacherId: string) {
  const db = await ensureNotificationSchema();
  const [requests, tasks, documents, reads] = await Promise.all([
    db.prepare(`SELECT id, student_name, category, title, urgency, message_count, COALESCE(last_message_at, updated_at, created_at) AS last_message_at FROM student_requests
      WHERE teacher_id = ? AND status = 'new' ORDER BY COALESCE(last_message_at, updated_at, created_at) DESC LIMIT 20`).bind(teacherId).all<{
        id: string; student_name: string; category: string; title: string; urgency: string; message_count: number; last_message_at: string;
      }>(),
    db.prepare(`SELECT id, title, module, due_at, priority, updated_at FROM tasks
      WHERE owner_id = ? AND status != 'done' AND due_at IS NOT NULL AND due_at <= datetime('now', '+3 days')
      ORDER BY due_at ASC LIMIT 20`).bind(teacherId).all<{
        id: number; title: string; module: string; due_at: string; priority: string; updated_at: string;
      }>(),
    db.prepare(`SELECT id, title, category, updated_at FROM source_documents
      WHERE owner_teacher_id = ? AND review_status = 'needs_review' ORDER BY updated_at DESC LIMIT 12`).bind(teacherId).all<{
        id: string; title: string; category: string; updated_at: string;
      }>(),
    db.prepare("SELECT notification_key FROM notification_reads WHERE teacher_id = ?").bind(teacherId).all<{ notification_key: string }>(),
  ]);
  const readKeys = new Set(reads.results.map((item) => item.notification_key));
  const items: TeacherNotification[] = [
    ...requests.results.map((item) => {
      const key = `request:${item.id}:${item.last_message_at}`;
      return {
        key, type: "request" as const,
        title: item.urgency === "urgent" ? `紧急诉求：${item.student_name}` : `新学生诉求：${item.student_name}`,
        detail: `${item.category} · ${item.message_count > 1 ? `连续${item.message_count}条留言 · ` : ""}${item.title}`,
        href: `/requests?id=${encodeURIComponent(item.id)}`, createdAt: item.last_message_at, read: readKeys.has(key),
      };
    }),
    ...tasks.results.map((item) => ({
      key: `task:${item.id}`, type: "task" as const, title: `待办临近：${item.title}`,
      detail: `${item.module} · 截止 ${new Date(item.due_at).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}`,
      href: "/", createdAt: item.updated_at, read: readKeys.has(`task:${item.id}`),
    })),
    ...documents.results.map((item) => ({
      key: `document:${item.id}`, type: "document" as const, title: `资料待确认：${item.title}`,
      detail: `${item.category} · 确认后才会用于学生问答`, href: "/knowledge", createdAt: item.updated_at, read: readKeys.has(`document:${item.id}`),
    })),
  ];
  items.sort((a, b) => Number(a.read) - Number(b.read) || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return { items: items.slice(0, 40), unreadCount: items.filter((item) => !item.read).length };
}

export async function markNotificationsRead(teacherId: string, keys: string[]) {
  const db = await ensureNotificationSchema();
  const clean = [...new Set(keys.map((key) => key.trim()).filter(Boolean))].slice(0, 100);
  if (clean.length) await db.batch(clean.map((key) => db.prepare(`INSERT INTO notification_reads (teacher_id, notification_key)
    VALUES (?, ?) ON CONFLICT(teacher_id, notification_key) DO UPDATE SET read_at = CURRENT_TIMESTAMP`).bind(teacherId, key)));
  return listTeacherNotifications(teacherId);
}
