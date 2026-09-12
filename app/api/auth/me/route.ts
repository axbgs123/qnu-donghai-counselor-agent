import { getAuthAccountFromRequest } from "../../../lib/auth-storage";

export async function GET(request: Request) {
  const account = await getAuthAccountFromRequest(request);
  if (!account) return Response.json({ error: "未登录" }, { status: 401 });
  return Response.json({ account });
}

