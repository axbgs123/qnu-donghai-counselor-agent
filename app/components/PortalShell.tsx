"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Bell,
  Bot,
  ChevronDown,
  Command,
  DatabaseZap,
  Inbox,
  LayoutDashboard,
  Library,
  LogOut,
  Menu,
  PartyPopper,
  Search,
  Settings,
  Users,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ActionCenter } from "./ActionCenter";

const nav: Array<{ href: string; label: string; icon: typeof LayoutDashboard; permission?: string; seasonal?: "welcome" }> = [
  { href: "/", label: "今日工作台", icon: LayoutDashboard },
  { href: "/assistant", label: "智能助手", icon: Bot },
  { href: "/requests", label: "学生诉求中心", icon: Inbox, permission: "requests.manage" },
  { href: "/students", label: "学生与班级", icon: Users, permission: "students.manage" },
  { href: "/imports", label: "智能资料导入", icon: DatabaseZap, permission: "knowledge.manage" },
  { href: "/knowledge", label: "泉师知识库", icon: Library, permission: "knowledge.manage" },
  { href: "/reports", label: "统计与总结", icon: BarChart3, permission: "reports.view" },
  { href: "/welcome", label: "迎新管理", icon: PartyPopper, permission: "students.manage", seasonal: "welcome" },
];

type ShellAccount = { role: string; username: string; displayName: string; permissions: string[] };
type NotificationItem = { key: string; type: "request" | "task" | "document"; title: string; detail: string; href: string; createdAt: string; read: boolean };

export function PortalShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [newRequests, setNewRequests] = useState(0);
  const [account, setAccount] = useState<ShellAccount | null>(null);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/auth/me").then(async (response) => {
      if (!response.ok) { window.location.assign("/login"); return; }
      const data = await response.json() as { account: ShellAccount };
      if (data.account.role !== "teacher") { window.location.assign(data.account.role === "admin" ? "/admin" : "/student"); return; }
      setAccount(data.account);
    }).catch(() => window.location.assign("/login"));
    const refreshRequestCount = () => fetch("/api/requests?summary=1", { cache: "no-store" }).then(async (response) => {
      if (!response.ok) return;
      const data = await response.json() as { metrics?: { new?: number }; requests?: unknown[] };
      setNewRequests(data.metrics?.new ?? data.requests?.length ?? 0);
    }).catch(() => undefined);
    const refreshNotifications = () => fetch("/api/notifications", { cache: "no-store" }).then(async (response) => {
      if (!response.ok) return;
      const data = await response.json() as { items?: NotificationItem[] };
      setNotifications(data.items ?? []);
    }).catch(() => undefined);
    void refreshRequestCount();
    void refreshNotifications();
    const requestTimer = window.setInterval(() => { if (!document.hidden) void refreshRequestCount(); }, 20_000);
    const refreshWhenVisible = () => { if (!document.hidden) { void refreshRequestCount(); void refreshNotifications(); } };
    const notificationTimer = window.setInterval(() => { if (!document.hidden) void refreshNotifications(); }, 30_000);
    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    window.addEventListener("student-requests-updated", refreshWhenVisible);
    const focusSearch = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", focusSearch);
    return () => {
      window.clearInterval(requestTimer);
      window.clearInterval(notificationTimer);
      window.removeEventListener("keydown", focusSearch);
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
      window.removeEventListener("student-requests-updated", refreshWhenVisible);
    };
  }, []);

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.assign("/login");
  };

  const markNotification = async (keys: string[], all = false) => {
    const response = await fetch("/api/notifications", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ keys, all }) });
    if (!response.ok) return;
    const data = await response.json() as { items?: NotificationItem[] };
    setNotifications(data.items ?? []);
  };

  const month = new Date().getMonth() + 1;
  const inWelcomeSeason = month >= 8 && month <= 10;
  const visibleNav = account ? nav.filter((item) => (!item.permission || account.permissions.includes(item.permission)) && (!item.seasonal || inWelcomeSeason)) : nav;

  return (
    <ActionCenter><div className="app-shell">
      <aside className={`sidebar ${mobileOpen ? "sidebar-open" : ""}`}>
        <div className="brand-block">
          <div className="brand-mark" aria-hidden="true"><span>泉</span></div>
          <div>
            <strong>泉师智辅</strong>
            <small>Donghai Campus</small>
          </div>
          <button className="mobile-close" onClick={() => setMobileOpen(false)} aria-label="关闭菜单"><X size={19} /></button>
        </div>

        <div className="campus-card">
          <span className="campus-dot" />
          <div><small>当前服务范围</small><b>东海校区</b></div>
          <ChevronDown size={15} aria-hidden="true" />
        </div>

        <nav className="main-nav" aria-label="主导航">
          <p className="nav-label">工作空间</p>
          {visibleNav.map((item) => {
            const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link key={item.href} href={item.href} className={active ? "nav-item active" : "nav-item"} onClick={() => setMobileOpen(false)}>
                <Icon size={18} strokeWidth={1.8} /><span>{item.label}</span>
                {item.href === "/requests" && newRequests > 0 && <em>{newRequests > 99 ? "99+" : newRequests}</em>}
              </Link>
            );
          })}
        </nav>

        <div className="sidebar-bottom">
          {(!account || account.permissions.includes("settings.ai")) && <Link href="/settings" className={pathname.startsWith("/settings") ? "nav-item active" : "nav-item"}>
            <Settings size={18} /><span>平台设置</span>
          </Link>}
          <button className="support-chip" data-action="help"><span>?</span><p><b>需要帮助？</b><small>查看使用指南</small></p></button>
        </div>
      </aside>

      {mobileOpen && <button className="sidebar-backdrop" aria-label="关闭菜单" onClick={() => setMobileOpen(false)} />}

      <div className="app-main">
        <header className="topbar">
          <button className="mobile-menu" onClick={() => setMobileOpen(true)} aria-label="打开菜单"><Menu size={21} /></button>
          <label className="global-search">
            <Search size={17} />
            <input ref={searchRef} value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && search.trim()) router.push(`/assistant?prompt=${encodeURIComponent(search.trim())}`); }} placeholder="搜索学生、事项、政策，或直接问智能助手…" aria-label="全局搜索" />
            <kbd><Command size={12} /> K</kbd>
          </label>
          <div className="top-actions">
            <div className="notification-center">
              <button className="icon-button notification-button" onClick={() => setNotificationOpen((value) => !value)} aria-label="通知" aria-expanded={notificationOpen}><Bell size={19} />{notifications.some((item) => !item.read) && <span>{Math.min(99, notifications.filter((item) => !item.read).length)}</span>}</button>
              {notificationOpen && <aside className="notification-popover"><header><div><b>通知中心</b><small>{notifications.filter((item) => !item.read).length} 条未读</small></div>{notifications.some((item) => !item.read) && <button onClick={() => markNotification([], true)}>全部已读</button>}</header>
                <div>{notifications.length ? notifications.map((item) => <Link className={item.read ? "read" : ""} href={item.href} key={item.key} onClick={() => { void markNotification([item.key]); setNotificationOpen(false); }}><i>{item.type === "request" ? "诉" : item.type === "task" ? "办" : "资"}</i><span><b>{item.title}</b><small>{item.detail}</small><time>{new Date(item.createdAt).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</time></span></Link>) : <p>目前没有需要处理的通知</p>}</div>
              </aside>}
            </div>
            <div className="divider" />
            <button className="profile-button" onClick={logout} title="退出登录">
              <span className="avatar">{account?.displayName.slice(0, 1) || "师"}</span>
              <span className="profile-copy"><b>{account?.displayName || "教师账号"}</b><small>{account ? `${account.username} · 教师账号` : "正在读取账号…"}</small></span>
              <LogOut size={15} />
            </button>
          </div>
        </header>
        <main className="page-content">{children}</main>
      </div>
    </div></ActionCenter>
  );
}
