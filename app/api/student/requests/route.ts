import { createStudentRequest } from "../../../lib/engagement-storage";
import type { StudentChatMessage } from "../../../lib/student-agent";
import { getSessionTokenFromRequest } from "../../../lib/auth-storage";

export async function POST(request: Request) {
  const body = await request.json() as {
    category?: string; title?: string; summary?: string; urgency?: string; conversation?: StudentChatMessage[];
  };
  if (!body.category || !body.title || !body.summary || !body.conversation?.length) return Response.json({ error: "诉求内容不完整" }, { status: 400 });
  const result = await createStudentRequest({
    token: getSessionTokenFromRequest(request), category: body.category, title: body.title,
    summary: body.summary, urgency: body.urgency === "urgent" ? "urgent" : "normal", conversation: body.conversation,
  });
  if (!result) return Response.json({ error: "学生身份已失效" }, { status: 401 });
  return Response.json({ request: { id: result.id, status: "new", merged: result.merged, messageCount: result.messageCount } }, { status: 201 });
}
