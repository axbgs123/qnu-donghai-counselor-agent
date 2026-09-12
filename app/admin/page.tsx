import type { Metadata } from "next";
import { AdminAccountsClient } from "../components/AdminAccountsClient";

export const metadata: Metadata = { title: "管理员工作台" };

export default function AdminPage() { return <AdminAccountsClient />; }

