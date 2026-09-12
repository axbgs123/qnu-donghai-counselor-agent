import { getAuthAccountFromRequest } from "../../lib/auth-storage";
import { listTeacherNotifications, markNotificationsRead } from "../../lib/notification-storage";

export async function GET(request: Request) {
  const teacher = await getAuthAccountFromRequest(request);
  if (teacher?.role !== "teacher") return Response.json({ error: "仅教师可查看通知" }, { status: 403 });
  return Response.json(await listTeacherNotifications(teacher.id));
}

export async function POST(request: Request) {
  const teacher = await getAuthAccountFromRequest(request);
  if (teacher?.role !== "teacher") return Response.json({ error: "仅教师可更新通知" }, { status: 403 });
  const body = await request.json() as { keys?: string[]; all?: boolean };
  const current = await listTeacherNotifications(teacher.id);
  const keys = body.all ? current.items.map((item) => item.key) : body.keys ?? [];
  return Response.json(await markNotificationsRead(teacher.id, keys));
}
