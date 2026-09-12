import { createTasksFromNaturalLanguage } from "../../../lib/engagement-storage";
import { getAuthAccountFromRequest } from "../../../lib/auth-storage";

export async function POST(request: Request) {
  const teacher = await getAuthAccountFromRequest(request);
  if (teacher?.role !== "teacher") return Response.json({ error: "仅教师可创建待办" }, { status: 403 });
  const body = await request.json() as { message?: string };
  if (!body.message?.trim()) return Response.json({ error: "请描述需要记录的待办" }, { status: 400 });
  return Response.json({ tasks: await createTasksFromNaturalLanguage(body.message.trim(), teacher.id) }, { status: 201 });
}
