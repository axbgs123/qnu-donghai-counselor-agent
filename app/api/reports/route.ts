import { getPlatformReport } from "../../lib/platform-storage";
import { getAuthAccountFromRequest } from "../../lib/auth-storage";

export async function GET(request: Request) {
  try {
    const teacher = await getAuthAccountFromRequest(request);
    if (teacher?.role !== "teacher") return Response.json({ error: "仅教师可查看统计" }, { status: 403 });
    return Response.json(await getPlatformReport(teacher.id));
  }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "统计失败" }, { status: 500 }); }
}
