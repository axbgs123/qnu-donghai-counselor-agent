import type { Metadata } from "next";
import { PartyPopper } from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { PortalShell } from "../components/PortalShell";
import { WelcomeManagementClient } from "../components/WelcomeManagementClient";

export const metadata: Metadata = { title: "迎新管理" };

export default function WelcomePage() {
  return <PortalShell><PageHeader eyebrow="东海校区 · 新生工作" title="迎新管理" description="发布迎新事项、查看新生准备进度，并把共性问题交给辅导员数字人回答。" icon={PartyPopper}/><WelcomeManagementClient/></PortalShell>;
}
