"use client";

import Link from "next/link";
import { ArrowRight, Download, Filter, Plus, Search, Trash2, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type StudentRow = {
  id: string; name: string; gender: string; department: string; grade: string; className: string;
  phone: string; status: string; tags: string[]; imported: boolean;
};

export function StudentsClient() {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("全部状态");
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    fetch("/api/students")
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("加载失败")))
      .then((payload: { students?: StudentRow[] }) => setStudents(payload.students ?? []))
      .catch(() => setStudents([]))
      .finally(() => setLoading(false));
  }, []);
  const filtered = useMemo(() => students.filter((s) => {
    const matchQuery = `${s.name}${s.id}${s.className}${s.department}${s.tags.join("")}`.includes(query.trim());
    const matchStatus = status === "全部状态" || s.status === status;
    return matchQuery && matchStatus;
  }), [students, query, status]);

  const removeStudent = async (student: StudentRow) => {
    if (!window.confirm(`确定删除 ${student.name}（${student.id}）的完整档案吗？\n\n该学生的登录账号、诉求、跟进记录和关联待办也会一并删除。`)) return;
    const response = await fetch(`/api/students?studentNo=${encodeURIComponent(student.id)}`, { method: "DELETE" });
    if (response.ok) setStudents((current) => current.filter((item) => item.id !== student.id));
  };

  return (
    <>
      <div className="student-summary-grid">
        <article><span className="metric-icon blue"><Users size={21} /></span><p><small>在管学生</small><strong>{students.length}</strong><em>{new Set(students.map((item) => item.className)).size}个行政班</em></p></article>
        <article><span className="metric-icon amber">!</span><p><small>需要跟进</small><strong>{students.filter((item) => item.status !== "正常").length}</strong><em>按真实档案状态汇总</em></p></article>
        <article><span className="metric-icon violet">入</span><p><small>批量导入</small><strong>{students.filter((item) => item.imported).length}</strong><em>已保存至学生档案</em></p></article>
        <article><span className="metric-icon green">✓</span><p><small>资料完整</small><strong>{students.length ? Math.round(students.filter((item) => ![item.phone, item.department, item.gender].includes("待补充")).length / students.length * 100) : 0}%</strong><em>缺项会明确显示</em></p></article>
      </div>

      <section className="panel table-panel">
        <div className="table-toolbar">
          <form className="table-search" onSubmit={(event) => {
            event.preventDefault();
            setQuery(String(new FormData(event.currentTarget).get("query") ?? ""));
          }}>
            <Search size={16} />
            <input name="query" defaultValue={query} placeholder="搜索姓名、学号、班级、学院或标签" />
            <button className="search-submit" type="submit">搜索</button>
          </form>
          <div className="toolbar-actions">
            <label className="select-wrap"><Filter size={15} /><select value={status} onChange={(e) => setStatus(e.target.value)}><option>全部状态</option><option>重点跟进</option><option>就业帮扶</option><option>回访中</option><option>升学跟进</option><option>正常</option></select></label>
            <button className="secondary-button" data-action="export-students"><Download size={15} />导出名册</button>
            <Link className="primary-button" href="/imports?type=students"><Plus size={15} />批量添加学生</Link>
          </div>
        </div>
        <div className="data-table-wrap">
          <table className="data-table">
            <thead><tr><th>学生</th><th>班级</th><th>学院</th><th>联系方式</th><th>状态</th><th>近期标签</th><th /></tr></thead>
            <tbody>
              {filtered.map((s) => (
                <tr key={s.id}>
                  <td><div className="person-cell"><span>{s.name.slice(0, 1)}</span><p><b>{s.name}</b><small>{s.id} · {s.gender}</small></p></div></td>
                  <td><b>{s.grade}级</b><small>{s.className}</small></td>
                  <td><b>{s.department}</b><small>东海校区</small></td>
                  <td className="muted-cell">{s.phone}</td>
                  <td><span className={`status-badge ${s.status === "正常" ? "normal" : "attention"}`}>{s.status}</span></td>
                  <td><div className="tag-list">{s.tags.map((t) => <span key={t}>{t}</span>)}</div></td>
                  <td><div className="student-row-actions"><Link className="table-link" href={`/students/${s.id}`}>查看 <ArrowRight size={14} /></Link><button onClick={() => removeStudent(s)} aria-label={`删除${s.name}档案`}><Trash2 size={14}/></button></div></td>
                </tr>
              ))}
            </tbody>
          </table>
          {!loading && filtered.length === 0 && <div className="empty-state"><Search size={25} /><b>没有找到匹配学生</b><p>换一个姓名、班级或状态试试。</p></div>}
        </div>
        <div className="table-footer"><span>{loading ? "正在读取学生档案…" : `共 ${filtered.length} 条 · 均来自教师创建或已确认导入的档案`}</span><div><button disabled>上一页</button><button className="current" aria-current="page" disabled>1</button><button disabled>下一页</button></div></div>
      </section>
    </>
  );
}
