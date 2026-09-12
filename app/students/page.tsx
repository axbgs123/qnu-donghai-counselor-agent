import type { Metadata } from "next";
import { PortalShell } from "../components/PortalShell";
import { StudentManagementHub, type StudentManagementView } from "../components/StudentManagementHub";

export const metadata: Metadata = { title: "学生与班级｜泉师智辅" };

export default async function StudentsPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const { view: requestedView } = await searchParams;
  const view: StudentManagementView = requestedView === "classes" || requestedView === "accounts" ? requestedView : "records";
  return (
    <PortalShell>
      <StudentManagementHub view={view} />
    </PortalShell>
  );
}
