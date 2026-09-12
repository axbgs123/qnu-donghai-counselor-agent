import { NextResponse } from "next/server";
import { AUTH_COOKIE, landingForRole, loginWithPassword } from "../../../lib/auth-storage";

export async function POST(request: Request) {
  const body = await request.json() as { username?: string; password?: string };
  if (!body.username?.trim() || !body.password) return Response.json({ error: "请输入账号和密码" }, { status: 400 });
  const result = await loginWithPassword(body.username, body.password);
  if (!result) return Response.json({ error: "账号或密码不正确，或账号已停用" }, { status: 401 });
  const response = NextResponse.json({ account: result.account, redirectTo: landingForRole(result.account.role) });
  response.cookies.set(AUTH_COOKIE, result.token, {
    httpOnly: true,
    sameSite: "lax",
    secure: new URL(request.url).protocol === "https:",
    path: "/",
    expires: new Date(result.expiresAt),
  });
  return response;
}

