import { createOpenAI } from "@ai-sdk/openai";
import { generateText, type ModelMessage, type UserContent } from "ai";
import { z } from "zod";
import type { MaterialAnalysis } from "./import-storage";
import { jsonObjectOutput } from "./json-object-output";
import { getActiveAiConfig } from "./ai-config";

export const structuredExtensions = new Set(["xlsx", "xls", "csv", "tsv", "json"]);
export const materialExtensions = new Set(["xlsx", "xls", "csv", "tsv", "json", "docx", "pdf", "pptx", "txt", "md", "html", "htm", "rtf", "eml", "xml", "png", "jpg", "jpeg", "webp", "gif"]);
export const imageExtensions = new Set(["png", "jpg", "jpeg", "webp", "gif"]);

const materialSchema = z.object({
  documentType: z.enum(["chat", "notice", "policy", "student_material", "meeting", "form", "report", "other"]),
  title: z.string(),
  category: z.string(),
  summary: z.string(),
  transcribedText: z.string(),
  people: z.array(z.string()),
  studentNos: z.array(z.string()),
  studentRecords: z.array(z.object({
    studentNo: z.string(), name: z.string(), className: z.string(), department: z.string(), grade: z.string(),
    gender: z.string(), phone: z.string(), status: z.string(), tags: z.string(),
  })),
  dates: z.array(z.object({ date: z.string(), event: z.string() })),
  tasks: z.array(z.object({ title: z.string(), owner: z.string(), dueAt: z.string(), relatedPeople: z.array(z.string()) })),
  tags: z.array(z.string()),
  confidence: z.number().min(0).max(1),
});

type ModelAnalysis = z.infer<typeof materialSchema>;

const ANALYSIS_PROMPT = `你是高校辅导员资料整理助手。请忠实读取资料，不补写不存在的信息。
把资料识别成：类型、标题、业务分类、摘要、涉及人员、学号、日期事件、明确或隐含待办、标签。
聊天截图要区分聊天参与者与正文中提到的人；日期无法确定年份时保留原文，不猜年份。
只有资料明确提出需要执行的事项才列为待办；负责人或截止时间不明时返回空字符串。
transcribedText 必须尽可能逐字保留图片、扫描件中的可见正文；如果输入已提供提取原文，则可返回空字符串。
confidence 表示识别内容本身的可信度，不是资料真实性。
只输出一个JSON对象，不要输出解释或Markdown，必须包含全部字段：
如果资料中包含学生名单、学生表单或多名学生信息，还要逐人提取 studentRecords。每条至少忠实对应原文中的学号、姓名和班级；缺少任一项就不要创建该条，其他不确定字段返回空字符串，严禁根据常识补写。
只输出一个JSON对象，不要输出解释或Markdown，必须包含全部字段：
{"documentType":"chat|notice|policy|student_material|meeting|form|report|other","title":"","category":"","summary":"","transcribedText":"","people":[],"studentNos":[],"studentRecords":[{"studentNo":"","name":"","className":"","department":"","grade":"","gender":"","phone":"","status":"","tags":""}],"dates":[{"date":"","event":""}],"tasks":[{"title":"","owner":"","dueAt":"","relatedPeople":[]}],"tags":[],"confidence":0.8}`;

function extensionOf(file: Pick<File, "name">) {
  return file.name.split(".").pop()?.toLowerCase() ?? "";
}

function decodeEntities(text: string) {
  const entities: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
  return text.replace(/&#(\d+);/g, (_, value) => String.fromCodePoint(Number(value)))
    .replace(/&#x([0-9a-f]+);/gi, (_, value) => String.fromCodePoint(parseInt(value, 16)))
    .replace(/&([a-z]+);/gi, (whole, name) => entities[name.toLowerCase()] ?? whole);
}

function stripMarkup(text: string) {
  return decodeEntities(text
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<\/(p|div|li|tr|h[1-6]|a:p)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " "))
    .replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

function decodeText(bytes: ArrayBuffer) {
  const utf8 = new TextDecoder("utf-8").decode(bytes);
  if (!utf8.includes("�")) return utf8;
  try { return new TextDecoder("gb18030").decode(bytes); } catch { return utf8; }
}

function stripRtf(text: string) {
  return text
    .replace(/\\u(-?\d+)\??/g, (_, value) => String.fromCharCode(Number(value) < 0 ? Number(value) + 65536 : Number(value)))
    .replace(/\\'([0-9a-f]{2})/gi, (_, value) => new TextDecoder("gb18030").decode(Uint8Array.of(parseInt(value, 16))))
    .replace(/\\[a-z]+-?\d* ?/gi, " ").replace(/[{}]/g, " ").replace(/\s+/g, " ").trim();
}

async function extractPptx(bytes: ArrayBuffer) {
  const { default: JSZip } = await import("jszip");
  const zip = await JSZip.loadAsync(bytes);
  const slides = Object.keys(zip.files).filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((a, b) => Number(a.match(/\d+/)?.[0]) - Number(b.match(/\d+/)?.[0]));
  const texts = await Promise.all(slides.map(async (name, index) => {
    const xml = await zip.file(name)?.async("string") ?? "";
    return `第${index + 1}页\n${stripMarkup(xml)}`;
  }));
  return texts.join("\n\n");
}

async function extractLocalText(file: File, bytes: ArrayBuffer) {
  const extension = extensionOf(file);
  if (structuredExtensions.has(extension)) {
    if (extension === "json") {
      const raw = decodeText(bytes);
      const parsed = JSON.parse(raw) as unknown;
      return { text: JSON.stringify(parsed, null, 2).slice(0, 180_000), method: "JSON资料提取", pages: null as number | null };
    }
    const XLSX = await import("xlsx");
    const workbook = extension === "csv" || extension === "tsv"
      ? XLSX.read(decodeText(bytes), { type: "string", cellDates: true })
      : XLSX.read(bytes, { type: "array", cellDates: true });
    const text = workbook.SheetNames.map((name) => `【工作表：${name}】\n${XLSX.utils.sheet_to_csv(workbook.Sheets[name], { FS: "\t" })}`).join("\n\n");
    return { text: text.slice(0, 180_000), method: "表格文字提取", pages: null as number | null };
  }
  if (extension === "docx") {
    const { default: mammoth } = await import("mammoth");
    const result = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
    return { text: result.value.trim(), method: "Word文字提取", pages: null as number | null };
  }
  if (extension === "pdf") {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(bytes));
    if (pdf.numPages > 80) throw new Error("PDF超过80页，请拆分后上传");
    const result = await extractText(pdf, { mergePages: true });
    return { text: result.text.trim(), method: "PDF文字提取", pages: result.totalPages };
  }
  if (extension === "pptx") return { text: await extractPptx(bytes), method: "演示文稿文字提取", pages: null };
  const raw = decodeText(bytes);
  if (["html", "htm", "xml"].includes(extension)) return { text: stripMarkup(raw), method: "网页文字提取", pages: null };
  if (extension === "rtf") return { text: stripRtf(raw), method: "RTF文字提取", pages: null };
  return { text: raw.trim(), method: extension === "eml" ? "邮件文字提取" : "文本读取", pages: null };
}

function uniq(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function localStudentRecords(text: string): MaterialAnalysis["studentRecords"] {
  const ignored = /^(学生|姓名|学号|班级|学院|年级|联系电话|手机号|状态|备注)$/;
  return text.split(/\r?\n/).flatMap((line) => {
    const studentNo = line.match(/\b(?:20)?\d{8,12}\b/)?.[0] ?? "";
    if (!studentNo) return [];
    const parts = line.split(/[\t,，;；|]+|\s{2,}/).map((part) => part.trim()).filter(Boolean);
    const className = parts.find((part) => /班$/.test(part) && part.length <= 24) ?? line.match(/[\u4e00-\u9fa5A-Za-z0-9]{1,18}(?:\d+|一|二|三|四|五)班/)?.[0] ?? "";
    const department = parts.find((part) => /学院$/.test(part) && part.length <= 24) ?? "";
    const phone = line.match(/(?<!\d)1\d{10}(?!\d)/)?.[0] ?? "";
    const name = parts.find((part) => /^[\u4e00-\u9fa5·]{2,8}$/.test(part) && !ignored.test(part) && part !== className && part !== department) ??
      line.replace(studentNo, " ").match(/(?<![\u4e00-\u9fa5])[\u4e00-\u9fa5·]{2,5}(?![\u4e00-\u9fa5])/)?.[0] ?? "";
    if (!name || !className) return [];
    return [{ studentNo, name, className, department, grade: /^20\d{2}/.test(studentNo) ? studentNo.slice(0, 4) : "", gender: "", phone, status: "", tags: "文档智能识别" }];
  });
}

function localAnalysis(fileName: string, text: string, method: string): MaterialAnalysis {
  const normalized = text.replace(/\s+/g, " ").trim();
  const firstLine = text.split(/\r?\n/).map((line) => line.trim()).find(Boolean) ?? fileName.replace(/\.[^.]+$/, "");
  const documentType: MaterialAnalysis["documentType"] = /微信|聊天|群聊|发言|消息/.test(text) ? "chat"
    : /通知|公告|关于.+的/.test(text) ? "notice"
      : /办法|规定|制度|细则|条例/.test(text) ? "policy"
        : /会议|纪要|签到/.test(text) ? "meeting"
          : /总结|报告|汇报/.test(text) ? "report"
            : /申请|登记表|审批表/.test(text) ? "form"
              : /学生|学号|班级|宿舍/.test(text) ? "student_material" : "other";
  const category = /就业|升学|考研/.test(text) ? "就业与升学" : /宿舍|住宿|外宿/.test(text) ? "学生生活资料"
    : /奖学金|助学金|资助|评优/.test(text) ? "奖助评优" : /请假|考勤|旷课/.test(text) ? "考勤请假"
      : /学业|成绩|挂科|学分/.test(text) ? "学业管理" : /心理|谈心|情绪/.test(text) ? "谈心关怀"
        : /班会|团建|思想/.test(text) ? "思想教育" : /制度|规定|办法/.test(text) ? "制度文件" : "综合资料";
  const studentNos = uniq(text.match(/\b(?:20)?\d{8,12}\b/g) ?? []);
  const studentRecords = localStudentRecords(text);
  const people = uniq([...text.matchAll(/(?:姓名|学生|同学|联系人|负责人)[：:\s]*([\u4e00-\u9fa5·]{2,8})/g)].map((match) => match[1])).slice(0, 30);
  const dateMatches = uniq(text.match(/(?:20\d{2}[年./-])?\d{1,2}[月./-]\d{1,2}日?(?:\s*\d{1,2}[:：]\d{2})?/g) ?? []).slice(0, 30);
  const taskLines = text.split(/\r?\n/).map((line) => line.trim()).filter((line) => /请|需|须|务必|截止|完成|提交|反馈|填报|提醒/.test(line) && line.length >= 5 && line.length <= 180).slice(0, 20);
  return {
    title: firstLine.slice(0, 80), category, documentType,
    summary: normalized.slice(0, 300) || "未提取到可读正文",
    extractedText: text.slice(0, 650_000), people, studentNos, studentRecords,
    dates: dateMatches.map((date) => ({ date, event: "原文出现的时间" })),
    tasks: taskLines.map((title) => ({ title, owner: "", dueAt: "", relatedPeople: [] })),
    tags: uniq([category, documentType === "chat" ? "聊天记录" : "", ...people.slice(0, 4)]),
    confidence: normalized.length >= 80 ? 0.64 : 0.42,
    processingMethod: method,
    needsReview: true,
  };
}

async function modelAnalyze(input: { file: Pick<File, "name" | "type">; bytes: ArrayBuffer; extractedText?: string; teacherId: string; disableExternalAi?: boolean; modelTextLimit?: number }) {
  const config = await getActiveAiConfig(input.teacherId, { disableExternalAi: input.disableExternalAi });
  if (!config) return null;
  if (!input.extractedText && !config.vision) {
    throw new Error(`当前模型 ${config.modelName} 不支持图片，请在平台设置切换到带“图片识别”标记的模型`);
  }
  const openai = createOpenAI({ apiKey: config.apiKey, baseURL: config.baseURL });
  const content: UserContent = [{
    type: "text",
    text: input.extractedText
      ? `${ANALYSIS_PROMPT}\n\n文件名：${input.file.name}\n\n已提取原文：\n${input.extractedText.slice(0, input.modelTextLimit ?? 100_000)}`
      : `${ANALYSIS_PROMPT}\n\n文件名：${input.file.name}`,
  }];
  if (!input.extractedText) content.push({
    type: "file", data: new Uint8Array(input.bytes), mediaType: input.file.type || (extensionOf(input.file) === "pdf" ? "application/pdf" : "image"), filename: input.file.name,
  });
  const result = await generateText({
    model: openai.chat(config.model),
    output: jsonObjectOutput(materialSchema),
    providerOptions: { openai: { ...(config.provider === "zhipu" ? { reasoningEffort: "low" } : {}), strictJsonSchema: false } },
    messages: [{ role: "user", content } as ModelMessage],
  });
  return result.output;
}

function mergeModel(fileName: string, local: MaterialAnalysis | null, model: ModelAnalysis, method: string): MaterialAnalysis {
  return {
    title: model.title.trim() || local?.title || fileName.replace(/\.[^.]+$/, ""),
    category: model.category.trim() || local?.category || "综合资料",
    documentType: model.documentType,
    summary: model.summary.trim() || local?.summary || "",
    extractedText: (local?.extractedText || model.transcribedText).slice(0, 650_000),
    people: uniq(model.people), studentNos: uniq(model.studentNos), studentRecords: model.studentRecords.length ? model.studentRecords : local?.studentRecords ?? [], dates: model.dates,
    tasks: model.tasks, tags: uniq(model.tags), confidence: model.confidence,
    processingMethod: method, needsReview: model.confidence < 0.8,
  };
}

export async function analyzeMaterial(file: File, bytes: ArrayBuffer, options: { teacherId: string; disableExternalAi?: boolean }) {
  const extension = extensionOf(file);
  if (!materialExtensions.has(extension)) throw new Error("不支持该文件类型");
  if (imageExtensions.has(extension)) {
    const model = await modelAnalyze({ file, bytes, teacherId: options.teacherId, disableExternalAi: options.disableExternalAi });
    if (!model) throw new Error("聊天截图和图片需要先在平台设置中配置视觉模型（带图片识别能力）");
    return mergeModel(file.name, null, model, "AI视觉识别");
  }
  const extracted = await extractLocalText(file, bytes);
  if (!extracted.text && extension === "pdf") {
    const model = await modelAnalyze({ file, bytes, teacherId: options.teacherId, disableExternalAi: options.disableExternalAi });
    if (!model) throw new Error("这是扫描版PDF，需要先配置视觉模型才能识别");
    return mergeModel(file.name, null, model, "扫描PDF视觉识别");
  }
  if (!extracted.text) throw new Error("没有从文件中提取到可读文字");
  const local = localAnalysis(file.name, extracted.text, extracted.method);
  try {
    const model = await modelAnalyze({ file, bytes, extractedText: extracted.text, teacherId: options.teacherId, disableExternalAi: options.disableExternalAi });
    return model ? mergeModel(file.name, local, model, `${extracted.method} + AI结构化识别`) : local;
  } catch (error) {
    console.error("material model fallback", error);
    return local;
  }
}

export async function analyzeExtractedMaterial(input: {
  fileName: string;
  mimeType: string;
  extractedText: string;
  processingMethod: string;
  teacherId: string;
  disableExternalAi?: boolean;
}) {
  const extractedText = input.extractedText.trim().slice(0, 650_000);
  if (!extractedText) throw new Error("没有从文件中提取到可读文字");
  const file = { name: input.fileName, type: input.mimeType || "text/markdown" };
  const local = localAnalysis(input.fileName, extractedText, input.processingMethod);
  try {
    const model = await modelAnalyze({
      file,
      bytes: new ArrayBuffer(0),
      extractedText,
      teacherId: input.teacherId,
      disableExternalAi: input.disableExternalAi,
      modelTextLimit: 24_000,
    });
    return model ? mergeModel(input.fileName, local, model, `${input.processingMethod} + AI摘要整理`) : local;
  } catch (error) {
    console.error("local markdown model fallback", error);
    return local;
  }
}
