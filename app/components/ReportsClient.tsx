"use client";

import { Database, TrendingUp, Users } from "lucide-react";
import { useEffect, useState } from "react";

type Report = {
  generatedAt: string; month: string; students: number; resolved: number; touched: number; pending: number;
  knowledge: { total: number; verified: number };
  categories: Array<{ name: string; count: number }>;
  classes: Array<{ className: string; students: number; attention: number }>;
};

export function ReportsClient() {
  const [report, setReport] = useState<Report | null>(null);
  useEffect(() => { fetch("/api/reports").then((response) => response.json()).then(setReport).catch(() => setReport(null)); }, []);
  const total = report?.categories.reduce((sum, item) => sum + item.count, 0) ?? 0;
  const max = Math.max(1, ...(report?.categories.map((item) => item.count) ?? [1]));
  return <>
    <div className="report-stats"><article><small>本月办结事项</small><strong>{report?.resolved ?? 0}</strong><span><TrendingUp size={14}/>按真实完成记录统计</span></article><article><small>学生触达人数</small><strong>{report?.touched ?? 0}</strong><span>在管学生 {report?.students ?? 0} 人</span></article><article><small>当前未完成</small><strong>{report?.pending ?? 0}</strong><span>诉求、待办与事项合计</span></article><article><small>知识资料</small><strong>{report?.knowledge.verified ?? 0}</strong><span>{report?.knowledge.total ?? 0} 份已上传资料</span></article></div>
    <div className="report-layout"><section className="panel chart-panel"><div className="panel-head"><div><h2>事项分类分布</h2><span>{report?.month || "本月"} · 只统计平台已有记录</span></div></div><div className="bar-chart">{(report?.categories.slice(0, 12) ?? []).map((item) => <div key={item.name}><span style={{ height: `${Math.max(8, item.count / max * 100)}%` }}/><small>{item.name.slice(0, 5)}</small></div>)}</div>{!report?.categories.length && <div className="empty-state"><Database size={25}/><b>还没有可统计的事项</b><p>处理学生诉求、创建事项或记录谈心后会自动形成统计。</p></div>}</section>
    <aside className="panel distribution-panel"><div className="panel-head"><div><h2>业务总量</h2><span>共 {total} 项</span></div></div><div className="donut"><div><strong>{total}</strong><small>全部事项</small></div></div><ul>{(report?.categories.slice(0, 5) ?? []).map((item, index) => <li key={item.name}><i className={["blue","amber","violet","green"][index % 4]}/><span>{item.name}</span><b>{total ? Math.round(item.count / total * 100) : 0}%</b></li>)}</ul></aside></div>
    <section className="panel class-progress"><div className="panel-head"><div><h2>班级档案概况</h2><span>按当前学生档案实时汇总</span></div><button className="secondary-button" data-action="export-ledger">下载详细台账</button></div><div className="progress-list">{(report?.classes ?? []).map((item) => { const normal = Math.max(0, item.students - item.attention); const pct = item.students ? Math.round(normal / item.students * 100) : 0; return <div key={item.className}><p><b>{item.className}</b><small>{item.students}名学生 · {item.attention}人标记跟进</small></p><div><span style={{ width: `${pct}%` }}/></div><strong>{pct}%</strong></div>; })}{!report?.classes.length && <div className="empty-state"><Users size={24}/><b>还没有班级档案</b><p>请先批量导入学生名单。</p></div>}</div></section>
    <section className="status-strip"><div><Database size={18}/><p><b>统计口径说明</b><small>未接入满意度或响应时长数据，因此不展示推测值；对话额度重置申请也不计入学生工作指标。</small></p></div><span>{report ? new Date(report.generatedAt).toLocaleString("zh-CN") : "正在读取"}</span></section>
  </>;
}
