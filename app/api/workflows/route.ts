import { createWorkflowCase, deleteWorkflowCase, listWorkflowCases, updateWorkflowCase } from "../../lib/platform-storage";
import { getAuthAccountFromRequest } from "../../lib/auth-storage";

export async function GET(request: Request) {
  try {
    const teacher = await getAuthAccountFromRequest(request);
    if (teacher?.role !== "teacher") return Response.json({ error: "仅教师可查看事项" }, { status: 403 });
    return Response.json({ cases: await listWorkflowCases(teacher.id) });
  }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "读取事项失败" }, { status: 500 }); }
}

export async function POST(request: Request) {
  const teacher = await getAuthAccountFromRequest(request);
  if (teacher?.role !== "teacher") return Response.json({ error: "仅教师可创建事项" }, { status: 403 });
  const body = await request.json() as { type?: string; title?: string; subject?: string; stage?: string; note?: string };
  if (!body.type?.trim() || !body.title?.trim()) return Response.json({ error: "请填写事项类型和标题" }, { status: 400 });
  try { return Response.json({ case: await createWorkflowCase({ type: body.type.trim(), title: body.title.trim(), subject: body.subject?.trim(), stage: body.stage?.trim(), note: body.note?.trim(), teacherId: teacher.id, teacherName: teacher.displayName }) }, { status: 201 }); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "创建事项失败" }, { status: 500 }); }
}

export async function PATCH(request: Request) {
  const teacher = await getAuthAccountFromRequest(request);
  if (teacher?.role !== "teacher") return Response.json({ error: "仅教师可修改事项" }, { status: 403 });
  const body = await request.json() as { id?: number; status?: "open" | "waiting" | "closed"; stage?: string };
  if (!body.id) return Response.json({ error: "缺少事项编号" }, { status: 400 });
  return Response.json({ case: await updateWorkflowCase({ ...body, id: body.id, teacherId: teacher.id }) });
}

export async function DELETE(request: Request) {
  const teacher = await getAuthAccountFromRequest(request);
  if (teacher?.role !== "teacher") return Response.json({ error: "仅教师可删除事项" }, { status: 403 });
  const id = Number(new URL(request.url).searchParams.get("id"));
  if (!id) return Response.json({ error: "缺少事项编号" }, { status: 400 });
  if (!await deleteWorkflowCase(id, teacher.id)) return Response.json({ error: "事项不存在" }, { status: 404 });
  return Response.json({ deleted: true, id });
}
