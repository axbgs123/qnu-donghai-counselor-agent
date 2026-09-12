import http from "node:http";
import { Readable } from "node:stream";

const host = process.env.MINERU_PROXY_HOST || "127.0.0.1";
const port = Number(process.env.MINERU_PROXY_PORT || 3002);
const appOrigin = process.env.QZ_APP_ORIGIN || "http://localhost:3001";
const flashBaseUrl = "https://mineru.net/api/v1/agent";
const precisionBaseUrl = "https://mineru.net/api/v4";
const flashLimit = 10 * 1024 * 1024;
const resultLimit = 200 * 1024 * 1024;

function send(response, status, data, origin = "") {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    ...(origin ? { "access-control-allow-origin": origin, "access-control-allow-credentials": "true", vary: "Origin" } : {}),
  });
  response.end(JSON.stringify(data));
}

async function apiJson(url, init) {
  const response = await fetch(url, init);
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.code !== 0) throw new Error(body.msg || `MinerU服务响应异常（${response.status}）`);
  return body.data || {};
}

async function authenticatedAccount(cookie) {
  if (!cookie) return null;
  const response = await fetch(`${appOrigin}/api/auth/me`, { headers: { cookie } });
  if (!response.ok) return null;
  return (await response.json()).account || null;
}

async function streamPrecisionResult(request, response, origin) {
  const account = await authenticatedAccount(request.headers.cookie || "");
  if (!account || !["teacher", "admin"].includes(account.role)) {
    send(response, 403, { error: "仅教师或管理员可读取OCR结果" }, origin);
    return;
  }
  const taskId = new URL(request.url, `http://${request.headers.host || "localhost"}`).searchParams.get("taskId") || "";
  if (!/^[A-Za-z0-9_-]{6,100}$/.test(taskId)) {
    send(response, 400, { error: "OCR任务编号无效" }, origin);
    return;
  }
  const token = process.env.MINERU_TOKEN?.trim();
  if (!token) {
    send(response, 400, { error: "服务器尚未配置MinerU精准解析Token" }, origin);
    return;
  }
  const data = await apiJson(`${precisionBaseUrl}/extract-results/batch/${encodeURIComponent(taskId)}`, {
    headers: { authorization: `Bearer ${token}`, source: "qz-zhifu" },
  });
  const item = data.extract_result?.[0];
  if (!item || item.state !== "done" || !item.full_zip_url) {
    send(response, item?.state === "failed" ? 502 : 202, { state: item?.state || "pending", error: item?.err_msg || undefined }, origin);
    return;
  }
  const zipResponse = await fetch(String(item.full_zip_url));
  if (!zipResponse.ok || !zipResponse.body) {
    send(response, 502, { error: "MinerU已完成转换，但结果包下载失败" }, origin);
    return;
  }
  const length = Number(zipResponse.headers.get("content-length") || 0);
  if (length > resultLimit) {
    await zipResponse.body.cancel();
    send(response, 413, { error: "OCR结果包超过200MB，请拆分PDF后重新识别" }, origin);
    return;
  }
  response.writeHead(200, {
    "content-type": "application/zip",
    ...(length > 0 ? { "content-length": String(length) } : {}),
    "cache-control": "no-store",
    ...(origin ? { "access-control-allow-origin": origin, "access-control-allow-credentials": "true", vary: "Origin" } : {}),
  });
  Readable.fromWeb(zipResponse.body).pipe(response);
}

const server = http.createServer(async (request, response) => {
  const origin = request.headers.origin || "";
  if (request.method === "OPTIONS") {
    response.writeHead(204, {
      "access-control-allow-origin": origin || "http://localhost:3001",
      "access-control-allow-credentials": "true",
      "access-control-allow-methods": "POST, OPTIONS",
      "access-control-allow-headers": "content-type, x-file-name-base64",
      vary: "Origin",
    });
    response.end();
    return;
  }
  if (request.method === "GET" && request.url?.startsWith("/mineru-result?")) {
    try {
      await streamPrecisionResult(request, response, origin);
    } catch (error) {
      if (response.headersSent) response.destroy(error instanceof Error ? error : undefined);
      else send(response, 502, { error: error instanceof Error ? error.message : "OCR结果读取失败" }, origin);
    }
    return;
  }
  if (request.method !== "POST" || request.url !== "/mineru-upload") {
    send(response, 404, { error: "接口不存在" }, origin);
    return;
  }
  try {
    const account = await authenticatedAccount(request.headers.cookie || "");
    if (!account || !["teacher", "admin"].includes(account.role)) {
      send(response, 403, { error: "仅教师或管理员可使用文档OCR" }, origin);
      return;
    }
    const fileSize = Number(request.headers["content-length"] || 0);
    const maxSize = account.role === "admin" ? 200 * 1024 * 1024 : 100 * 1024 * 1024;
    if (!Number.isFinite(fileSize) || fileSize <= 0 || fileSize > maxSize) {
      send(response, 413, { error: `OCR文件不能超过${account.role === "admin" ? "200MB" : "100MB"}` }, origin);
      return;
    }
    const encodedName = String(request.headers["x-file-name-base64"] || "");
    const fileName = Buffer.from(encodedName, "base64").toString("utf8").trim();
    if (!fileName.toLowerCase().endsWith(".pdf")) {
      send(response, 400, { error: "OCR流式通道目前仅接收PDF" }, origin);
      return;
    }
    const token = process.env.MINERU_TOKEN?.trim();
    let mode;
    let taskId;
    let uploadUrl;
    if (token) {
      const data = await apiJson(`${precisionBaseUrl}/file-urls/batch`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json", source: "qz-zhifu" },
        body: JSON.stringify({
          files: [{ name: fileName, is_ocr: true }],
          model_version: "vlm",
          language: "ch",
          enable_formula: true,
          enable_table: true,
        }),
      });
      mode = "precision";
      taskId = data.batch_id;
      uploadUrl = data.file_urls?.[0];
    } else {
      if (fileSize > flashLimit) {
        send(response, 413, { error: "扫描版PDF超过10MB，请先在服务器环境中配置MINERU_TOKEN以启用精准解析" }, origin);
        return;
      }
      const data = await apiJson(`${flashBaseUrl}/parse/file`, {
        method: "POST",
        headers: { "content-type": "application/json", source: "qz-zhifu" },
        body: JSON.stringify({ file_name: fileName, language: "ch", is_ocr: true, enable_formula: true, enable_table: true }),
      });
      mode = "flash";
      taskId = data.task_id;
      uploadUrl = data.file_url;
    }
    if (!taskId || !uploadUrl) throw new Error("MinerU没有返回文件上传地址");
    const uploaded = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "content-length": String(fileSize) },
      body: Readable.toWeb(request),
      duplex: "half",
    });
    if (!uploaded.ok) throw new Error(`扫描件发送失败（${uploaded.status}）`);
    send(response, 200, { mode, taskId }, origin);
  } catch (error) {
    send(response, 502, { error: error instanceof Error ? error.message : "OCR流式上传失败" }, origin);
  }
});

server.listen(port, host, () => {
  console.log(`MinerU upload proxy listening on http://${host}:${port}`);
});
