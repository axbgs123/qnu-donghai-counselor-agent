"use client";

import Link from "next/link";
import { ChevronRight, FileText, Inbox, LoaderCircle, LogOut, Save, ShieldCheck, Trash2, UploadCloud, UserCog, UsersRound, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ImportCenterClient } from "./ImportCenterClient";

type KnowledgeRow = {
  id: string; title: string; category: string; summary: string; file_name: string; owner_teacher_name: string;
  visibility: "global" | "teacher_private"; review_status: "verified" | "needs_review"; updated_at: string;
};
type RequestRow = {
  id: string; student_name: string; student_no: string; class_name: string; owner_teacher_name: string;
  title: string; category: string; summary: string; status: "new" | "processing" | "resolved";
  teacher_reply: string | null; reply_channel: string | null; updated_at: string;
};

export function AdminContentClient({ kind }: { kind: "knowledge" | "requests" }) {
  const [knowledge, setKnowledge] = useState<KnowledgeRow[]>([]);
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [showUploader, setShowUploader] = useState(false);
  const rows = kind === "knowledge" ? knowledge : requests;
  const title = kind === "knowledge" ? "全局知识资料管理" : "全局学生诉求管理";
  const description = kind === "knowledge" ? "上传学校通用资料，并管理教师与管理员已上传的资料、使用范围和确认状态。" : "查看所有教师名下的学生留言，修正内容和处理状态，或删除记录。";

  const load = useCallback(() => fetch(`/api/admin/content?type=${kind}`).then(async (response) => {
    if (response.status === 401 || response.status === 403) { window.location.assign("/login"); return; }
    const data = await response.json() as { documents?: KnowledgeRow[]; requests?: RequestRow[] };
    setKnowledge(data.documents ?? []); setRequests(data.requests ?? []);
  }).catch(() => setNotice("内容读取失败")).finally(() => setLoading(false)), [kind]);
  useEffect(() => { void load(); }, [load]);

  const saveKnowledge = async (row: KnowledgeRow) => {
    const response = await fetch("/api/admin/content", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ type: "knowledge", id: row.id, title: row.title, category: row.category, summary: row.summary, visibility: row.visibility, reviewStatus: row.review_status }) });
    setNotice(response.ok ? `《${row.title}》已保存` : (await response.json()).error || "保存失败");
    if (response.ok) await load();
  };
  const saveRequest = async (row: RequestRow) => {
    const response = await fetch("/api/admin/content", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ type: "request", id: row.id, title: row.title, category: row.category, summary: row.summary, status: row.status, reply: row.teacher_reply, replyChannel: row.reply_channel }) });
    setNotice(response.ok ? `${row.id} 已保存` : (await response.json()).error || "保存失败");
    if (response.ok) await load();
  };
  const remove = async (id: string, label: string) => {
    if (!window.confirm(`确定删除“${label}”吗？删除后无法从平台恢复。`)) return;
    const response = await fetch(`/api/admin/content?type=${kind === "knowledge" ? "knowledge" : "request"}&id=${encodeURIComponent(id)}`, { method: "DELETE" });
    setNotice(response.ok ? "已删除" : (await response.json()).error || "删除失败");
    if (response.ok) await load();
  };
  const updateKnowledge = (id: string, update: Partial<KnowledgeRow>) => setKnowledge((current) => current.map((item) => item.id === id ? { ...item, ...update } : item));
  const updateRequest = (id: string, update: Partial<RequestRow>) => setRequests((current) => current.map((item) => item.id === id ? { ...item, ...update } : item));
  const stats = useMemo(() => kind === "knowledge"
    ? [knowledge.length, knowledge.filter((item) => item.visibility === "global").length, knowledge.filter((item) => item.visibility === "teacher_private").length]
    : [requests.length, requests.filter((item) => item.status === "new").length, requests.filter((item) => item.status === "resolved").length], [kind, knowledge, requests]);
  const logout = async () => { await fetch("/api/auth/logout", { method: "POST" }); window.location.assign("/login"); };

  return <main className="admin-console">
    <header className="admin-topbar"><div className="login-brand"><span>泉</span><p><b>泉师智辅 · 管理端</b><small>东海校区全局管理中心</small></p></div><div><span><ShieldCheck size={15}/>管理员 axbgs</span><button onClick={logout}><LogOut size={16}/>退出登录</button></div></header>
    <section className="admin-body">
      <aside className="admin-rail"><div><span><UserCog size={20}/></span><p><b>平台管理</b><small>账号、资料与学生诉求</small></p></div><nav><Link href="/admin"><UsersRound size={17}/>教师账号管理<ChevronRight size={15}/></Link><Link className={kind === "knowledge" ? "active" : ""} href="/admin/knowledge"><FileText size={17}/>知识资料管理<ChevronRight size={15}/></Link><Link className={kind === "requests" ? "active" : ""} href="/admin/requests"><Inbox size={17}/>学生诉求管理<ChevronRight size={15}/></Link></nav><footer><b>管理员权限</b><p>管理员可查看、修改和删除全部教师的资料与学生诉求。</p></footer></aside>
      <div className="admin-workspace">
        <header className="admin-page-head"><div><small>GLOBAL CONTENT CONTROL</small><h1>{title}</h1><p>{description}</p></div>{kind === "knowledge" && <button onClick={() => setShowUploader((current) => !current)}>{showUploader ? <X size={16}/> : <UploadCloud size={16}/>} {showUploader ? "关闭上传" : "上传通用资料"}</button>}</header>
        {kind === "knowledge" && showUploader && <section className="admin-knowledge-uploader"><ImportCenterClient administratorKnowledge onCommitted={() => { void load(); setNotice("资料已保存，学生智能体现在可以检索该资料"); }}/></section>}
        <div className="admin-stats"><article><small>全部记录</small><strong>{stats[0]}</strong><span>当前平台总数</span></article><article><small>{kind === "knowledge" ? "普遍通用" : "等待处理"}</small><strong>{stats[1]}</strong><span>{kind === "knowledge" ? "教师和学生可检索" : "尚未开始处理"}</span></article><article><small>{kind === "knowledge" ? "教师专用" : "已经完成"}</small><strong>{stats[2]}</strong><span>{kind === "knowledge" ? "仅上传教师检索" : "已有处理结果"}</span></article></div>
        {notice && <p className="account-notice">{notice}</p>}
        <section className="admin-content-list panel">
          {loading ? <div className="account-loading"><LoaderCircle className="spin"/>正在读取全部内容…</div> : rows.length === 0 ? <div className="account-empty"><b>暂无记录</b><p>教师或学生产生内容后会显示在这里。</p></div> : kind === "knowledge" ? knowledge.map((row) => <article key={row.id}><header><div><b>{row.file_name}</b><small>上传教师：{row.owner_teacher_name} · 更新于 {new Date(row.updated_at).toLocaleString("zh-CN", { hour12: false })}</small></div><div><button onClick={() => void saveKnowledge(row)}><Save size={14}/>保存</button><button className="danger" onClick={() => void remove(row.id, row.title)}><Trash2 size={14}/>删除</button></div></header><div className="admin-content-fields"><label>资料标题<input value={row.title} onChange={(event) => updateKnowledge(row.id, { title: event.target.value })}/></label><label>业务分类<input value={row.category} onChange={(event) => updateKnowledge(row.id, { category: event.target.value })}/></label><label>使用范围<select value={row.visibility} onChange={(event) => updateKnowledge(row.id, { visibility: event.target.value as KnowledgeRow["visibility"] })}><option value="global">普遍通用</option><option value="teacher_private">教师专用</option></select></label><label>确认状态<select value={row.review_status} onChange={(event) => updateKnowledge(row.id, { review_status: event.target.value as KnowledgeRow["review_status"] })}><option value="verified">已确认</option><option value="needs_review">待复核</option></select></label><label className="wide">内容摘要<textarea value={row.summary} onChange={(event) => updateKnowledge(row.id, { summary: event.target.value })}/></label></div></article>) : requests.map((row) => <article key={row.id}><header><div><b>{row.student_name} · {row.student_no} · {row.class_name}</b><small>所属教师：{row.owner_teacher_name} · {row.id}</small></div><div><button onClick={() => void saveRequest(row)}><Save size={14}/>保存</button><button className="danger" onClick={() => void remove(row.id, row.title)}><Trash2 size={14}/>删除</button></div></header><div className="admin-content-fields"><label>诉求标题<input value={row.title} onChange={(event) => updateRequest(row.id, { title: event.target.value })}/></label><label>业务分类<input value={row.category} onChange={(event) => updateRequest(row.id, { category: event.target.value })}/></label><label>处理状态<select value={row.status} onChange={(event) => updateRequest(row.id, { status: event.target.value as RequestRow["status"] })}><option value="new">待处理</option><option value="processing">处理中</option><option value="resolved">已完成</option></select></label><label>回复渠道<select value={row.reply_channel || "system"} onChange={(event) => updateRequest(row.id, { reply_channel: event.target.value })}><option value="system">系统回复</option><option value="wechat">微信已回复</option></select></label><label className="wide">学生原话／归纳<textarea value={row.summary} onChange={(event) => updateRequest(row.id, { summary: event.target.value })}/></label><label className="wide">处理回复<textarea value={row.teacher_reply || ""} onChange={(event) => updateRequest(row.id, { teacher_reply: event.target.value })}/></label></div></article>)}
        </section>
      </div>
    </section>
  </main>;
}
