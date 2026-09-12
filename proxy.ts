import { NextResponse, type NextRequest } from "next/server";
import { getAuthAccountFromRequest, landingForRole } from "./app/lib/auth-storage";

const PUBLIC_PATHS = ["/login", "/api/auth/login", "/api/auth/logout", "/api/auth/me"];

function isPublic(pathname: string) {
  return PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

function matchesPath(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

function requiredTeacherPermission(pathname: string) {
  const rules: Array<[string[], string]> = [
    [["/students", "/classes", "/services", "/welcome", "/accounts/students", "/api/students", "/api/student-records", "/api/welcome", "/api/teacher/students", "/api/teacher/classes"], "students.manage"],
    [["/requests", "/api/requests"], "requests.manage"],
    [["/workflows", "/api/workflows"], "workflows.manage"],
    [["/knowledge", "/imports", "/api/imports", "/api/materials"], "knowledge.manage"],
    [["/reports", "/api/reports"], "reports.view"],
    [["/settings", "/api/settings"], "settings.ai"],
  ];
  return rules.find(([prefixes]) => prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)))?.[1] ?? null;
}

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const account = await getAuthAccountFromRequest(request);

  if (pathname === "/login") {
    if (account) return NextResponse.redirect(new URL(landingForRole(account.role), request.url));
    return NextResponse.next();
  }
  if (isPublic(pathname)) return NextResponse.next();
  if (!account) {
    if (pathname.startsWith("/api/")) return NextResponse.json({ error: "请先登录" }, { status: 401 });
    const login = new URL("/login", request.url);
    login.searchParams.set("returnTo", `${pathname}${search}`);
    return NextResponse.redirect(login);
  }

  const isApi = pathname.startsWith("/api/");
  const adminSharedKnowledgeApi = account.role === "admin"
    && (matchesPath(pathname, "/api/materials") || matchesPath(pathname, "/api/imports"));
  const allowed = adminSharedKnowledgeApi
    ? true
    : matchesPath(pathname, "/admin") || pathname.startsWith("/api/admin/")
    ? account.role === "admin"
    : matchesPath(pathname, "/student") || pathname.startsWith("/api/student/")
      ? account.role === "student"
      : matchesPath(pathname, "/accounts/students") || pathname.startsWith("/api/teacher/")
        ? account.role === "teacher"
        : account.role === "teacher";

  if (!allowed) {
    if (isApi) return NextResponse.json({ error: "当前账号没有此功能权限" }, { status: 403 });
    return NextResponse.redirect(new URL(landingForRole(account.role), request.url));
  }
  if (account.role === "teacher") {
    const permission = requiredTeacherPermission(pathname);
    if (permission && !account.permissions.includes(permission)) {
      if (isApi) return NextResponse.json({ error: "管理员尚未为当前账号开通此功能" }, { status: 403 });
      return NextResponse.redirect(new URL("/", request.url));
    }
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|og.png|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico|css|js)$).*)"],
};
