import { getAuthAccountFromRequest } from "../../../lib/auth-storage";
import { classifyKnowledgeVisibility, createImportJob, ensureImportSchema, getImportDb, getImportJob, getStagingRows } from "../../../lib/import-storage";
import { analyzeExtractedMaterial, materialExtensions } from "../../../lib/material-analysis";

const MAX_CHUNK_CHARACTERS = 70_000;
const MAX_MARKDOWN_CHARACTERS = 650_000;
const TEACHER_MAX_FILE_SIZE = 100 * 1024 * 1024;
const ADMIN_MAX_FILE_SIZE = 300 * 1024 * 1024;

type LocalExtractionBody = {
  action?: "start" | "chunk" | "finish";
  jobId?: string;
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
  chunkIndex?: number;
  text?: string;
  processingMethod?: string;
};

function extensionOf(fileName: string) {
  return fileName.split(".").pop()?.toLowerCase() ?? "";
}

export async function POST(request: Request) {
  try {
    const uploader = await getAuthAccountFromRequest(request);
    if (!uploader || !["teacher", "admin"].includes(uploader.role)) {
      return Response.json({ error: "仅教师或管理员可导入资料" }, { status: 403 });
    }
    const body = await request.json() as LocalExtractionBody;
    if (body.action === "start") {
      const fileName = body.fileName?.trim() ?? "";
      const fileSize = Number(body.fileSize ?? 0);
      const extension = extensionOf(fileName);
      if (!fileName || !Number.isFinite(fileSize) || fileSize <= 0) return Response.json({ error: "文件信息不完整" }, { status: 400 });
      if (!materialExtensions.has(extension)) return Response.json({ error: "暂不支持该资料格式；旧版 .doc 请先另存为 .docx" }, { status: 415 });
      if (!["pdf", "docx", "txt", "md", "html", "htm", "xml", "rtf", "eml"].includes(extension)) {
        return Response.json({ error: "该格式暂不支持浏览器本地转 Markdown，请压缩到 800KB 以下后再导入" }, { status: 415 });
      }
      const maxSize = uploader.role === "admin" ? ADMIN_MAX_FILE_SIZE : TEACHER_MAX_FILE_SIZE;
      if (fileSize > maxSize) {
        return Response.json({ error: `单个文件不能超过${uploader.role === "admin" ? "300MB" : "100MB"}` }, { status: 413 });
      }
      const jobId = crypto.randomUUID();
      await createImportJob({
        id: jobId,
        ownerTeacherId: uploader.id,
        file: { name: fileName, size: fileSize, type: body.mimeType || "application/octet-stream" },
        storageKey: null,
        rows: [],
        sheetCount: 1,
      });
      return Response.json({ jobId }, { status: 201 });
    }

    if (!body.jobId) return Response.json({ error: "缺少导入任务编号" }, { status: 400 });
    const job = await getImportJob(body.jobId, uploader.id);
    if (!job) return Response.json({ error: "导入任务不存在或已过期" }, { status: 404 });

    if (body.action === "chunk") {
      const chunkIndex = Number(body.chunkIndex);
      const text = body.text ?? "";
      if (!Number.isInteger(chunkIndex) || chunkIndex < 0 || chunkIndex > 30) return Response.json({ error: "分块编号无效" }, { status: 400 });
      if (!text || text.length > MAX_CHUNK_CHARACTERS) return Response.json({ error: "单个 Markdown 分块过大" }, { status: 413 });
      const db = await ensureImportSchema();
      await db.batch([
        db.prepare("DELETE FROM import_staging_rows WHERE job_id = ? AND sheet_name = '本地Markdown分块' AND row_number = ?").bind(body.jobId, chunkIndex + 1),
        db.prepare("INSERT INTO import_staging_rows (job_id, sheet_name, row_number, raw_json) VALUES (?, '本地Markdown分块', ?, ?)").bind(body.jobId, chunkIndex + 1, JSON.stringify({ text })),
      ]);
      return Response.json({ accepted: true });
    }

    if (body.action === "finish") {
      const rows = await getStagingRows(body.jobId, "本地Markdown分块");
      if (!rows.length) return Response.json({ error: "没有收到本地提取的 Markdown 内容" }, { status: 400 });
      const markdown = rows.map((row) => {
        try { return (JSON.parse(row.raw_json) as { text?: string }).text ?? ""; } catch { return ""; }
      }).join("").slice(0, MAX_MARKDOWN_CHARACTERS).trim();
      if (!markdown) return Response.json({ error: "本地 Markdown 内容为空" }, { status: 400 });
      const extension = extensionOf(job.file_name);
      const analysis = await analyzeExtractedMaterial({
        fileName: job.file_name,
        mimeType: job.mime_type,
        extractedText: markdown,
        processingMethod: body.processingMethod?.trim().slice(0, 100) || "浏览器本地转 Markdown",
        teacherId: uploader.id,
        disableExternalAi: request.headers.get("x-local-ai") === "1",
      });
      const access = classifyKnowledgeVisibility(analysis, job.file_name);
      const db = getImportDb();
      await db.batch([
        db.prepare("DELETE FROM import_staging_rows WHERE job_id = ? AND sheet_name = '资料识别'").bind(body.jobId),
        db.prepare("DELETE FROM import_staging_rows WHERE job_id = ? AND sheet_name = '本地Markdown分块'").bind(body.jobId),
        db.prepare("INSERT INTO import_staging_rows (job_id, sheet_name, row_number, raw_json) VALUES (?, '资料识别', 1, ?)")
          .bind(body.jobId, JSON.stringify({ analysis, extension, mimeType: job.mime_type, storageKey: null })),
        db.prepare("UPDATE import_jobs SET total_rows = 1 WHERE id = ?").bind(body.jobId),
      ]);
      return Response.json({
        job: { id: body.jobId, fileName: job.file_name, fileSize: job.file_size, rawFileStored: false },
        material: analysis,
        recommendedVisibility: access.visibility,
        visibilityReason: access.reason,
      }, { status: 201 });
    }
    return Response.json({ error: "不支持的本地提取操作" }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? `本地资料接收失败：${error.message}` : "本地资料接收失败" }, { status: 422 });
  }
}
