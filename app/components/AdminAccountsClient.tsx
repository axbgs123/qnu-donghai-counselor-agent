"use client";

import Link from "next/link";
import { Check, ChevronRight, FileText, Inbox, KeyRound, LoaderCircle, LogOut, Pencil, Plus, ShieldCheck, Trash2, UserCog, UsersRound, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

const permissions = [
  ["students.manage", "学生档案", "查看、导入和维护学生档案"],
  ["requests.manage", "学生诉求", "处理学生提交的咨询与留言"],
  ["workflows.manage", "事项流程", "创建和办理学生工作事项"],
  ["knowledge.manage", "知识与资料", "导入学校文件并维护知识库"],
  ["reports.view", "统计与总结", "查看统计并生成工作报告"],
  ["settings.ai", "模型设置", "配置智能助手使用的模型"],
] as const;
type Teacher = { id: string; username: string; displayName: string; status: "active" | "disabled"; permissions: string[]; studentCount: number };
type Form = { username: string; displayName: string; password: string; status: "active" | "disabled"; permissions: string[] };
const emptyForm = (): Form => ({ username: "", displayName: "", password: "", status: "active", permissions: permissions.map((item) => item[0]) });
const requestTimeoutMs = 15000;

async function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), requestTimeoutMs);
  try { return await fetch(input, { ...init, signal: controller.signal }); }
  finally { window.clearTimeout(timer); }
}

export function AdminAccountsClient() {
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [selected, setSelected] = useState<Teacher | null>(null);
  const [form, setForm] = useState<Form>(emptyForm());
  const [mode, setMode] = useState<"list" | "create" | "edit">("list");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const activeCount = useMemo(() => teachers.filter((item) => item.status === "active").length, [teachers]);

  const load = async () => {
    const response = await fetchWithTimeout("/api/admin/teachers", { cache: "no-store" });
    if (response.status === 401 || response.status === 403) { window.location.assign("/login"); return; }
    const data = await response.json() as { teachers?: Teacher[]; error?: string };
    if (!response.ok) throw new Error(data.error || "读取教师账号失败");
    setTeachers(data.teachers ?? []); setLoading(false);
  };
  useEffect(() => {
    fetchWithTimeout("/api/admin/teachers", { cache: "no-store" }).then(async (response) => {
      if (response.status === 401 || response.status === 403) { window.location.assign("/login"); return; }
      const data = await response.json() as { teachers?: Teacher[]; error?: string };
      if (!response.ok) throw new Error(data.error || "读取教师账号失败");
      setTeachers(data.teachers ?? []); setLoading(false);
    }).catch((error) => { setNotice(error instanceof Error ? error.message : "读取教师账号失败"); setLoading(false); });
  }, []);

  const startCreate = () => { setSelected(null); setForm(emptyForm()); setMode("create"); setNotice(""); };
  const startEdit = (teacher: Teacher) => { setSelected(teacher); setForm({ username: teacher.username, displayName: teacher.displayName, password: "", status: teacher.status, permissions: teacher.permissions }); setMode("edit"); setNotice(""); };
  const togglePermission = (id: string) => setForm((value) => ({ ...value, permissions: value.permissions.includes(id) ? value.permissions.filter((item) => item !== id) : [...value.permissions, id] }));

  const save = async (event: React.FormEvent) => {
    event.preventDefault(); setSaving(true); setNotice("");
    try {
      const response = await fetchWithTimeout("/api/admin/teachers", { method: mode === "create" ? "POST" : "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...form, id: selected?.id, password: form.password || undefined }) });
      const data = await response.json() as { error?: string; teacher?: Teacher };
      if (!response.ok) { setNotice(data.error || "保存失败"); return; }
      if (data.teacher) {
        setTeachers((items) => mode === "create"
          ? [data.teacher!, ...items.filter((item) => item.id !== data.teacher!.id)]
          : items.map((item) => item.id === data.teacher!.id ? data.teacher! : item));
      }
      setMode("list"); setNotice("教师账号已保存，可以使用登录账号和初始密码登录");
      // 保存结果已由接口直接返回，不阻塞界面；随后静默核对数据库中的最新列表。
      void load().catch(() => undefined);
    } catch (error) {
      setNotice(error instanceof DOMException && error.name === "AbortError" ? "服务器响应超时，请刷新列表确认；不要重复创建同一账号" : error instanceof Error ? error.message : "保存失败，请稍后重试");
    } finally { setSaving(false); }
  };

  const remove = async (teacher: Teacher) => {
    if (!window.confirm(`确定删除教师账号“${teacher.displayName}”吗？`)) return;
    const response = await fetch(`/api/admin/teachers?id=${encodeURIComponent(teacher.id)}`, { method: "DELETE" });
    const data = await response.json() as { error?: string };
    if (!response.ok) { setNotice(data.error || "删除失败"); return; }
    await load(); setNotice("教师账号已删除");
  };
  const logout = async () => { await fetch("/api/auth/logout", { method: "POST" }); window.location.assign("/login"); };

  return <main className="admin-console">
    <header className="admin-topbar"><div className="login-brand"><span>泉</span><p><b>泉师智辅 · 管理端</b><small>东海校区账号与权限中心</small></p></div><div><span><ShieldCheck size={15}/>管理员 axbgs</span><button onClick={logout}><LogOut size={16}/>退出登录</button></div></header>
    <section className="admin-body">
      <aside className="admin-rail"><div><span><UserCog size={20}/></span><p><b>平台管理</b><small>账号、资料与学生诉求</small></p></div><nav><Link className="active" href="/admin"><UsersRound size={17}/>教师账号管理<ChevronRight size={15}/></Link><Link href="/admin/knowledge"><FileText size={17}/>知识资料管理<ChevronRight size={15}/></Link><Link href="/admin/requests"><Inbox size={17}/>学生诉求管理<ChevronRight size={15}/></Link></nav><footer><b>权限说明</b><p>教师只能管理自己名下的内容；管理员可以查看、修改和删除全平台内容。</p></footer></aside>
      <div className="admin-workspace">
        <header className="admin-page-head"><div><small>ADMINISTRATOR WORKSPACE</small><h1>教师账号与权限</h1><p>创建教师登录账号，决定教师可以使用哪些学生工作功能。</p></div><button onClick={startCreate}><Plus size={17}/>新增教师</button></header>
        <div className="admin-stats"><article><small>教师账号</small><strong>{teachers.length}</strong><span>全部已创建账号</span></article><article><small>正常使用</small><strong>{activeCount}</strong><span>可正常登录</span></article><article><small>学生账号</small><strong>{teachers.reduce((sum, item) => sum + item.studentCount, 0)}</strong><span>由教师创建管理</span></article></div>
        {notice && <p className="account-notice">{notice}</p>}
        <section className="account-table panel"><header><div><h2>教师列表</h2><p>账号停用后，该教师会立即退出且无法再次登录。</p></div></header>
          {loading ? <div className="account-loading"><LoaderCircle className="spin"/>正在读取教师账号…</div> : teachers.length ? <div className="account-rows">{teachers.map((teacher) => <article key={teacher.id}><span className="teacher-avatar">{teacher.displayName.slice(0, 1)}</span><p><b>{teacher.displayName}</b><small>登录账号：{teacher.username}</small></p><div><span className={teacher.status}>{teacher.status === "active" ? "正常" : "已停用"}</span><small>{teacher.permissions.length} 项权限 · {teacher.studentCount} 名学生账号</small></div><button onClick={() => startEdit(teacher)}><Pencil size={15}/>编辑</button><button className="danger" onClick={() => remove(teacher)}><Trash2 size={15}/></button></article>)}</div> : <div className="account-empty"><UserCog size={31}/><b>还没有教师账号</b><p>点击“新增教师”，设置登录账号和可使用的功能。</p><button onClick={startCreate}><Plus size={15}/>新增第一位教师</button></div>}
        </section>
      </div>
    </section>
    {mode !== "list" && <div className="account-modal-backdrop"><section className="account-modal"><header><div><small>{mode === "create" ? "CREATE TEACHER" : "EDIT TEACHER"}</small><h2>{mode === "create" ? "新增教师账号" : `编辑${selected?.displayName}`}</h2></div><button onClick={() => setMode("list")} aria-label="关闭"><X size={19}/></button></header><form onSubmit={save}>
      <div className="account-form-grid"><label>教师姓名<input value={form.displayName} onChange={(event) => setForm({ ...form, displayName: event.target.value })} placeholder="请输入教师姓名" /></label><label>登录账号<input value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })} placeholder="请输入登录账号" /></label></div>
      <label>{mode === "create" ? "初始密码" : "重置密码（不修改可留空）"}<input type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} placeholder="至少6位" /></label>
      {mode === "edit" && <label>账号状态<select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as Form["status"] })}><option value="active">正常使用</option><option value="disabled">停用账号</option></select></label>}
      <fieldset><legend>功能权限</legend><p>勾选后教师才能进入和使用相应功能。</p><div>{permissions.map(([id, label, description]) => <button type="button" className={form.permissions.includes(id) ? "selected" : ""} onClick={() => togglePermission(id)} key={id}><i>{form.permissions.includes(id) && <Check size={13}/>}</i><span><b>{label}</b><small>{description}</small></span></button>)}</div></fieldset>
      {notice && <p className="login-error">{notice}</p>}<footer><button type="button" onClick={() => setMode("list")}>取消</button><button className="primary" disabled={saving}>{saving ? <LoaderCircle className="spin" size={16}/> : <KeyRound size={16}/>}保存教师账号</button></footer>
    </form></section></div>}
  </main>;
}
