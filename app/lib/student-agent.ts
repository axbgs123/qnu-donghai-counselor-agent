import { createOpenAI } from "@ai-sdk/openai";
import { generateText } from "ai";
import { getActiveAiConfig } from "./ai-config";

export type StudentChatMessage = {
  role: "student" | "assistant";
  text: string;
  resolution?: "resolved" | "unresolved";
  resolutionBy?: "assistant" | "teacher";
  kind?: "inquiry" | "message";
};
export type StudentIntent = "inquiry" | "message";
export type StudentCategory = "迎新咨询" | "请假考勤" | "生活事务" | "班级事务" | "学业问题" | "奖助咨询" | "其他诉求";

export type StudentChatResult = {
  reply: string;
  intent: StudentIntent;
  category: StudentCategory;
  title: string;
  summary: string;
  urgency: "normal" | "urgent";
  ready: boolean;
  needsResolutionCheck: boolean;
  sources?: Array<{ title: string; detail?: string }>;
};

export function inferStudentCategory(text: string): StudentCategory {
  if (/迎新|报到|新生|志愿者|军训|录取通知书/.test(text)) return "迎新咨询";
  if (/请假|迟到|考勤|旷课|销假/.test(text)) return "请假考勤";
  if (/宿舍|住宿|外宿|床位|舍友|生活/.test(text)) return "生活事务";
  if (/班干|班委|竞选|班级|团支部/.test(text)) return "班级事务";
  if (/课程|成绩|挂科|学分|学习|选课/.test(text)) return "学业问题";
  if (/奖学金|助学金|资助|困难认定|评优/.test(text)) return "奖助咨询";
  return "其他诉求";
}

export function classifyStudentIntent(text: string): StudentIntent {
  const value = text.trim();
  const asksQuestion = /[?？]|怎么|如何|什么|哪里|哪儿|几号|何时|什么时候|是否|能不能|可不可以|需要哪些|怎么办|规定|流程|要求|多少|多久/.test(value);
  const explicitMessage = /我要请假|我想请假|申请请假|帮我请假|希望老师|请老师|麻烦老师|帮我处理|我要申请|我想申请|申请外宿|申请调宿|我要反馈|我想反馈|投诉|报修|不能参加|无法参加|身体不适|信息不一致|有冲突|需要老师/.test(value);
  const statedProblem = /坏了|丢了|受伤|不舒服|不一致|被扣|冲突|无法|没法|遗漏|错误/.test(value);
  if (explicitMessage || (statedProblem && !asksQuestion)) return "message";
  return asksQuestion ? "inquiry" : "message";
}

export function faithfulStudentSummary(messages: StudentChatMessage[]) {
  const originals = messages.filter((message) => message.role === "student").map((message) => message.text.trim()).filter(Boolean);
  return originals.map((text, index) => `第${index + 1}次学生原话：${text}`).join("\n").slice(0, 4000);
}

function baseResult(messages: StudentChatMessage[], intent: StudentIntent): Omit<StudentChatResult, "reply" | "needsResolutionCheck"> {
  const summary = faithfulStudentSummary(messages);
  const original = messages.filter((message) => message.role === "student").at(-1)?.text.trim() ?? "学生事项";
  const category = inferStudentCategory(original);
  return {
    intent,
    category,
    title: `${category}｜${original.replace(/\s+/g, " ").slice(0, 42)}`,
    summary,
    urgency: /今天|马上|紧急|无法报到|没地方住|受伤|安全/.test(original) ? "urgent" : "normal",
    ready: intent === "message",
  };
}

export function createStudentMessageResult(messages: StudentChatMessage[]): StudentChatResult {
  return {
    ...baseResult(messages, "message"),
    reply: "已为你原样留言给负责老师。你可以在“我的诉求”中查看处理进度。",
    needsResolutionCheck: false,
  };
}

export async function answerStudentInquiry(input: {
  messages: StudentChatMessage[];
  student: { name: string; class_name: string };
  evidence: string;
  sources: Array<{ title: string; detail?: string }>;
  teacherId: string;
  disableExternalAi?: boolean;
}): Promise<StudentChatResult> {
  const common = baseResult(input.messages, "inquiry");
  if (!input.evidence.trim()) return {
    ...common,
    ready: false,
    needsResolutionCheck: true,
    sources: input.sources,
    reply: "此知识我暂未学会，请通过留言的方式询问教师。",
  };
  let reply = input.evidence.trim();
  const config = await getActiveAiConfig(input.teacherId, { disableExternalAi: input.disableExternalAi });
  if (config) {
    try {
      const openai = createOpenAI({ apiKey: config.apiKey, baseURL: config.baseURL });
      const question = input.messages.filter((message) => message.role === "student").at(-1)?.text ?? "";
      const result = await generateText({
        model: openai.chat(config.model),
        providerOptions: config.provider === "zhipu" ? { openai: { reasoningEffort: "low" } } : undefined,
        system: "你是泉州师范学院东海校区学生服务问答助手。只能依据提供的学校资料回答，不推测、不补写。先直接回答，再用短句列出关键时间、材料或操作，并在末尾列出引用的资料标题。若资料与问题不直接相关、资料有冲突或资料不足，只回复：此知识我暂未学会，请通过留言的方式询问教师。不要承诺老师审批结果。不要使用Markdown粗体符号。",
        prompt: `学生：${input.student.name}（${input.student.class_name}）\n问题：${question}\n\n可用学校资料：\n${input.evidence.slice(0, 8000)}`,
      });
      if (result.text.trim()) {
        const generated = result.text.trim();
        if (/此知识我暂未学会|无法确认|资料(?:不足|中没有|未提及)|没有(?:找到|提供).*资料|不直接相关/.test(generated)) {
          return { ...common, ready: false, needsResolutionCheck: true, sources: [], reply: "此知识我暂未学会，请通过留言的方式询问教师。" };
        }
        reply = generated;
      }
    } catch (error) {
      console.error("student inquiry model fallback", error);
    }
  }
  return { ...common, ready: false, needsResolutionCheck: true, sources: input.sources, reply };
}
