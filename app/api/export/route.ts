import { listSourceDocuments } from "../../lib/import-storage";
import { getPlatformReport, listPlatformStudents, listWorkflowCases } from "../../lib/platform-storage";
import { getAuthAccountFromRequest } from "../../lib/auth-storage";

function csvCell(value: unknown) { return `"${String(value ?? "").replace(/"/g, '""')}"`; }
function csv(rows: unknown[][]) { return rows.map((row) => row.map(csvCell).join(",")).join("\n"); }

export async function GET(request: Request) {
  const teacher = await getAuthAccountFromRequest(request);
  if (teacher?.role !== "teacher") return Response.json({ error: "仅教师可导出数据" }, { status: 403 });
  const type = new URL(request.url).searchParams.get("type") ?? "";
  let filename = "导出资料.txt";
  let contentType = "text/plain;charset=utf-8";
  let content = "";
  if (type === "export-students") {
    const students = await listPlatformStudents(teacher.id);
    filename = "东海校区学生名册.csv"; contentType = "text/csv;charset=utf-8";
    content = csv([["学号","姓名","年级","班级","学院","电话","状态","标签"], ...students.map((item) => [item.id,item.name,item.grade,item.className,item.department,item.phone,item.status,item.tags.join("、")])]);
  } else if (type === "export-knowledge") {
    const documents = await listSourceDocuments(1000, { audience: "teacher", teacherId: teacher.id });
    filename = "知识资料目录.csv"; contentType = "text/csv;charset=utf-8";
    content = csv([["资料名称","原文件名（原件存上传教师电脑）","业务分类","识别方式","确认状态","更新时间"], ...documents.map((item) => [item.title,item.file_name,item.category,item.processing_method,item.review_status,item.updated_at])]);
  } else if (type === "generate-report") {
    const report = await getPlatformReport(teacher.id);
    filename = `${report.month}-东海校区辅导员月度工作报告.txt`;
    content = `东海校区辅导员月度工作报告\n统计月份：${report.month}\n生成时间：${report.generatedAt}\n\n在管学生：${report.students}\n本月办结事项：${report.resolved}\n学生触达人数：${report.touched}\n当前未完成：${report.pending}\n知识资料：${report.knowledge.verified}/${report.knowledge.total} 份已确认\n\n事项分类：\n${report.categories.map((item) => `- ${item.name}：${item.count}`).join("\n") || "- 暂无事项记录"}\n\n说明：本报告只使用平台当前数据库记录，不生成满意度、响应时长等未采集指标。`;
  } else if (type === "export-ledger") {
    const [report, cases] = await Promise.all([getPlatformReport(teacher.id), listWorkflowCases(teacher.id)]);
    filename = "班级工作台账.csv"; contentType = "text/csv;charset=utf-8";
    content = csv([["班级","学生数","标记跟进人数","事项标题","事项类型","当前节点","状态"], ...report.classes.flatMap((item) => {
      const related = cases.filter((row) => row.subject.includes(item.className));
      return related.length ? related.map((row) => [item.className,item.students,item.attention,row.title,row.type,row.stage,row.status]) : [[item.className,item.students,item.attention,"","","",""]];
    })]);
  } else return Response.json({ error: "不支持的导出类型" }, { status: 400 });
  return new Response(`\uFEFF${content}`, { headers: { "content-type": contentType, "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`, "cache-control": "no-store" } });
}
