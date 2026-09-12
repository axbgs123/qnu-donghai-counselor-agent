import { and, desc, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { tasks } from "../../../db/schema";
import { ensurePlatformSchema } from "../../lib/platform-storage";
import { getAuthAccountFromRequest } from "../../lib/auth-storage";

export async function GET(request: Request) {
  try {
    const teacher = await getAuthAccountFromRequest(request);
    if (teacher?.role !== "teacher") return Response.json({ error: "仅教师可查看待办" }, { status: 403 });
    await ensurePlatformSchema();
    const rows = await getDb().select().from(tasks).where(eq(tasks.ownerId, teacher.id)).orderBy(desc(tasks.createdAt)).limit(50);
    return Response.json({ tasks: rows });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Task storage unavailable" }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const teacher = await getAuthAccountFromRequest(request);
  if (teacher?.role !== "teacher") return Response.json({ error: "仅教师可创建待办" }, { status: 403 });
  const body = (await request.json()) as { title?: string; module?: string; dueAt?: string; priority?: "urgent"|"important"|"normal"; subjectType?: string; subjectId?: string };
  if (!body.title?.trim()) return Response.json({ error: "title is required" }, { status: 400 });
  try {
    await ensurePlatformSchema();
    const [task] = await getDb().insert(tasks).values({ ownerId: teacher.id, title: body.title.trim(), module: body.module ?? "个人待办", dueAt: body.dueAt || undefined, priority: body.priority ?? "normal", subjectType: body.subjectType, subjectId: body.subjectId }).returning();
    return Response.json({ task }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Task storage unavailable" }, { status: 503 });
  }
}

export async function PATCH(request: Request) {
  const teacher = await getAuthAccountFromRequest(request);
  if (teacher?.role !== "teacher") return Response.json({ error: "仅教师可修改待办" }, { status: 403 });
  const body = (await request.json()) as { id?: number; status?: "todo"|"doing"|"done" };
  if (!body.id || !body.status) return Response.json({ error: "id and status are required" }, { status: 400 });
  try {
    await ensurePlatformSchema();
    const [task] = await getDb().update(tasks).set({ status: body.status, updatedAt: new Date().toISOString() }).where(and(eq(tasks.id, body.id), eq(tasks.ownerId, teacher.id))).returning();
    if (!task) return Response.json({ error: "待办不存在" }, { status: 404 });
    return Response.json({ task });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Task storage unavailable" }, { status: 503 });
  }
}

export async function DELETE(request: Request) {
  const teacher = await getAuthAccountFromRequest(request);
  if (teacher?.role !== "teacher") return Response.json({ error: "仅教师可删除待办" }, { status: 403 });
  const id = Number(new URL(request.url).searchParams.get("id"));
  if (!id) return Response.json({ error: "缺少待办编号" }, { status: 400 });
  try {
    await ensurePlatformSchema();
    const [task] = await getDb().delete(tasks).where(and(eq(tasks.id, id), eq(tasks.ownerId, teacher.id))).returning();
    if (!task) return Response.json({ error: "待办不存在" }, { status: 404 });
    return Response.json({ deleted: true, id });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "删除待办失败" }, { status: 503 }); }
}
