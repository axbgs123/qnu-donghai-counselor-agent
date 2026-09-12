import { getRawImportFile, getSourceDocument } from "../../../lib/import-storage";

export async function GET(request: Request) {
  try {
    const id = new URL(request.url).searchParams.get("id");
    if (!id) return Response.json({ error: "缺少资料编号" }, { status: 400 });
    const document = await getSourceDocument(id);
    if (!document?.storage_key) return Response.json({ error: "原文件未保存" }, { status: 404 });
    const object = await getRawImportFile(document.storage_key);
    if (!object) return Response.json({ error: "原文件不存在" }, { status: 404 });
    const asciiName = document.file_name.replace(/[^A-Za-z0-9._-]/g, "_");
    return new Response(object.body, { headers: {
      "content-type": document.mime_type || "application/octet-stream",
      "content-length": String(object.size),
      "content-disposition": `inline; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(document.file_name)}`,
    } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "读取原文件失败" }, { status: 500 });
  }
}
