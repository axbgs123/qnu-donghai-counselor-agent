import { analyzeMaterial, materialExtensions } from "../../../lib/material-analysis";
import { classifyKnowledgeVisibility, createImportJob } from "../../../lib/import-storage";
import { getAuthAccountFromRequest } from "../../../lib/auth-storage";

const MAX_FILE_SIZE = 20 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    const uploader = await getAuthAccountFromRequest(request);
    if (!uploader || !["teacher", "admin"].includes(uploader.role)) return Response.json({ error: "仅教师或管理员可导入资料" }, { status: 403 });
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return Response.json({ error: "请选择资料文件" }, { status: 400 });
    if (!file.size) return Response.json({ error: "文件内容为空" }, { status: 400 });
    if (file.size > MAX_FILE_SIZE) return Response.json({ error: "单个文件不能超过20MB" }, { status: 413 });
    const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
    if (!materialExtensions.has(extension)) return Response.json({ error: "暂不支持该资料格式；旧版 .doc 请先另存为 .docx" }, { status: 415 });
    const bytes = await file.arrayBuffer();
    const analysis = await analyzeMaterial(file, bytes, { teacherId: uploader.id, disableExternalAi: request.headers.get("x-local-ai") === "1" });
    const access = classifyKnowledgeVisibility(analysis, file.name);
    const jobId = crypto.randomUUID();
    await createImportJob({
      id: jobId, ownerTeacherId: uploader.id, file, storageKey: null, sheetCount: 1,
      rows: [{ sheetName: "资料识别", rowNumber: 1, raw: { analysis, extension, mimeType: file.type || "application/octet-stream", storageKey: null } }],
    });
    return Response.json({
      job: { id: jobId, fileName: file.name, fileSize: file.size, rawFileStored: false },
      material: analysis,
      recommendedVisibility: access.visibility,
      visibilityReason: access.reason,
    }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? `资料识别失败：${error.message}` : "资料识别失败" }, { status: 422 });
  }
}
