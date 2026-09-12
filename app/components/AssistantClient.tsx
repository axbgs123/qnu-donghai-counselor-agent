"use client";

import Link from "next/link";
import { Bot, CheckCircle2, ExternalLink, FileText, History, Paperclip, Send, Sparkles, Trash2, WandSparkles, Wrench } from "lucide-react";
import { useEffect, useState } from "react";
import type { AssistantAction, AssistantCard, AssistantReply, AssistantSource } from "../lib/assistant-capabilities";
import { createClientId } from "../lib/client-id";

type Message = {
  role: "user" | "assistant";
  text: string;
  cards?: AssistantCard[];
  sources?: AssistantSource[];
  actions?: AssistantAction[];
  suggestions?: string[];
  tools?: string[];
  mode?: AssistantReply["mode"];
};

type Conversation = { id: string; title: string; messages?: Message[]; createdAt: string; updatedAt: string };
const openingMessage: Message = { role: "assistant", text: "老师好，我已连接东海校区知识库、学生诉求和你的工作事项。你可以直接说目标，我会先查依据，再生成可确认的执行方案。" };

const toolLabels: Record<string, string> = {
  search_student_requests: "学生诉求",
  search_students: "学生档案",
  search_knowledge: "知识检索",
  list_tasks: "待办日程",
  inspect_workflow: "事项流程",
  draft_material: "材料生成",
  campus_snapshot: "工作概览",
  prepare_import: "资料导入",
  search_imported_records: "已导入数据",
  search_source_documents: "上传资料检索",
};

function ResultCard({ card }: { card: AssistantCard }) {
  const content = <>
    <header><span>{card.type === "student" ? "生" : card.type === "document" ? "文" : card.type === "workflow" ? "流" : card.type === "task" ? "办" : card.type === "draft" ? "稿" : "数"}</span><div><b>{card.title}</b>{card.subtitle && <small>{card.subtitle}</small>}</div>{card.badge && <em>{card.badge}</em>}</header>
    {card.rows?.length ? <dl>{card.rows.map((row) => <div key={`${row.label}-${row.value}`}><dt>{row.label}</dt><dd>{row.value}</dd></div>)}</dl> : null}
    {card.href && <footer>查看完整档案 <ExternalLink size={12} /></footer>}
  </>;
  return card.href ? <Link className={`assistant-result-card ${card.type}`} href={card.href}>{content}</Link> : <article className={`assistant-result-card ${card.type}`}>{content}</article>;
}

function AssistantAnswer({ text }: { text: string }) {
  const normalized = text.replace(/\*\*/g, "").replace(/\s+(?=(?:🔴|🟡|🔵)?\s*\d+[.、]\s*)/g, "\n");
  const lines = normalized.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const blocks: Array<{ type: "text" | "item"; value: string; marker?: string }> = [];
  for (const line of lines) {
    const match = line.match(/^(?:(🔴|🟡|🔵)\s*)?(?:[-•]\s*|(\d+)[.、]\s*)(.+)$/);
    if (match) blocks.push({ type: "item", value: match[3].trim(), marker: match[1] || match[2] });
    else blocks.push({ type: "text", value: line });
  }
  return <div className="assistant-answer">{blocks.map((block, index) => block.type === "item"
    ? <div className="assistant-answer-item" key={`${block.value}-${index}`}><span className={block.marker && /[🔴🟡🔵]/.test(block.marker) ? "priority-dot" : "item-number"}>{block.marker || "•"}</span><p>{block.value}</p></div>
    : <p key={`${block.value}-${index}`}>{block.value}</p>)}</div>;
}

export function AssistantClient({ initialPrompt = "" }: { initialPrompt?: string }) {
  const [input, setInput] = useState(initialPrompt);
  const [messages, setMessages] = useState<Message[]>([openingMessage]);
  const [conversationId, setConversationId] = useState(createClientId);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(false);
  const [modelInfo, setModelInfo] = useState({ configured: false, name: "本地工具模式", vision: false });
  useEffect(() => {
    fetch("/api/assistant").then(async (response) => {
      if (!response.ok) return;
      const data = await response.json() as { modelConfigured?: boolean; model?: string; vision?: boolean };
      setModelInfo({ configured: Boolean(data.modelConfigured), name: data.model || "本地工具模式", vision: Boolean(data.vision) });
    }).catch(() => undefined);
    fetch("/api/assistant/history").then(async (response) => {
      if (!response.ok) return;
      const data = await response.json() as { conversations?: Conversation[] };
      setConversations(data.conversations ?? []);
    }).catch(() => undefined);
  }, []);

  const saveConversation = async (id: string, nextMessages: Message[]) => {
    const firstQuestion = nextMessages.find((message) => message.role === "user")?.text.trim();
    if (!firstQuestion) return;
    const response = await fetch("/api/assistant/history", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, title: firstQuestion.slice(0, 32), messages: nextMessages }),
    });
    if (!response.ok) return;
    const data = await response.json() as { conversation?: Conversation };
    if (data.conversation) setConversations((current) => [data.conversation!, ...current.filter((item) => item.id !== id)]);
  };

  const newConversation = () => {
    setInput("");
    setConversationId(createClientId());
    setMessages([{ role: "assistant", text: "已新建对话。请告诉我需要处理的学生工作，我会先给出执行清单。" }]);
  };

  const openConversation = async (conversation: Conversation) => {
    const response = await fetch(`/api/assistant/history?id=${encodeURIComponent(conversation.id)}`);
    if (!response.ok) return;
    const data = await response.json() as { conversation?: Conversation };
    if (!data.conversation) return;
    setConversationId(data.conversation.id);
    setMessages(data.conversation.messages?.length ? data.conversation.messages : [openingMessage]);
    setInput("");
  };

  const removeConversation = async (id: string) => {
    if (!window.confirm("确定删除这条助手对话吗？")) return;
    const response = await fetch(`/api/assistant/history?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    if (!response.ok) return;
    setConversations((current) => current.filter((item) => item.id !== id));
    if (id === conversationId) newConversation();
  };

  const send = async (value = input) => {
    const text = value.trim();
    if (!text || loading) return;
    const nextMessages: Message[] = [...messages, { role: "user", text }];
    setMessages(nextMessages);
    setInput("");
    setLoading(true);
    try {
      const response = await fetch("/api/assistant", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: text, history: messages.slice(-8).map(({ role, text }) => ({ role, text })) }),
      });
      if (!response.ok) throw new Error("assistant request failed");
      const result = await response.json() as AssistantReply;
      const assistantMessage: Message = {
        role: "assistant",
        text: result.answer ?? "我已整理好相关信息。",
        cards: result.cards,
        sources: result.sources,
        actions: result.actions,
        suggestions: result.suggestions,
        tools: result.tools,
        mode: result.mode,
      };
      const completedMessages = [...nextMessages, assistantMessage];
      setMessages(completedMessages);
      await saveConversation(conversationId, completedMessages);
    } catch {
      const completedMessages: Message[] = [...nextMessages, { role: "assistant", text: "暂时没有完成本次处理，请稍后重试；已输入的内容会保留在本次对话中。" }];
      setMessages(completedMessages);
      await saveConversation(conversationId, completedMessages);
    } finally { setLoading(false); }
  };

  return (
    <div className="assistant-page-layout">
      <aside className="conversation-list panel">
        <button className="primary-button" onClick={newConversation}><WandSparkles size={16} />新建对话</button>
        <p className="nav-label">最近对话</p>
        {conversations.length ? <div className="conversation-history-items">{conversations.map((conversation) => <div className={conversation.id === conversationId ? "active" : ""} key={conversation.id}><button onClick={() => void openConversation(conversation)}><History size={15}/><span><b>{conversation.title}</b><small>{new Date(conversation.updatedAt).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</small></span></button><button aria-label={`删除对话${conversation.title}`} onClick={() => removeConversation(conversation.id)}><Trash2 size={14}/></button></div>)}</div>
          : <div className="conversation-list-empty"><History size={16}/><span>还没有保存的历史对话</span></div>}
        <small className="conversation-retention">聊天记录仅保留 7 天，过期自动删除</small>
        <div className="knowledge-health"><span><CheckCircle2 size={17}/></span><p><b>{modelInfo.name}{modelInfo.configured ? " 已连接" : ""}</b><small>9项核心工具 · {modelInfo.vision ? "支持图片资料" : "文字资料可用"}</small></p></div>
      </aside>
      <section className="assistant-workspace panel">
        <header><div><span className="assistant-mark"><Sparkles size={18}/></span><p><b>泉师智能助手</b><small><i/>{modelInfo.name} · 学生、知识、待办、流程与材料工具已加载</small></p></div><Link className="secondary-button" href="/settings">切换模型</Link></header>
        <div className="chat-canvas">
          {messages.length === 1 && <div className="assistant-welcome"><span><Bot size={27}/></span><h2>今天想处理什么工作？</h2><p>直接输入学生、待办、制度、流程或材料需求；我会读取平台现有数据，不补写示例记录。</p></div>}
          {messages.map((message,i)=><div key={`${message.role}-${i}`} className={`chat-message ${message.role}`}><span>{message.role==="assistant"?<Sparkles size={16}/>:"徐"}</span><div>
            {message.tools?.length ? <div className="assistant-tool-trace"><Wrench size={12}/><span>{message.mode === "model+campus-tools" ? "模型已调用" : "已调用"}</span>{message.tools.map((item) => <em key={item}>{toolLabels[item] ?? item}</em>)}</div> : null}
            <AssistantAnswer text={message.text}/>
            {message.cards?.length ? <div className="assistant-result-grid">{message.cards.map((card, cardIndex) => <ResultCard key={`${card.type}-${card.title}-${cardIndex}`} card={card}/>)}</div> : null}
            {message.sources?.length ? <aside className="assistant-sources"><FileText size={14}/><span><b>参考依据</b>{message.sources.map((source) => <small key={source.title}>{source.title} · {source.scope ?? source.updatedAt}</small>)}</span></aside> : null}
            {message.actions?.length ? <div className="assistant-response-actions">{message.actions.map((action) => action.href ? <Link className={action.primary ? "primary" : ""} href={action.href} key={`${action.href}-${action.label}`}>{action.label}</Link> : <button className={action.primary ? "primary" : ""} data-action={action.action} data-context={action.context ?? action.label} key={`${action.action}-${action.label}`}>{action.label}</button>)}</div> : null}
            {message.suggestions?.length ? <div className="assistant-followups">{message.suggestions.map((suggestion) => <button onClick={() => send(suggestion)} key={suggestion}>{suggestion}</button>)}</div> : null}
          </div></div>)}
          {loading && <div className="chat-message assistant"><span><Sparkles size={16}/></span><div className="typing"><i/><i/><i/></div></div>}
        </div>
        <footer className="assistant-composer"><div><Link href="/imports" aria-label="添加附件"><Paperclip size={18}/></Link><textarea value={input} onChange={(e)=>setInput(e.target.value)} onKeyDown={(e)=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();send();}}} placeholder="描述你的工作需求，按 Enter 发送…"/><button onClick={()=>send()} aria-label="发送"><Send size={18}/></button></div><small>AI 可能出错。涉及学生的重要事项，请保留必要沟通并由老师判断。</small></footer>
      </section>
    </div>
  );
}
