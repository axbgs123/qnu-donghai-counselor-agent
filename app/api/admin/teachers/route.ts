import { createTeacherAccount, deleteTeacherAccount, getAuthAccountFromRequest, listTeacherAccounts, updateTeacherAccount } from "../../../lib/auth-storage";

async function requireAdmin(request: Request) {
  const account = await getAuthAccountFromRequest(request);
  return account?.role === "admin" ? account : null;
}

export async function GET(request: Request) {
  if (!await requireAdmin(request)) return Response.json({ error: "仅管理员可操作" }, { status: 403 });
  return Response.json({ teachers: await listTeacherAccounts() });
}

export async function POST(request: Request) {
  if (!await requireAdmin(request)) return Response.json({ error: "仅管理员可操作" }, { status: 403 });
  const body = await request.json() as { username?: string; password?: string; displayName?: string; permissions?: string[] };
  if (!body.username?.trim() || !body.displayName?.trim() || !body.password || body.password.length < 6) {
    return Response.json({ error: "请填写教师姓名、登录账号和至少6位初始密码" }, { status: 400 });
  }
  try {
    return Response.json({ teacher: await createTeacherAccount({ username: body.username, password: body.password, displayName: body.displayName, permissions: body.permissions }) }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error && error.message.includes("UNIQUE") ? "登录账号已被使用" : error instanceof Error ? error.message : "创建失败";
    return Response.json({ error: message }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  if (!await requireAdmin(request)) return Response.json({ error: "仅管理员可操作" }, { status: 403 });
  const body = await request.json() as { id?: string; username?: string; displayName?: string; status?: "active" | "disabled"; permissions?: string[]; password?: string };
  if (!body.id || !body.username?.trim() || !body.displayName?.trim() || !body.status) return Response.json({ error: "教师信息不完整" }, { status: 400 });
  if (body.password && body.password.length < 6) return Response.json({ error: "新密码至少6位" }, { status: 400 });
  try {
    const teacher = await updateTeacherAccount({ id: body.id, username: body.username, displayName: body.displayName, status: body.status, permissions: body.permissions, password: body.password });
    return teacher ? Response.json({ teacher }) : Response.json({ error: "教师账号不存在" }, { status: 404 });
  } catch (error) {
    const message = error instanceof Error && error.message.includes("UNIQUE") ? "登录账号已被使用" : error instanceof Error ? error.message : "保存失败";
    return Response.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  if (!await requireAdmin(request)) return Response.json({ error: "仅管理员可操作" }, { status: 403 });
  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!id) return Response.json({ error: "缺少教师账号编号" }, { status: 400 });
  try {
    return await deleteTeacherAccount(id) ? Response.json({ deleted: true }) : Response.json({ error: "教师账号不存在" }, { status: 404 });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "删除失败" }, { status: 400 }); }
}

