"use client";

import { CheckCircle2, Clock3, Inbox, LoaderCircle, MessageSquareReply, RefreshCw, RotateCcw, Search, Sparkles, Trash2, UserRound, XCircle } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

type RequestRow = {
  id: string; student_no: string; student_name: string; class_name: string; category: string; title: string; summary: string;
  conversation_json?: string; status: "new" | "processing" | "resolved"; urgency: string; teacher_reply?: string;
  reply_channel?: string; message_count?: number; last_message_at?: string; created_at: string; updated_at: string;
};
type ConversationMessage = {
  role: "student" | "assistant";
  text: string;
  resolution?: "resolved" | "unresolved";
  resolutionBy?: "assistant" | "teacher";
  kind?: "inquiry" | "message";
};
type Metrics = { total: number; new: number; processing: number; resolved: number; classes: string[] };
const statusLabel = { new: "未解决", processing: "处理中", resolved: "已解决" };

export function RequestInboxClient() {
  const [rows, setRows] = useState<RequestRow[]>([]);
  const [metrics, setMetrics] = useState<Metrics>({ total: 0, new: 0, processing: 0, resolved: 0, classes: [] });
  const [selectedId, setSelectedId] = useState("");
  const [status, setStatus] = useState("");
  const [className, setClassName] = useState("");
  const [query, setQuery] = useState("");
  const [reply, setReply] = useState("");
  const [channel, setChannel] = useState("system");
  const [loading, setLoading] = useState(true);
  const [selectedDetail, setSelectedDetail] = useState<RequestRow | null>(null);
  const [showAllOriginals, setShowAllOriginals] = useState(false);

  const loadDetail = useCallback(async (id: string) => {
    const response = await fetch(`/api/requests?id=${encodeURIComponent(id)}`, { cache: "no-store" });
    if (!response.ok) return;
    const data = await response.json() as { request?: RequestRow };
    if (data.request) setSelectedDetail(data.request);
  }, []);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    const params = new URLSearchParams(); if (status) params.set("status", status); if (className) params.set("class", className);
    const response = await fetch(`/api/requests?${params}`, { cache: "no-store" });
    if (!response.ok) { if (!quiet) setLoading(false); return; }
    const data = await response.json() as { requests: RequestRow[]; metrics: Metrics };
    setRows(data.requests ?? []); setMetrics(data.metrics ?? { total: 0, new: 0, processing: 0, resolved: 0, classes: [] });
    setSelectedId((current) => data.requests?.some((row) => row.id === current) ? current : data.requests?.[0]?.id ?? "");
    window.dispatchEvent(new Event("student-requests-updated"));
    if (!quiet) setLoading(false);
  }, [status, className]);

  useEffect(() => {
    const initial = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(initial);
  }, [load]);

  useEffect(() => {
    const timer = window.setInterval(() => { if (!document.hidden) void load(true); }, 15_000);
    const refreshWhenVisible = () => { if (!document.hidden) void load(true); };
    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [load]);
  useEffect(() => {
    if (!selectedId) return;
    const timer = window.setTimeout(() => {
      setShowAllOriginals(false);
      void loadDetail(selectedId);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadDetail, selectedId]);
  const filtered = useMemo(() => rows.filter((row) => `${row.student_name}${row.student_no}${row.title}${row.summary}${row.category}`.includes(query.trim())), [rows, query]);
  const selectedSummary = rows.find((row) => row.id === selectedId) ?? filtered[0];
  const selected = selectedDetail?.id === selectedSummary?.id ? selectedDetail : selectedSummary;
  let conversation: ConversationMessage[] = [];
  try {
    const parsed = selected?.conversation_json ? JSON.parse(selected.conversation_json) : [];
    if (Array.isArray(parsed)) conversation = parsed;
  } catch { conversation = []; }
  const studentOriginals = conversation.reduce<Array<ConversationMessage & { sequence: number }>>((items, message) => {
    if (message.role === "student") items.push({ ...message, sequence: items.length + 1 });
    return items;
  }, []).map((message) => selected?.status === "resolved" ? { ...message, resolution: "resolved" as const, resolutionBy: message.resolutionBy || "teacher" as const } : message);
  const unresolvedOriginals = studentOriginals.filter((message) => message.resolution !== "resolved");
  const visibleOriginals = showAllOriginals ? studentOriginals : unresolvedOriginals;

  const update = async (nextStatus: RequestRow["status"]) => {
    if (!selected) return;
    setLoading(true);
    await fetch("/api/requests", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: selected.id, status: nextStatus, reply: reply || undefined, replyChannel: reply ? channel : undefined }) });
    setReply(""); await load(); await loadDetail(selected.id);
  };

  const decideReset = async (decision: "approve" | "reject") => {
    if (!selected) return;
    setLoading(true);
    await fetch("/api/requests", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: selected.id, resetDecision: decision }) });
    await load(); await loadDetail(selected.id);
  };

  const remove = async () => {
    if (!selected || !window.confirm(`确定删除 ${selected.student_name} 的这条记录吗？删除后不可恢复。`)) return;
    setLoading(true);
    await fetch(`/api/requests?id=${encodeURIComponent(selected.id)}`, { method: "DELETE" });
    setReply(""); setSelectedDetail(null); await load();
  };

  const summary = useMemo(() => {
    const topCategories = Object.entries(rows.reduce<Record<string, number>>((acc, row) => ({ ...acc, [row.category]: (acc[row.category] ?? 0) + 1 }), {})).sort((a, b) => b[1] - a[1]).slice(0, 3);
    return `今日共收到 ${metrics.total} 条诉求，其中 ${metrics.new} 条待处理、${metrics.processing} 条处理中。${topCategories.length ? `主要集中在${topCategories.map(([name, count]) => `${name}${count}条`).join("、")}。` : "目前暂无学生诉求。"}`;
  }, [metrics, rows]);

  return <div className="request-center">
    <section className="request-metrics"><article><span><Inbox size={19}/></span><p><small>全部诉求</small><strong>{metrics.total}</strong><em>{metrics.classes.length ? `涉及 ${metrics.classes.length} 个行政班` : "暂无学生诉求"}</em></p></article><article><span className="amber"><Clock3 size={19}/></span><p><small>未解决</small><strong>{metrics.new}</strong><em>建议上班后集中处理</em></p></article><article><span className="blue"><MessageSquareReply size={19}/></span><p><small>处理中</small><strong>{metrics.processing}</strong><em>已进入当前教师工作队列</em></p></article><article><span className="green"><CheckCircle2 size={19}/></span><p><small>已解决</small><strong>{metrics.resolved}</strong><em>学生端可查看结果</em></p></article></section>
    <section className="request-summary panel"><span><Sparkles size={18}/></span><div><b>智能汇总</b><p>{summary}</p></div><button onClick={() => void load()}><RefreshCw size={14}/>刷新数据</button></section>
    <div className="request-layout">
      <section className="request-list-panel panel"><header><label><Search size={15}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索姓名、学号或诉求"/></label><div><select value={className} onChange={(event) => setClassName(event.target.value)}><option value="">全部班级</option>{metrics.classes.map((item) => <option key={item}>{item}</option>)}</select><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="">全部状态</option><option value="new">未解决</option><option value="processing">处理中</option><option value="resolved">已解决</option></select></div></header>
        <div>{loading && !rows.length ? <p className="request-loading"><LoaderCircle className="spin" size={18}/>正在读取学生诉求…</p> : filtered.length ? filtered.map((row) => <button className={row.id === selected?.id ? "active" : ""} onClick={() => { setSelectedId(row.id); setReply(""); }} key={row.id}><span className={`request-avatar ${row.status}`}>{row.student_name.slice(0, 1)}</span><p><b>{row.student_name}<em>{row.class_name}</em></b><strong>{row.title}</strong><small>{row.summary}</small></p><aside><time>{new Date(row.last_message_at || row.updated_at || row.created_at).toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" })}</time>{(row.message_count ?? 1) > 1 && <em>{row.message_count}条留言</em>}<span className={row.status}>{statusLabel[row.status]}</span></aside></button>) : <div className="request-empty"><Inbox size={26}/><b>当前筛选下没有诉求</b><p>学生通过数字人提交后会出现在这里。</p></div>}</div>
      </section>
      <section className="request-detail panel">{selected ? <><header><div><span className="request-avatar">{selected.student_name.slice(0, 1)}</span><p><b>{selected.student_name}</b><small>{selected.student_no} · {selected.class_name}{(selected.message_count ?? 1) > 1 ? ` · 连续${selected.message_count}条留言` : ""}</small></p></div><div className="request-detail-head-actions"><span className={selected.status}>{statusLabel[selected.status]}</span><button onClick={remove} aria-label="删除这条诉求"><Trash2 size={15}/></button></div></header><div className="request-detail-body"><div className="request-title"><span>{selected.category}</span>{selected.urgency === "urgent" && <em>希望尽快处理</em>}<h2>{selected.title}</h2><div className="request-originals-heading"><div><h3>{showAllOriginals ? "全部学生原话" : "尚未解决的学生原话"}</h3><small>默认只显示需要老师处理的内容</small></div>{studentOriginals.length > unresolvedOriginals.length && <button type="button" onClick={() => setShowAllOriginals((current) => !current)}>{showAllOriginals ? `只看未解决（${unresolvedOriginals.length}）` : `显示全部原话（${studentOriginals.length}）`}</button>}</div><div className="request-original-list">{selected.conversation_json ? visibleOriginals.length ? visibleOriginals.map((message) => <article className={message.resolution === "resolved" ? "resolved" : "unresolved"} key={`${message.sequence}-${message.text}`}><header><b>第{message.sequence}条</b><span>{message.resolution === "resolved" ? <><CheckCircle2 size={13}/>已解决{message.resolutionBy === "assistant" ? " · 智能体" : message.resolutionBy === "teacher" ? " · 教师" : ""}</> : <><XCircle size={13}/>未解决</>}</span></header><p>{message.text}</p></article>) : <p className="request-original-empty"><CheckCircle2 size={17}/>当前没有未解决的学生原话</p> : <p className="request-original-empty"><LoaderCircle className="spin" size={17}/>正在读取学生原话…</p>}</div><small>{selected.id} · 首次提交 {new Date(selected.created_at).toLocaleString("zh-CN", { hour12: false })}{(selected.message_count ?? 1) > 1 ? ` · 最近更新 ${new Date(selected.last_message_at || selected.updated_at).toLocaleString("zh-CN", { hour12: false })}` : ""}</small></div><details><summary>逐条核对完整对话</summary><div className="request-transcript">{conversation.map((message, index) => <p className={message.role} key={index}><b>{message.role === "student" ? selected.student_name : "辅导员数字人"}</b><span>{message.text}</span></p>)}</div></details>{selected.teacher_reply && <blockquote><b>已回复 · {selected.reply_channel === "wechat" ? "微信" : "系统"}</b>{selected.teacher_reply}</blockquote>}</div>
        {selected.category === "对话额度重置" && selected.status !== "resolved" ? <footer className="reset-decision-footer"><p>学生申请重新计算今日20轮额度。批准后额度立即归零。</p><div><button className="secondary-button" onClick={() => decideReset("reject")}><XCircle size={14}/>拒绝申请</button><button className="primary-button" onClick={() => decideReset("approve")}><RotateCcw size={14}/>批准并重新计数</button></div></footer> : <footer><label>处理回复<textarea value={reply} onChange={(event) => setReply(event.target.value)} placeholder="回复会显示在学生端；如通过微信处理，也可在此记录处理结果。"/></label><div><select value={channel} onChange={(event) => setChannel(event.target.value)}><option value="system">系统回复</option><option value="wechat">微信已回复</option></select>{selected.status === "new" && <button className="secondary-button" onClick={() => update("processing")}>标记处理中</button>}<button className="primary-button" onClick={() => update("resolved")}><CheckCircle2 size={14}/>回复并完成</button></div></footer>}</> : <div className="request-empty"><UserRound size={30}/><b>选择一条学生诉求</b><p>这里会显示数字人整理结果和原始对话。</p></div>}</section>
    </div>
  </div>;
}
