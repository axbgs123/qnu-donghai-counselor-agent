"use client";

import Link from "next/link";
import { CheckCircle2, ClipboardList, LoaderCircle, PartyPopper, Upload, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { WelcomeArticleCards } from "./WelcomeEditorial";

type WelcomeData = {
  items: Array<{ id: number; title: string; description: string; due_at: string; status: string }>;
  students: Array<{ student_no: string; name: string; class_name: string; completed: number; total: number }>;
  metrics: { students: number; items: number; completed: number; completionRate: number };
};

export function WelcomeManagementClient() {
  const [data, setData] = useState<WelcomeData | null>(null);
  const [className, setClassName] = useState("");
  useEffect(() => { fetch("/api/welcome").then((response) => response.json()).then(setData).catch(() => undefined); }, []);
  if (!data) return <div className="welcome-loading panel"><LoaderCircle className="spin" size={21}/>正在读取迎新进度…</div>;
  const students = data.students.filter((student) => !className || student.class_name === className);
  const classes = [...new Set(data.students.map((student) => student.class_name))].filter(Boolean);
  return <div className="welcome-management">
    <section className="welcome-metrics"><article><span><Users size={20}/></span><p><small>新生人数</small><strong>{data.metrics.students}</strong><em>{classes.length ? `${classes.length}个班级` : "尚未导入学生"}</em></p></article><article><span className="blue"><ClipboardList size={20}/></span><p><small>迎新事项</small><strong>{data.metrics.items}</strong><em>{data.metrics.items ? "当前已发布" : "尚未发布"}</em></p></article><article><span className="green"><CheckCircle2 size={20}/></span><p><small>总体完成率</small><strong>{data.metrics.completionRate}%</strong><em>{data.metrics.completed}次学生确认</em></p></article></section>
    <section className="welcome-launch panel"><div><span><PartyPopper size={24}/></span><p><small>迎新管理</small><h2>{data.metrics.items ? "迎新事项已同步到学生端" : "先导入迎新资料并发布事项"}</h2><em>页面只展示当前数据库中的学生、资料与完成记录。</em></p></div><div><Link className="secondary-button" href="/imports?type=knowledge"><Upload size={14}/>导入迎新材料</Link></div></section>
    <WelcomeArticleCards baseHref="/welcome"/>
    <div className="welcome-grid"><section className="panel welcome-item-list"><header><div><h2>已发布迎新事项</h2><p>学生完成后实时进入统计。</p></div><button data-action="create-flow" data-context="新增迎新事项">新增事项</button></header>{data.items.map((item, index) => <article key={item.id}><span>{index + 1}</span><div><b>{item.title}</b><p>{item.description}</p><small>截止：{item.due_at || "未设置"} · 学生端可见</small></div><em>已发布</em></article>)}{!data.items.length && <div className="empty-state"><ClipboardList size={24}/><b>还没有迎新事项</b><p>新增事项后才会显示在学生端。</p></div>}</section>
      <section className="panel welcome-progress"><header><div><h2>学生准备进度</h2><p>按班级查看清单完成情况。</p></div><select value={className} onChange={(event) => setClassName(event.target.value)}><option value="">全部班级</option>{classes.map((item) => <option key={item}>{item}</option>)}</select></header><div>{students.map((student) => { const progress = student.total ? Math.round(student.completed / student.total * 100) : 0; return <article key={student.student_no}><span>{student.name.slice(0, 1)}</span><p><b>{student.name}<em>{student.class_name}</em></b><small>{student.student_no}</small><i><u style={{ width: `${progress}%` }}/></i></p><strong>{student.completed}/{student.total}</strong></article>; })}{!students.length && <div className="empty-state"><Users size={24}/><b>还没有学生数据</b><p>请先导入学生档案并创建学生账号。</p></div>}</div></section></div>
  </div>;
}
