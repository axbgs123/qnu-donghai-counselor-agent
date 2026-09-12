import { deleteTeacherStudentProfile } from "../../lib/import-storage";
import { listPlatformStudents } from "../../lib/platform-storage";
import { getAuthAccountFromRequest } from "../../lib/auth-storage";

export async function GET(request: Request) {
  try {
    const teacher = await getAuthAccountFromRequest(request);
    if (teacher?.role !== "teacher") return Response.json({ error: "仅教师可查看学生档案" }, { status: 403 });
    return Response.json({ students: await listPlatformStudents(teacher.id) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "读取已导入学生失败" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const teacher = await getAuthAccountFromRequest(request);
  if (teacher?.role !== "teacher") return Response.json({ error: "仅教师可删除学生档案" }, { status: 403 });
  const studentNo = new URL(request.url).searchParams.get("studentNo")?.trim();
  if (!studentNo) return Response.json({ error: "缺少学号" }, { status: 400 });
  if (!await deleteTeacherStudentProfile(studentNo, teacher.id)) return Response.json({ error: "学生档案不存在或不属于当前教师" }, { status: 404 });
  return Response.json({ deleted: true, studentNo });
}
