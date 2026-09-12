import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = { title: "学生账号" };
export default function StudentAccountsPage() { redirect("/students?view=accounts"); }
