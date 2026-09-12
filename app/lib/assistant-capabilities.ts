import { listSourceDocuments } from "./import-storage";
import { ensurePlatformSchema, getPlatformReport, listPlatformStudents, listWorkflowCases } from "./platform-storage";

export type AssistantSource = {
  title: string;
  updatedAt: string;
  scope?: string;
};

export type AssistantCard = {
  type: "student" | "document" | "workflow" | "task" | "draft" | "metric";
  title: string;
  subtitle?: string;
  badge?: string;
  href?: string;
  rows?: Array<{ label: string; value: string }>;
};

export type AssistantAction = {
  label: string;
  action?: string;
  href?: string;
  context?: string;
  primary?: boolean;
};

export type CapabilityResult = {
  tool: string;
  answer: string;
  cards?: AssistantCard[];
  sources?: AssistantSource[];
  actions?: AssistantAction[];
  suggestions?: string[];
};

export type AssistantReply = {
  answer: string;
  cards: AssistantCard[];
  sources: AssistantSource[];
  actions: AssistantAction[];
  suggestions: string[];
  tools: string[];
  mode: "campus-tools" | "model+campus-tools";
};

export const capabilityCatalog = [
  { id: "search_student_requests", label: "学生诉求汇总", description: "汇总当前教师负责学生通过辅导员数字人提交的诉求与处理状态。", readOnly: true },
  { id: "search_students", label: "学生档案查询", description: "按姓名、学号、班级、状态和标签检索学生。", readOnly: true },
  { id: "search_knowledge", label: "校务知识检索", description: "检索制度、通知、流程、指南和有效版本。", readOnly: true },
  { id: "list_tasks", label: "待办与日程", description: "汇总今日待办、时间、优先级和业务模块。", readOnly: true },
  { id: "inspect_workflow", label: "事项流程解析", description: "给出学生工作事项的节点、数量和当前状态。", readOnly: true },
  { id: "draft_material", label: "材料生成", description: "生成通知、班会方案、谈话提纲、办理清单和工作总结。", readOnly: true },
  { id: "campus_snapshot", label: "工作概览", description: "综合学生、事项、班级与知识库数据形成工作概览。", readOnly: true },
  { id: "prepare_import", label: "智能资料导入", description: "识别结构化文件、映射字段、校验并在确认后保存。", readOnly: true },
  { id: "search_source_documents", label: "多模态资料检索", description: "检索已确认的 Word、PDF、PPT、聊天截图和图片资料。", readOnly: true },
] as const;

const compact = (value: string) => value.toLowerCase().replace(/[\s，。、“”‘’：；！？,.!?:;()（）/\-]/g, "");

function includesAny(message: string, words: string[]) {
  const value = compact(message);
  return words.some((word) => value.includes(compact(word)));
}

function uniqueBy<T>(items: T[], getKey: (item: T) => string) {
  return [...new Map(items.map((item) => [getKey(item), item])).values()];
}

export async function searchStudents(input: { query?: string; status?: string } = {}, teacherId: string): Promise<CapabilityResult> {
  const students = await listPlatformStudents(teacherId);
  const query = compact(input.query ?? "");
  const status = input.status?.trim() ?? "";
  const matches = students.filter((student) => {
    const haystack = compact(`${student.name}${student.id}${student.grade}${student.className}${student.department}${student.status}${student.tags.join("")}`);
    return (!query || haystack.includes(query)) && (!status || student.status.includes(status));
  });
  const cards = matches.slice(0, 6).map<AssistantCard>((student) => ({
    type: "student",
    title: student.name,
    subtitle: `${student.id} · ${student.grade}级${student.className}`,
    badge: student.status,
    href: `/students/${student.id}`,
    rows: [
      { label: "学院", value: student.department },
      { label: "标签", value: student.tags.join("、") },
      { label: "联系", value: student.phone },
    ],
  }));
  const answer = matches.length
    ? `找到 ${matches.length} 名匹配学生。${matches.slice(0, 3).map((student) => `${student.name}（${student.status}）`).join("、")}${matches.length > 3 ? "等" : ""}。`
    : "没有找到匹配学生。可以换用姓名、学号、班级、学院或跟进状态查询。";
  return {
    tool: "search_students",
    answer,
    cards,
    actions: matches.length ? [
      { label: "导出当前名册", action: "export-students" },
      { label: "创建跟进任务", action: "create-followup", context: matches[0] ? `${matches[0].name}|${matches[0].id}` : "", primary: true },
    ] : [{ label: "批量添加学生", href: "/imports?type=students", primary: true }],
    suggestions: matches[0] ? [`查看${matches[0].name}的完整档案`, `为${matches[0].name}生成谈话提纲`] : ["查看全部重点跟进学生"],
  };
}

export async function searchKnowledge(input: { query?: string; category?: string } = {}, teacherId: string): Promise<CapabilityResult> {
  const knowledgeDocs = await listSourceDocuments(300, { audience: "teacher", teacherId });
  const query = compact(input.query ?? "");
  const category = input.category?.trim() ?? "";
  const synonyms: Record<string, string[]> = {
    请假: ["请假", "销假", "考勤"], 学业: ["学业", "学籍", "学分"],
    心理: ["心理", "危机", "转介"], 就业: ["就业", "毕业", "去向"], 班会: ["班会", "思想教育", "温暖集体"],
    奖助: ["奖助", "综合测评", "评优"], 征兵: ["征兵", "国防"],
  };
  const expanded = uniqueBy([
    input.query ?? "",
    ...Object.entries(synonyms).filter(([key]) => query.includes(key)).flatMap(([, values]) => values),
  ].map(compact).filter(Boolean), (item) => item);
  const matches = knowledgeDocs.filter((doc) => {
    const haystack = compact(`${doc.title}${doc.category}${doc.summary}${doc.extracted_text}${doc.file_name}`);
    const matchesQuery = !expanded.length || expanded.some((term) => haystack.includes(term));
    return matchesQuery && (!category || doc.category.includes(category));
  });
  return {
    tool: "search_knowledge",
    answer: matches.length
      ? `从已确认上传的资料中检索到 ${matches.length} 份相关内容。原件保存在上传教师的本机文件库。`
      : "知识库中暂未检索到直接匹配的资料，建议更换业务名称或查看全部知识目录。",
    cards: matches.slice(0, 5).map((doc) => ({
      type: "document",
      title: doc.title,
      subtitle: `${doc.category} · ${doc.file_name}`,
      badge: doc.review_status === "verified" ? "已确认" : "待复核",
      href: `/knowledge?localFile=${encodeURIComponent(doc.job_id)}`,
      rows: [{ label: "摘要", value: doc.summary || "暂无摘要" }, { label: "更新", value: doc.updated_at }],
    })),
    sources: matches.slice(0, 5).map((doc) => ({ title: doc.title, updatedAt: doc.updated_at, scope: doc.file_name })),
    actions: [
      { label: "打开知识库", href: "/knowledge", primary: true },
      { label: "导出知识目录", action: "export-knowledge" },
    ],
    suggestions: ["按这份依据生成办理清单", "检查资料是否需要更新"],
  };
}

export async function listTasks(input: { query?: string; priority?: string } = {}, teacherId: string): Promise<CapabilityResult> {
  const db = await ensurePlatformSchema();
  const rows = await db.prepare("SELECT id, title, module, due_at, priority, status FROM tasks WHERE owner_id = ? ORDER BY CASE status WHEN 'todo' THEN 0 WHEN 'doing' THEN 1 ELSE 2 END, COALESCE(due_at, created_at) LIMIT 100").bind(teacherId)
    .all<{ id: number; title: string; module: string; due_at: string | null; priority: string; status: string }>();
  const query = compact(input.query ?? "");
  const priority = input.priority?.trim() ?? "";
  const priorityMap: Record<string, string> = { "紧急": "urgent", "重要": "important", "常规": "normal" };
  const matches = rows.results.filter((task) => {
    const haystack = compact(`${task.title}${task.module}${task.priority}${task.status}`);
    return (!query || haystack.includes(query)) && (!priority || task.priority === (priorityMap[priority] || priority));
  });
  const urgent = matches.filter((task) => task.priority === "urgent").length;
  const priorityLabel: Record<string, string> = { urgent: "紧急", important: "重要", normal: "常规" };
  return {
    tool: "list_tasks",
    answer: `当前共有 ${matches.length} 项匹配工作，其中 ${urgent} 项紧急。${matches[0] ? `最靠前的一项是“${matches[0].title}”。` : "当前没有匹配待办。"}`,
    cards: matches.map((task) => ({
      type: "task",
      title: `${task.due_at ? task.due_at.slice(0, 16).replace("T", " ") : "未设日期"} · ${task.title}`,
      subtitle: `${task.module} · ${task.status === "done" ? "已完成" : task.status === "doing" ? "进行中" : "待办理"}`,
      badge: priorityLabel[task.priority] || task.priority,
    })),
    actions: [{ label: "添加个人待办", action: "add-task", primary: true }, { label: "打开今日工作台", href: "/" }],
    suggestions: ["只看紧急待办", "把本周到期待办整理成检查清单"],
  };
}

export async function inspectWorkflow(input: { query?: string } = {}, teacherId: string): Promise<CapabilityResult> {
  const cases = await listWorkflowCases(teacherId);
  const query = compact(input.query ?? "");
  const aliases: Record<string, string[]> = {
    "请销假": ["请假", "销假", "考勤"], "心理支持": ["心理", "转介", "危机"],
    "就业困难帮扶": ["就业", "求职"], "学业预警": ["学业", "预警", "旷课"],
    "奖助评优": ["奖助", "资助", "奖学金", "评优"], "主题班会": ["班会", "班团", "温暖集体"], "四个100%": ["100%", "运动", "竞赛", "志愿", "社团"],
    "迎新与军训": ["迎新", "新生", "军训"], "毕业与离校": ["毕业", "离校", "档案"], "国防与征兵": ["国防", "征兵", "入伍"],
  };
  const templates = Object.entries(aliases).map(([name]) => ({ name, steps: ({
    "请销假": ["信息核对", "辅导员处理", "结果记录"], "心理支持": ["线索记录", "初步沟通", "转介或回访"],
    "就业困难帮扶": ["目标确认", "材料辅导", "结果跟进"], "学业预警": ["依据核对", "学生谈话", "帮扶跟进"],
    "奖助评优": ["材料收集", "班级评议", "结果归档"], "主题班会": ["确定主题", "组织开展", "总结归档"],
    "四个100%": ["数据汇总", "缺项提醒", "结果登记"], "迎新与军训": ["报到核验", "入学教育", "适应回访"],
    "毕业与离校": ["去向核对", "材料确认", "未就业跟进"], "国防与征兵": ["意向登记", "报名指导", "学籍衔接"],
  } as Record<string, string[]>)[name] || ["信息确认", "办理", "归档"] }));
  const matches = templates.filter((workflow) => {
    const terms = [workflow.name, ...(aliases[workflow.name] ?? [])].map(compact);
    return !query || terms.some((term) => query.includes(term) || term.includes(query));
  });
  const selected = matches.length ? matches : templates.slice(0, 4);
  return {
    tool: "inspect_workflow",
    answer: matches.length
      ? `${matches.map((workflow) => `“${workflow.name}”当前 ${cases.filter((item) => item.type === workflow.name && item.status !== "closed").length} 项正在办理`).join("；")}。办理节点已列在下方。`
      : "没有识别出唯一流程，先列出最常用的四类学生工作流程。",
    cards: selected.slice(0, 4).map((workflow) => ({
      type: "workflow",
      title: workflow.name,
      subtitle: workflow.steps.map((step, index) => `${index + 1}.${step}`).join("  →  "),
      badge: `${cases.filter((item) => item.type === workflow.name && item.status !== "closed").length}项`,
      rows: [{ label: "数据", value: "来自事项台账" }],
    })),
    actions: [{ label: "发起该流程", action: "create-flow", context: selected[0]?.name ?? "学生工作事项", primary: true }, { label: "筛选已有事项", action: "filter-cases" }],
    suggestions: selected[0] ? [`为${selected[0].name}生成材料清单`, `查看${selected[0].name}相关依据`] : [],
  };
}

function inferMaterialType(message: string) {
  if (includesAny(message, ["通知", "告知", "提醒"])) return "通知";
  if (includesAny(message, ["班会", "班团", "活动方案"])) return "班会方案";
  if (includesAny(message, ["谈话", "家长沟通", "访谈"])) return "谈话提纲";
  if (includesAny(message, ["总结", "汇报", "月报"])) return "工作总结";
  return "执行清单";
}

export function draftMaterial(input: { request: string; type?: string }): CapabilityResult {
  const request = input.request.trim();
  const type = input.type?.trim() || inferMaterialType(request);
  const isFreshman = includesAny(request, ["新生", "迎新", "入学"]);
  const isStudy = includesAny(request, ["学业", "预警", "旷课", "考研"]);
  const isMeeting = type === "班会方案";
  let draft = "";

  if (type === "通知") {
    const subject = isFreshman ? "新生入学适应主题班会" : isStudy ? "学业情况沟通与帮扶安排" : request.replace(/^(请|帮我|生成|起草|写一份?)/g, "") || "学生工作事项";
    draft = `【${subject}通知】\n各位同学：\n为做好${subject}相关工作，现定于【日期】【时间】在【地点】开展相关活动。\n一、参加对象：【班级／学生范围】\n二、主要内容：情况说明、重点事项提醒、学生交流与问题收集。\n三、准备要求：请提前安排时间，携带必要材料，并于【截止时间】前反馈特殊情况。\n请大家准时参加。收到请回复“已知悉”。\n\n辅导员：【教师姓名】\n【发布日期】`;
  } else if (isMeeting) {
    const theme = isFreshman ? "从陌生到同行——新生适应与温暖集体建设" : request.replace(/^(请|帮我|生成|起草|写一份?)/g, "") || "温暖集体建设";
    draft = `主题：${theme}\n目标：完成规则共识、同伴连接、需求摸排和后续任务沉淀。\n流程（45分钟）：\n1. 破冰与签到（5分钟）：关键词自我介绍。\n2. 情境讨论（10分钟）：围绕学习、宿舍、网络与安全设置四个情境。\n3. 小组共创（15分钟）：形成班级公约与互助清单。\n4. 资源说明（8分钟）：介绍辅导员、班委、心理朋辈和社区服务站。\n5. 匿名反馈（5分钟）：收集当前困难、希望获得的支持。\n6. 总结与任务确认（2分钟）：明确负责人和回访时间。\n留档：签到表、现场照片、班级公约、问题清单、班会纪要。`;
  } else if (type === "谈话提纲") {
    draft = `谈话目标：了解事实、识别需求、共同形成下一步计划。\n1. 开场：说明谈话目的，使用开放式问题了解学生近况。\n2. 事实核对：时间、事件、频次、已采取行动及影响。\n3. 状态了解：学习、生活、宿舍关系、家庭支持和个人感受。\n4. 资源盘点：学生可用资源、班级支持、学校服务和现实限制。\n5. 共同行动：确定1—3项可执行事项、负责人和完成时间。\n6. 结束确认：请学生复述计划，约定下次回访时间。\n记录字段：谈话摘要、学生诉求、已提供支持、待跟进事项、回访日期。`;
  } else if (type === "工作总结") {
    draft = `一、总体情况\n本阶段围绕学生日常事务、学业发展、班级建设和就业支持推进工作。\n二、已完成事项\n- 完成重点学生联系与回访；\n- 推进在办流程并核对材料；\n- 开展班级走访与谈心，收集学生诉求；\n- 更新相关工作台账。\n三、发现问题\n按“对象—事实—影响—已采取措施”记录，避免只写结论。\n四、下一步安排\n明确事项、负责人、截止时间和复核方式。\n五、附件\n学生清单、过程记录、数据汇总与相关依据。`;
  } else {
    const items = isStudy
        ? ["核对成绩、考勤与课程事实", "确认预警等级和适用依据", "安排学生谈话并形成记录", "按需要完成家长或监护人沟通", "制定帮扶措施并约定复核时间"]
        : ["确认对象、范围与截止时间", "检索当前有效制度和通知", "准备名单、表格与沟通材料", "按节点推进并记录负责人", "办结后回访并归档"];
    draft = `${request || "学生工作事项"}\n${items.map((item, index) => `${index + 1}. □ ${item}`).join("\n")}`;
  }

  return {
    tool: "draft_material",
    answer: `已生成“${type}”草稿，时间、地点、对象等占位内容需要由老师确认后使用。\n\n${draft}`,
    cards: [{ type: "draft", title: type, subtitle: request, badge: "可编辑", rows: [{ label: "状态", value: "待老师核对" }] }],
    actions: [
      { label: "加入个人待办", action: "add-answer-task", context: `${type}：${request}`, primary: true },
      { label: "发起配套流程", action: "create-flow", context: request },
    ],
    suggestions: ["把这份草稿改得更正式", "补充签到表和过程纪要模板", "查找相关校内依据"],
  };
}

export async function campusSnapshot(teacherId: string): Promise<CapabilityResult> {
  const report = await getPlatformReport(teacherId);
  const students = await listPlatformStudents(teacherId);
  const attention = students.filter((student) => student.status !== "正常");
  const cases = await listWorkflowCases(teacherId);
  const db = await ensurePlatformSchema();
  const urgent = await db.prepare("SELECT title FROM tasks WHERE owner_id = ? AND priority = 'urgent' AND status != 'done' ORDER BY due_at LIMIT 20").bind(teacherId).all<{ title: string }>();
  return {
    tool: "campus_snapshot",
    answer: `当前数据库中有 ${students.length} 名学生、${attention.length} 名被明确标记为需要跟进、${urgent.results.length} 项未完成紧急待办、${cases.filter((item) => item.status !== "closed").length} 项正在办理。`,
    cards: [
      { type: "metric", title: "专项跟进", subtitle: attention.map((student) => student.name).join("、"), badge: `${attention.length}人` },
      { type: "metric", title: "紧急待办", subtitle: urgent.results.map((task) => task.title).join("、"), badge: `${urgent.results.length}项` },
      { type: "metric", title: "开放事项", subtitle: "来自统一事项台账", badge: `${cases.filter((item) => item.status !== "closed").length}项` },
      { type: "metric", title: "知识资料", subtitle: `${report.knowledge.verified}份已确认`, badge: `${report.knowledge.total}份` },
    ],
    actions: [{ label: "查看今日待办", href: "/", primary: true }, { label: "查看学生档案", href: "/students" }],
    suggestions: ["列出今天的紧急待办", "查看重点跟进学生", "检查本周到期流程"],
  };
}

export function prepareImport(): CapabilityResult {
  return {
    tool: "prepare_import",
    answer: "可以统一导入 Excel、Word、PDF、PPT、文本、邮件和聊天截图。表格会做字段映射与逐行校验；文档和图片会提取正文、人物、学号、日期与待办，确认后进入助手可检索资料库。",
    cards: [{ type: "draft", title: "智能资料导入", subtitle: "业务表格、Word/PDF/PPT、通知制度、学生材料、聊天截图", badge: "多模态" }],
    actions: [{ label: "打开资料导入中心", href: "/imports", primary: true }],
    suggestions: ["导入学生名单需要哪些字段", "导入学业预警表", "查看最近导入的数据"],
  };
}

function inferStudentQuery(message: string) {
  const status = ["重点跟进", "就业帮扶", "回访中", "升学跟进", "正常"].find((item) => message.includes(item));
  const studentNo = message.match(/[A-Za-z0-9_-]{6,24}/)?.[0];
  const name = message.match(/[\u4e00-\u9fa5]{2,5}(?=同学|学生|的档案|的情况)/)?.[0]?.replace(/^(?:查看|查询|看看|关于|找|看)/, "");
  const tag = ["考研", "就业", "竞赛", "志愿服务", "志愿", "社团", "适应", "心理朋辈"].find((item) => message.includes(item));
  return { query: studentNo || name || tag, status };
}

function inferKnowledgeQuery(message: string) {
  const terms = ["留校", "外宿", "通学", "学业", "心理", "就业", "毕业", "班会", "奖助", "征兵", "国防", "100%"];
  return terms.find((term) => message.includes(term)) ?? message;
}

function mergeResults(results: CapabilityResult[], mode: AssistantReply["mode"] = "campus-tools"): AssistantReply {
  const cards = uniqueBy(results.flatMap((result) => result.cards ?? []), (card) => `${card.type}:${card.title}`);
  const sources = uniqueBy(results.flatMap((result) => result.sources ?? []), (source) => source.title);
  const actions = uniqueBy(results.flatMap((result) => result.actions ?? []), (action) => `${action.action ?? action.href}:${action.label}`);
  const suggestions = uniqueBy(results.flatMap((result) => result.suggestions ?? []), (suggestion) => suggestion).slice(0, 4);
  return {
    answer: results.map((result) => result.answer).filter(Boolean).join("\n\n"),
    cards: cards.slice(0, 8),
    sources: sources.slice(0, 6),
    actions: actions.slice(0, 4),
    suggestions,
    tools: uniqueBy(results.map((result) => result.tool), (tool) => tool),
    mode,
  };
}

export async function runCampusAssistant(message: string, teacherId: string): Promise<AssistantReply> {
  const results: CapabilityResult[] = [];
  const wantsDraft = includesAny(message, ["生成", "起草", "写", "通知", "方案", "清单", "提纲", "总结", "整理"]);
  const wantsStudents = includesAny(message, ["学生", "同学", "名单", "学号", "重点跟进", "就业帮扶", "回访中", "升学跟进", "学生档案"])
    && !includesAny(message, ["学生工作流程", "学生事务流程", "四个100%", "100%缺项", "导入的数据", "导入的学生", "刚才导入", "上传的数据"]);
  const wantsKnowledge = includesAny(message, ["依据", "政策", "制度", "规定", "办法", "指南", "资料", "知识库", "哪份文件"]);
  const wantsTasks = includesAny(message, ["今天", "待办", "日程", "安排", "到期", "要做什么"]);
  const wantsWorkflow = includesAny(message, ["流程", "办理", "步骤", "怎么做", "如何处理", "请假", "预警", "奖助", "心理转介", "四个100%", "征兵", "迎新", "毕业离校"]);
  const wantsImport = includesAny(message, ["我要导入", "想导入", "开始导入", "怎么导入", "上传表格", "上传excel", "上传文件", "上传word", "上传pdf", "上传截图", "聊天截图", "excel表", "csv文件"]);

  if (wantsImport) return mergeResults([prepareImport()]);
  if (wantsStudents) results.push(await searchStudents(inferStudentQuery(message), teacherId));
  if (wantsKnowledge) results.push(await searchKnowledge({ query: inferKnowledgeQuery(message) }, teacherId));
  if (wantsTasks) results.push(await listTasks({ priority: message.includes("紧急") ? "紧急" : undefined }, teacherId));
  if (wantsWorkflow && !wantsDraft) results.push(await inspectWorkflow({ query: message }, teacherId));
  if (wantsDraft) results.unshift(draftMaterial({ request: message }));
  if (!results.length || includesAny(message, ["概览", "总体", "工作情况", "你能做什么", "有什么能力"])) results.push(await campusSnapshot(teacherId));

  return mergeResults(results);
}

export function mergeModelResults(answer: string, results: CapabilityResult[]): AssistantReply {
  const merged = mergeResults(results, "model+campus-tools");
  return { ...merged, answer: answer.trim() || merged.answer };
}

export function mergeReplyWithCapability(reply: AssistantReply, result: CapabilityResult): AssistantReply {
  return {
    ...reply,
    answer: [reply.answer, result.answer].filter(Boolean).join("\n\n"),
    cards: uniqueBy([...reply.cards, ...(result.cards ?? [])], (card) => `${card.type}:${card.title}`).slice(0, 8),
    sources: uniqueBy([...reply.sources, ...(result.sources ?? [])], (source) => source.title).slice(0, 6),
    actions: uniqueBy([...reply.actions, ...(result.actions ?? [])], (action) => `${action.action ?? action.href}:${action.label}`).slice(0, 4),
    suggestions: uniqueBy([...reply.suggestions, ...(result.suggestions ?? [])], (suggestion) => suggestion).slice(0, 4),
    tools: uniqueBy([...reply.tools, result.tool], (tool) => tool),
  };
}
