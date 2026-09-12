import type { Metadata } from "next";
import { Settings } from "lucide-react";
import { ModelSettingsClient } from "../components/ModelSettingsClient";
import { PageHeader } from "../components/PageHeader";
import { PortalShell } from "../components/PortalShell";

export const metadata: Metadata = { title: "平台设置" };

export default function SettingsPage() {
  return <PortalShell>
    <PageHeader
      eyebrow="个人与平台配置"
      title="平台设置"
      description="面向辅导员的简易模型连接页。填写 Key、选择模型，保存后全站立即使用。"
      icon={Settings}
    />
    <ModelSettingsClient />
  </PortalShell>;
}
