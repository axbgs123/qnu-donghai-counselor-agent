import type { MaterialAnalysis } from "../../../lib/import-storage";
import { getImportJob, getStagingRows, saveMaterialStudents } from "../../../lib/import-storage";
import { createAllStudentAccounts, getAuthAccountFromRequest } from "../../../lib/auth-storage";

export async function POST(request: Request) {
  try {
    const teacher = await getAuthAccountFromRequest(request);
    if (teacher?.role !== "teacher") return Response.json({ error: "仅教师可保存学生档案" }, { status: 403 });
    const body = await request.json() as { jobId?: string; confirmed?: boolean };
    if (!body.jobId || !body.confirmed) return Response.json({ error: "请确认识别结果后再导入学生档案" }, { status: 400 });
    if (!await getImportJob(body.jobId, teacher.id)) return Response.json({ error: "导入任务不存在或不属于当前教师" }, { status: 404 });
    const staging = await getStagingRows(body.jobId, "资料识别");
    if (!staging[0]) return Response.json({ error: "没有找到待确认的识别结果" }, { status: 404 });
    const staged = JSON.parse(staging[0].raw_json) as { analysis: MaterialAnalysis };
    const result = await saveMaterialStudents(body.jobId, staged.analysis.studentRecords ?? [], teacher.id);
    const accountCreation = await createAllStudentAccounts(teacher.id);
    return Response.json({ result: { ...result, accounts: {
      created: accountCreation.created,
      skipped: accountCreation.skipped,
      failed: accountCreation.failed,
    } } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "学生档案保存失败" }, { status: 422 });
  }
}
