"use client";

import Link from "next/link";
import { Bot, Check, CheckCircle2, Eye, EyeOff, Gauge, Image as ImageIcon, KeyRound, LoaderCircle, PlugZap, ShieldCheck, Sparkles, TriangleAlert } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type ModelOption = { id: string; name: string; description: string; recommended?: boolean; vision?: boolean };
type Provider = {
  id: "zhipu" | "deepseek";
  name: string;
  shortName: string;
  keyHint: string;
  hasKey: boolean;
  maskedKey: string;
  model: string;
  models: ModelOption[];
  active: boolean;
  lastTestStatus: string | null;
  lastTestAt: string | null;
};
type Overview = {
  active: { provider: Provider["id"]; providerName: string; model: string; modelName: string; vision: boolean; source: string } | null;
  providers: Provider[];
};
type Notice = { tone: "success" | "error"; text: string; latency?: number } | null;

export function ModelSettingsClient() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [providerId, setProviderId] = useState<Provider["id"]>("zhipu");
  const [model, setModel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [busy, setBusy] = useState<"test" | "save" | null>(null);
  const [notice, setNotice] = useState<Notice>(null);

  const applyOverview = (next: Overview) => {
    setOverview(next);
    const chosen = next.providers.find((provider) => provider.active) ?? next.providers[0];
    setProviderId(chosen.id);
    setModel(chosen.model);
  };

  useEffect(() => {
    fetch("/api/settings/ai").then(async (response) => {
      if (!response.ok) throw new Error("读取配置失败");
      applyOverview(await response.json() as Overview);
    }).catch(() => setNotice({ tone: "error", text: "暂时无法读取模型配置，请刷新页面重试。" }));
  }, []);

  const provider = useMemo(() => overview?.providers.find((item) => item.id === providerId), [overview, providerId]);
  const selectedModel = provider?.models.find((item) => item.id === model);

  const chooseProvider = (nextId: Provider["id"]) => {
    const next = overview?.providers.find((item) => item.id === nextId);
    setProviderId(nextId);
    setModel(next?.model || next?.models.find((item) => item.recommended)?.id || next?.models[0]?.id || "");
    setApiKey("");
    setNotice(null);
  };

  const submit = async (action: "test" | "save") => {
    if (!provider || !model || busy) return;
    if (!apiKey.trim() && !provider.hasKey) {
      setNotice({ tone: "error", text: `请先填写${provider.shortName} API Key。` });
      return;
    }
    setBusy(action);
    setNotice(null);
    try {
      const response = await fetch("/api/settings/ai", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, provider: providerId, model, apiKey: apiKey.trim() || undefined }),
      });
      const result = await response.json() as { error?: string; tested?: { latencyMs?: number }; overview?: Overview };
      if (!response.ok) throw new Error(result.error || "连接失败");
      if (result.overview) applyOverview(result.overview);
      if (action === "save") setApiKey("");
      setNotice({
        tone: "success",
        text: action === "save" ? `${selectedModel?.name ?? model} 已启用，全站智能功能已切换。` : "连接测试通过，这个 Key 和模型可以使用。",
        latency: result.tested?.latencyMs,
      });
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "连接失败，请检查 Key 后重试。" });
    } finally {
      setBusy(null);
    }
  };

  if (!overview || !provider) return <div className="model-settings-loading panel"><LoaderCircle className="spin" size={20} />正在读取模型配置…</div>;

  return <div className="model-settings-layout">
    <section className="model-config-panel panel">
      <div className="model-step">
        <header><span>1</span><div><h2>选择模型平台</h2><p>目前支持智谱和 DeepSeek，可随时切换。</p></div></header>
        <div className="provider-picker">
          {overview.providers.map((item) => <button key={item.id} className={providerId === item.id ? "active" : ""} onClick={() => chooseProvider(item.id)}>
            <span className={`provider-logo ${item.id}`}>{item.id === "zhipu" ? "智" : "D"}</span>
            <p><b>{item.name}</b><small>{item.id === "zhipu" ? "适合中文办公与图片资料" : "适合问答、总结与复杂分析"}</small></p>
            <i>{providerId === item.id && <Check size={13} />}</i>
          </button>)}
        </div>
      </div>

      <div className="model-step">
        <header><span>2</span><div><h2>填写 API Key</h2><p>Key 相当于模型平台的使用凭证，只需填写一次。</p></div></header>
        <label className="key-field">
          <KeyRound size={17} />
          <input type={showKey ? "text" : "password"} value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder={provider.hasKey ? `已保存 ${provider.maskedKey}；留空表示继续使用` : `粘贴${provider.shortName} API Key`} autoComplete="off" spellCheck={false} />
          <button type="button" onClick={() => setShowKey((value) => !value)} aria-label={showKey ? "隐藏 Key" : "显示 Key"}>{showKey ? <EyeOff size={17} /> : <Eye size={17} />}</button>
        </label>
        <p className="key-help"><ShieldCheck size={13} />保存在本网站服务端，不会显示在聊天和导入页面。{provider.keyHint}。</p>
      </div>

      <div className="model-step">
        <header><span>3</span><div><h2>选择模型并启用</h2><p>不懂参数时，直接选择带“推荐”标记的模型。</p></div></header>
        <div className="model-picker">
          {provider.models.map((item) => <button key={item.id} className={model === item.id ? "active" : ""} onClick={() => { setModel(item.id); setNotice(null); }}>
            <span className="model-radio">{model === item.id && <i />}</span>
            <p><b>{item.name}</b><small>{item.description}</small></p>
            <span className="model-tags">{item.recommended && <em>推荐</em>}{item.vision && <em className="vision"><ImageIcon size={11} />图片识别</em>}</span>
          </button>)}
        </div>
      </div>

      {notice && <div className={`model-notice ${notice.tone}`}>{notice.tone === "success" ? <CheckCircle2 size={17} /> : <TriangleAlert size={17} />}<span>{notice.text}{notice.latency ? <small>连接耗时约 {notice.latency}ms</small> : null}</span></div>}

      <footer className="model-config-actions">
        <button className="secondary-button" disabled={Boolean(busy)} onClick={() => submit("test")}>{busy === "test" ? <LoaderCircle className="spin" size={15} /> : <PlugZap size={15} />}测试连接</button>
        <button className="primary-button" disabled={Boolean(busy)} onClick={() => submit("save")}>{busy === "save" ? <LoaderCircle className="spin" size={15} /> : <Sparkles size={15} />}保存并启用</button>
      </footer>
    </section>

    <aside className="model-settings-side">
      <section className="connection-receipt panel">
        <header><span><CheckCircle2 size={18} /></span><div><small>模型连接回执</small><b>{overview.active ? "当前可以正常使用" : "尚未连接模型"}</b></div></header>
        <div className="receipt-model"><small>全站当前模型</small><strong>{overview.active?.modelName ?? "本地工具模式"}</strong><span>{overview.active?.providerName ?? "未配置平台"}</span></div>
        <dl>
          <div><dt><Bot size={14} />老师智能助手</dt><dd className={overview.active ? "ready" : "local"}>{overview.active ? "已接入" : "本地模式"}</dd></div>
          <div><dt><Sparkles size={14} />学生端数字人</dt><dd className={overview.active ? "ready" : "local"}>{overview.active ? "已接入" : "本地模式"}</dd></div>
          <div><dt><ImageIcon size={14} />聊天截图识别</dt><dd className={overview.active?.vision ? "ready" : "local"}>{overview.active?.vision ? "可使用" : "需视觉模型"}</dd></div>
        </dl>
        <p><i />保存后立即生效，不需要重启网站。</p>
      </section>

      <section className="setting-scope-card panel">
        <span><Gauge size={19} /></span><div><small>当前业务范围</small><b>东海校区 · 当前教师账号</b><p>所负责班级 · 辅导员工作场景</p></div>
      </section>
      <Link className="model-try-link" href="/assistant"><Sparkles size={15} />打开智能助手试用当前模型</Link>
    </aside>
  </div>;
}
