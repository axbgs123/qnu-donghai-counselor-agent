import { deleteAssistantConversation, getAssistantConversation, listAssistantConversations, saveAssistantConversation, type StoredConversationMessage } from "../../../lib/conversation-storage";
import { getAuthAccountFromRequest } from "../../../lib/auth-storage";

async function teacherFrom(request: Request) {
  const account = await getAuthAccountFromRequest(request);
  return account?.role === "teacher" ? account : null;
}

export async function GET(request: Request) {
  const teacher = await teacherFrom(request);
  if (!teacher) return Response.json({ error: "仅教师可查看助手历史" }, { status: 403 });
  const id = new URL(request.url).searchParams.get("id")?.trim();
  if (id) {
    const conversation = await getAssistantConversation(id, teacher.id);
    if (!conversation) return Response.json({ error: "对话不存在或已过期" }, { status: 404 });
    return Response.json({ conversation, retentionDays: 7 });
  }
  return Response.json({ conversations: await listAssistantConversations(teacher.id), retentionDays: 7 });
}

export async function POST(request: Request) {
  const teacher = await teacherFrom(request);
  if (!teacher) return Response.json({ error: "仅教师可保存助手历史" }, { status: 403 });
  const body = await request.json() as { id?: string; title?: string; messages?: StoredConversationMessage[] };
  if (!body.id?.trim() || !Array.isArray(body.messages)) return Response.json({ error: "对话内容不完整" }, { status: 400 });
  const messages = body.messages.filter((item) => item && ["user", "assistant"].includes(item.role) && typeof item.text === "string");
  if (!messages.length) return Response.json({ error: "对话内容为空" }, { status: 400 });
  const conversation = await saveAssistantConversation({
    id: body.id.trim(), teacherId: teacher.id,
    title: body.title?.trim() || messages.find((item) => item.role === "user")?.text.slice(0, 32) || "新对话",
    messages,
  });
  return Response.json({ conversation }, { status: 201 });
}

export async function DELETE(request: Request) {
  const teacher = await teacherFrom(request);
  if (!teacher) return Response.json({ error: "仅教师可删除助手历史" }, { status: 403 });
  const id = new URL(request.url).searchParams.get("id")?.trim();
  if (!id) return Response.json({ error: "缺少对话编号" }, { status: 400 });
  if (!await deleteAssistantConversation(id, teacher.id)) return Response.json({ error: "对话不存在" }, { status: 404 });
  return Response.json({ deleted: true });
}
