import type { KnowledgeVisibility, MaterialAnalysis } from "../../../lib/import-storage";
import { getImportJob, getStagingRows, markImportCommitted, saveSourceDocument } from "../../../lib/import-storage";
import { getAuthAccountFromRequest } from "../../../lib/auth-storage";

type CommitBody = {
  jobId?: string;
  title?: string;
  category?: string;
  summary?: string;
  confirmed?: boolean;
  visibility?: KnowledgeVisibility;
  visibilityReason?: string;
};

export async function POST(request: Request) {
  try {
    const uploader = await getAuthAccountFromRequest(request);
    if (!uploader || !["teacher", "admin"].includes(uploader.role)) return Response.json({ error: "仅教师或管理员可保存资料" }, { status: 403 });
    const body = await request.json() as CommitBody;
    if (!body.jobId || !body.confirmed) return Response.json({ error: "请确认识别结果后再保存" }, { status: 400 });
    const job = await getImportJob(body.jobId, uploader.id);
    if (!job) return Response.json({ error: "资料识别任务不存在或已过期" }, { status: 404 });
    const staging = await getStagingRows(body.jobId, "资料识别");
    if (!staging[0]) return Response.json({ error: "没有找到待确认的识别结果" }, { status: 404 });
    const staged = JSON.parse(staging[0].raw_json) as { analysis: MaterialAnalysis; extension: string; mimeType: string; storageKey: string | null };
    const analysis: MaterialAnalysis = {
      ...staged.analysis,
      title: body.title?.trim() || staged.analysis.title,
      category: body.category?.trim() || staged.analysis.category,
      summary: body.summary?.trim() || staged.analysis.summary,
      needsReview: false,
    };
    const saved = await saveSourceDocument({
      ownerTeacherId: uploader.id,
      visibility: uploader.role === "admin" || body.visibility === "global" ? "global" : "teacher_private",
      visibilityReason: body.visibilityReason?.trim() || (uploader.role === "admin" ? "平台管理员确认为普遍通用资料" : body.visibility === "global" ? "上传教师确认为普遍通用资料" : "上传教师确认为教师专用资料"),
      jobId: body.jobId, fileName: job.file_name, mimeType: staged.mimeType, extension: staged.extension,
      storageKey: staged.storageKey, analysis,
    });
    await markImportCommitted(body.jobId);
    return Response.json({ result: { ...saved, title: analysis.title, textLength: analysis.extractedText.length, taskCount: analysis.tasks.length } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "资料保存失败" }, { status: 500 });
  }
}
