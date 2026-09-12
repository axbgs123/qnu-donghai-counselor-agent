import type { Metadata } from "next";
import { StudentAgentClient } from "../components/StudentAgentClient";

export const metadata: Metadata = { title: "辅导员数字人｜学生服务" };

export default function StudentPage() {
  return <StudentAgentClient />;
}
