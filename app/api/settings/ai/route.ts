import { getAiConfigOverview, saveAiConfig, testAiConnection, type AiProviderId } from "../../../lib/ai-config";
import { getAuthAccountFromRequest } from "../../../lib/auth-storage";

type RequestBody = {
  action?: "test" | "save";
  provider?: AiProviderId;
  model?: string;
  apiKey?: string;
};

export async function GET(request: Request) {
  try {
    const teacher = await getAuthAccountFromRequest(request);
    if (teacher?.role !== "teacher") return Response.json({ error: "仅教师可配置工作助手模型" }, { status: 403 });
    return Response.json(await getAiConfigOverview(teacher.id));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "读取模型配置失败" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const teacher = await getAuthAccountFromRequest(request);
    if (teacher?.role !== "teacher") return Response.json({ error: "仅教师可配置工作助手模型" }, { status: 403 });
    const body = await request.json() as RequestBody;
    if (!body.provider || !body.model) {
      return Response.json({ error: "请选择模型平台和模型" }, { status: 400 });
    }
    const input = { provider: body.provider, model: body.model, apiKey: body.apiKey };
    if (body.action === "test") {
      return Response.json({ tested: await testAiConnection(teacher.id, input) });
    }
    if (body.action !== "save") {
      return Response.json({ error: "不支持的操作" }, { status: 400 });
    }
    const tested = await saveAiConfig(teacher.id, input);
    return Response.json({ tested, overview: await getAiConfigOverview(teacher.id) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "连接模型失败，请检查 Key 后重试" }, { status: 400 });
  }
}
