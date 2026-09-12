import type { Metadata } from "next";
import { Inbox } from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { PortalShell } from "../components/PortalShell";
import { RequestInboxClient } from "../components/RequestInboxClient";

export const metadata: Metadata = { title: "学生诉求中心" };

export default function RequestsPage() {
  return <PortalShell><PageHeader eyebrow="集中受理 · 减少微信打扰" title="学生诉求中心" description="查看本人负责学生通过辅导员数字人提交的咨询与诉求，集中处理并反馈。" icon={Inbox}/><RequestInboxClient/></PortalShell>;
}
