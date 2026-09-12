import { consumeStudentDailyTurn, createStudentRequest, getStudentByToken, getStudentDailyUsage } from "../../../lib/engagement-storage";
import { searchSourceDocuments } from "../../../lib/import-storage";
import {
  answerStudentInquiry,
  classifyStudentIntent,
  createStudentMessageResult,
  type StudentChatMessage,
  type StudentIntent,
} from "../../../lib/student-agent";
import { getAuthAccountFromRequest, getSessionTokenFromRequest } from "../../../lib/auth-storage";

export async function POST(request: Request) {
  const token = getSessionTokenFromRequest(request);
  const student = await getStudentByToken(token);
  if (!student) return Response.json({ error: "学生身份已失效" }, { status: 401 });
  const account = await getAuthAccountFromRequest(request);
  if (account?.role !== "student" || !account.teacherId) return Response.json({ error: "学生账号未关联负责教师" }, { status: 403 });
  const body = await request.json() as { messages?: StudentChatMessage[]; mode?: StudentIntent };
  const messages = (body.messages ?? []).filter((message) => message && ["student", "assistant"].includes(message.role) && message.text?.trim()).slice(-39);
  const latest = [...messages].reverse().find((message) => message.role === "student")?.text.trim() ?? "";
  if (!latest) return Response.json({ error: "请输入需要咨询或留言的事情" }, { status: 400 });
  const intent = body.mode === "inquiry" || body.mode === "message" ? body.mode : classifyStudentIntent(latest);
  const usage = intent === "inquiry" ? await consumeStudentDailyTurn(student.student_no) : await getStudentDailyUsage(student.student_no);
  if (intent === "inquiry" && "allowed" in usage && !usage.allowed) return Response.json({ error: "今天的20轮智能问答额度已经用完。如仍需使用，请点击“向老师申请重新计数”。", dailyUsage: usage }, { status: 429 });
  if (intent === "inquiry") {
    const uploaded = await searchSourceDocuments(latest, { audience: "student" });
    const uploadedSources = uploaded?.cards?.map((card) => ({ title: card.title, detail: card.subtitle })).slice(0, 4) ?? [];
    const result = await answerStudentInquiry({
      messages,
      student,
      evidence: uploaded?.answer || "",
      sources: uploadedSources,
      teacherId: account.teacherId,
      disableExternalAi: request.headers.get("x-local-ai") === "1",
    });
    return Response.json({ ...result, dailyUsage: usage });
  }

  const result = createStudentMessageResult(messages);
  const created = await createStudentRequest({
    token,
    category: result.category,
    title: result.title,
    summary: result.summary,
    urgency: result.urgency,
    conversation: [{ role: "student", text: latest, resolution: "unresolved", kind: "message" }],
  });
  return Response.json({ ...result, request: created ? { id: created.id, status: "new", merged: created.merged, messageCount: created.messageCount } : null, dailyUsage: usage });
}
