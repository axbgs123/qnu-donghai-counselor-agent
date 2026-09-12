import { capabilityCatalog } from "../../lib/assistant-capabilities";
import { runAssistantAgent } from "../../lib/assistant-agent";
import { getActiveAiConfig } from "../../lib/ai-config";
import { getAuthAccountFromRequest } from "../../lib/auth-storage";

export async function GET(request: Request) {
  const teacher = await getAuthAccountFromRequest(request);
  if (teacher?.role !== "teacher") return Response.json({ error: "仅教师可使用工作助手" }, { status: 403 });
  const localOnly = request.headers.get("x-local-ai") === "1" || process.env.DISABLE_EXTERNAL_AI === "1";
  const config = await getActiveAiConfig(teacher.id, { disableExternalAi: localOnly });
  return Response.json({
    capabilities: capabilityCatalog,
    modelConfigured: Boolean(config),
    model: config?.modelName ?? "本地工具模式",
    provider: config?.providerName ?? null,
    vision: config?.vision ?? false,
  });
}

export async function POST(request: Request) {
  const teacher = await getAuthAccountFromRequest(request);
  if (teacher?.role !== "teacher") return Response.json({ error: "仅教师可使用工作助手" }, { status: 403 });
  const body = (await request.json()) as {
    message?: string;
    history?: Array<{ role: "user" | "assistant"; text: string }>;
  };
  const message = body.message?.trim() ?? "";
  if (!message) return Response.json({ error: "message is required" }, { status: 400 });
  const reply = await runAssistantAgent({ message, teacherId: teacher.id, history: body.history, disableExternalAi: request.headers.get("x-local-ai") === "1" });
  return Response.json(reply);
}
