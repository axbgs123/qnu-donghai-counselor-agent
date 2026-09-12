import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = { title: "班级管理｜泉师智辅" };

export default function ClassesPage() {
  redirect("/students?view=classes");
}
