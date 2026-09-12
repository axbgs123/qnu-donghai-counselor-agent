export async function POST() {
  return Response.json({ error: "学生端已改为统一账号密码登录，请从登录页进入" }, { status: 410 });
}
