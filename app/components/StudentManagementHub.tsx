"use client";

import Link from "next/link";
import { KeyRound, School, UserRoundPlus, Users } from "lucide-react";
import { StudentsClient } from "./StudentsClient";
import { TeacherClassesClient } from "./TeacherClassesClient";
import { TeacherStudentAccountsClient } from "./TeacherStudentAccountsClient";

export type StudentManagementView = "records" | "classes" | "accounts";

const views: Array<{
  id: StudentManagementView;
  label: string;
  description: string;
  icon: typeof Users;
}> = [
  { id: "records", label: "学生档案", description: "资料、状态与跟进记录", icon: Users },
  { id: "classes", label: "班级管理", description: "行政班与学生名册", icon: School },
  { id: "accounts", label: "学生账号", description: "创建账号与修改密码", icon: KeyRound },
];

export function StudentManagementHub({ view }: { view: StudentManagementView }) {
  return (
    <>
      <header className="student-hub-header">
        <div>
          <small>STUDENT MANAGEMENT</small>
          <h1>学生与班级</h1>
          <p>在一个页面维护学生资料、班级归属和学生端登录账号。</p>
        </div>
        <Link className="primary-button" href="/imports?type=students"><UserRoundPlus size={16} />批量添加学生</Link>
      </header>

      <nav className="student-hub-nav" aria-label="学生与班级功能">
        {views.map((item) => {
          const Icon = item.icon;
          return <Link key={item.id} href={`/students?view=${item.id}`} className={view === item.id ? "active" : ""} aria-current={view === item.id ? "page" : undefined}>
            <span><Icon size={19} /></span>
            <p><b>{item.label}</b><small>{item.description}</small></p>
          </Link>;
        })}
      </nav>

      <section className="student-hub-content">
        {view === "records" && <StudentsClient />}
        {view === "classes" && <TeacherClassesClient embedded />}
        {view === "accounts" && <TeacherStudentAccountsClient embedded />}
      </section>
    </>
  );
}
