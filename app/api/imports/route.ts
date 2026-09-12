import { importDefinitionList } from "../../lib/import-definitions";
import { deleteImportJob, listImportJobs } from "../../lib/import-storage";
import { getAuthAccountFromRequest } from "../../lib/auth-storage";

export async function GET(request: Request) {
  try {
    const account = await getAuthAccountFromRequest(request);
    if (!account || !["teacher", "admin"].includes(account.role)) return Response.json({ error: "仅教师或管理员可查看导入记录" }, { status: 403 });
    return Response.json({ jobs: await listImportJobs(12, account.id), definitions: importDefinitionList });
  } catch (error) {
    return Response.json({ jobs: [], definitions: importDefinitionList, warning: error instanceof Error ? error.message : "导入记录暂不可用" });
  }
}

export async function DELETE(request: Request) {
  const account = await getAuthAccountFromRequest(request);
  if (!account || !["teacher", "admin"].includes(account.role)) return Response.json({ error: "仅教师或管理员可删除导入记录" }, { status: 403 });
  const id = new URL(request.url).searchParams.get("id")?.trim();
  if (!id) return Response.json({ error: "缺少导入记录编号" }, { status: 400 });
  if (!await deleteImportJob(id, account.id)) return Response.json({ error: "导入记录不存在" }, { status: 404 });
  return Response.json({ deleted: true, id });
}
