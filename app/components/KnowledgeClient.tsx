"use client";

import Link from "next/link";
import { Download, FileText, HardDriveDownload, Plus, Search, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { deleteLocalFile, downloadLocalFile, getLocalFileIds } from "../lib/local-file-vault";

type DocumentRow = {
  id: string; jobId: string; fileName: string; title: string; category: string; documentType: string; summary: string;
  processingMethod: string; confidence: number; reviewStatus: "verified" | "needs_review"; createdAt: string; updatedAt: string;
  visibility: "global" | "teacher_private"; visibilityReason?: string;
  owned: boolean;
};

export function KnowledgeClient() {
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("全部");
  const [loading, setLoading] = useState(true);
  const [localFileIds, setLocalFileIds] = useState<Set<string>>(new Set());
  const [notice, setNotice] = useState("");
  const load = () => fetch("/api/materials").then((response) => response.ok ? response.json() : Promise.reject(new Error("加载失败")))
    .then((payload: { documents?: DocumentRow[] }) => setDocuments(payload.documents ?? [])).catch(() => setDocuments([])).finally(() => setLoading(false));
  useEffect(() => { load(); getLocalFileIds().then((ids) => setLocalFileIds(new Set(ids))).catch(() => undefined); }, []);
  const categories = useMemo(() => ["全部", ...new Set(documents.map((item) => item.category).filter(Boolean))], [documents]);
  const visible = useMemo(() => documents.filter((doc) => {
    const categoryMatch = category === "全部" || doc.category === category;
    const queryMatch = `${doc.title}${doc.fileName}${doc.category}${doc.summary}`.toLowerCase().includes(query.trim().toLowerCase());
    return categoryMatch && queryMatch;
  }), [category, documents, query]);
  const remove = async (document: DocumentRow) => {
    if (!window.confirm(`确定删除《${document.title}》吗？平台检索索引和当前电脑中的本地原件都会一并删除。`)) return;
    const response = await fetch(`/api/materials?id=${encodeURIComponent(document.id)}`, { method: "DELETE" });
    if (response.ok) {
      await deleteLocalFile(document.jobId).catch(() => undefined);
      setLocalFileIds((current) => { const next = new Set(current); next.delete(document.jobId); return next; });
      setDocuments((current) => current.filter((item) => item.id !== document.id));
    }
  };
  const downloadOriginal = async (document: DocumentRow) => {
    setNotice("");
    try { await downloadLocalFile(document.jobId); }
    catch (error) { setNotice(error instanceof Error ? error.message : "读取本地原件失败"); }
  };
  const changeVisibility = async (document: DocumentRow, visibility: DocumentRow["visibility"]) => {
    const response = await fetch("/api/materials", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: document.id, visibility }) });
    if (!response.ok) { setNotice("资料范围修改失败，请稍后重试"); return; }
    setDocuments((current) => current.map((item) => item.id === document.id ? { ...item, visibility } : item));
    setNotice(visibility === "global" ? "已设为普遍通用：其他教师和学生可以检索。" : "已设为教师专用：只有当前教师可以检索。");
  };

  return <>
    <div className="knowledge-summary"><article><span className="metric-icon blue"><FileText size={20}/></span><p><small>知识资料</small><strong>{documents.length}</strong><em>全部来自已确认上传</em></p></article><article><span className="metric-icon green">✓</span><p><small>普遍通用</small><strong>{documents.filter((item) => item.visibility === "global").length}</strong><em>教师与学生均可检索</em></p></article><article><span className="metric-icon amber">私</span><p><small>教师专用</small><strong>{documents.filter((item) => item.visibility === "teacher_private").length}</strong><em>仅当前上传教师可检索</em></p></article></div>
    <section className="panel table-panel">
      <div className="table-toolbar"><form className="table-search" onSubmit={(event) => { event.preventDefault(); setQuery(String(new FormData(event.currentTarget).get("query") ?? "")); }}><Search size={16}/><input name="query" defaultValue={query} placeholder="搜索文件名、资料标题、分类或摘要"/><button className="search-submit" type="submit">搜索</button></form><div className="toolbar-actions"><button className="secondary-button" data-action="export-knowledge"><Download size={15}/>导出目录</button><Link className="primary-button" href="/imports?type=knowledge"><Plus size={15}/>上传资料</Link></div></div>
      <div className="category-tabs">{categories.map((item) => <button key={item} className={category === item ? "active" : ""} onClick={() => setCategory(item)}>{item}{item === "全部" ? ` ${documents.length}` : ""}</button>)}</div>
      {notice && <div className="import-error" role="alert">{notice}</div>}
      <div className="document-list"><div className="document-head"><span>资料名称</span><span>业务分类</span><span>识别方式</span><span>更新时间</span><span>使用范围</span><span/></div>{visible.map((doc) => <article key={doc.id}><span className="doc-cell"><i><FileText size={18}/></i><p><b>{doc.title}</b><small>{doc.fileName} · {doc.summary || "暂无摘要"}</small></p></span><span>{doc.category}</span><span>{doc.processingMethod}</span><span><b>{Math.round(doc.confidence * 100)}% 置信度</b><small>{new Date(doc.updatedAt).toLocaleDateString("zh-CN")}</small></span><span><select disabled={!doc.owned} value={doc.visibility} onChange={(event) => void changeVisibility(doc, event.target.value as DocumentRow["visibility"])} aria-label={`${doc.title}的智能体使用范围`}><option value="global">普遍通用</option><option value="teacher_private">教师专用</option></select><small>{doc.owned ? (localFileIds.has(doc.jobId) ? "原件在当前电脑" : "原件在上传电脑") : "其他教师共享"}</small></span><span className="student-row-actions">{doc.owned && <><button disabled={!localFileIds.has(doc.jobId)} onClick={() => downloadOriginal(doc)} aria-label={`从本机下载${doc.title}`} title={localFileIds.has(doc.jobId) ? "从当前电脑的本地文件库下载" : "原件不在当前电脑"}><HardDriveDownload size={15}/></button><button onClick={() => remove(doc)} aria-label={`删除${doc.title}`}><Trash2 size={15}/></button></>}</span></article>)}</div>
      {!loading && visible.length === 0 && <div className="empty-state"><Search size={25}/><b>还没有匹配资料</b><p>上传并确认文件后，资料才会出现在知识库并供智能体检索。</p></div>}
    </section>
  </>;
}
