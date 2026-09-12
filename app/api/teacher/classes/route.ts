import { getAuthAccountFromRequest } from "../../../lib/auth-storage";
import {
  createTeacherClass,
  deleteTeacherClass,
  getTeacherClassWorkspace,
  updateTeacherClass,
} from "../../../lib/class-storage";

async function requireTeacher(request: Request) {
  const account = await getAuthAccountFromRequest(request);
  return account?.role === "teacher" ? account : null;
}

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "操作失败";
  const status = /已经存在/.test(message) ? 409 : 400;
  return Response.json({ error: message }, { status });
}

export async function GET(request: Request) {
  const teacher = await requireTeacher(request);
  if (!teacher) return Response.json({ error: "仅教师可操作" }, { status: 403 });
  return Response.json(await getTeacherClassWorkspace(teacher.id));
}

export async function POST(request: Request) {
  const teacher = await requireTeacher(request);
  if (!teacher) return Response.json({ error: "仅教师可操作" }, { status: 403 });
  const body = await request.json() as { name?: string; grade?: string; department?: string };
  try {
    const teacherClass = await createTeacherClass(teacher.id, {
      name: body.name ?? "",
      grade: body.grade,
      department: body.department,
    });
    return Response.json({ class: teacherClass }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request) {
  const teacher = await requireTeacher(request);
  if (!teacher) return Response.json({ error: "仅教师可操作" }, { status: 403 });
  const body = await request.json() as {
    action?: "update";
    id?: string;
    name?: string;
    grade?: string;
    department?: string;
  };
  try {
    if (!body.id) return Response.json({ error: "缺少班级编号" }, { status: 400 });
    const teacherClass = await updateTeacherClass(teacher.id, {
      id: body.id,
      name: body.name ?? "",
      grade: body.grade,
      department: body.department,
    });
    return teacherClass ? Response.json({ class: teacherClass }) : Response.json({ error: "班级不存在或不属于当前教师" }, { status: 404 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request) {
  const teacher = await requireTeacher(request);
  if (!teacher) return Response.json({ error: "仅教师可操作" }, { status: 403 });
  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!id) return Response.json({ error: "缺少班级编号" }, { status: 400 });
  try {
    return await deleteTeacherClass(teacher.id, id)
      ? Response.json({ deleted: true })
      : Response.json({ error: "班级不存在或不属于当前教师" }, { status: 404 });
  } catch (error) {
    return errorResponse(error);
  }
}
