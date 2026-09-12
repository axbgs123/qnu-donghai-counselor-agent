import { getStudentHome } from "../../../lib/engagement-storage";
import { getSessionTokenFromRequest } from "../../../lib/auth-storage";

export async function GET(request: Request) {
  const home = await getStudentHome(getSessionTokenFromRequest(request));
  if (!home) return Response.json({ error: "学生身份已失效，请重新登录" }, { status: 401 });
  return Response.json(home);
}
