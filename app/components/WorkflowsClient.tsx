"use client";

import { ArrowRight, CheckCircle2, ClipboardCheck, Layers3, ListChecks, Trash2, UserRound } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type CaseRow = { id: number; type: string; title: string; subject: string; stage: string; status: "open" | "waiting" | "closed"; owner: string; updatedAt: string };
const templates = [
  { name: "请销假", forWho: "需要请假、续假或销假的学生", prepare: "学生姓名、请假时间、原因和证明材料", steps: ["信息核对", "辅导员处理", "结果记录"] },
  { name: "心理支持", forWho: "需要持续沟通或转介专业支持的学生", prepare: "事实记录、初步沟通情况、可联系时间", steps: ["线索记录", "初步沟通", "转介或回访"] },
  { name: "就业困难帮扶", forWho: "去向未落实或求职困难学生", prepare: "就业意向、简历、当前困难", steps: ["目标确认", "材料辅导", "结果跟进"] },
  { name: "学业预警", forWho: "达到学业预警条件的学生", prepare: "成绩、考勤、预警依据和谈话记录", steps: ["依据核对", "学生谈话", "帮扶跟进"] },
  { name: "奖助评优", forWho: "申请奖助项目或参与评优的学生", prepare: "申请名单、证明材料、班级评议结果", steps: ["材料收集", "班级评议", "结果归档"] },
  { name: "主题班会", forWho: "需要组织主题教育的班级", prepare: "班级、主题、时间地点、签到方式", steps: ["确定主题", "组织开展", "总结归档"] },
  { name: "四个100%", forWho: "存在参与缺项的学生或班级", prepare: "参与记录、缺项名单、补充安排", steps: ["数据汇总", "缺项提醒", "结果登记"] },
  { name: "迎新与军训", forWho: "新生班级与军训学生", prepare: "新生名单、报到缺项、军训安排", steps: ["报到核验", "入学教育", "适应回访"] },
  { name: "毕业与离校", forWho: "毕业班和待离校学生", prepare: "去向、档案和离校清单", steps: ["去向核对", "材料确认", "未就业跟进"] },
  { name: "国防与征兵", forWho: "咨询或报名应征的学生", prepare: "报名阶段、学生意向、待办材料", steps: ["意向登记", "报名指导", "学籍衔接"] },
];

export function WorkflowsClient() {
  const [cases, setCases] = useState<CaseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const load = () => fetch("/api/workflows").then((response) => response.json()).then((payload: { cases?: CaseRow[] }) => setCases(payload.cases ?? [])).catch(() => setCases([])).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);
  const active = cases.filter((item) => item.status !== "closed");
  const selected = useMemo(() => typeof window === "undefined" ? "" : new URLSearchParams(window.location.search).get("type") || "", []);
  const remove = async (id: number) => {
    if (!window.confirm("确定删除这条事项记录吗？")) return;
    if ((await fetch(`/api/workflows?id=${id}`, { method: "DELETE" })).ok) setCases((current) => current.filter((item) => item.id !== id));
  };
  const complete = async (item: CaseRow) => {
    const status = item.status === "closed" ? "open" : "closed";
    const response = await fetch("/api/workflows", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: item.id, status }) });
    if (response.ok) setCases((current) => current.map((row) => row.id === item.id ? { ...row, status } : row));
  };
  return <>
    <section className="workflow-start panel"><header><span>从这里开始</span><h2>你现在要处理哪一种情况？</h2><p>保存后进入统一事项台账，并在所有页面保持一致。</p></header><div>
      <button data-action="create-flow" data-context="为一名学生办理事项"><UserRound size={21}/><span><b>为一名学生办理</b><small>请假、预警、谈话、帮扶等个人事项</small></span><ArrowRight size={16}/></button>
      <button data-action="create-flow" data-context="为班级批量办理事项"><Layers3 size={21}/><span><b>为班级批量办理</b><small>班会、奖助评议、活动与名单类事项</small></span><ArrowRight size={16}/></button>
      <button onClick={() => document.getElementById("recent-cases")?.scrollIntoView({ behavior: "smooth" })}><ListChecks size={21}/><span><b>处理待我办理</b><small>查看当前真实未办结事项</small></span><ArrowRight size={16}/></button>
    </div></section>
    <div className="workflow-practical-stats"><article><small>正在办理</small><strong>{active.length}</strong><span>来自真实事项台账</span></article><article><small>等待处理</small><strong>{cases.filter((item) => item.status === "waiting").length}</strong><span className="warn">需要补充或确认</span></article><article><small>已完成</small><strong>{cases.filter((item) => item.status === "closed").length}</strong><span>可随时追溯</span></article><article><small>事项类型</small><strong>{new Set(cases.map((item) => item.type)).size}</strong><span>按实际创建统计</span></article></div>
    <section className="workflow-catalog-head"><div><span>常用办理模板</span><h2>选择具体事项</h2></div><p>模板只提供办理结构，数字均来自真实事项记录。</p></section>
    <div className="workflow-guide-grid">{templates.filter((item) => !selected || item.name === selected).map((flow, flowIndex) => { const count = cases.filter((item) => item.type === flow.name && item.status !== "closed").length; return <article className="panel workflow-guide-card" key={flow.name}><header><span className={`flow-mark ${["blue","violet","green","amber"][flowIndex % 4]}`}><ClipboardCheck size={18}/></span><div><h2>{flow.name}</h2><p>{count ? `${count}项正在办理` : "暂无进行中事项"}</p></div><strong>{count}<small>项</small></strong></header><dl><div><dt>适用于</dt><dd>{flow.forWho}</dd></div><div><dt>开始前准备</dt><dd>{flow.prepare}</dd></div></dl><ol>{flow.steps.map((step, index) => <li key={step}><span>{index + 1}</span>{step}{index < flow.steps.length - 1 && <i/>}</li>)}</ol><footer><button data-action="create-flow" data-context={flow.name}>开始办理 <ArrowRight size={14}/></button><button onClick={() => document.getElementById("recent-cases")?.scrollIntoView({ behavior: "smooth" })}>查看已有{count}项</button></footer></article>; })}</div>
    <section className="panel recent-cases" id="recent-cases"><div className="panel-head"><div><h2>事项台账</h2><span>{loading ? "正在读取…" : `共 ${cases.length} 条真实记录`}</span></div></div><div className="case-table"><div className="case-head"><span>事项</span><span>学生／对象</span><span>当前节点</span><span>负责人</span><span>操作</span></div>{cases.map((row) => <div className="case-row" key={row.id}><span><b>{row.title}</b><small>{row.type}</small></span><span>{row.subject || "未填写"}</span><span className="node-badge"><CheckCircle2 size={12}/>{row.status === "closed" ? "已完成" : row.stage}</span><span>{row.owner}</span><span className="student-row-actions"><button onClick={() => complete(row)}>{row.status === "closed" ? "恢复" : "完成"}</button><button onClick={() => remove(row.id)} aria-label={`删除${row.title}`}><Trash2 size={14}/></button></span></div>)}</div>{!loading && !cases.length && <div className="empty-state"><ClipboardCheck size={25}/><b>还没有事项记录</b><p>从上方选择模板或新建事项，保存后会出现在这里。</p></div>}</section>
  </>;
}
