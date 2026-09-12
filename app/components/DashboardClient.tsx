"use client";

import Link from "next/link";
import {
  ArrowRight,
  Bot,
  CalendarDays,
  Check,
  CheckCircle2,
  Clock3,
  FileText,
  Inbox,
  Plus,
  Send,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserRoundCheck,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type TaskRow = { id: number; title: string; module: string; dueAt?: string | null; priority: "urgent" | "important" | "normal"; status: "todo" | "doing" | "done" };
type StudentRow = { id: string; name: string; className: string; status: string; tags: string[] };

export function DashboardClient() {
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [answer, setAnswer] = useState("");
  const [requestMetrics, setRequestMetrics] = useState({ total: 0, new: 0, processing: 0, resolved: 0 });
  const [welcomeMetrics, setWelcomeMetrics] = useState({ students: 0, completionRate: 0 });
  const [taskInput, setTaskInput] = useState("");
  const [taskRows, setTaskRows] = useState<TaskRow[]>([]);
  const [studentRows, setStudentRows] = useState<StudentRow[]>([]);
  const [taskSaving, setTaskSaving] = useState(false);
  const [assistantBusy, setAssistantBusy] = useState(false);
  const [assistantModel, setAssistantModel] = useState("智能模型");
  const [teacherName, setTeacherName] = useState("老师");
  const [assistantSources, setAssistantSources] = useState<Array<{ title: string; scope?: string }>>([]);
  const pending = taskRows.filter((task) => task.status !== "done").length;
  const classCount = new Set(studentRows.map((student) => student.className).filter(Boolean)).size;

  const todayLabel = useMemo(() => new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", month: "long", day: "numeric", weekday: "long" }).format(new Date()), []);
  const currentTime = useMemo(() => new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date()), []);

  useEffect(() => {
    Promise.all([
      fetch("/api/requests").then((response) => response.json()),
      fetch("/api/welcome").then((response) => response.json()),
      fetch("/api/assistant").then((response) => response.json()),
      fetch("/api/tasks").then((response) => response.json()),
      fetch("/api/students").then((response) => response.json()),
      fetch("/api/auth/me").then((response) => response.json()),
    ]).then(([requests, welcome, assistant, tasksPayload, studentsPayload, auth]) => {
      if (requests.metrics) setRequestMetrics(requests.metrics);
      if (welcome.metrics) setWelcomeMetrics(welcome.metrics);
      if (assistant.model) setAssistantModel(assistant.model);
      setTaskRows(tasksPayload.tasks ?? []);
      setStudentRows(studentsPayload.students ?? []);
      if (auth.account?.displayName) setTeacherName(auth.account.displayName);
    }).catch(() => undefined);
  }, []);

  const createNaturalTasks = async () => {
    if (!taskInput.trim() || taskSaving) return;
    setTaskSaving(true);
    try {
      const response = await fetch("/api/tasks/natural-language", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message: taskInput }) });
      const data = await response.json() as { tasks?: TaskRow[] };
      setTaskRows((current) => [...(data.tasks ?? []), ...current]);
      setTaskInput("");
    } finally { setTaskSaving(false); }
  };

  const toggleTask = async (task: TaskRow) => {
    const status = task.status === "done" ? "todo" : "done";
    setTaskRows((current) => current.map((item) => item.id === task.id ? { ...item, status } : item));
    const response = await fetch("/api/tasks", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: task.id, status }) }).catch(() => null);
    if (!response?.ok) setTaskRows((current) => current.map((item) => item.id === task.id ? task : item));
  };

  const removeTask = async (task: TaskRow) => {
    if (!window.confirm(`确定删除待办“${task.title}”吗？`)) return;
    const response = await fetch(`/api/tasks?id=${task.id}`, { method: "DELETE" });
    if (response.ok) setTaskRows((current) => current.filter((item) => item.id !== task.id));
  };

  const ask = async (value = prompt) => {
    const question = value.trim();
    if (!question || assistantBusy) return;
    setPrompt(value);
    setAnswer("");
    setAssistantSources([]);
    setAssistantOpen(true);
    setAssistantBusy(true);
    try {
      const response = await fetch("/api/assistant", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message: question }) });
      const result = await response.json() as { answer?: string; error?: string; sources?: Array<{ title: string; scope?: string }> };
      if (!response.ok) throw new Error(result.error || "智能助手暂时无法响应");
      setAnswer(result.answer || "已完成查询，请打开完整智能助手继续处理。");
      setAssistantSources(result.sources ?? []);
    } catch (error) {
      setAnswer(error instanceof Error ? error.message : "智能助手暂时无法响应，请稍后重试。");
    } finally {
      setAssistantBusy(false);
    }
  };

  return (
    <>
      <section className="page-heading dashboard-heading">
        <div>
          <p className="eyebrow">{todayLabel}</p>
          <h1>早上好，{teacherName}</h1>
          <p>当前负责学生中有 <b>{requestMetrics.new} 条</b> 诉求待处理。</p>
        </div>
        <button className="primary-button" onClick={() => setAssistantOpen(true)}><Sparkles size={17} />唤起智能助手</button>
      </section>

      <section className="overview-grid">
        <article className="focus-card">
          <div className="focus-orbit orbit-one" /><div className="focus-orbit orbit-two" />
          <div className="focus-copy">
            <span className="focus-kicker"><Sparkles size={14} /> AI 今日建议</span>
            <h2>{requestMetrics.new ? `先处理 ${requestMetrics.new} 条新诉求，` : "学生诉求已清空，"}<br />再查看学生与迎新进度。</h2>
            <p>学生已通过{teacherName}数字人完成信息整理，打开工作台即可集中回复。</p>
            <div className="focus-actions">
              <Link href="/requests">处理学生诉求 <ArrowRight size={16} /></Link>
              <span><Clock3 size={14} />数字人已完成前置信息收集</span>
            </div>
          </div>
          <div className="focus-score">
            <div className="score-ring" style={{ "--score": `${welcomeMetrics.completionRate || 2}%` } as React.CSSProperties}><strong>{welcomeMetrics.completionRate}</strong><small>%</small></div>
            <p>迎新清单完成率</p>
          </div>
        </article>

        <div className="metric-stack">
          <Link href="/requests" className="metric-card"><span className="metric-icon amber"><Inbox size={20} /></span><div><small>待处理诉求</small><strong>{requestMetrics.new}</strong><em>{requestMetrics.processing} 条正在处理中</em></div></Link>
          <Link href="/welcome" className="metric-card"><span className="metric-icon blue"><UserRoundCheck size={20} /></span><div><small>迎新学生</small><strong>{welcomeMetrics.students}</strong><em>{classCount ? `${classCount} 个行政班` : "尚未导入学生"}</em></div></Link>
        </div>
      </section>

      <section className="quick-strip natural-task-strip">
        <div><span className="quick-logo"><Bot size={19} /></span><p><b>一句话创建多项待办</b><small>日期、对象和事项会自动拆分保存</small></p></div>
        <div className="natural-task-input"><input value={taskInput} onChange={(event) => setTaskInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") createNaturalTasks(); }} placeholder="输入待办，多项内容可用顿号或换行分开"/><button onClick={createNaturalTasks} disabled={taskSaving}>{taskSaving ? "保存中" : "创建待办"}</button></div>
      </section>
      {!!taskRows.length && <section className="created-task-bar"><CheckCircle2 size={15}/><div><b>平台共保存 {taskRows.length} 项待办</b><span>{pending} 项尚未完成，完成状态会持久保存</span></div></section>}

      <div className="dashboard-columns">
        <section className="panel task-panel">
          <div className="panel-head"><div><h2>今日待办</h2><span>{pending} 项未完成</span></div><Link href="/workflows">查看全部 <ArrowRight size={14} /></Link></div>
          <div className="task-list">
            {taskRows.map((task) => {
              const isDone = task.status === "done";
              return (
                <article className={`task-row ${isDone ? "done" : ""}`} key={task.id}>
                  <button className="check-button" aria-label={isDone ? "恢复任务" : "完成任务"} onClick={() => toggleTask(task)}>{isDone && <Check size={14} />}</button>
                  <time>{task.dueAt ? new Date(task.dueAt).toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" }) : "待办"}</time>
                  <div className="task-copy"><b>{task.title}</b><small>{task.module} · {task.status === "doing" ? "进行中" : isDone ? "已完成" : "未开始"}</small></div>
                  <span className={`priority ${task.priority}`}>{task.priority}</span>
                  <span/><button className="row-more" onClick={() => removeTask(task)} aria-label={`删除待办${task.title}`}><Trash2 size={16}/></button>
                </article>
              );
            })}
            {!taskRows.length && <div className="empty-state"><CheckCircle2 size={24}/><b>当前没有待办</b><p>可用上方一句话创建，或点击“添加个人待办”。</p></div>}
          </div>
          <button className="add-task" data-action="add-task"><Plus size={15} />添加个人待办</button>
        </section>

        <aside className="panel schedule-panel">
          <div className="panel-head"><div><h2>今日日程</h2><span>{taskRows.filter((task) => task.dueAt?.slice(0, 10) === new Date().toISOString().slice(0, 10)).length} 个安排</span></div></div>
          <div className="timeline">
            {taskRows.filter((task) => task.dueAt?.slice(0, 10) === new Date().toISOString().slice(0, 10)).slice(0, 5).map((task, index) => <div className={`timeline-item ${index === 0 ? "current" : ""}`} key={task.id}><time>{task.dueAt?.slice(11, 16) || "今日"}</time><span/><div><b>{task.title}</b><small>{task.module}</small></div></div>)}
            {!taskRows.some((task) => task.dueAt?.slice(0, 10) === new Date().toISOString().slice(0, 10)) && <div className="empty-state"><CalendarDays size={22}/><b>今天没有定时事项</b><p>未设置日期的内容仍显示在左侧待办。</p></div>}
          </div>
        </aside>
      </div>

      <section className="panel follow-panel">
        <div className="panel-head"><div><h2>需要跟进的学生</h2><span>根据近期事项自动汇总，仍需由你判断</span></div><Link href="/students">进入学生档案 <ArrowRight size={14} /></Link></div>
        <div className="follow-grid">
          {studentRows.filter((student) => student.status !== "正常").slice(0, 6).map((student) => (
            <Link href={`/students/${student.id}`} className="student-card" key={student.id}>
              <span className="student-avatar blue">{student.name.slice(0, 1)}</span>
              <div><b>{student.name}</b><small>{student.className}</small><p>{student.status}</p><em>{student.tags.join("、") || "查看档案"}</em></div>
              <ArrowRight size={17} />
            </Link>
          ))}
          {!studentRows.some((student) => student.status !== "正常") && <div className="empty-state"><UserRoundCheck size={24}/><b>当前没有标记为重点跟进的学生</b><p>只有档案中明确标记的学生会出现在这里。</p></div>}
        </div>
      </section>

      <section className="status-strip">
        <div><ShieldCheck size={18} /><p><b>东海校区辅导员工作台</b><small>学生、待办、诉求和资料均读取平台数据库；空数据不会用示例补齐。</small></p></div>
        <span>数据实时读取</span>
      </section>

      {assistantOpen && (
        <div className="assistant-drawer" role="dialog" aria-modal="true" aria-label="智能助手">
          <button className="drawer-backdrop" onClick={() => setAssistantOpen(false)} aria-label="关闭智能助手" />
          <section className="drawer-panel">
            <header><span className="assistant-mark"><Sparkles size={18} /></span><div><b>泉师智能助手</b><small><i />{assistantModel} · 东海校区工具已加载</small></div><button onClick={() => setAssistantOpen(false)} aria-label="关闭">×</button></header>
            <div className="drawer-body">
              <p className="assistant-date">今天 {currentTime}</p>
              <div className="assistant-message"><span><Bot size={16} /></span><p>{teacherName}好。我可以帮你汇总学生诉求、整理迎新材料、创建待办和生成待确认的工作草稿。</p></div>
              {prompt && <div className="user-message"><p>{prompt}</p></div>}
              {assistantBusy && <div className="assistant-message"><span><Sparkles size={16}/></span><p>正在查询学生工作数据并整理答案…</p></div>}
              {answer && <div className="assistant-message detailed"><span><Sparkles size={16} /></span><div><p>{answer}</p>{assistantSources.length ? <aside><FileText size={14} /><span><b>参考依据</b>{assistantSources.slice(0, 2).map((source) => <small key={source.title}>{source.title}{source.scope ? ` · ${source.scope}` : ""}</small>)}</span></aside> : null}<div className="message-actions"><Link href={`/assistant?prompt=${encodeURIComponent(prompt)}`}><CheckCircle2 size={14} />在完整助手中继续</Link><button data-action="add-answer-task" data-context={prompt}>加入待办</button></div></div></div>}
            </div>
            <footer>
              <div className="suggestions"><button onClick={() => ask("查询办理流程")}>查询办理流程</button><button onClick={() => ask("生成正式通知")}>生成正式通知</button></div>
              <div className="composer"><textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); ask(); } }} placeholder="输入你的工作需求…" /><button onClick={() => ask()} disabled={assistantBusy} aria-label="发送"><Send size={17} /></button></div>
              <small>重要操作会在执行前请你确认，AI 生成内容请结合实际情况审核。</small>
            </footer>
          </section>
        </div>
      )}
    </>
  );
}
