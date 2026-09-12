import { getAuthAccountFromRequest } from "../../../lib/auth-storage";
import { deleteImportJob, ensureImportSchema, getSourceDocument, type KnowledgeVisibility } from "../../../lib/import-storage";
import { indexKnowledgeDocument } from "../../../lib/knowledge-vector";

async function requireAdmin(request: Request) {
  const account = await getAuthAccountFromRequest(request);
  return account?.role === "admin" ? account : null;
}

export async function GET(request: Request) {
  if (!await requireAdmin(request)) return Response.json({ error: "仅管理员可操作" }, { status: 403 });
  const type = new URL(request.url).searchParams.get("type");
  const db = await ensureImportSchema();
  if (type === "knowledge") {
    const documents = await db.prepare(`SELECT d.*, COALESCE(a.display_name, '未关联教师') AS owner_teacher_name
      FROM source_documents d LEFT JOIN app_accounts a ON a.id = d.owner_teacher_id
      ORDER BY d.updated_at DESC LIMIT 500`).all<Record<string, unknown>>();
    return Response.json({ documents: documents.results });
  }
  if (type === "requests") {
    const requests = await db.prepare(`SELECT r.*, COALESCE(a.display_name, '未关联教师') AS owner_teacher_name
      FROM student_requests r LEFT JOIN app_accounts a ON a.id = r.teacher_id
      ORDER BY CASE r.status WHEN 'new' THEN 0 WHEN 'processing' THEN 1 ELSE 2 END, r.updated_at DESC LIMIT 500`).all<Record<string, unknown>>();
    return Response.json({ requests: requests.results });
  }
  return Response.json({ error: "不支持的内容类型" }, { status: 400 });
}

export async function PATCH(request: Request) {
  if (!await requireAdmin(request)) return Response.json({ error: "仅管理员可操作" }, { status: 403 });
  const body = await request.json() as {
    type?: "knowledge" | "request"; id?: string; title?: string; category?: string; summary?: string;
    visibility?: KnowledgeVisibility; reviewStatus?: "verified" | "needs_review";
    status?: "new" | "processing" | "resolved"; reply?: string; replyChannel?: string;
  };
  if (!body.id || !body.type) return Response.json({ error: "缺少内容编号或类型" }, { status: 400 });
  const db = await ensureImportSchema();
  if (body.type === "knowledge") {
    const existing = await getSourceDocument(body.id);
    if (!existing) return Response.json({ error: "资料不存在" }, { status: 404 });
    const visibility = body.visibility === "global" ? "global" : body.visibility === "teacher_private" ? "teacher_private" : existing.visibility;
    await db.prepare(`UPDATE source_documents SET title = ?, category = ?, summary = ?, visibility = ?, visibility_reason = ?,
      review_status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
      .bind(body.title?.trim() || existing.title, body.category?.trim() || existing.category, body.summary?.trim() || existing.summary,
        visibility, body.visibility ? "平台管理员调整资料范围" : existing.visibility_reason,
        body.reviewStatus || existing.review_status, body.id).run();
    const updated = await getSourceDocument(body.id);
    if (updated && (body.visibility || body.title)) {
      const chunks = await db.prepare("SELECT content FROM document_chunks WHERE document_id = ? ORDER BY chunk_index").bind(body.id).all<{ content: string }>();
      await indexKnowledgeDocument({
        documentId: updated.id, title: updated.title, ownerTeacherId: updated.owner_teacher_id || "unassigned",
        visibility: updated.visibility, chunks: chunks.results.map((item) => item.content),
      });
    }
    return Response.json({ document: updated });
  }
  const existing = await db.prepare("SELECT * FROM student_requests WHERE id = ?").bind(body.id).first<Record<string, unknown>>();
  if (!existing) return Response.json({ error: "学生诉求不存在" }, { status: 404 });
  const status = ["new", "processing", "resolved"].includes(body.status || "") ? body.status : String(existing.status);
  await db.prepare(`UPDATE student_requests SET title = ?, category = ?, summary = ?, status = ?, teacher_reply = ?,
    reply_channel = ?, updated_at = CURRENT_TIMESTAMP,
    resolved_at = CASE WHEN ? = 'resolved' THEN COALESCE(resolved_at, CURRENT_TIMESTAMP) ELSE NULL END WHERE id = ?`)
    .bind(body.title?.trim() || existing.title, body.category?.trim() || existing.category, body.summary?.trim() || existing.summary,
      status, body.reply?.trim() || existing.teacher_reply || null, body.replyChannel || existing.reply_channel || null, status, body.id).run();
  return Response.json({ request: await db.prepare("SELECT * FROM student_requests WHERE id = ?").bind(body.id).first() });
}

export async function DELETE(request: Request) {
  if (!await requireAdmin(request)) return Response.json({ error: "仅管理员可操作" }, { status: 403 });
  const params = new URL(request.url).searchParams;
  const type = params.get("type");
  const id = params.get("id")?.trim();
  if (!id || !type) return Response.json({ error: "缺少内容编号或类型" }, { status: 400 });
  const db = await ensureImportSchema();
  if (type === "knowledge") {
    const document = await getSourceDocument(id);
    if (!document) return Response.json({ error: "资料不存在" }, { status: 404 });
    await deleteImportJob(document.job_id);
    return Response.json({ deleted: true, id });
  }
  if (type === "request") {
    const existing = await db.prepare("SELECT id FROM student_requests WHERE id = ?").bind(id).first();
    if (!existing) return Response.json({ error: "学生诉求不存在" }, { status: 404 });
    await db.prepare("DELETE FROM student_requests WHERE id = ?").bind(id).run();
    return Response.json({ deleted: true, id });
  }
  return Response.json({ error: "不支持的内容类型" }, { status: 400 });
}
