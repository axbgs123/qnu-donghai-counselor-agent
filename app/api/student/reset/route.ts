import { requestDailyUsageReset } from "../../../lib/engagement-storage";
import { getSessionTokenFromRequest } from "../../../lib/auth-storage";

export async function POST(request: Request) {
  const result = await requestDailyUsageReset(getSessionTokenFromRequest(request));
  if (!result) return Response.json({ error: "学生身份已失效" }, { status: 401 });
  return Response.json({ request: result }, { status: result.duplicate ? 200 : 201 });
}
