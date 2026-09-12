import type { Metadata } from "next";
import { LoginClient } from "../components/LoginClient";

export const metadata: Metadata = { title: "登录", description: "泉师智辅统一登录入口" };

export default function LoginPage() {
  return <LoginClient />;
}

