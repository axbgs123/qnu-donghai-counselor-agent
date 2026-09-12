import { ensureImportSchema } from "./import-storage";

export type AiProviderId = "zhipu" | "deepseek";

export type AiModelOption = {
  id: string;
  name: string;
  description: string;
  recommended?: boolean;
  vision?: boolean;
};

export const aiProviders: Record<AiProviderId, {
  id: AiProviderId;
  name: string;
  shortName: string;
  baseURL: string;
  keyHint: string;
  models: AiModelOption[];
}> = {
  zhipu: {
    id: "zhipu",
    name: "智谱 AI",
    shortName: "智谱",
    baseURL: "https://open.bigmodel.cn/api/paas/v4",
    keyHint: "通常是一串字母和数字，中间可能带一个点",
    models: [
      { id: "glm-5.3-flash", name: "GLM-5.3-Flash", description: "速度快，适合日常问答、学生数字人和图片资料", recommended: true, vision: true },
      { id: "glm-5.2", name: "GLM-5.2", description: "更适合复杂材料、长文本和深度分析" },
      { id: "glm-4.7-flash", name: "GLM-4.7-Flash", description: "稳定轻量，适合普通问答和分类整理" },
    ],
  },
  deepseek: {
    id: "deepseek",
    name: "DeepSeek",
    shortName: "DeepSeek",
    baseURL: "https://api.deepseek.com",
    keyHint: "通常以 sk- 开头",
    models: [
      { id: "deepseek-v4-flash", name: "DeepSeek V4 Flash", description: "速度和成本平衡，适合日常学生工作", recommended: true },
      { id: "deepseek-v4-pro", name: "DeepSeek V4 Pro", description: "适合复杂推理、总结和方案生成" },
      { id: "deepseek-v4-flash-vision-exp", name: "DeepSeek V4 Flash Vision", description: "实验版，可处理聊天截图和图片资料", vision: true },
    ],
  },
};

type StoredAiSetting = {
  teacher_id: string;
  provider: AiProviderId;
  api_key: string;
  model: string;
  base_url: string;
  is_active: number;
  last_test_status: string | null;
  last_test_at: string | null;
  updated_at: string;
};

export type ActiveAiConfig = {
  provider: AiProviderId;
  providerName: string;
  model: string;
  modelName: string;
  apiKey: string;
  baseURL: string;
  vision: boolean;
  source: "database" | "environment" | "local";
};

export async function ensureAiConfigSchema() {
  const db = await ensureImportSchema();
  await db.prepare(`CREATE TABLE IF NOT EXISTS teacher_ai_settings (
    teacher_id TEXT NOT NULL,
    provider TEXT NOT NULL,
    api_key TEXT NOT NULL DEFAULT '',
    model TEXT NOT NULL,
    base_url TEXT NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 0,
    last_test_status TEXT,
    last_test_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (teacher_id, provider)
  )`).run();
  await db.prepare("CREATE INDEX IF NOT EXISTS idx_teacher_ai_active ON teacher_ai_settings(teacher_id, is_active)").run();
  const legacy = await db.prepare("SELECT name FROM sqlite_schema WHERE type = 'table' AND name = 'ai_provider_settings'").first();
  const accounts = await db.prepare("SELECT name FROM sqlite_schema WHERE type = 'table' AND name = 'app_accounts'").first();
  if (legacy && accounts) {
    await db.prepare(`INSERT OR IGNORE INTO teacher_ai_settings
      (teacher_id, provider, api_key, model, base_url, is_active, last_test_status, last_test_at, created_at, updated_at)
      SELECT (SELECT id FROM app_accounts WHERE role = 'teacher' ORDER BY created_at LIMIT 1),
        provider, api_key, model, base_url, is_active, last_test_status, last_test_at, created_at, updated_at
      FROM ai_provider_settings
      WHERE EXISTS (SELECT 1 FROM app_accounts WHERE role = 'teacher')`).run();
  }
  return db;
}

function environmentConfig(): ActiveAiConfig | null {
  if (process.env.DISABLE_EXTERNAL_AI === "1") return null;
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return null;
  const model = process.env.OPENAI_MODEL?.trim() || "glm-5.3-flash";
  const provider: AiProviderId = (process.env.OPENAI_BASE_URL ?? "").includes("deepseek") ? "deepseek" : "zhipu";
  const definition = aiProviders[provider];
  const modelInfo = definition.models.find((item) => item.id === model);
  return {
    provider, providerName: definition.name, model, modelName: modelInfo?.name ?? model,
    apiKey, baseURL: process.env.OPENAI_BASE_URL?.trim() || definition.baseURL,
    vision: Boolean(modelInfo?.vision), source: "environment",
  };
}

export async function getActiveAiConfig(teacherId: string, options: { disableExternalAi?: boolean } = {}): Promise<ActiveAiConfig | null> {
  if (options.disableExternalAi || process.env.DISABLE_EXTERNAL_AI === "1") return null;
  const db = await ensureAiConfigSchema();
  const row = await db.prepare("SELECT * FROM teacher_ai_settings WHERE teacher_id = ? AND is_active = 1 LIMIT 1").bind(teacherId).first<StoredAiSetting>();
  if (!row) return environmentConfig();
  const definition = aiProviders[row.provider];
  if (!definition) return environmentConfig();
  const envConfig = environmentConfig();
  const apiKey = row.api_key.trim() || (row.provider === envConfig?.provider ? envConfig.apiKey : "");
  if (!apiKey) return null;
  const modelInfo = definition.models.find((item) => item.id === row.model);
  return {
    provider: row.provider, providerName: definition.name, model: row.model, modelName: modelInfo?.name ?? row.model,
    apiKey, baseURL: row.base_url || definition.baseURL, vision: Boolean(modelInfo?.vision), source: "database",
  };
}

function maskKey(value: string) {
  if (!value) return "";
  if (value.length <= 10) return `${value.slice(0, 2)}••••${value.slice(-2)}`;
  return `${value.slice(0, 6)}••••••${value.slice(-4)}`;
}

export async function getAiConfigOverview(teacherId: string) {
  const db = await ensureAiConfigSchema();
  const stored = await db.prepare("SELECT * FROM teacher_ai_settings WHERE teacher_id = ? ORDER BY provider").bind(teacherId).all<StoredAiSetting>();
  const rows = new Map(stored.results.map((row) => [row.provider, row]));
  const envConfig = environmentConfig();
  const active = await getActiveAiConfig(teacherId);
  return {
    active: active ? { provider: active.provider, providerName: active.providerName, model: active.model, modelName: active.modelName, vision: active.vision, source: active.source } : null,
    providers: Object.values(aiProviders).map((provider) => {
      const row = rows.get(provider.id);
      const envKey = envConfig?.provider === provider.id ? envConfig.apiKey : "";
      const key = row?.api_key || envKey;
      return {
        id: provider.id, name: provider.name, shortName: provider.shortName, keyHint: provider.keyHint,
        hasKey: Boolean(key), maskedKey: maskKey(key), model: row?.model || (envConfig?.provider === provider.id ? envConfig.model : provider.models.find((item) => item.recommended)?.id) || provider.models[0].id,
        models: provider.models, active: active?.provider === provider.id,
        lastTestStatus: row?.last_test_status ?? (envConfig?.provider === provider.id ? "success" : null),
        lastTestAt: row?.last_test_at ?? null,
      };
    }),
  };
}

function validateSelection(provider: string, model: string) {
  if (!(provider in aiProviders)) throw new Error("请选择支持的模型平台");
  const definition = aiProviders[provider as AiProviderId];
  if (!definition.models.some((item) => item.id === model)) throw new Error("请选择该平台提供的模型");
  return definition;
}

async function resolveProviderKey(teacherId: string, provider: AiProviderId, suppliedKey?: string) {
  const value = suppliedKey?.trim();
  if (value) return value;
  const db = await ensureAiConfigSchema();
  const row = await db.prepare("SELECT api_key FROM teacher_ai_settings WHERE teacher_id = ? AND provider = ?").bind(teacherId, provider).first<{ api_key: string }>();
  if (row?.api_key) return row.api_key;
  const envConfig = environmentConfig();
  return envConfig?.provider === provider ? envConfig.apiKey : "";
}

export async function testAiConnection(teacherId: string, input: { provider: AiProviderId; model: string; apiKey?: string }) {
  const definition = validateSelection(input.provider, input.model);
  await ensureAiConfigSchema();
  const apiKey = await resolveProviderKey(teacherId, input.provider, input.apiKey);
  if (!apiKey) throw new Error(`请先填写${definition.shortName} API Key`);
  const startedAt = Date.now();
  const body: Record<string, unknown> = {
    model: input.model,
    messages: [{ role: "user", content: "只回复：连接成功" }],
    max_tokens: input.provider === "zhipu" ? 512 : 64,
  };
  if (input.provider === "zhipu") body.reasoning_effort = "low";
  const response = await fetch(`${definition.baseURL}/chat/completions`, {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({})) as { choices?: Array<{ message?: { content?: string } }>; error?: { message?: string } };
  if (!response.ok) throw new Error(data.error?.message || `连接失败（${response.status}）`);
  if (!data.choices?.[0]?.message) throw new Error("平台已响应，但没有返回模型结果");
  return { success: true, latencyMs: Date.now() - startedAt, message: "连接成功" };
}

export async function saveAiConfig(teacherId: string, input: { provider: AiProviderId; model: string; apiKey?: string }) {
  const definition = validateSelection(input.provider, input.model);
  const db = await ensureAiConfigSchema();
  const apiKey = await resolveProviderKey(teacherId, input.provider, input.apiKey);
  if (!apiKey) throw new Error(`请先填写${definition.shortName} API Key`);
  const tested = await testAiConnection(teacherId, { ...input, apiKey });
  await db.batch([
    db.prepare("UPDATE teacher_ai_settings SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE teacher_id = ?").bind(teacherId),
    db.prepare(`INSERT INTO teacher_ai_settings (teacher_id, provider, api_key, model, base_url, is_active, last_test_status, last_test_at)
      VALUES (?, ?, ?, ?, ?, 1, 'success', CURRENT_TIMESTAMP)
      ON CONFLICT(teacher_id, provider) DO UPDATE SET api_key = excluded.api_key, model = excluded.model, base_url = excluded.base_url,
      is_active = 1, last_test_status = 'success', last_test_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP`)
      .bind(teacherId, input.provider, apiKey, input.model, definition.baseURL),
  ]);
  return tested;
}
