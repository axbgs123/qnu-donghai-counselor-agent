import type { Metadata } from "next";
import { AdminContentClient } from "../../components/AdminContentClient";

export const metadata: Metadata = { title: "学生诉求管理｜管理员" };
export default function AdminRequestsPage() { return <AdminContentClient kind="requests" />; }
