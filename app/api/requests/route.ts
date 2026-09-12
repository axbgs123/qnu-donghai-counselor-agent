import { decideDailyUsageReset, deleteStudentRequest, getStudentRequest, getStudentRequestMetrics, listStudentRequests, updateStudentRequest, type StudentRequestStatus } from "../../lib/engagement-storage";
import { getAuthAccountFromRequest } from "../../lib/auth-storage";

async function requireTeacher(request: Request) {
  const account = await getAuthAccountFromRequest(request);
  return account?.role === "teacher" ? account : null;
}

export async function GET(request: Request) {
  const teacher = await requireTeacher(request);
  if (!teacher) return Response.json({ error: "仅教师可查看学生诉求" }, { status: 403 });
  const params = new URL(request.url).searchParams;
  const id = params.get("id")?.trim();
  if (id) {
    const item = await getStudentRequest(id, teacher.id);
    if (!item) return Response.json({ error: "诉求不存在" }, { status: 404 });
    return Response.json({ request: item });
  }
  if (params.get("summary") === "1") return Response.json({ requests: [], metrics: await getStudentRequestMetrics(teacher.id) });
  return Response.json(await listStudentRequests({ teacherId: teacher.id, status: params.get("status") || undefined, className: params.get("class") || undefined }));
}

export async function DELETE(request: Request) {
  const teacher = await requireTeacher(request);
  if (!teacher) return Response.json({ error: "仅教师可删除学生诉求" }, { status: 403 });
  const id = new URL(request.url).searchParams.get("id")?.trim();
  if (!id) return Response.json({ error: "缺少诉求编号" }, { status: 400 });
  if (!await deleteStudentRequest(id, teacher.id)) return Response.json({ error: "诉求不存在" }, { status: 404 });
  return Response.json({ deleted: true, id });
}

export async function PATCH(request: Request) {
  const teacher = await requireTeacher(request);
  if (!teacher) return Response.json({ error: "仅教师可处理学生诉求" }, { status: 403 });
  const body = await request.json() as { id?: string; status?: StudentRequestStatus; reply?: string; replyChannel?: string; resetDecision?: "approve" | "reject" };
  if (body.id && body.resetDecision) {
    const result = await decideDailyUsageReset(body.id, body.resetDecision === "approve", teacher.id);
    if (!result) return Response.json({ error: "重置申请不存在" }, { status: 404 });
    return Response.json({ request: result });
  }
  if (!body.id || !body.status || !["new", "processing", "resolved"].includes(body.status)) return Response.json({ error: "参数不完整" }, { status: 400 });
  const result = await updateStudentRequest({ id: body.id, teacherId: teacher.id, status: body.status, reply: body.reply, replyChannel: body.replyChannel });
  if (!result) return Response.json({ error: "诉求不存在" }, { status: 404 });
  return Response.json({ request: result });
}
