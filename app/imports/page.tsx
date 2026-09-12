import type { Metadata } from "next";
import { DatabaseZap } from "lucide-react";
import { ImportCenterClient } from "../components/ImportCenterClient";
import { PageHeader } from "../components/PageHeader";
import { PortalShell } from "../components/PortalShell";
import { importDefinitions, type ImportRecordType } from "../lib/import-definitions";

export const metadata: Metadata = { title: "智能资料导入" };

export default async function ImportsPage({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  const params = await searchParams;
  const initialType = params.type && Object.prototype.hasOwnProperty.call(importDefinitions, params.type)
    ? params.type as ImportRecordType
    : undefined;
  const knowledgeOnly = params.type === "knowledge";
  return <PortalShell>
    <PageHeader eyebrow="表格 · 文档 · PDF · 聊天截图" title="智能资料导入" description="统一读取业务表格与非结构化资料，提取人物、学号、日期和待办，确认后供智能助手检索。" icon={DatabaseZap}/>
    <ImportCenterClient initialType={initialType} knowledgeOnly={knowledgeOnly}/>
  </PortalShell>;
}
