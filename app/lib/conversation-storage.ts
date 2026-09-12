import { ensureImportSchema } from "./import-storage";

export type StoredConversationMessage = {
  role: "user" | "assistant";
  text: string;
  cards?: unknown[];
  sources?: unknown[];
  actions?: unknown[];
  suggestions?: string[];
  tools?: string[];
  mode?: string;
};

type ConversationRow = {
  id: string;
  teacher_id: string;
  title: string;
  messages_json: string;
  created_at: string;
  updated_at: string;
};

const RETENTION_DAYS = 7;

export async function ensureConversationSchema() {
  const db = await ensureImportSchema();
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS assistant_conversations (
      id TEXT PRIMARY KEY,
      teacher_id TEXT NOT NULL,
      title TEXT NOT NULL,
      messages_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_assistant_conversations_teacher_updated ON assistant_conversations(teacher_id, updated_at)"),
    db.prepare(`DELETE FROM assistant_conversations WHERE updated_at < datetime('now', '-${RETENTION_DAYS} days')`),
  ]);
  return db;
}

function parseMessages(value: string) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed as StoredConversationMessage[] : [];
  } catch { return []; }
}

function toConversation(row: ConversationRow) {
  return { id: row.id, title: row.title, messages: parseMessages(row.messages_json), createdAt: row.created_at, updatedAt: row.updated_at };
}

function toConversationSummary(row: Omit<ConversationRow, "teacher_id" | "messages_json">) {
  return { id: row.id, title: row.title, createdAt: row.created_at, updatedAt: row.updated_at };
}

export async function listAssistantConversations(teacherId: string) {
  const db = await ensureConversationSchema();
  const rows = await db.prepare("SELECT id, title, created_at, updated_at FROM assistant_conversations WHERE teacher_id = ? ORDER BY updated_at DESC LIMIT 50")
    .bind(teacherId).all<Omit<ConversationRow, "teacher_id" | "messages_json">>();
  return rows.results.map(toConversationSummary);
}

export async function getAssistantConversation(id: string, teacherId: string) {
  const db = await ensureConversationSchema();
  const row = await db.prepare("SELECT * FROM assistant_conversations WHERE id = ? AND teacher_id = ? LIMIT 1")
    .bind(id, teacherId).first<ConversationRow>();
  return row ? toConversation(row) : null;
}

export async function saveAssistantConversation(input: { id: string; teacherId: string; title: string; messages: StoredConversationMessage[] }) {
  const db = await ensureConversationSchema();
  const messages = input.messages.slice(-50).map((message) => ({ ...message, text: String(message.text || "").slice(0, 12000) }));
  await db.prepare(`INSERT INTO assistant_conversations (id, teacher_id, title, messages_json)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET title = excluded.title, messages_json = excluded.messages_json,
      updated_at = CURRENT_TIMESTAMP WHERE teacher_id = excluded.teacher_id`)
    .bind(input.id, input.teacherId, input.title.slice(0, 80), JSON.stringify(messages)).run();
  const row = await db.prepare("SELECT * FROM assistant_conversations WHERE id = ? AND teacher_id = ?")
    .bind(input.id, input.teacherId).first<ConversationRow>();
  return row ? toConversation(row) : null;
}

export async function deleteAssistantConversation(id: string, teacherId: string) {
  const db = await ensureConversationSchema();
  const result = await db.prepare("DELETE FROM assistant_conversations WHERE id = ? AND teacher_id = ?").bind(id, teacherId).run();
  return Number(result.meta.changes) > 0;
}
