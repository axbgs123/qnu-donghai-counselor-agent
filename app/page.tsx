import type { Metadata } from "next";
import { DashboardClient } from "./components/DashboardClient";
import { PortalShell } from "./components/PortalShell";

export const metadata: Metadata = {
  title: "今日工作台",
  description: "东海校区辅导员今日待办、学生动态与智能协同工作台。",
};

export default function Home() {
  return (
    <PortalShell>
      <DashboardClient />
    </PortalShell>
  );
}
