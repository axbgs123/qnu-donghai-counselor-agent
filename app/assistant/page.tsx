import type { Metadata } from "next";
import { AssistantClient } from "../components/AssistantClient";
import { PageHeader } from "../components/PageHeader";
import { PortalShell } from "../components/PortalShell";

export const metadata: Metadata = { title: "智能助手" };

export default async function AssistantPage({ searchParams }: { searchParams: Promise<{ prompt?: string }> }) {
  const { prompt = "" } = await searchParams;
  return <PortalShell><PageHeader eyebrow="自然语言工作入口" title="智能助手" description="查政策、生成材料、整理记录和发起流程；重要操作始终由老师确认。" /><AssistantClient initialPrompt={prompt} /></PortalShell>;
}
