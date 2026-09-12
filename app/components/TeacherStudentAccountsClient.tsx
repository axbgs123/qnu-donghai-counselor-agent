"use client";

import { KeyRound, LoaderCircle, Pencil, Plus, Search, Trash2, UserRoundPlus, UsersRound, WandSparkles, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type StudentAccount = { id: string; username: string; displayName: string; status: "active" | "disabled"; studentNo: string; className: string };
type TeacherClass = { id: string; name: string; grade: string; department: string; studentCount: number; accountCount: number };
type Form = { studentNo: string; name: string; className: string; password: string; status: "active" | "disabled" };
const blank = (): Form => ({ studentNo: "", name: "", className: "", password: "", status: "active" });
const requestTimeoutMs = 30_000;

async function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), requestTimeoutMs);
  try { return await fetch(input, { ...init, signal: controller.signal, cache: "no-store" }); }
  finally { window.clearTimeout(timer); }
}

export function TeacherStudentAccountsClient({ embedded = false }: { embedded?: boolean }) {
  const [students, setStudents] = useState<StudentAccount[]>([]);
  const [classes, setClasses] = useState<TeacherClass[]>([]);
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<"list" | "create" | "edit">("list");
  const [selected, setSelected] = useState<StudentAccount | null>(null);
  const [form, setForm] = useState<Form>(blank());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [uncreatedCount, setUncreatedCount] = useState(0);
  const [notice, setNotice] = useState("");

  const load = async () => {
    const response = await fetchWithTimeout("/api/teacher/students");
    const data = await response.json() as { students?: StudentAccount[]; classes?: TeacherClass[]; uncreatedCount?: number; error?: string };
    if (!response.ok) throw new Error(data.error || "读取学生账号失败");
    setStudents(data.students ?? []);
    setClasses(data.classes ?? []);
    setUncreatedCount(data.uncreatedCount ?? 0);
    setLoading(false);
  };

  useEffect(() => {
    const timer = window.setTimeout(() => void load().catch((error) => {
      setNotice(error instanceof Error ? error.message : "读取学生账号失败");
      setLoading(false);
    }), 0);
    return () => window.clearTimeout(timer);
  }, []);

  const shown = useMemo(() => students.filter((item) => `${item.studentNo}${item.displayName}${item.className}`.toLowerCase().includes(query.trim().toLowerCase())), [students, query]);

  const startEdit = (student: StudentAccount) => {
    setSelected(student);
    setForm({ studentNo: student.studentNo, name: student.displayName, className: student.className, password: "", status: student.status });
    setMode("edit");
    setNotice("");
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setNotice("");
    try {
      const response = await fetchWithTimeout("/api/teacher/students", {
        method: mode === "create" ? "POST" : "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: selected?.id, studentNo: form.studentNo, name: form.name, className: form.className, password: form.password || undefined, status: form.status }),
      });
      const data = await response.json() as { student?: StudentAccount; error?: string };
      if (!response.ok || !data.student) throw new Error(data.error || "保存失败");
      setStudents((current) => mode === "create"
        ? [...current, data.student!].sort((a, b) => `${a.className}${a.studentNo}`.localeCompare(`${b.className}${b.studentNo}`, "zh-CN"))
        : current.map((item) => item.id === data.student!.id ? data.student! : item));
      if (mode === "create") setUncreatedCount((count) => Math.max(0, count - 1));
      setMode("list");
      setNotice(mode === "edit" && form.password ? "学生密码已修改，其他账号信息也已保存" : "学生登录账号已保存");
      void load().catch(() => undefined);
    } catch (error) {
      setNotice(error instanceof Error && error.name === "AbortError" ? "保存超时，请稍后重试" : error instanceof Error ? error.message : "保存失败");
    } finally { setSaving(false); }
  };

  const createAll = async () => {
    if (!uncreatedCount || bulkSaving || !window.confirm(`将为学生档案中尚未建号的 ${uncreatedCount} 名学生创建账号。\n\n登录账号：学号\n初始密码：姓名全拼（小写、无空格）\n\n是否继续？`)) return;
    setBulkSaving(true);
    setNotice("");
    try {
      const response = await fetchWithTimeout("/api/teacher/students", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "create_all" }),
      });
      const data = await response.json() as { created?: number; skipped?: number; students?: StudentAccount[]; error?: string };
      if (!response.ok) throw new Error(data.error || "批量创建失败");
      if (data.students) setStudents(data.students);
      setUncreatedCount(0);
      setNotice(`已创建 ${data.created ?? 0} 个学生账号${data.skipped ? `，${data.skipped} 个未创建` : ""}；初始密码为各自姓名全拼（小写、无空格）`);
      void load().catch(() => undefined);
    } catch (error) {
      setNotice(error instanceof Error && error.name === "AbortError" ? "批量创建用时较长，请刷新页面查看结果" : error instanceof Error ? error.message : "批量创建失败");
    } finally { setBulkSaving(false); }
  };

  const remove = async (student: StudentAccount) => {
    if (!window.confirm(`删除${student.displayName}的登录账号？学生档案和历史记录会保留。`)) return;
    try {
      const response = await fetchWithTimeout(`/api/teacher/students?id=${encodeURIComponent(student.id)}`, { method: "DELETE" });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "删除失败");
      setStudents((current) => current.filter((item) => item.id !== student.id));
      setUncreatedCount((count) => count + 1);
      setNotice("学生登录账号已删除，学生档案仍保留");
      void load().catch(() => undefined);
    } catch (error) { setNotice(error instanceof Error ? error.message : "删除失败"); }
  };

  return <>
    <header className={`admin-page-head teacher-account-head ${embedded ? "embedded-section-head" : ""}`}>
      <div><small>STUDENT ACCESS</small>{embedded ? <h2>学生账号</h2> : <h1>学生登录账号</h1>}<p>为自己负责的学生创建登录账号、重置密码或暂停登录；账号默认使用学号。</p></div>
      <div className="teacher-account-actions">
        <button className="secondary" disabled={!uncreatedCount || bulkSaving} onClick={createAll}>{bulkSaving ? <LoaderCircle className="spin" size={17}/> : <WandSparkles size={17}/>}一键创建全部{uncreatedCount ? `（${uncreatedCount}）` : ""}</button>
        <button onClick={() => { setSelected(null); setForm(blank()); setMode("create"); setNotice(""); }}><Plus size={17}/>新增学生账号</button>
      </div>
    </header>
    <div className="admin-stats"><article><small>学生账号</small><strong>{students.length}</strong><span>当前教师名下</span></article><article><small>正常使用</small><strong>{students.filter((item) => item.status === "active").length}</strong><span>可以登录学生端</span></article><article><small>已停用</small><strong>{students.filter((item) => item.status === "disabled").length}</strong><span>保留档案但禁止登录</span></article></div>
    {notice && <p className="account-notice">{notice}</p>}
    <section className="account-table panel"><header><div><h2>学生账号列表</h2><p>删除登录账号不会删除学生档案、诉求或历史记录。</p></div><label className="account-search"><Search size={16}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索学号、姓名或班级" /></label></header>
      {loading ? <div className="account-loading"><LoaderCircle className="spin"/>正在读取学生账号…</div> : shown.length ? <div className="account-rows student-account-rows">{shown.map((student) => <article key={student.id}><span className="teacher-avatar student">{student.displayName.slice(0, 1)}</span><p><b>{student.displayName}</b><small>{student.studentNo} · {student.className}</small></p><div><span className={student.status}>{student.status === "active" ? "可登录" : "已停用"}</span><small>登录账号：{student.username}</small></div><button onClick={() => startEdit(student)}><Pencil size={15}/>资料与密码</button><button className="danger" onClick={() => remove(student)} aria-label={`删除${student.displayName}账号`}><Trash2 size={15}/></button></article>)}</div> : <div className="account-empty"><UsersRound size={31}/><b>{query ? "没有匹配的学生账号" : "还没有学生登录账号"}</b><p>{query ? "请更换关键词后再试。" : uncreatedCount ? `学生档案中还有 ${uncreatedCount} 人，可一键创建全部账号。` : "请先导入学生档案，再为学生创建登录账号。"}</p>{!query && <button onClick={() => { setForm(blank()); setMode("create"); }}><UserRoundPlus size={15}/>新增学生账号</button>}</div>}
    </section>
    {mode !== "list" && <div className="account-modal-backdrop"><section className="account-modal compact"><header><div><small>{mode === "create" ? "CREATE STUDENT" : "EDIT STUDENT"}</small><h2>{mode === "create" ? "新增学生登录账号" : `编辑${selected?.displayName}`}</h2></div><button onClick={() => setMode("list")} aria-label="关闭"><X size={19}/></button></header><form onSubmit={save}>
      <div className="account-form-grid"><label>学号<input disabled={mode === "edit"} value={form.studentNo} onChange={(event) => setForm({ ...form, studentNo: event.target.value })} placeholder="同时作为登录账号" /></label><label>姓名<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="学生姓名" /></label></div>
      <label>班级<select value={form.className} onChange={(event) => setForm({ ...form, className: event.target.value })}><option value="">请选择班级</option>{classes.map((item) => <option key={item.id} value={item.name}>{item.name}{item.grade ? ` · ${item.grade}` : ""}</option>)}</select><small className="field-help">没有所需班级？请先到<Link href="/students?view=classes">“班级管理”页签</Link>中创建。</small></label><label>{mode === "create" ? "初始密码" : "重置密码（不修改可留空）"}<input type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} placeholder="至少6位" /></label>
      {mode === "edit" && <label>登录状态<select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as Form["status"] })}><option value="active">正常使用</option><option value="disabled">暂停登录</option></select></label>}
      {notice && <p className="login-error">{notice}</p>}<footer><button type="button" onClick={() => setMode("list")}>取消</button><button className="primary" disabled={saving}>{saving ? <LoaderCircle className="spin" size={16}/> : <KeyRound size={16}/>}保存学生账号</button></footer>
    </form></section></div>}
  </>;
}
