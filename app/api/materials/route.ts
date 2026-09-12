import { deleteImportJob, ensureImportSchema, getSourceDocument, listSourceDocuments } from "../../lib/import-storage";
import { getActiveAiConfig } from "../../lib/ai-config";
import { getAuthAccountFromRequest } from "../../lib/auth-storage";
import { getKnowledgeVectorStatus, indexKnowledgeDocument } from "../../lib/knowledge-vector";

export async function GET(request: Request) {
  try {
    const teacher = await getAuthAccountFromRequest(request);
    if (teacher?.role !== "teacher") return Response.json({ error: "仅教师可查看资料库" }, { status: 403 });
    const config = await getActiveAiConfig(teacher.id);
    const [documents, vector] = await Promise.all([listSourceDocuments(100, { audience: "teacher", teacherId: teacher.id }), getKnowledgeVectorStatus()]);
    return Response.json({
      modelConfigured: Boolean(config),
      model: config?.modelName ?? null,
      vision: config?.vision ?? false,
      vector,
      documents: documents.map((document) => ({
        id: document.id, jobId: document.job_id, fileName: document.file_name, title: document.title, category: document.category,
        documentType: document.document_type, summary: document.summary, processingMethod: document.processing_method,
        confidence: document.confidence, reviewStatus: document.review_status, createdAt: document.created_at, updatedAt: document.updated_at,
        visibility: document.visibility, visibilityReason: document.visibility_reason,
        owned: document.owner_teacher_id === teacher.id,
      })),
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "读取资料失败" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const teacher = await getAuthAccountFromRequest(request);
  if (teacher?.role !== "teacher") return Response.json({ error: "仅教师可修改资料" }, { status: 403 });
  const body = await request.json() as { id?: string; title?: string; category?: string; reviewStatus?: "verified" | "needs_review"; visibility?: "global" | "teacher_private" };
  if (!body.id) return Response.json({ error: "缺少资料编号" }, { status: 400 });
  const existing = await getSourceDocument(body.id);
  if (!existing || existing.owner_teacher_id !== teacher.id) return Response.json({ error: "资料不存在或不属于当前教师" }, { status: 404 });
  const db = await ensureImportSchema();
  await db.prepare("UPDATE source_documents SET title = ?, category = ?, review_status = ?, visibility = ?, visibility_reason = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND owner_teacher_id = ?")
    .bind(body.title?.trim() || existing.title, body.category?.trim() || existing.category, body.reviewStatus || existing.review_status,
      body.visibility || existing.visibility, body.visibility ? "上传教师手动调整资料范围" : existing.visibility_reason, body.id, teacher.id).run();
  const updated = await getSourceDocument(body.id);
  if (updated && body.visibility && body.visibility !== existing.visibility) {
    const chunks = await db.prepare("SELECT content FROM document_chunks WHERE document_id = ? ORDER BY chunk_index").bind(body.id).all<{ content: string }>();
    await indexKnowledgeDocument({ documentId: updated.id, title: updated.title, ownerTeacherId: teacher.id, visibility: updated.visibility, chunks: chunks.results.map((item) => item.content) });
  }
  return Response.json({ document: updated });
}

export async function DELETE(request: Request) {
  const teacher = await getAuthAccountFromRequest(request);
  if (teacher?.role !== "teacher") return Response.json({ error: "仅教师可删除资料" }, { status: 403 });
  const id = new URL(request.url).searchParams.get("id")?.trim();
  if (!id) return Response.json({ error: "缺少资料编号" }, { status: 400 });
  const document = await getSourceDocument(id);
  if (!document || document.owner_teacher_id !== teacher.id) return Response.json({ error: "资料不存在或不属于当前教师" }, { status: 404 });
  await deleteImportJob(document.job_id, teacher.id);
  return Response.json({ deleted: true, id });
}
