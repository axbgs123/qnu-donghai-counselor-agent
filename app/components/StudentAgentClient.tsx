"use client";

import { BookOpenText, Bot, Check, CheckCircle2, ClipboardCheck, Clock3, GraduationCap, LoaderCircle, LogOut, MessageCircleMore, RotateCcw, Send, Sparkles, XCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { WelcomeArticleCards } from "./WelcomeEditorial";

type Student = { student_no: string; name: string; class_name: string };
type WelcomeItem = { id: number; title: string; description: string; due_at: string | null; completed: number };
type StudentRequest = { id: string; category: string; title: string; summary: string; status: string; teacher_reply?: string; message_count?: number; last_message_at?: string; created_at: string };
type HomeData = { student: Student; teacherName: string; welcomeItems: WelcomeItem[]; requests: StudentRequest[]; dailyUsage: { used: number; remaining: number; usageDate: string } };
type ChatMessage = {
  role: "student" | "assistant";
  text: string;
  resolution?: "resolved" | "unresolved";
  resolutionBy?: "assistant" | "teacher";
  kind?: "inquiry" | "message";
};
type ChatAnalysis = { reply: string; intent?: "inquiry" | "message"; category: string; title: string; summary: string; urgency: string; ready: boolean; needsResolutionCheck?: boolean; sources?: Array<{ title: string; detail?: string }>; request?: { id: string; status: string; merged?: boolean; messageCount?: number } | null; dailyUsage?: { used: number; remaining: number } };

export function StudentAgentClient() {
  const [home, setHome] = useState<HomeData | null>(null);
  const [tab, setTab] = useState<"home" | "welcome" | "chat" | "requests">(() =>
    typeof window !== "undefined" && new URLSearchParams(window.location.search).get("view") === "welcome" ? "welcome" : "home",
  );
  const [chatMode, setChatMode] = useState<"inquiry" | "message">("inquiry");
  const [messages, setMessages] = useState<ChatMessage[]>([{ role: "assistant", text: "请直接输入想了解的问题。我只依据老师上传并确认的学校资料回答；如果没有解决，再由你决定是否留言给老师。" }]);
  const [input, setInput] = useState("");
  const [analysis, setAnalysis] = useState<ChatAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [submittedId, setSubmittedId] = useState("");
  const [dailyUsed, setDailyUsed] = useState(0);
  const [resetNotice, setResetNotice] = useState("");

  const loadHome = async () => {
    const response = await fetch("/api/student/home");
    if (response.status === 401 || response.status === 403) { window.location.assign("/login"); throw new Error("请重新登录"); }
    if (!response.ok) throw new Error("读取学生主页失败");
    const data = await response.json() as HomeData;
    setHome(data); setDailyUsed(data.dailyUsage.used);
  };
  useEffect(() => {
    fetch("/api/student/home").then(async (response) => {
      if (response.status === 401 || response.status === 403) { window.location.assign("/login"); return; }
      if (!response.ok) throw new Error("读取学生主页失败");
      const data = await response.json() as HomeData;
      setHome(data); setDailyUsed(data.dailyUsage.used);
    }).catch((caught) => setError(caught instanceof Error ? caught.message : "读取学生主页失败"));
  }, []);

  const toggleWelcome = async (item: WelcomeItem) => {
    if (!home) return;
    const completed = !item.completed;
    const response = await fetch("/api/student/welcome", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ itemId: item.id, completed }) });
    if (response.ok) setHome({ ...home, welcomeItems: home.welcomeItems.map((current) => current.id === item.id ? { ...current, completed: completed ? 1 : 0 } : current) });
  };

  const send = async () => {
    const text = input.trim();
    if (!text || loading || analysis?.ready || analysis?.needsResolutionCheck || (chatMode === "inquiry" && dailyUsed >= 20)) return;
    const next = [...messages, { role: "student" as const, text }];
    setMessages(next); setInput(""); setLoading(true); setError("");
    try {
      const response = await fetch("/api/student/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ messages: next, mode: chatMode }) });
      const data = await response.json() as ChatAnalysis & { error?: string };
      if (!response.ok) throw new Error(data.error || "数字人暂时无法回答");
      setAnalysis(data); setDailyUsed(data.dailyUsage?.used ?? dailyUsed + 1); setSubmittedId(data.request?.id ?? "");
      if (chatMode === "inquiry") setMessages((current) => [...current, { role: "assistant", text: data.reply }]);
      if (data.request) await loadHome();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "发送失败"); }
    finally { setLoading(false); }
  };

  const newConversation = (nextMode: "inquiry" | "message" = chatMode) => {
    setChatMode(nextMode);
    setMessages(nextMode === "inquiry" ? [{ role: "assistant", text: "请直接输入想了解的问题。我只依据老师上传并确认的学校资料回答；如果没有解决，再由你决定是否留言给老师。" }] : []);
    setAnalysis(null); setSubmittedId(""); setInput(""); setError(""); setTab("chat");
  };

  const resolveInquiry = async (solved: boolean) => {
    if (!analysis || loading) return;
    if (solved) {
      setMessages((current) => [...current, { role: "assistant", text: "好的，本次问题标记为已解决，不会生成老师留言。你可以继续问下一个问题。" }]);
      setAnalysis(null);
      return;
    }
    const latestQuestion = [...messages].reverse().find((message) => message.role === "student");
    if (!latestQuestion) { setError("没有找到需要留言的学生原话"); return; }
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/student/requests", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          category: analysis.category,
          title: `咨询未解决：${analysis.title.replace(/^.*?：/, "")}`,
          summary: latestQuestion.text,
          urgency: analysis.urgency,
          conversation: [
            { ...latestQuestion, resolution: "unresolved", kind: "inquiry" },
            { role: "assistant", text: analysis.reply },
          ],
        }),
      });
      const data = await response.json() as { request?: { id: string; status: string; merged?: boolean; messageCount?: number }; error?: string };
      if (!response.ok || !data.request) throw new Error(data.error || "留言失败");
      setSubmittedId(data.request.id);
      setAnalysis({ ...analysis, ready: true, needsResolutionCheck: false, request: data.request, reply: `问题未解决，已把你的原问题留言给${home?.teacherName || "负责老师"}。` });
      setMessages((current) => [...current, { role: "assistant", text: `问题未解决，已把你的原问题留言给${home?.teacherName || "负责老师"}。` }]);
      await loadHome();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "留言失败"); }
    finally { setLoading(false); }
  };

  const requestReset = async () => {
    if (loading) return;
    setLoading(true); setResetNotice(""); setError("");
    try {
      const response = await fetch("/api/student/reset", { method: "POST" });
      const data = await response.json() as { request?: { id: string; duplicate?: boolean }; error?: string };
      if (!response.ok || !data.request) throw new Error(data.error || "申请失败");
      setResetNotice(data.request.duplicate ? `已有一条重置申请等待${home?.teacherName || "负责老师"}处理。` : `重置申请已提交，${home?.teacherName || "负责老师"}批准后会恢复20轮额度。`);
      await loadHome();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "申请失败"); }
    finally { setLoading(false); }
  };

  const completed = home?.welcomeItems.filter((item) => item.completed).length ?? 0;
  const progress = home?.welcomeItems.length ? Math.round(completed / home.welcomeItems.length * 100) : 0;
  const recent = useMemo(() => home?.requests.slice(0, 3) ?? [], [home]);
  const teacherName = home?.teacherName || "负责老师";
  const statusLabel: Record<string, string> = { new: `未解决（等待${teacherName}处理）`, processing: `${teacherName}处理中`, resolved: "已解决" };

  if (!home) return <main className="student-gateway"><section className="student-login-card student-session-loading"><LoaderCircle className="spin" size={24}/><b>正在进入学生工作台</b><p>{error || "正在读取你的迎新清单与诉求记录…"}</p></section></main>;

  return <main className="student-portal">
    <header className="student-topbar"><div className="student-brand"><span>泉</span><p><b>{teacherName}数字人</b><small>东海校区学生服务</small></p></div><div className="student-profile-block"><span>{home.student.class_name}</span><b>{home.student.name}</b><small>{home.student.student_no}</small><button onClick={async () => { await fetch("/api/auth/logout", { method: "POST" }); window.location.assign("/login"); }} title="退出登录"><LogOut size={15}/></button></div></header>
    <nav className="student-tabs"><button className={tab === "home" ? "active" : ""} onClick={() => setTab("home")}><GraduationCap size={16}/>我的主页</button><button className={tab === "welcome" ? "active" : ""} onClick={() => setTab("welcome")}><BookOpenText size={16}/>迎新指南</button><button className={tab === "chat" ? "active" : ""} onClick={() => setTab("chat")}><Bot size={16}/>找{teacherName}数字人</button><button className={tab === "requests" ? "active" : ""} onClick={() => setTab("requests")}><ClipboardCheck size={16}/>我的诉求</button></nav>

    {tab === "home" && <section className="student-home">
      <article className="student-welcome-hero"><span>学生服务</span><h1>{home.student.name}，欢迎来到泉州师范学院</h1><p>询问学校规定时由智能体依据老师资料回答；请假、申请和情况说明会直接留言给老师。</p><div><div className="student-home-actions"><button onClick={() => newConversation("inquiry")}><Bot size={16}/>询问学校问题</button><button className="message" onClick={() => newConversation("message")}><MessageCircleMore size={16}/>给{teacherName}留言</button></div><aside><strong>{progress}%</strong><span>迎新准备完成度</span></aside></div></article>
      <div className="student-home-grid"><section className="student-checklist"><header><div><h2>迎新准备清单</h2><p>{completed}/{home.welcomeItems.length} 项已确认</p></div><span>{progress}%</span></header>{home.welcomeItems.map((item) => <button className={item.completed ? "done" : ""} onClick={() => toggleWelcome(item)} key={item.id}><i>{item.completed ? <Check size={15}/> : null}</i><p><b>{item.title}</b><small>{item.description}</small></p><time>{item.due_at?.slice(5).replace("-", "月")}日</time></button>)}</section>
      <aside className="student-recent"><h2>最近诉求</h2>{recent.length ? recent.map((request) => <article key={request.id}><span className={request.status}>{statusLabel[request.status]}</span><b>{request.title}</b><small>{request.id}</small>{request.teacher_reply ? <p>{teacherName}：{request.teacher_reply}</p> : null}</article>) : <div className="student-empty"><MessageCircleMore size={25}/><b>还没有提交诉求</b><p>需要帮助时，数字人会替你整理清楚。</p></div>}<button onClick={() => setTab("requests")}>查看全部</button></aside></div>
    </section>}

    {tab === "welcome" && <section className="student-welcome-library"><WelcomeArticleCards baseHref="/student/welcome"/></section>}

    {tab === "chat" && <section className="student-chat-shell">
      <header><span>{chatMode === "inquiry" ? <Bot size={21}/> : <MessageCircleMore size={21}/>}</span><div><b>{chatMode === "inquiry" ? "学校资料智能问答" : `给${teacherName}留言`}</b><small><i/>{chatMode === "inquiry" ? `智能问答每天最多20轮 · 今日已用 ${dailyUsed}/20` : "留言不调用智能体，直接送达老师"}</small></div>{chatMode === "inquiry" && <button onClick={requestReset}><RotateCcw size={13}/>向老师申请重新计数</button>}</header>
      <nav className="student-agent-mode" aria-label="选择服务类型"><button className={chatMode === "inquiry" ? "active" : ""} onClick={() => newConversation("inquiry")}><Bot size={16}/><span><b>询问学校问题</b><small>智能体依据老师资料回答</small></span></button><button className={chatMode === "message" ? "active" : ""} onClick={() => newConversation("message")}><MessageCircleMore size={16}/><span><b>给老师留言</b><small>不经过智能回答，直接交给老师</small></span></button></nav>
      <div className="student-chat-body">{messages.map((message, index) => <div className={`student-bubble ${message.role}`} key={`${message.role}-${index}`}><span>{message.role === "assistant" ? <Sparkles size={15}/> : home.student.name.slice(0, 1)}</span><p>{message.text}</p></div>)}{loading && <div className="student-bubble assistant"><span><Sparkles size={15}/></span><p className="typing"><i/><i/><i/></p></div>}
        {analysis?.needsResolutionCheck && <article className="student-resolution-card"><header><Sparkles size={18}/><div><b>这条回答是否解决了你的问题？</b><small>选择“已解决”不会给老师增加留言；选择“未解决”才会原文登记。</small></div></header>{analysis.sources?.length ? <div className="student-answer-sources">{analysis.sources.map((source) => <span key={source.title}>{source.title}{source.detail ? ` · ${source.detail}` : ""}</span>)}</div> : null}<div><button onClick={() => resolveInquiry(true)}><CheckCircle2 size={16}/>已解决</button><button className="unresolved" onClick={() => resolveInquiry(false)}><XCircle size={16}/>未解决，留言给老师</button></div></article>}
        {analysis?.ready && <article className="student-submit-card"><header><CheckCircle2 size={19}/><div><b>{analysis.intent === "inquiry" ? "未解决问题已留言" : analysis.request?.merged ? "已追加到本次留言" : "留言已原样登记"}</b><small>{analysis.category} · {analysis.request?.merged ? `同一会话共${analysis.request.messageCount}条学生留言` : analysis.urgency === "urgent" ? "希望尽快处理" : "普通事项"}</small></div></header><h3>{analysis.title}</h3><p>{analysis.summary}</p><div className="student-submitted"><CheckCircle2 size={18}/><span><b>{analysis.request?.merged ? `已更新${teacherName}工作台中的原留言` : `已进入${teacherName}工作台`}</b><small>{submittedId || "诉求已登记"} · 可在“我的诉求”查看进度</small></span></div><button className="student-next-question" onClick={() => newConversation(chatMode)}><MessageCircleMore size={15}/>{chatMode === "message" ? "继续留言" : "开始新问题"}</button></article>}
        {resetNotice && <p className="student-reset-notice"><CheckCircle2 size={15}/>{resetNotice}</p>}
      </div>
      <footer><div><textarea value={input} disabled={Boolean(analysis?.ready) || Boolean(analysis?.needsResolutionCheck) || (chatMode === "inquiry" && dailyUsed >= 20)} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); send(); } }} placeholder={chatMode === "inquiry" && dailyUsed >= 20 ? "今天的20轮智能问答额度已经用完，可向老师申请重新计数" : analysis?.needsResolutionCheck ? "请先选择回答是否已解决" : analysis?.ready ? "留言已提交，可从“我的诉求”查看进度" : chatMode === "message" ? "写清楚需要老师查看的事情、时间和相关情况" : "输入想了解的学校规定、流程或学业问题"}/><button onClick={send} disabled={loading || Boolean(analysis?.ready) || Boolean(analysis?.needsResolutionCheck) || (chatMode === "inquiry" && dailyUsed >= 20)} aria-label={chatMode === "message" ? "提交留言" : "发送问题"}><Send size={18}/></button></div>{error && <p>{error}</p>}<small>{chatMode === "message" ? "留言不会由智能体代替老师回复，将按你的原话直接送达老师。" : "智能体只依据老师上传并确认的资料回答；只有选择“未解决”才生成老师留言。"}</small></footer>
    </section>}

    {tab === "requests" && <section className="student-request-list"><header><div><h1>我的诉求</h1><p>查看{teacherName}的处理进度和回复。</p></div><button onClick={() => newConversation("message")}><MessageCircleMore size={15}/>给老师留言</button></header>{home.requests.length ? home.requests.map((request) => <article key={request.id}><div><span className={request.status}>{statusLabel[request.status]}</span><time><Clock3 size={12}/>{new Date(request.last_message_at || request.created_at).toLocaleString("zh-CN", { hour12: false })}</time></div><h2>{request.title}</h2><p>{request.summary}</p><footer><small>{request.id} · {request.category}{(request.message_count ?? 1) > 1 ? ` · ${request.message_count}条连续留言` : ""}</small>{request.teacher_reply ? <blockquote><b>{teacherName}回复</b>{request.teacher_reply}</blockquote> : null}</footer></article>) : <div className="student-empty"><ClipboardCheck size={30}/><b>没有诉求记录</b><p>请假、申请或情况说明可以直接留言给老师。</p></div>}</section>}
  </main>;
}
