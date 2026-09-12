import type { Metadata } from "next";
import { BarChart3, Download } from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { PortalShell } from "../components/PortalShell";
import { ReportsClient } from "../components/ReportsClient";

export const metadata: Metadata = { title: "统计与总结" };

export default function ReportsPage() {
  return <PortalShell><PageHeader eyebrow="辅导员工作分析" title="统计与总结" description="按当前数据库中的学生、诉求、待办和事项生成统计，不使用预设数字。" action={<button className="primary-button" data-action="generate-report"><Download size={16}/>生成月度报告</button>} icon={BarChart3}/><ReportsClient/></PortalShell>;
}
