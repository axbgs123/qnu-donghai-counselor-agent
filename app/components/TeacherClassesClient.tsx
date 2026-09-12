"use client";

import { BookOpenCheck, Check, LoaderCircle, Pencil, Plus, Search, Trash2, UserRoundCheck, UsersRound, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type TeacherClass = {
  id: string;
  name: string;
  grade: string;
  department: string;
  studentCount: number;
  accountCount: number;
};

type ClassStudent = {
  studentNo: string;
  name: string;
  className: string;
  grade: string;
  department: string;
  accountId: string | null;
  accountStatus: "active" | "disabled" | null;
};

type ClassForm = { name: string; grade: string; department: string };
const emptyForm = (): ClassForm => ({ name: "", grade: "", department: "" });

export function TeacherClassesClient({ embedded = false }: { embedded?: boolean }) {
  const [classes, setClasses] = useState<TeacherClass[]>([]);
  const [students, setStudents] = useState<ClassStudent[]>([]);
  const [activeId, setActiveId] = useState("");
  const [query, setQuery] = useState("");
  const [modal, setModal] = useState<"closed" | "create" | "edit">("closed");
  const [form, setForm] = useState<ClassForm>(emptyForm());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");

  const load = async (preferredId?: string) => {
    const response = await fetch("/api/teacher/classes", { cache: "no-store" });
    const data = await response.json() as { classes?: TeacherClass[]; students?: ClassStudent[]; error?: string };
    if (!response.ok) throw new Error(data.error || "读取班级失败");
    const nextClasses = data.classes ?? [];
    setClasses(nextClasses);
    setStudents(data.students ?? []);
    setActiveId((current) => {
      const candidate = preferredId || current;
      return nextClasses.some((item) => item.id === candidate) ? candidate : (nextClasses[0]?.id ?? "");
    });
    setLoading(false);
  };

  useEffect(() => {
    const timer = window.setTimeout(() => void load().catch((error) => {
      setNotice(error instanceof Error ? error.message : "读取班级失败");
      setLoading(false);
    }), 0);
    return () => window.clearTimeout(timer);
  }, []);

  const activeClass = classes.find((item) => item.id === activeId) ?? null;
  const roster = useMemo(() => students.filter((student) => student.className === activeClass?.name && `${student.name}${student.studentNo}`.toLowerCase().includes(query.trim().toLowerCase())), [activeClass?.name, query, students]);
  const withoutAccounts = students.filter((student) => !student.accountId).length;

  const openCreate = () => { setForm(emptyForm()); setModal("create"); setNotice(""); };
  const openEdit = () => {
    if (!activeClass) return;
    setForm({ name: activeClass.name, grade: activeClass.grade, department: activeClass.department });
    setModal("edit");
    setNotice("");
  };

  const saveClass = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setNotice("");
    try {
      const response = await fetch("/api/teacher/classes", {
        method: modal === "create" ? "POST" : "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(modal === "create" ? form : { action: "update", id: activeId, ...form }),
      });
      const data = await response.json() as { class?: TeacherClass; error?: string };
      if (!response.ok || !data.class) throw new Error(data.error || "保存班级失败");
      await load(data.class.id);
      setModal("closed");
      setNotice(modal === "create" ? "班级已创建，可以开始添加学生" : "班级信息已更新，学生档案和登录账号已同步");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "保存班级失败");
    } finally { setSaving(false); }
  };

  const removeClass = async () => {
    if (!activeClass || activeClass.studentCount || activeClass.accountCount) {
      setNotice("该班级仍有学生，不能删除；请先在学生账号中逐一调整班级");
      return;
    }
    if (!window.confirm(`删除空班级“${activeClass.name}”？`)) return;
    setSaving(true);
    try {
      const response = await fetch(`/api/teacher/classes?id=${encodeURIComponent(activeClass.id)}`, { method: "DELETE" });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "删除失败");
      await load();
      setNotice("空班级已删除");
    } catch (error) { setNotice(error instanceof Error ? error.message : "删除失败"); }
    finally { setSaving(false); }
  };

  return <>
    <header className={`admin-page-head class-page-head ${embedded ? "embedded-section-head" : ""}`}>
      <div><small>CLASS ROSTER</small>{embedded ? <h2>班级管理</h2> : <h1>班级管理</h1>}<p>创建行政班、维护班级资料并查看学生名册。</p></div>
      <button onClick={openCreate}><Plus size={17}/>新建班级</button>
    </header>
    <div className="admin-stats class-stats">
      <article><small>负责班级</small><strong>{classes.length}</strong><span>教师可独立维护</span></article>
      <article><small>学生档案</small><strong>{students.length}</strong><span>已归入当前教师</span></article>
      <article><small>尚未建号</small><strong>{withoutAccounts}</strong><span>可在“登录账号”中一键创建</span></article>
    </div>
    {notice && <p className="account-notice">{notice}</p>}

    {loading ? <div className="account-loading panel"><LoaderCircle className="spin"/>正在读取班级与学生名单…</div> : classes.length ? <section className="class-workspace panel">
      <aside className="class-tabs" aria-label="班级列表">
        <header><div><h2>我的班级</h2><p>选择班级查看名册</p></div><button onClick={openCreate} aria-label="新建班级"><Plus size={17}/></button></header>
        <div>{classes.map((item) => <button key={item.id} className={item.id === activeId ? "active" : ""} onClick={() => { setActiveId(item.id); setQuery(""); }}>
          <span>{item.name.slice(0, 1)}</span><p><b>{item.name}</b><small>{item.grade || "年级待补充"} · {item.studentCount} 人</small></p><em>{item.accountCount}/{item.studentCount}</em>
        </button>)}</div>
      </aside>
      <div className="class-roster">
        <header className="class-roster-head">
          <div><small>{activeClass?.department || "院系待补充"}</small><h2>{activeClass?.name}</h2><p>{activeClass?.grade || "年级待补充"} · {activeClass?.studentCount ?? 0} 名学生 · {activeClass?.accountCount ?? 0} 个登录账号</p></div>
          <div><button className="secondary" onClick={openEdit}><Pencil size={15}/>编辑班级</button><button className="danger" onClick={removeClass}><Trash2 size={15}/>删除空班</button></div>
        </header>
        <div className="class-roster-tools"><label className="account-search"><Search size={16}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索姓名或学号"/></label></div>
        {roster.length ? <div className="class-roster-table"><div className="class-roster-row heading"><span>学生</span><span>学号</span><span>年级 / 院系</span><span>登录账号</span></div>{roster.map((student) => <div className="class-roster-row" key={student.studentNo}><label><span className="class-student-avatar">{student.name.slice(0, 1)}</span><b>{student.name}</b></label><span>{student.studentNo}</span><span><b>{student.grade}</b><small>{student.department}</small></span><span className={student.accountStatus === "active" ? "account-ready" : student.accountStatus === "disabled" ? "account-disabled" : "account-missing"}>{student.accountStatus === "active" ? <><UserRoundCheck size={14}/>可登录</> : student.accountStatus === "disabled" ? "已停用" : "未创建"}</span></div>)}</div> : <div className="class-empty-roster"><BookOpenCheck size={30}/><b>{query ? "没有匹配的学生" : "这个班级还没有学生"}</b><p>{query ? "请更换关键词后再试。" : "可以在“学生账号”页签或资料导入中添加学生。"}</p></div>}
      </div>
    </section> : <section className="class-first-empty panel"><UsersRound size={38}/><h2>先创建第一个班级</h2><p>班级建立后，新增学生账号和导入学生名单时都可以自动归入对应班级。</p><button onClick={openCreate}><Plus size={16}/>新建班级</button></section>}

    {modal !== "closed" && <div className="account-modal-backdrop"><section className="account-modal compact class-modal"><header><div><small>{modal === "create" ? "CREATE CLASS" : "EDIT CLASS"}</small><h2>{modal === "create" ? "新建班级" : `编辑${activeClass?.name}`}</h2></div><button onClick={() => setModal("closed")} aria-label="关闭"><X size={19}/></button></header><form onSubmit={saveClass}>
      <label>班级名称<input autoFocus value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="例如：2026级化工1班" maxLength={50}/></label>
      <div className="account-form-grid"><label>年级<input value={form.grade} onChange={(event) => setForm({ ...form, grade: event.target.value })} placeholder="例如：2026级" maxLength={20}/></label><label>所属学院<input value={form.department} onChange={(event) => setForm({ ...form, department: event.target.value })} placeholder="例如：化工与材料学院" maxLength={80}/></label></div>
      {notice && <p className="login-error">{notice}</p>}<footer><button type="button" onClick={() => setModal("closed")}>取消</button><button className="primary" disabled={saving || !form.name.trim()}>{saving ? <LoaderCircle className="spin" size={16}/> : <Check size={16}/>}保存班级</button></footer>
    </form></section></div>}
  </>;
}
