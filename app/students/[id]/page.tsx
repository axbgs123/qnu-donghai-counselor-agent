import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, BookOpen, BriefcaseBusiness, FileCheck2, Mail, MessageSquareText, Phone, Plus, UserRoundCheck } from "lucide-react";
import { PortalShell } from "../../components/PortalShell";
import { getPlatformStudent } from "../../lib/platform-storage";
import { getAuthAccountByToken, AUTH_COOKIE } from "../../lib/auth-storage";
import { cookies } from "next/headers";

export const metadata: Metadata = { title: "学生详情" };

function text(value: unknown, fallback = "未填写") { return typeof value === "string" && value.trim() ? value : fallback; }
function shortDate(value: unknown) {
  const date = new Date(text(value, ""));
  return Number.isNaN(date.getTime()) ? "时间未记录" : new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

export default async function StudentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const token = (await cookies()).get(AUTH_COOKIE)?.value ?? "";
  const teacher = await getAuthAccountByToken(token);
  if (teacher?.role !== "teacher") notFound();
  const profile = await getPlatformStudent(id, teacher.id);
  if (!profile) notFound();
  const { student, records, requests, imported, tasks } = profile;
  const timeline = [
    ...records.map((row) => ({ key: `record-${row.id}`, date: row.happened_at, source: "辅导员记录", title: row.title, summary: row.summary, status: row.status })),
    ...requests.map((row) => ({ key: `request-${row.id}`, date: row.created_at, source: "学生诉求", title: row.title, summary: row.summary, status: row.status })),
    ...imported.map((row) => ({ key: `import-${row.id}`, date: row.occurred_at || row.updated_at, source: "导入业务资料", title: row.title || row.record_type, summary: "该记录来自已确认导入文件，可在智能资料导入中核对来源。", status: row.review_status })),
  ].sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
  const openTasks = tasks.filter((row) => row.status !== "done");

  return <PortalShell>
    <div className="detail-back"><Link href="/students"><ArrowLeft size={16}/>返回学生档案</Link><div><button className="secondary-button" data-action="record-talk" data-context={`${student.name}|${student.id}`}><MessageSquareText size={15}/>记录谈心</button><button className="primary-button" data-action="create-followup" data-context={`${student.name}|${student.id}`}><Plus size={15}/>创建跟进任务</button></div></div>
    <section className="profile-hero panel">
      <span className="large-avatar">{student.name.slice(0, 1)}</span>
      <div className="profile-main"><div><h1>{student.name}</h1><span className={`status-badge ${student.status === "正常" ? "normal" : "attention"}`}>{student.status}</span></div><p>{student.id} · {student.gender} · {student.department}</p><div className="profile-tags">{student.tags.map((tag) => <span key={tag}>{tag}</span>)}</div></div>
      <dl><div><dt>行政班</dt><dd>{student.grade}级{student.className}</dd></div><div><dt>数据来源</dt><dd>{student.imported ? "已确认导入档案" : "教师创建档案"}</dd></div><div><dt>联系方式</dt><dd><Phone size={13}/>{student.phone} <Mail size={13}/>以档案为准</dd></div></dl>
    </section>
    <section className="student-work-snapshot">
      <article className="panel"><span className="metric-icon blue"><BookOpen size={18}/></span><div><small>业务记录</small><b>{imported.length} 条</b><em>来自已确认的导入资料</em></div></article>
      <article className="panel"><span className="metric-icon amber"><MessageSquareText size={18}/></span><div><small>谈心与跟进</small><b>{records.length} 条</b><em>{records.filter((row) => row.status === "follow_up").length} 条待回访</em></div></article>
      <article className="panel"><span className="metric-icon violet"><UserRoundCheck size={18}/></span><div><small>学生诉求</small><b>{requests.length} 条</b><em>{requests.filter((row) => row.status !== "resolved").length} 条未办结</em></div></article>
      <article className="panel"><span className="metric-icon green"><FileCheck2 size={18}/></span><div><small>跟进待办</small><b>{openTasks.length} 条</b><em>只统计关联本人的真实待办</em></div></article>
    </section>
    <div className="profile-layout">
      <section className="panel timeline-panel"><div className="panel-head"><div><h2>学生时间线</h2><span>由谈心记录、学生诉求和导入业务资料汇总</span></div></div>
        <div className="event-timeline">{timeline.length ? timeline.map((event) => <article key={event.key}><span className="event-icon blue"><FileCheck2 size={17}/></span><div><time>{shortDate(event.date)} · {text(event.source)}</time><h3>{text(event.title)}</h3><p>{text(event.summary, "暂无补充说明")}</p><em>{text(event.status, "已记录")}</em></div></article>) : <div className="empty-state"><FileCheck2 size={25}/><b>还没有业务记录</b><p>记录谈心或导入该生资料后，会按时间显示在这里。</p></div>}</div>
      </section>
      <aside className="profile-side">
        <section className="panel compact-panel"><h2>当前跟进</h2>{openTasks.length ? openTasks.slice(0, 4).map((task) => <div className="case-focus" key={String(task.id)}><span>待</span><div><b>{text(task.title)}</b><small>{text(task.due_at, "未设截止时间")}</small></div></div>) : <div className="side-note"><FileCheck2 size={17}/><p><b>暂无关联待办</b><small>可从右上角创建跟进任务</small></p></div>}</section>
        <section className="panel compact-panel"><h2>档案完整性</h2><ul className="growth-list"><li><span>班级</span><b>{student.className}</b></li><li><span>电话</span><b>{student.phone}</b></li><li><span>资料来源</span><b>{student.imported ? "导入" : "教师创建"}</b></li></ul></section>
        <section className="panel compact-panel"><h2>说明</h2><div className="side-note"><BriefcaseBusiness size={17}/><p><b>不自动推断学生状态</b><small>没有数据的学业、奖助、就业等信息会保持空白。</small></p></div></section>
      </aside>
    </div>
  </PortalShell>;
}
