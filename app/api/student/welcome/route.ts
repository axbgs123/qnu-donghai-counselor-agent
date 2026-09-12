import { setWelcomeCompletion } from "../../../lib/engagement-storage";
import { getSessionTokenFromRequest } from "../../../lib/auth-storage";

export async function PATCH(request: Request) {
  const body = await request.json() as { itemId?: number; completed?: boolean };
  if (!body.itemId || typeof body.completed !== "boolean") return Response.json({ error: "参数不完整" }, { status: 400 });
  const result = await setWelcomeCompletion(getSessionTokenFromRequest(request), body.itemId, body.completed);
  if (!result) return Response.json({ error: "学生身份已失效" }, { status: 401 });
  return Response.json(result);
}
