export type ImportRecordType =
  | "students"
  | "dormitory"
  | "academic_warning"
  | "attendance"
  | "funding"
  | "employment"
  | "participation"
  | "student_record"
  | "workflow"
  | "knowledge";

export type ImportFieldType = "text" | "number" | "date" | "student_no" | "phone";

export type ImportFieldDefinition = {
  key: string;
  label: string;
  required?: boolean;
  type?: ImportFieldType;
  aliases: string[];
};

export type ImportDefinition = {
  type: ImportRecordType;
  label: string;
  description: string;
  icon: string;
  keyFields: string[];
  fields: ImportFieldDefinition[];
};

const field = (key: string, label: string, aliases: string[], options: Pick<ImportFieldDefinition, "required" | "type"> = {}): ImportFieldDefinition => ({ key, label, aliases: [label, ...aliases], ...options });

export const importDefinitions: Record<ImportRecordType, ImportDefinition> = {
  students: {
    type: "students", label: "学生基础档案", icon: "生", description: "学生名单、联系方式、班级与基础状态", keyFields: ["studentNo"],
    fields: [
      field("studentNo", "学号", ["学生学号", "studentno", "studentid", "id"], { required: true, type: "student_no" }),
      field("name", "姓名", ["学生姓名", "名字", "name"], { required: true }),
      field("gender", "性别", ["gender", "sex"]), field("department", "学院", ["院系", "所属学院", "department"]),
      field("grade", "年级", ["入学年级", "grade"]), field("className", "行政班", ["班级", "专业班级", "classname", "class"], { required: true }),
      field("community", "社区", ["宿舍社区", "园区", "community"]), field("building", "楼栋", ["宿舍楼", "公寓楼", "building"]),
      field("room", "房间", ["宿舍号", "寝室", "房间号", "room"]), field("phone", "手机号", ["联系电话", "手机", "电话", "mobile", "phone"], { type: "phone" }),
      field("status", "跟进状态", ["学生状态", "状态", "status"]), field("tags", "标签", ["学生标签", "备注标签", "tags"]),
    ],
  },
  dormitory: {
    type: "dormitory", label: "住宿与调宿", icon: "宿", description: "住宿分配、调宿、外宿和社区信息", keyFields: ["studentNo"],
    fields: [field("studentNo", "学号", ["学生学号", "studentid"], { required: true, type: "student_no" }), field("name", "姓名", ["学生姓名", "name"]),
      field("community", "社区", ["园区", "宿舍社区"], { required: true }), field("building", "楼栋", ["宿舍楼", "公寓楼"], { required: true }), field("room", "房间", ["宿舍号", "寝室", "房间号"], { required: true }),
      field("bed", "床位", ["床号", "bed"]), field("moveInDate", "入住日期", ["入住时间", "调整日期"], { type: "date" }), field("status", "住宿状态", ["入住状态", "外宿状态", "状态"]), field("remark", "备注", ["说明", "原因"])],
  },
  academic_warning: {
    type: "academic_warning", label: "学业与预警", icon: "学", description: "成绩、挂科、学分、预警等级与帮扶", keyFields: ["studentNo", "term", "course"],
    fields: [field("studentNo", "学号", ["学生学号", "studentid"], { required: true, type: "student_no" }), field("name", "姓名", ["学生姓名", "name"]), field("term", "学期", ["学年学期", "semester"], { required: true }),
      field("course", "课程", ["课程名称", "科目", "course"], { required: true }), field("score", "成绩", ["分数", "score"], { type: "number" }), field("credits", "学分", ["课程学分", "credit"], { type: "number" }),
      field("warningLevel", "预警等级", ["预警级别", "预警类型", "level"]), field("status", "处理状态", ["送达状态", "状态"]), field("remark", "备注", ["情况说明", "原因"])],
  },
  attendance: {
    type: "attendance", label: "考勤与请假", icon: "勤", description: "迟到、旷课、请假、销假和课堂考勤", keyFields: ["studentNo", "date", "course", "type"],
    fields: [field("studentNo", "学号", ["学生学号", "studentid"], { required: true, type: "student_no" }), field("name", "姓名", ["学生姓名", "name"]), field("date", "日期", ["考勤日期", "发生时间", "time"], { required: true, type: "date" }),
      field("course", "课程", ["课程名称", "科目"]), field("type", "考勤类型", ["异常类型", "出勤状态", "状态"], { required: true }), field("periods", "节数", ["缺勤节数", "课时"], { type: "number" }), field("teacher", "任课教师", ["教师", "老师"]), field("remark", "备注", ["说明", "请假原因"])],
  },
  funding: {
    type: "funding", label: "奖助与评优", icon: "助", description: "困难认定、奖助学金、贷款和评优结果", keyFields: ["studentNo", "project", "year"],
    fields: [field("studentNo", "学号", ["学生学号", "studentid"], { required: true, type: "student_no" }), field("name", "姓名", ["学生姓名", "name"]), field("project", "项目名称", ["奖项", "资助项目", "奖助项目"], { required: true }),
      field("year", "年度", ["学年", "批次"], { required: true }), field("amount", "金额", ["资助金额", "奖助金额"], { type: "number" }), field("level", "等级", ["困难等级", "奖项等级"]), field("status", "审核状态", ["评议状态", "公示状态", "状态"]), field("awardedAt", "发放日期", ["获评日期", "时间"], { type: "date" }), field("remark", "备注", ["说明"])],
  },
  employment: {
    type: "employment", label: "就业与升学", icon: "业", description: "毕业去向、就业单位、岗位和帮扶进度", keyFields: ["studentNo"],
    fields: [field("studentNo", "学号", ["学生学号", "studentid"], { required: true, type: "student_no" }), field("name", "姓名", ["学生姓名", "name"]), field("destination", "毕业去向", ["去向类型", "就业去向"], { required: true }),
      field("company", "单位名称", ["就业单位", "签约单位", "公司"]), field("position", "岗位", ["职位", "职业"]), field("status", "落实状态", ["就业状态", "跟进状态", "状态"]), field("updatedAt", "更新日期", ["登记日期", "时间"], { type: "date" }), field("contact", "单位联系人", ["联系人"]), field("remark", "备注", ["帮扶记录", "说明"])],
  },
  participation: {
    type: "participation", label: "四个100%与活动", icon: "活", description: "运动、竞赛、社团、志愿服务和活动参与", keyFields: ["studentNo", "activityName", "occurredAt"],
    fields: [field("studentNo", "学号", ["学生学号", "studentid"], { required: true, type: "student_no" }), field("name", "姓名", ["学生姓名", "name"]), field("category", "参与类别", ["活动类别", "类型"], { required: true }),
      field("activityName", "活动名称", ["项目名称", "赛事名称", "社团名称"], { required: true }), field("occurredAt", "参与日期", ["活动日期", "时间"], { required: true, type: "date" }), field("hours", "时长", ["志愿时长", "小时数"], { type: "number" }), field("result", "成果", ["获奖情况", "结果", "证明"]), field("remark", "备注", ["说明"])],
  },
  student_record: {
    type: "student_record", label: "谈心与跟进记录", icon: "访", description: "谈话、家校沟通、回访与个案跟进", keyFields: ["studentNo", "happenedAt", "title"],
    fields: [field("studentNo", "学号", ["学生学号", "studentid"], { required: true, type: "student_no" }), field("name", "姓名", ["学生姓名", "name"]), field("domain", "记录类别", ["谈话类型", "业务领域", "类型"], { required: true }),
      field("title", "记录主题", ["谈话主题", "事项标题", "标题"], { required: true }), field("summary", "内容摘要", ["谈话内容", "沟通记录", "情况说明"]), field("status", "跟进状态", ["处理状态", "状态"]), field("happenedAt", "发生日期", ["谈话日期", "沟通日期", "时间"], { required: true, type: "date" }), field("followUpAt", "回访日期", ["下次回访", "跟进日期"], { type: "date" })],
  },
  workflow: {
    type: "workflow", label: "事项与流程台账", icon: "流", description: "在办事项、流程节点、截止时间和办理状态", keyFields: ["studentNo", "type", "title"],
    fields: [field("studentNo", "学号", ["学生学号", "studentid"], { type: "student_no" }), field("name", "姓名", ["学生姓名", "name"]), field("type", "事项类型", ["流程类型", "业务类型", "类别"], { required: true }),
      field("title", "事项标题", ["流程名称", "标题"], { required: true }), field("stage", "当前节点", ["办理节点", "流程节点", "阶段"], { required: true }), field("status", "办理状态", ["流程状态", "状态"]), field("dueAt", "截止日期", ["到期时间", "截止时间"], { type: "date" }), field("owner", "负责人", ["经办人", "办理人"]), field("remark", "备注", ["说明"])],
  },
  knowledge: {
    type: "knowledge", label: "制度与知识资料", icon: "知", description: "制度目录、通知、指南、模板和版本信息", keyFields: ["title", "version"],
    fields: [field("title", "文件名称", ["资料名称", "文档标题", "标题"], { required: true }), field("category", "业务分类", ["文件类别", "资料类别", "类别"], { required: true }), field("version", "版本", ["版本号", "文号"], { required: true }),
      field("scope", "适用范围", ["适用对象", "范围"]), field("effectiveAt", "生效日期", ["发布日期", "开始日期"], { type: "date" }), field("expiresAt", "失效日期", ["到期日期", "有效期"], { type: "date" }), field("status", "有效状态", ["文件状态", "状态"]), field("source", "来源", ["发布部门", "来源地址", "网址"]), field("remark", "备注", ["摘要", "说明"])],
  },
};

// 住宿台账保留兼容既有数据，但不在辅导员端作为可选业务模块展示或自动识别。
export const importDefinitionList = Object.values(importDefinitions).filter((definition) => definition.type !== "dormitory");

export function normalizeHeader(value: unknown) {
  return String(value ?? "").trim().toLowerCase().replace(/[\s_\-—－（）()【】\[\]：:/.]/g, "");
}

export function suggestMapping(headers: string[], definition: ImportDefinition) {
  const normalizedHeaders = headers.map((header) => ({ header, normalized: normalizeHeader(header) }));
  const mapping: Record<string, string> = {};
  for (const fieldDefinition of definition.fields) {
    const aliases = fieldDefinition.aliases.map(normalizeHeader);
    const exact = normalizedHeaders.find((item) => aliases.includes(item.normalized));
    const fuzzy = normalizedHeaders.find((item) => aliases.some((alias) => alias.length >= 2 && (item.normalized.includes(alias) || alias.includes(item.normalized))));
    const match = exact ?? fuzzy;
    if (match && !Object.values(mapping).includes(match.header)) mapping[fieldDefinition.key] = match.header;
  }
  return mapping;
}

export function detectImportType(headers: string[], fileName = "") {
  const ranked = importDefinitionList.map((definition) => {
    const mapping = suggestMapping(headers, definition);
    const required = definition.fields.filter((item) => item.required);
    const requiredMatched = required.filter((item) => mapping[item.key]).length;
    const optionalMatched = Object.keys(mapping).length - requiredMatched;
    const nameBonus = normalizeHeader(fileName).includes(normalizeHeader(definition.label).slice(0, 2)) ? 0.08 : 0;
    const confidence = Math.min(0.99, (required.length ? requiredMatched / required.length : 0) * 0.78 + Math.min(optionalMatched, 5) * 0.035 + nameBonus);
    return { type: definition.type, confidence, mapping, requiredMatched, requiredTotal: required.length };
  }).sort((a, b) => b.confidence - a.confidence || b.requiredMatched - a.requiredMatched);
  return ranked[0];
}

export function getExternalKey(type: ImportRecordType, row: Record<string, string>) {
  const definition = importDefinitions[type];
  return definition.keyFields.map((key) => normalizeHeader(row[key])).filter(Boolean).join("|");
}

function normalizeDate(value: string) {
  const cleaned = value.trim();
  if (!cleaned) return "";
  const timestamp = Date.parse(cleaned.replace(/年|月/g, "-").replace(/日/g, ""));
  return Number.isNaN(timestamp) ? cleaned : new Date(timestamp).toISOString().slice(0, 10);
}

export function normalizeImportRow(type: ImportRecordType, raw: Record<string, unknown>, mapping: Record<string, string>) {
  const definition = importDefinitions[type];
  const normalized: Record<string, string> = {};
  for (const fieldDefinition of definition.fields) {
    const header = mapping[fieldDefinition.key];
    let value = header ? String(raw[header] ?? "").trim() : "";
    if (fieldDefinition.type === "date") value = normalizeDate(value);
    if (fieldDefinition.type === "student_no") value = value.replace(/\.0$/, "").replace(/\s/g, "");
    if (fieldDefinition.type === "phone") value = value.replace(/\.0$/, "").replace(/\s/g, "");
    normalized[fieldDefinition.key] = value;
  }
  return normalized;
}

export type RowValidationError = { field: string; message: string };

export function validateImportRow(type: ImportRecordType, row: Record<string, string>): RowValidationError[] {
  const definition = importDefinitions[type];
  const errors: RowValidationError[] = [];
  for (const fieldDefinition of definition.fields) {
    const value = row[fieldDefinition.key]?.trim() ?? "";
    if (fieldDefinition.required && !value) errors.push({ field: fieldDefinition.key, message: `${fieldDefinition.label}不能为空` });
    if (value && fieldDefinition.type === "student_no" && !/^[A-Za-z0-9_-]{5,24}$/.test(value)) errors.push({ field: fieldDefinition.key, message: `${fieldDefinition.label}格式不正确` });
    if (value && fieldDefinition.type === "number" && !Number.isFinite(Number(value.replace(/,/g, "")))) errors.push({ field: fieldDefinition.key, message: `${fieldDefinition.label}应为数字` });
    if (value && fieldDefinition.type === "date" && Number.isNaN(Date.parse(value))) errors.push({ field: fieldDefinition.key, message: `${fieldDefinition.label}无法识别为日期` });
    if (value && fieldDefinition.type === "phone" && !/^[+\d*#-]{6,24}$/.test(value)) errors.push({ field: fieldDefinition.key, message: `${fieldDefinition.label}格式不正确` });
  }
  if (!getExternalKey(type, row)) errors.push({ field: "_row", message: "无法生成唯一记录标识" });
  return errors;
}
