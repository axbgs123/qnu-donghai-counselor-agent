import { getAuthAccountFromRequest } from "../../../lib/auth-storage";

const MINERU_FLASH_BASE_URL = "https://mineru.net/api/v1/agent";
const MINERU_PRECISION_BASE_URL = "https://mineru.net/api/v4";
const FLASH_MAX_FILE_SIZE = 10 * 1024 * 1024;

type MineruBody = {
  action?: "start" | "status";
  fileName?: string;
  fileSize?: number;
  taskId?: string;
  mode?: "flash" | "precision";
};

async function mineruJson(path: string, init?: RequestInit) {
  const response = await fetch(`${MINERU_FLASH_BASE_URL}${path}`, init);
  const data = await response.json().catch(() => ({})) as {
    code?: number | string;
    msg?: string;
    data?: Record<string, unknown>;
  };
  if (!response.ok || data.code !== 0) throw new Error(data.msg || `MinerU服务响应异常（${response.status}）`);
  return data.data ?? {};
}

export async function POST(request: Request) {
  try {
    const uploader = await getAuthAccountFromRequest(request);
    if (!uploader || !["teacher", "admin"].includes(uploader.role)) return Response.json({ error: "仅教师或管理员可使用文档OCR" }, { status: 403 });
    const body = await request.json() as MineruBody;
    if (body.action === "start") {
      const fileName = body.fileName?.trim() ?? "";
      const fileSize = Number(body.fileSize ?? 0);
      if (!fileName.toLowerCase().endsWith(".pdf") || !Number.isFinite(fileSize) || fileSize <= 0) return Response.json({ error: "请选择有效的PDF文件" }, { status: 400 });
      if (fileSize > FLASH_MAX_FILE_SIZE) return Response.json({ error: "扫描版PDF超过10MB，需要在平台中配置MinerU精准解析Token后才能转换" }, { status: 413 });
      const data = await mineruJson("/parse/file", {
        method: "POST",
        headers: { "content-type": "application/json", source: "qz-zhifu" },
        body: JSON.stringify({ file_name: fileName, language: "ch", is_ocr: true, enable_formula: true, enable_table: true }),
      });
      return Response.json({ taskId: data.task_id, uploadUrl: data.file_url });
    }
    if (body.action === "status") {
      if (!body.taskId || !/^[A-Za-z0-9_-]{6,100}$/.test(body.taskId)) return Response.json({ error: "OCR任务编号无效" }, { status: 400 });
      if (body.mode === "precision") {
        const token = process.env.MINERU_TOKEN?.trim();
        if (!token) return Response.json({ error: "服务器尚未配置MinerU精准解析Token" }, { status: 400 });
        const response = await fetch(`${MINERU_PRECISION_BASE_URL}/extract-results/batch/${encodeURIComponent(body.taskId)}`, {
          headers: { authorization: `Bearer ${token}`, source: "qz-zhifu" },
        });
        const payload = await response.json().catch(() => ({})) as { code?: number; msg?: string; data?: { extract_result?: Array<Record<string, unknown>> } };
        if (!response.ok || payload.code !== 0) throw new Error(payload.msg || `MinerU精准解析响应异常（${response.status}）`);
        const item = payload.data?.extract_result?.[0];
        if (!item) return Response.json({ state: "pending", progress: null });
        const state = String(item.state ?? "unknown");
        if (state === "failed") return Response.json({ state, error: String(item.err_msg || "MinerU精准解析失败") });
        if (state === "done" && item.full_zip_url) {
          return Response.json({ state, resultReady: true, progress: item.extract_progress ?? null });
        }
        return Response.json({ state, progress: item.extract_progress ?? null });
      }
      const data = await mineruJson(`/parse/${encodeURIComponent(body.taskId)}`);
      const state = String(data.state ?? "unknown");
      if (state === "failed") return Response.json({ state, error: String(data.err_msg || "MinerU OCR转换失败") });
      if (state === "done" && data.markdown_url) {
        const markdownResponse = await fetch(String(data.markdown_url), { redirect: "follow" });
        if (!markdownResponse.ok) throw new Error("MinerU已完成转换，但Markdown结果下载失败");
        return Response.json({ state, markdown: (await markdownResponse.text()).slice(0, 650_000) });
      }
      return Response.json({ state, progress: data.extract_progress ?? null });
    }
    return Response.json({ error: "不支持的OCR操作" }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "MinerU OCR服务暂不可用" }, { status: 502 });
  }
}
