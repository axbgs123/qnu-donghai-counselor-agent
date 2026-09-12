"use client";

import { CheckCircle2, FileText, Info, Plus, X } from "lucide-react";
import { useState } from "react";

type ActionState = { kind: string; context: string } | null;

const actionTitles: Record<string, string> = {
  profile: "个人账户", help: "使用指南", "create-flow": "发起学生事项",
  "view-flow": "查看事项", "filter-cases": "筛选事项", "upload-knowledge": "上传知识资料",
  "create-knowledge": "新建知识资料", "create-student": "新增学生",
  "record-talk": "记录谈心谈话", "create-followup": "创建跟进任务",
  "add-task": "添加个人待办", "add-answer-task": "加入个人待办", "configure-setting": "平台设置",
  "assistant-attach": "添加参考资料", "assistant-mode": "助手工作模式",
};

const downloadContent: Record<string, string> = {
  "export-students": "东海校区学生名册.csv", "export-knowledge": "知识资料目录.csv",
  "generate-report": "东海校区辅导员月度工作报告.txt", "export-ledger": "班级工作台账.csv",
};

const redirectActions: Record<string, string> = {
  "upload-knowledge": "/imports?type=knowledge", "create-knowledge": "/imports?type=knowledge",
  "assistant-attach": "/imports", "create-student": "/imports?type=students", "configure-setting": "/settings",
};

function downloadFile(kind: string, filename: string) {
  const anchor = document.createElement("a");
  anchor.href = `/api/export?type=${encodeURIComponent(kind)}`;
  anchor.download = filename;
  document.body.appendChild(anchor); anchor.click(); anchor.remove();
}

function readContext(value: string) {
  const [name = "", studentId = ""] = value.split("|");
  return { name, studentId };
}

export function ActionCenter({ children }: { children: React.ReactNode }) {
  const [action, setAction] = useState<ActionState>(null);
  const [toast, setToast] = useState("");
  const [saving, setSaving] = useState(false);
  const notify = (message: string) => { setToast(message); window.setTimeout(() => setToast(""), 3000); };

  const handleClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const trigger = (event.target as HTMLElement).closest<HTMLElement>("[data-action]");
    if (!trigger || trigger.hasAttribute("disabled")) return;
    const kind = trigger.dataset.action ?? "";
    const context = trigger.dataset.context ?? trigger.textContent?.trim() ?? "";
    if (downloadContent[kind]) { downloadFile(kind, downloadContent[kind]); notify(`${downloadContent[kind]} 已根据当前数据生成`); return; }
    if (redirectActions[kind]) { window.location.assign(redirectActions[kind]); return; }
    if (kind === "view-flow") { window.location.assign(`/workflows?type=${encodeURIComponent(context)}`); return; }
    setAction({ kind, context });
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!action || saving) return;
    const form = new FormData(event.currentTarget);
    const { studentId } = readContext(action.context);
    let url = "/api/tasks";
    let body: Record<string, unknown> = {};
    if (action.kind === "create-flow") {
      url = "/api/workflows";
      body = { type: String(form.get("type") || "学生日常事务"), title: String(form.get("title") || "").trim(), subject: String(form.get("subject") || "").trim(), note: String(form.get("note") || "").trim() };
    } else if (action.kind === "record-talk") {
      url = "/api/student-records";
      body = { studentId, domain: "谈心谈话", title: String(form.get("title") || "").trim(), summary: String(form.get("note") || "").trim(), happenedAt: String(form.get("date") || ""), followUpAt: String(form.get("followUpAt") || "") };
    } else {
      body = { title: String(form.get("title") || action.context || "个人待办").trim(), module: String(form.get("type") || "个人待办"), dueAt: String(form.get("date") || "") || undefined, subjectType: studentId ? "student" : undefined, subjectId: studentId || undefined };
    }
    if (!body.title) { notify("请先填写标题"); return; }
    setSaving(true);
    try {
      const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "保存失败");
      notify(`${actionTitles[action.kind] || "操作"}已保存到平台`);
      setAction(null);
      window.setTimeout(() => window.location.reload(), 450);
    } catch (error) { notify(error instanceof Error ? error.message : "保存失败"); }
    finally { setSaving(false); }
  };

  const editable = action && ["create-flow", "record-talk", "create-followup", "add-task", "add-answer-task"].includes(action.kind);
  return <div className="action-root" onClick={handleClick}>
    {children}
    {toast && <div className="action-toast" role="status"><CheckCircle2 size={17}/>{toast}</div>}
    {action && <div className="action-modal" role="dialog" aria-modal="true" aria-label={actionTitles[action.kind] || "操作"}>
      <button className="action-backdrop" onClick={() => setAction(null)} aria-label="关闭操作窗口"/>
      <form className="action-card" onSubmit={submit}>
        <header><div><span><Plus size={18}/></span><div><h2>{actionTitles[action.kind] || "处理事项"}</h2><p>{readContext(action.context).name || action.context}</p></div></div><button type="button" onClick={() => setAction(null)} aria-label="关闭"><X size={18}/></button></header>
        <ActionFields action={action}/>
        <footer><button type="button" className="secondary-button" onClick={() => setAction(null)}>{editable ? "取消" : "关闭"}</button>{editable && <button type="submit" className="primary-button" disabled={saving}><CheckCircle2 size={15}/>{saving ? "保存中…" : "确认保存"}</button>}</footer>
      </form>
    </div>}
  </div>;
}

function ActionFields({ action }: { action: NonNullable<ActionState> }) {
  if (action.kind === "profile") return <div className="action-body profile-summary"><span>师</span><div><b>当前教师账号</b><p>泉州师范学院东海校区 · 辅导员</p><small>具体姓名和负责范围以右上角登录信息为准</small></div></div>;
  if (action.kind === "help") return <div className="action-body action-list"><article><b>1. 先导入真实资料</b><small>学生表进入学生档案，政策和通知进入知识库。</small></article><article><b>2. 从工作台创建待办</b><small>保存后会进入数据库，并能完成或恢复。</small></article><article><b>3. 从学生详情沉淀记录</b><small>谈心、诉求和业务资料会汇总到个人时间线。</small></article><article><b>学生工作功能说明</b><small><a href="/services">查看平台覆盖的辅导员工作场景</a></small></article></div>;
  if (action.kind === "filter-cases") return <div className="action-body action-detail"><Info size={20}/><h3>按事项类型查看</h3><p>请进入事项流程页面，直接选择对应业务类型。</p></div>;
  if (action.kind === "assistant-mode") return <div className="action-body action-detail"><Info size={20}/><h3>助手模式由问题自动判断</h3><p>列表、通知、谈话提纲和工作总结会根据你的请求选择合适格式；模型与 Key 在平台设置中切换。</p></div>;

  const isTalk = action.kind === "record-talk";
  const isFlow = action.kind === "create-flow";
  const isFollowUp = action.kind === "create-followup";
  const flowTypes = ["请销假", "心理支持", "就业困难帮扶", "学业预警", "奖助评优", "主题班会", "四个100%", "迎新与军训", "毕业与离校", "国防与征兵"];
  const flowType = flowTypes.includes(action.context) ? action.context : "学生日常事务";
  return <div className="action-body action-fields">
    <label>{isTalk ? "谈话主题" : isFlow ? "事项标题" : "待办标题"}<input name="title" required defaultValue={isFollowUp ? `跟进${readContext(action.context).name}` : action.kind === "add-answer-task" ? action.context : isFlow && flowTypes.includes(action.context) ? action.context : ""} placeholder="请输入清晰、可执行的标题"/></label>
    {isFlow && <label>办理对象<input name="subject" placeholder="学生姓名、学号或班级"/></label>}
    <label>{isFlow ? "事项类型" : "所属业务"}<select name="type" defaultValue={isFlow ? flowType : isTalk ? "谈心谈话" : isFollowUp ? "学生跟进" : "个人待办"}><option>学生日常事务</option>{flowTypes.map((item) => <option key={item}>{item}</option>)}<option>班团建设</option><option>迎新工作</option><option>学生跟进</option><option>个人待办</option></select></label>
    {(isTalk || isFlow) && <label>{isTalk ? "谈话摘要" : "办理说明"}<textarea name="note" placeholder="只记录已确认的事实和下一步"/></label>}
    <label>{isTalk ? "谈话日期" : "办理日期"}<input name="date" type="date" defaultValue={new Date().toISOString().slice(0, 10)}/></label>
    {isTalk && <label>下次回访（可不填）<input name="followUpAt" type="date"/></label>}
    <p className="field-hint"><FileText size={14}/>确认后会写入平台数据库，可在对应页面查看。</p>
  </div>;
}
