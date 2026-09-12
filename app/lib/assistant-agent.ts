import { createOpenAI } from "@ai-sdk/openai";
import { generateText, stepCountIs, tool, type ModelMessage } from "ai";
import { z } from "zod";
import {
  campusSnapshot,
  draftMaterial,
  inspectWorkflow,
  listTasks,
  mergeModelResults,
  mergeReplyWithCapability,
  prepareImport,
  runCampusAssistant,
  searchKnowledge,
  searchStudents,
  type AssistantReply,
  type CapabilityResult,
} from "./assistant-capabilities";
import { searchImportedRecords, searchSourceDocuments } from "./import-storage";
import { listStudentRequests } from "./engagement-storage";
import { getActiveAiConfig } from "./ai-config";

const SYSTEM_PROMPT = `你是泉州师范学院东海校区辅导员的学生工作助手。
你的职责是帮助老师查学生、汇总学生通过数字人提交的诉求、查制度、查看老师确认上传的 Word、PDF、PPT 与聊天截图、看待办、理解流程并生成可执行材料。

工作原则：
1. 涉及校内数据时优先调用工具，不要凭空编造学生、数字、制度名称或流程状态。
2. 可以组合多个只读工具后再回答，例如先找学生，再查对应流程和依据。
3. 回复使用简洁中文，先给结论，再给行动建议。
4. 通知、班会方案、谈话提纲、检查清单和总结必须调用 draft_material，生成可直接修改的完整草稿。
5. 任何写入、发送、审批和建档动作只提出建议，由界面的确认按钮交给老师执行。
6. 如果平台数据不足，明确说明数据范围，不要假设不存在的事实。
7. 超过两项的信息必须分行列出；每项只写一个动作或事实。不要输出Markdown粗体符号（**），不要把整段内容挤成一行。`;

const createCampusTools = (teacherId: string) => ({
  search_student_requests: tool({
    description: "汇总当前教师负责学生通过辅导员数字人提交的学生诉求、处理状态和主要类别。",
    inputSchema: z.object({ status: z.enum(["new", "processing", "resolved"]).optional(), className: z.string().trim().min(1).optional() }),
    execute: async (input) => summarizeStudentRequests(input, teacherId),
  }),
  search_students: tool({
    description: "按姓名、学号、班级、跟进状态或标签检索东海校区学生档案。",
    inputSchema: z.object({
      query: z.string().optional().describe("姓名、学号、班级、学院或标签关键词"),
      status: z.string().optional().describe("重点跟进、就业帮扶、回访中、升学跟进或正常"),
    }),
    execute: async (input) => searchStudents(input, teacherId),
  }),
  search_knowledge: tool({
    description: "检索校内制度、通知、办法、流程、指南，并返回版本、更新时间和适用范围。",
    inputSchema: z.object({ query: z.string().optional(), category: z.string().optional() }),
    execute: async (input) => searchKnowledge(input, teacherId),
  }),
  list_tasks: tool({
    description: "查询辅导员今日待办、日程、到期事项和优先级。",
    inputSchema: z.object({ query: z.string().optional(), priority: z.enum(["紧急", "重要", "常规"]).optional() }),
    execute: async (input) => listTasks(input, teacherId),
  }),
  inspect_workflow: tool({
    description: "查询请销假、心理支持、就业帮扶、学业预警、奖助评优、主题班会、四个100%、迎新、毕业离校、征兵等辅导员办理流程。",
    inputSchema: z.object({ query: z.string().optional() }),
    execute: async (input) => inspectWorkflow(input, teacherId),
  }),
  draft_material: tool({
    description: "生成完整的通知、班会方案、谈话提纲、走访或办理清单、工作总结。",
    inputSchema: z.object({
      request: z.string().describe("老师的完整材料生成要求"),
      type: z.enum(["通知", "班会方案", "谈话提纲", "执行清单", "工作总结"]).optional(),
    }),
    execute: async (input) => draftMaterial(input),
  }),
  campus_snapshot: tool({
    description: "查看东海校区辅导员当前学生、紧急待办、开放流程和知识资料概览。",
    inputSchema: z.object({}),
    execute: async () => campusSnapshot(teacherId),
  }),
  prepare_import: tool({
    description: "当老师希望上传或导入 Excel、CSV、JSON 等业务数据时，说明导入能力并打开确认式资料导入中心。",
    inputSchema: z.object({}),
    execute: async () => prepareImport(),
  }),
  search_imported_records: tool({
    description: "查询老师已经确认导入的平台数据，包括学生、学业、考勤、奖助、就业、活动、谈话、流程和知识记录。",
    inputSchema: z.object({ query: z.string().describe("老师的查询问题，应保留姓名、学号或业务关键词") }),
    execute: async ({ query }) => await searchImportedRecords(query, teacherId) ?? { tool: "search_imported_records", answer: "已导入数据中没有找到匹配记录。", cards: [] },
  }),
  search_source_documents: tool({
    description: "检索老师已确认上传的 Word、PDF、PPT、文本、邮件、聊天截图和图片资料，返回摘要、人物、日期和待办；原文件只在上传教师电脑本地保存。",
    inputSchema: z.object({ query: z.string().describe("资料主题、学生姓名、学号、文件类型或待办问题") }),
    execute: async ({ query }) => await searchSourceDocuments(query, { audience: "teacher", teacherId }) ?? { tool: "search_source_documents", answer: "已确认资料中没有找到匹配内容。", cards: [] },
  }),
});

async function summarizeStudentRequests(input: { status?: string; className?: string } = {}, teacherId: string): Promise<CapabilityResult> {
  const data = await listStudentRequests({ ...input, teacherId });
  const rows = data.requests as Array<Record<string, unknown>>;
  const statusLabels: Record<string, string> = { new: "待处理", processing: "处理中", resolved: "已完成" };
  const categories = Object.entries(rows.reduce<Record<string, number>>((acc, row) => {
    const category = String(row.category ?? "其他诉求"); acc[category] = (acc[category] ?? 0) + 1; return acc;
  }, {})).sort((a, b) => b[1] - a[1]).slice(0, 3);
  return {
    tool: "search_student_requests",
    answer: rows.length ? `当前共 ${rows.length} 条匹配诉求，其中待处理 ${data.metrics.new} 条、处理中 ${data.metrics.processing} 条。主要类别：${categories.map(([name, count]) => `${name}${count}条`).join("、")}。` : "当前筛选条件下没有学生诉求。",
    cards: rows.slice(0, 6).map((row) => ({ type: "task", title: String(row.title), subtitle: `${row.student_name} · ${row.class_name} · ${row.summary}`, badge: statusLabels[String(row.status)] ?? String(row.status), href: "/requests" })),
    actions: [{ label: "打开学生诉求中心", href: "/requests", primary: true }],
    suggestions: ["只看待处理诉求", "按班级汇总诉求", "查看迎新准备进度"],
  };
}

function isCapabilityResult(value: unknown): value is CapabilityResult {
  if (!value || typeof value !== "object") return false;
  const result = value as { tool?: unknown; answer?: unknown };
  return typeof result.tool === "string" && typeof result.answer === "string";
}

export async function runAssistantAgent(input: {
  message: string;
  teacherId: string;
  history?: Array<{ role: "user" | "assistant"; text: string }>;
  disableExternalAi?: boolean;
}): Promise<AssistantReply> {
  const config = await getActiveAiConfig(input.teacherId, { disableExternalAi: input.disableExternalAi });
  if (!config) {
    const localReply = await runCampusAssistant(input.message, input.teacherId);
    const wantsRequests = /诉求|留言|数字人|学生消息/.test(input.message);
    const wantsImported = /导入|上传|刚才|文件中的|表格中的/.test(input.message);
    const wantsDocuments = /资料|材料|文件|通知|制度|政策|依据|截图|上传|word|pdf/i.test(input.message);
    const [imported, documents, requests] = await Promise.all([wantsImported ? searchImportedRecords(input.message, input.teacherId) : null, wantsDocuments ? searchSourceDocuments(input.message, { audience: "teacher", teacherId: input.teacherId }) : null, wantsRequests ? summarizeStudentRequests({}, input.teacherId) : null]);
    if (requests) return mergeModelResults("", [requests]);
    let reply = localReply;
    if (imported) reply = mergeReplyWithCapability(reply, imported);
    if (documents) reply = mergeReplyWithCapability(reply, documents);
    if (requests) reply = mergeReplyWithCapability(reply, requests);
    return reply;
  }

  try {
    const provider = createOpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseURL,
    });
    const messages: ModelMessage[] = [
      ...(input.history ?? []).slice(-8).map((message) => ({ role: message.role, content: message.text }) as ModelMessage),
      { role: "user", content: input.message },
    ];
    const result = await generateText({
      model: provider.chat(config.model),
      system: SYSTEM_PROMPT,
      messages,
      tools: createCampusTools(input.teacherId),
      providerOptions: config.provider === "zhipu" ? { openai: { reasoningEffort: "low" } } : undefined,
      stopWhen: stepCountIs(6),
    });
    const toolResults = result.steps
      .flatMap((step) => step.toolResults)
      .map((item) => ("output" in item ? item.output : undefined))
      .filter(isCapabilityResult);
    if (toolResults.length) return mergeModelResults(result.text, toolResults);
    const localReply = await runCampusAssistant(input.message, input.teacherId);
    const [documents, requests] = await Promise.all([searchSourceDocuments(input.message, { audience: "teacher", teacherId: input.teacherId }), /诉求|留言|数字人|学生消息/.test(input.message) ? summarizeStudentRequests({}, input.teacherId) : null]);
    const merged = requests ? mergeModelResults("", [requests]) : documents ? mergeReplyWithCapability(localReply, documents) : localReply;
    return { ...merged, answer: result.text.trim() || merged.answer, mode: "model+campus-tools" };
  } catch (error) {
    console.error("assistant model fallback", error);
    return await runCampusAssistant(input.message, input.teacherId);
  }
}
