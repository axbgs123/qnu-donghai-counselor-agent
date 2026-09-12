import { createAllStudentAccounts, createStudentAccount, deleteStudentAccount, getAuthAccountFromRequest, listStudentAccountCandidates, listStudentAccounts, updateStudentAccount } from "../../../lib/auth-storage";
import { getTeacherClassWorkspace } from "../../../lib/class-storage";

async function requireTeacher(request: Request) {
  const account = await getAuthAccountFromRequest(request);
  return account?.role === "teacher" ? account : null;
}

export async function GET(request: Request) {
  const teacher = await requireTeacher(request);
  if (!teacher) return Response.json({ error: "仅教师可操作" }, { status: 403 });
  const [students, candidates, workspace] = await Promise.all([listStudentAccounts(teacher.id), listStudentAccountCandidates(teacher.id), getTeacherClassWorkspace(teacher.id)]);
  return Response.json({ students, uncreatedCount: candidates.length, classes: workspace.classes });
}

export async function POST(request: Request) {
  const teacher = await requireTeacher(request);
  if (!teacher) return Response.json({ error: "仅教师可操作" }, { status: 403 });
  const body = await request.json() as { action?: "create_all"; studentNo?: string; name?: string; className?: string; password?: string };
  if (body.action === "create_all") {
    const result = await createAllStudentAccounts(teacher.id);
    return Response.json(result, { status: result.created ? 201 : 200 });
  }
  if (!body.studentNo?.trim() || !body.name?.trim() || !body.className?.trim() || !body.password || body.password.length < 6) {
    return Response.json({ error: "请填写学号、姓名、班级和至少6位初始密码" }, { status: 400 });
  }
  try {
    return Response.json({ student: await createStudentAccount(teacher.id, { studentNo: body.studentNo, name: body.name, className: body.className, password: body.password }) }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error && error.message.includes("UNIQUE") ? "该学号或登录账号已存在" : error instanceof Error ? error.message : "创建失败";
    return Response.json({ error: message }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  const teacher = await requireTeacher(request);
  if (!teacher) return Response.json({ error: "仅教师可操作" }, { status: 403 });
  const body = await request.json() as { id?: string; name?: string; className?: string; status?: "active" | "disabled"; password?: string };
  if (!body.id || !body.name?.trim() || !body.className?.trim() || !body.status) return Response.json({ error: "学生账号信息不完整" }, { status: 400 });
  if (body.password && body.password.length < 6) return Response.json({ error: "新密码至少6位" }, { status: 400 });
  const student = await updateStudentAccount(teacher.id, { id: body.id, name: body.name, className: body.className, status: body.status, password: body.password });
  return student ? Response.json({ student }) : Response.json({ error: "学生账号不存在或不属于当前教师" }, { status: 404 });
}

export async function DELETE(request: Request) {
  const teacher = await requireTeacher(request);
  if (!teacher) return Response.json({ error: "仅教师可操作" }, { status: 403 });
  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!id) return Response.json({ error: "缺少学生账号编号" }, { status: 400 });
  return await deleteStudentAccount(teacher.id, id) ? Response.json({ deleted: true }) : Response.json({ error: "学生账号不存在或不属于当前教师" }, { status: 404 });
}
