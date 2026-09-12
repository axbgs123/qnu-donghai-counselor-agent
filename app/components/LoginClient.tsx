"use client";

import { Eye, EyeOff, KeyRound, LoaderCircle, LockKeyhole, ShieldCheck, UserRound } from "lucide-react";
import { useState } from "react";

export function LoginClient() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const login = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!username.trim() || !password) { setError("请输入账号和密码"); return; }
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username, password }) });
      const data = await response.json() as { redirectTo?: string; error?: string };
      if (!response.ok || !data.redirectTo) throw new Error(data.error || "登录失败");
      window.location.assign(data.redirectTo);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "登录失败"); setLoading(false); }
  };

  return <main className="unified-login">
    <section className="login-story" aria-label="平台介绍">
      <div className="login-brand"><span>泉</span><p><b>泉师智辅</b><small>QUANZHOU NORMAL UNIVERSITY</small></p></div>
      <div className="login-statement">
        <small>东海校区 · 学生工作智能平台</small>
        <h1>一个入口，<br/>回到你的工作位置。</h1>
        <p>系统会根据账号自动进入管理员、教师或学生工作空间，无需手动选择身份。</p>
      </div>
      <ol className="login-role-track">
        <li><span>管</span><p><b>管理员</b><small>维护教师账号与功能权限</small></p></li>
        <li><span>师</span><p><b>教师</b><small>管理学生账号与学生工作</small></p></li>
        <li><span>生</span><p><b>学生</b><small>咨询学校事项并提交诉求</small></p></li>
      </ol>
      <footer><ShieldCheck size={15}/>账号、权限和使用数据均保存在平台中</footer>
    </section>

    <section className="login-form-panel">
      <form onSubmit={login}>
        <header><span><KeyRound size={21}/></span><div><small>统一身份入口</small><h2>登录泉师智辅</h2><p>输入管理员、教师或学生账号</p></div></header>
        <label><span>账号</span><div><UserRound size={18}/><input autoFocus autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} placeholder="请输入登录账号" /></div></label>
        <label><span>密码</span><div><LockKeyhole size={18}/><input type={showPassword ? "text" : "password"} autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="请输入登录密码" /><button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "隐藏密码" : "显示密码"}>{showPassword ? <EyeOff size={17}/> : <Eye size={17}/>}</button></div></label>
        {error && <p className="login-error">{error}</p>}
        <button className="login-submit" disabled={loading}>{loading ? <LoaderCircle className="spin" size={18}/> : <LockKeyhole size={18}/>}登录并进入</button>
        <p className="login-help">忘记密码请联系管理员；学生账号由负责教师创建。</p>
      </form>
    </section>
  </main>;
}

