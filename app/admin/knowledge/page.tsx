import type { Metadata } from "next";
import { AdminContentClient } from "../../components/AdminContentClient";

export const metadata: Metadata = { title: "知识资料管理｜管理员" };
export default function AdminKnowledgePage() { return <AdminContentClient kind="knowledge" />; }
