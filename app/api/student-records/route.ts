import { createStudentRecord } from "../../lib/platform-storage";
import { getAuthAccountFromRequest } from "../../lib/auth-storage";

export async function POST(request: Request) {
  const teacher = await getAuthAccountFromRequest(request);
  if (teacher?.role !== "teacher") return Response.json({ error: "仅教师可记录学生工作" }, { status: 403 });
  const body = await request.json() as { studentId?: string; domain?: string; title?: string; summary?: string; happenedAt?: string; followUpAt?: string };
  if (!body.studentId?.trim() || !body.title?.trim()) return Response.json({ error: "请选择学生并填写记录主题" }, { status: 400 });
  try {
    const record = await createStudentRecord({ studentId: body.studentId.trim(), domain: body.domain?.trim() || "谈心谈话", title: body.title.trim(), summary: body.summary?.trim(), happenedAt: body.happenedAt, followUpAt: body.followUpAt, teacherId: teacher.id });
    return Response.json({ record }, { status: 201 });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "保存记录失败" }, { status: 500 }); }
}
