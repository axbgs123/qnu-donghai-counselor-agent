import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import test, { after, before } from "node:test";
import JSZip from "jszip";
import * as XLSX from "xlsx";

const port = 41731;
const baseUrl = `http://127.0.0.1:${port}`;
const nativeFetch = globalThis.fetch;
const testAdminPassword = "test-admin-password-2026";
let server;
let serverOutput = "";
const localAiHeaders = { "x-local-ai": "1" };
let adminCookie = "";
let teacherCookie = "";
let teacherId = "";
let secondTeacherId = "";
let secondTeacherCookie = "";
let firstStudentCookie = "";
let secondStudentCookie = "";
const createdStudentAccountIds = [];

function responseCookie(response) {
  return (response.headers.get("set-cookie") ?? "").split(";")[0];
}

async function fetch(input, init = {}) {
  const headers = new Headers(init.headers);
  if (teacherCookie && String(input).startsWith(baseUrl) && !headers.has("cookie")) headers.set("cookie", teacherCookie);
  return nativeFetch(input, { ...init, headers });
}

async function studentFetch(cookie, input, init = {}) {
  const headers = new Headers(init.headers);
  headers.set("cookie", cookie);
  return nativeFetch(input, { ...init, headers });
}

before(async () => {
  server = spawn(
    "pnpm",
    ["exec", "vinext", "dev", "--hostname", "127.0.0.1", "--port", String(port)],
    {
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        ADMIN_INITIAL_PASSWORD: testAdminPassword,
        DISABLE_EXTERNAL_AI: "1",
        TEST_DISABLE_PERSIST: "1",
      },
    },
  );
  server.stdout.on("data", (chunk) => (serverOutput += chunk));
  server.stderr.on("data", (chunk) => (serverOutput += chunk));

  const startedAt = Date.now();
  let ready = false;
  while (Date.now() - startedAt < 15_000) {
    if (server.exitCode !== null) {
      throw new Error(`Test server exited early:\n${serverOutput}`);
    }
    try {
      const response = await nativeFetch(baseUrl);
      if (response.ok) { ready = true; break; }
    } catch {
      // Server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  if (!ready) throw new Error(`Timed out waiting for test server:\n${serverOutput}`);

  const adminLogin = await nativeFetch(`${baseUrl}/api/auth/login`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "axbgs", password: testAdminPassword }),
  });
  assert.equal(adminLogin.status, 200);
  adminCookie = responseCookie(adminLogin);
  const teacherCreated = await nativeFetch(`${baseUrl}/api/admin/teachers`, {
    method: "POST", headers: { "content-type": "application/json", cookie: adminCookie },
    body: JSON.stringify({
      username: "automated_teacher", password: "Teacher123", displayName: "自动化测试教师",
      permissions: ["students.manage", "requests.manage", "workflows.manage", "knowledge.manage", "reports.view", "settings.ai"],
    }),
  });
  assert.equal(teacherCreated.status, 201);
  teacherId = (await teacherCreated.json()).teacher.id;
  const teacherLogin = await nativeFetch(`${baseUrl}/api/auth/login`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "automated_teacher", password: "Teacher123" }),
  });
  assert.equal(teacherLogin.status, 200);
  teacherCookie = responseCookie(teacherLogin);

  const secondTeacherCreated = await nativeFetch(`${baseUrl}/api/admin/teachers`, {
    method: "POST", headers: { "content-type": "application/json", cookie: adminCookie },
    body: JSON.stringify({
      username: "isolated_teacher", password: "Teacher456", displayName: "隔离测试教师",
      permissions: ["students.manage", "requests.manage", "workflows.manage", "knowledge.manage", "reports.view"],
    }),
  });
  assert.equal(secondTeacherCreated.status, 201);
  secondTeacherId = (await secondTeacherCreated.json()).teacher.id;
  const secondTeacherLogin = await nativeFetch(`${baseUrl}/api/auth/login`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "isolated_teacher", password: "Teacher456" }),
  });
  assert.equal(secondTeacherLogin.status, 200);
  secondTeacherCookie = responseCookie(secondTeacherLogin);

  for (const student of [
    { studentNo: "2026001001", name: "徐明哲", className: "化工1班", password: "Student001" },
    { studentNo: "2026002001", name: "周浩然", className: "化工2班", password: "Student002" },
  ]) {
    const created = await fetch(`${baseUrl}/api/teacher/students`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(student),
    });
    assert.equal(created.status, 201);
    createdStudentAccountIds.push((await created.json()).student.id);
  }
  const firstLogin = await nativeFetch(`${baseUrl}/api/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: "2026001001", password: "Student001" }) });
  const secondLogin = await nativeFetch(`${baseUrl}/api/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: "2026002001", password: "Student002" }) });
  assert.equal(firstLogin.status, 200); assert.equal(secondLogin.status, 200);
  firstStudentCookie = responseCookie(firstLogin); secondStudentCookie = responseCookie(secondLogin);
});

after(async () => {
  for (const id of createdStudentAccountIds) await fetch(`${baseUrl}/api/teacher/students?id=${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => undefined);
  if (teacherId) await nativeFetch(`${baseUrl}/api/admin/teachers?id=${encodeURIComponent(teacherId)}`, { method: "DELETE", headers: { cookie: adminCookie } }).catch(() => undefined);
  if (secondTeacherId) await nativeFetch(`${baseUrl}/api/admin/teachers?id=${encodeURIComponent(secondTeacherId)}`, { method: "DELETE", headers: { cookie: adminCookie } }).catch(() => undefined);
  server?.kill("SIGTERM");
});

async function render(path = "/") {
  return fetch(`${baseUrl}${path}`, { headers: { accept: "text/html" } });
}

test("renders the Donghai counselor dashboard", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /泉师智辅/);
  assert.match(html, /东海校区/);
  assert.match(html, /今日待办/);
  assert.match(html, /智能助手/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|react-loading-skeleton/i);
});

test("renders one unified login entry and routes accounts by role", async () => {
  const response = await nativeFetch(`${baseUrl}/login`);
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /统一身份入口/);
  assert.match(html, /管理员/);
  assert.match(html, /教师/);
  assert.match(html, /学生/);
  const studentPage = await studentFetch(firstStudentCookie, `${baseUrl}/student`, { headers: { accept: "text/html" } });
  assert.equal(studentPage.status, 200);
  const studentHtml = await studentPage.text();
  assert.match(studentHtml, /辅导员数字人/);
  const studentGuide = await studentFetch(firstStudentCookie, `${baseUrl}/student/welcome/psychology-development-center`, { headers: { accept: "text/html" } });
  assert.equal(studentGuide.status, 200);
  assert.match(await studentGuide.text(), /特教大楼 B201、C211/);
  const studentHome = await studentFetch(firstStudentCookie, `${baseUrl}/api/student/home`);
  assert.equal(studentHome.status, 200);
  assert.equal((await studentHome.json()).teacherName, "自动化测试教师");
});

test("renders core product routes", async () => {
  for (const [path, content] of [
    ["/services", "学生工作全景"],
    ["/students", "学生与班级"],
    ["/students?view=classes", "班级管理"],
    ["/students?view=accounts", "学生账号"],
    ["/workflows", "事项流程"],
    ["/knowledge", "泉师知识库"],
    ["/imports", "智能资料导入"],
    ["/imports?type=knowledge", "上传知识资料"],
    ["/reports", "统计与总结"],
    ["/requests", "学生诉求中心"],
    ["/welcome", "迎新管理"],
    ["/welcome/campus-arrival-traffic", "2026级新生报到校园交通指南"],
    ["/welcome/freshman-breakthrough-guide", "给大一新生的“破局”攻略"],
    ["/welcome/psychology-development-center", "心理发展指导中心"],
    ["/settings", "平台设置"],
  ]) {
    const response = await render(path);
    assert.equal(response.status, 200, path);
    assert.match(await response.text(), new RegExp(content));
  }
});

test("shows drag-and-drop guidance on shared import routes", async () => {
  for (const path of ["/imports", "/imports?type=students", "/imports?type=knowledge"]) {
    const response = await render(path);
    assert.equal(response.status, 200, path);
    assert.match(await response.text(), /也可以把文件直接拖到此区域/);
  }
  const adminUploaderSource = await readFile("app/components/AdminContentClient.tsx", "utf8");
  assert.match(adminUploaderSource, /<ImportCenterClient administratorKnowledge/);
});

test("merges student management and removes workflow from the teacher navigation", async () => {
  const response = await render("/students");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /学生档案/);
  assert.match(html, /班级管理/);
  assert.match(html, /学生账号/);
  assert.doesNotMatch(html, /href="\/workflows"/);
});

test("exposes safe beginner model settings for Zhipu and DeepSeek", async () => {
  const response = await fetch(`${baseUrl}/api/settings/ai`);
  assert.equal(response.status, 200);
  const overview = await response.json();
  assert.deepEqual(overview.providers.map((provider) => provider.id).sort(), ["deepseek", "zhipu"]);
  assert.ok(overview.providers.find((provider) => provider.id === "zhipu").models.some((model) => model.id === "glm-5.3-flash"));
  assert.ok(overview.providers.find((provider) => provider.id === "deepseek").models.length >= 2);
  assert.equal("apiKey" in overview.providers[0], false, "settings API must never return the raw key");
});

test("splits student inquiries from messages and supports the 20-turn reset loop", async () => {
  const oldVerify = await studentFetch(firstStudentCookie, `${baseUrl}/api/student/verify`, { method: "POST" });
  assert.equal(oldVerify.status, 410);

  const homeResponse = await studentFetch(firstStudentCookie, `${baseUrl}/api/student/home`);
  assert.equal(homeResponse.status, 200);
  const home = await homeResponse.json();
  assert.equal(home.student.class_name, "化工1班");
  assert.ok(Array.isArray(home.welcomeItems), "迎新事项允许为空，但必须返回可用列表");
  if (home.welcomeItems.length) {
    const complete = await studentFetch(firstStudentCookie, `${baseUrl}/api/student/welcome`, {
      method: "PATCH", headers: { "content-type": "application/json" },
      body: JSON.stringify({ itemId: home.welcomeItems[0].id, completed: true }),
    });
    assert.equal(complete.status, 200);
  }

  const inquiryResponse = await studentFetch(firstStudentCookie, `${baseUrl}/api/student/chat`, {
    method: "POST", headers: { ...localAiHeaders, "content-type": "application/json" },
    body: JSON.stringify({ messages: [{ role: "student", text: "接送新生车辆进入东海校区后可以停在哪些区域？" }] }),
  });
  assert.equal(inquiryResponse.status, 200);
  const inquiry = await inquiryResponse.json();
  assert.equal(inquiry.intent, "inquiry");
  assert.equal(inquiry.needsResolutionCheck, true);
  assert.equal(inquiry.request, undefined, "咨询回答后不能自动生成老师留言");
  assert.match(inquiry.reply, /P1|P2|P3|P4|P5|P6|停车区域/);
  assert.ok(inquiry.sources.some((source) => source.title.includes("交通指南")));

  const conversation = [{ role: "student", text: "自动化测试：我的宿舍床位信息不一致，希望徐老师明天前帮我核对" }];
  const messageResponse = await studentFetch(firstStudentCookie, `${baseUrl}/api/student/chat`, {
    method: "POST", headers: { ...localAiHeaders, "content-type": "application/json" },
    body: JSON.stringify({ messages: conversation }),
  });
  assert.equal(messageResponse.status, 200);
  const analysis = await messageResponse.json();
  assert.equal(analysis.ready, true);
  assert.equal(analysis.intent, "message");
  assert.ok(["迎新咨询", "生活事务", "其他诉求"].includes(analysis.category));
  assert.match(analysis.summary, /宿舍|床位/);
  assert.match(analysis.summary, /学生原话/);
  assert.ok(analysis.request?.id, "留言类事项应第一轮直接提交");
  assert.equal(analysis.dailyUsage.used, 1, "留言不消耗20轮智能问答额度");

  const followupResponse = await studentFetch(firstStudentCookie, `${baseUrl}/api/student/chat`, {
    method: "POST", headers: { ...localAiHeaders, "content-type": "application/json" },
    body: JSON.stringify({ messages: [{ role: "student", text: "补充留言：我的床位单上写的是C区，请一起核对" }], mode: "message" }),
  });
  assert.equal(followupResponse.status, 200);
  const followup = await followupResponse.json();
  assert.equal(followup.request.id, analysis.request.id, "24小时内同一学生的未办结留言应合并到同一会话卡片");
  assert.equal(followup.request.merged, true);
  assert.equal(followup.request.messageCount, 2);

  const inbox = await fetch(`${baseUrl}/api/requests`).then((response) => response.json());
  const requestSummary = inbox.requests.find((item) => item.id === analysis.request.id);
  assert.ok(requestSummary);
  assert.equal(requestSummary.message_count, 2);
  assert.ok(!Object.hasOwn(requestSummary, "conversation_json"), "诉求列表不应轮询完整聊天记录");
  const requestDetail = await fetch(`${baseUrl}/api/requests?id=${encodeURIComponent(analysis.request.id)}`).then((response) => response.json());
  const unresolvedMessages = JSON.parse(requestDetail.request.conversation_json);
  assert.equal(unresolvedMessages.length, 2);
  assert.ok(unresolvedMessages.every((message) => message.role !== "student" || message.resolution === "unresolved"));
  assert.match(requestDetail.request.summary, /床位信息不一致/);
  assert.match(requestDetail.request.summary, /C区/);

  const resolved = await fetch(`${baseUrl}/api/requests`, {
    method: "PATCH", headers: { "content-type": "application/json" },
    body: JSON.stringify({ id: analysis.request.id, status: "resolved", reply: "自动化测试回复：信息已核对。", replyChannel: "system" }),
  });
  assert.equal(resolved.status, 200);
  const resolvedPayload = await resolved.json();
  assert.ok(JSON.parse(resolvedPayload.request.conversation_json).every((message) => message.role !== "student" || (message.resolution === "resolved" && message.resolutionBy === "teacher")));
  const refreshedHome = await studentFetch(firstStudentCookie, `${baseUrl}/api/student/home`).then((response) => response.json());
  assert.equal(refreshedHome.requests.find((item) => item.id === analysis.request.id).teacher_reply, "自动化测试回复：信息已核对。");

  const legacyMixedResponse = await studentFetch(secondStudentCookie, `${baseUrl}/api/student/requests`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({
      category: "学业问题", title: "混合问答状态测试", summary: "旧会话兼容测试", urgency: "normal",
      conversation: [
        { role: "student", text: "学分是什么意思" },
        { role: "assistant", text: "学分是衡量课程学习量的单位。" },
        { role: "assistant", text: "好的，本次问题标记为已解决，不会生成老师留言。" },
        { role: "student", text: "这条问题仍需要老师处理" },
      ],
    }),
  });
  assert.equal(legacyMixedResponse.status, 201);
  const legacyMixed = await legacyMixedResponse.json();
  const legacyMixedDetail = await fetch(`${baseUrl}/api/requests?id=${encodeURIComponent(legacyMixed.request.id)}`).then((response) => response.json());
  const legacyMessages = JSON.parse(legacyMixedDetail.request.conversation_json).filter((message) => message.role === "student");
  assert.deepEqual(legacyMessages.map((message) => message.resolution), ["resolved", "unresolved"]);
  assert.equal(legacyMessages[0].resolutionBy, "assistant");
  assert.doesNotMatch(legacyMixedDetail.request.summary, /学分是什么意思/);
  assert.match(legacyMixedDetail.request.summary, /仍需要老师处理/);

  for (let index = 1; index <= 20; index += 1) {
    const response = await studentFetch(secondStudentCookie, `${baseUrl}/api/student/chat`, {
      method: "POST", headers: { ...localAiHeaders, "content-type": "application/json" },
      body: JSON.stringify({ messages: [{ role: "student", text: `新生什么时候报到？第${index}次查询` }] }),
    });
    assert.equal(response.status, 200);
  }
  const overLimit = await studentFetch(secondStudentCookie, `${baseUrl}/api/student/chat`, {
    method: "POST", headers: { ...localAiHeaders, "content-type": "application/json" },
    body: JSON.stringify({ messages: [{ role: "student", text: "新生什么时候报到？第21次查询" }] }),
  });
  assert.equal(overLimit.status, 429);

  const resetApplication = await studentFetch(secondStudentCookie, `${baseUrl}/api/student/reset`, { method: "POST" });
  assert.equal(resetApplication.status, 201);
  const { request: resetRequest } = await resetApplication.json();
  const approveReset = await fetch(`${baseUrl}/api/requests`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: resetRequest.id, resetDecision: "approve" }) });
  assert.equal(approveReset.status, 200);
  const afterReset = await studentFetch(secondStudentCookie, `${baseUrl}/api/student/chat`, {
    method: "POST", headers: { ...localAiHeaders, "content-type": "application/json" },
    body: JSON.stringify({ messages: [{ role: "student", text: "新生什么时候报到？重置后查询" }] }),
  });
  assert.equal(afterReset.status, 200);
  assert.equal((await afterReset.json()).dailyUsage.used, 1);

  const tasksResponse = await fetch(`${baseUrl}/api/tasks/natural-language`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ message: "明天安排自动化测试新生志愿者、处理自动化测试老生外宿、推进自动化测试班干竞选" }),
  });
  assert.equal(tasksResponse.status, 201);
  const generated = await tasksResponse.json();
  assert.equal(generated.tasks.length, 3);
  assert.deepEqual(generated.tasks.map((item) => item.module), ["迎新工作", "学生事务", "班团建设"]);
});

test("generates downloadable exports", async () => {
  const response = await fetch(`${baseUrl}/api/export?type=export-knowledge`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-disposition") ?? "", /attachment/);
  assert.match(response.headers.get("content-type") ?? "", /text\/csv/);
  assert.match(await response.text(), /资料名称/);
});

test("exposes assistant capabilities and executes campus tools", async () => {
  const catalogResponse = await fetch(`${baseUrl}/api/assistant`, { headers: localAiHeaders });
  assert.equal(catalogResponse.status, 200);
  const catalog = await catalogResponse.json();
  assert.equal(catalog.capabilities.length, 9);

  const studentResponse = await fetch(`${baseUrl}/api/assistant`, {
    method: "POST",
    headers: { ...localAiHeaders, "content-type": "application/json" },
    body: JSON.stringify({ message: "查看徐明哲同学的学生档案" }),
  });
  assert.equal(studentResponse.status, 200);
  const studentReply = await studentResponse.json();
  assert.ok(studentReply.tools.includes("search_students"));
  assert.equal(studentReply.cards[0].title, "徐明哲");

  const draftResponse = await fetch(`${baseUrl}/api/assistant`, {
    method: "POST",
    headers: { ...localAiHeaders, "content-type": "application/json" },
    body: JSON.stringify({ message: "生成一份新生入学适应主题班会通知" }),
  });
  assert.equal(draftResponse.status, 200);
  const draftReply = await draftResponse.json();
  assert.ok(draftReply.tools.includes("draft_material"));
  assert.match(draftReply.answer, /新生入学适应主题班会/);
  assert.ok(draftReply.actions.some((action) => action.action === "create-flow"));

  const requestResponse = await fetch(`${baseUrl}/api/assistant`, {
    method: "POST", headers: { ...localAiHeaders, "content-type": "application/json" },
    body: JSON.stringify({ message: "汇总化工1班和化工2班的学生诉求" }),
  });
  assert.equal(requestResponse.status, 200);
  const requestReply = await requestResponse.json();
  assert.ok(requestReply.tools.includes("search_student_requests"));
});

test("analyzes, validates, saves and retrieves imported student data", async () => {
  const suffix = String(Date.now()).slice(-7);
  const validNo = `26${suffix}`;
  const invalidNo = `27${suffix}`;
  const csv = [
    "学生学号,学生姓名,班级,学院,年级,社区,宿舍楼,宿舍号,联系电话,状态",
    `${validNo},导入测试甲,测试1班,文学与传播学院,2026,文馨苑,3号楼,412,13800138000,重点跟进`,
    `${invalidNo},导入测试乙,,文学与传播学院,2026,文馨苑,3号楼,413,13800138001,正常`,
  ].join("\n");
  const form = new FormData();
  form.append("file", new File([`\uFEFF${csv}`], "辅导员学生名单.csv", { type: "text/csv" }));
  const analyzeResponse = await fetch(`${baseUrl}/api/imports/analyze`, { method: "POST", body: form });
  assert.equal(analyzeResponse.status, 201);
  const analysis = await analyzeResponse.json();
  assert.equal(analysis.sheets[0].detectedType, "students");
  assert.equal(analysis.sheets[0].rowCount, 2);
  assert.equal(analysis.sheets[0].mapping.studentNo, "学生学号");
  assert.equal(analysis.sheets[0].mapping.name, "学生姓名");

  const commitResponse = await fetch(`${baseUrl}/api/imports/commit`, {
    method: "POST",
    headers: { ...localAiHeaders, "content-type": "application/json" },
    body: JSON.stringify({
      jobId: analysis.job.id,
      sheetName: analysis.sheets[0].name,
      recordType: "students",
      mapping: analysis.sheets[0].mapping,
    }),
  });
  assert.equal(commitResponse.status, 200);
  const committed = await commitResponse.json();
  assert.equal(committed.result.inserted, 1);
  assert.equal(committed.result.skipped, 1);
  assert.match(committed.result.errors[0].messages.join(""), /行政班不能为空/);
  assert.equal(committed.result.accounts.created, 1, "导入学生档案后应自动创建对应登录账号");

  const assistantResponse = await fetch(`${baseUrl}/api/assistant`, {
    method: "POST",
    headers: { ...localAiHeaders, "content-type": "application/json" },
    body: JSON.stringify({ message: "查看导入测试甲的学生档案" }),
  });
  assert.equal(assistantResponse.status, 200);
  const reply = await assistantResponse.json();
  assert.ok(reply.tools.includes("search_imported_records"));
  assert.ok(reply.cards.some((card) => card.title === "导入测试甲"));

  const studentsResponse = await fetch(`${baseUrl}/api/students`);
  assert.equal(studentsResponse.status, 200);
  const importedStudents = await studentsResponse.json();
  assert.ok(importedStudents.students.some((student) => student.id === validNo && student.name === "导入测试甲"));

  const bulkLogin = await nativeFetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: validNo, password: "daoruceshijia" }),
  });
  assert.equal(bulkLogin.status, 200, "自动创建的账号应使用学号登录、姓名全拼作为初始密码");

  const detailResponse = await render(`/students/${validNo}`);
  assert.equal(detailResponse.status, 200);
  assert.match(await detailResponse.text(), /导入测试甲/);

  const deleted = await fetch(`${baseUrl}/api/students?studentNo=${validNo}`, { method: "DELETE" });
  if (deleted.status !== 200) throw new Error(`删除学生档案失败（${deleted.status}）：${await deleted.text()}\n${serverOutput.slice(-5000)}`);
  const afterDelete = await fetch(`${baseUrl}/api/students`).then((response) => response.json());
  assert.ok(!afterDelete.students.some((student) => student.id === validNo));
});

test("imports the five-student test workbook and creates every login account automatically", async () => {
  const workbookBytes = await readFile("5人学生批量导入测试.xlsx");
  const form = new FormData();
  form.append("file", new File([workbookBytes], "5人学生批量导入测试.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const analyzed = await fetch(`${baseUrl}/api/imports/analyze`, { method: "POST", body: form });
  assert.equal(analyzed.status, 201);
  const analysis = await analyzed.json();
  assert.equal(analysis.sheets[0].detectedType, "students");
  assert.equal(analysis.sheets[0].rowCount, 5);

  const committed = await fetch(`${baseUrl}/api/imports/commit`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jobId: analysis.job.id,
      sheetName: analysis.sheets[0].name,
      recordType: "students",
      mapping: analysis.sheets[0].mapping,
    }),
  });
  assert.equal(committed.status, 200);
  const result = (await committed.json()).result;
  assert.equal(result.inserted, 5);
  assert.equal(result.accounts.created, 5);

  for (const [studentNo, password] of [
    ["2026999001", "zhangmingyuan"],
    ["2026999002", "lixinyi"],
    ["2026999003", "wanghaoran"],
    ["2026999004", "chenyutong"],
    ["2026999005", "linjiale"],
  ]) {
    const login = await nativeFetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: studentNo, password }),
    });
    assert.equal(login.status, 200, `${studentNo} 应能使用姓名全拼初始密码登录`);
    const deleted = await fetch(`${baseUrl}/api/students?studentNo=${studentNo}`, { method: "DELETE" });
    assert.equal(deleted.status, 200);
  }
});

test("recognizes title rows and multiple business sheets in Excel", async () => {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ["2026级学生基础信息汇总"],
    [],
    ["学号", "姓名", "行政班", "学院", "社区", "楼栋", "房间"],
    ["2026123456", "Excel测试学生", "测试2班", "文学与传播学院", "文馨苑", "2号楼", "501"],
  ]), "学生花名册");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ["学生学号", "学生姓名", "考勤日期", "课程名称", "考勤类型", "缺勤节数"],
    ["2026123456", "Excel测试学生", "2026-09-08", "大学英语", "请假", 2],
  ]), "课堂考勤");
  const bytes = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
  const form = new FormData();
  form.append("file", new File([bytes], "学生综合数据.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const response = await fetch(`${baseUrl}/api/imports/analyze`, { method: "POST", body: form });
  assert.equal(response.status, 201);
  const analysis = await response.json();
  assert.equal(analysis.job.sheetCount, 2);
  assert.equal(analysis.sheets[0].headerRow, 3);
  assert.equal(analysis.sheets[0].detectedType, "students");
  assert.equal(analysis.sheets[1].detectedType, "attendance");
});

test("extracts, confirms and retrieves a Word document", async () => {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`);
  zip.folder("_rels").file(".rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`);
  zip.folder("word").file("document.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>2026级新生材料提交提醒</w:t></w:r></w:p><w:p><w:r><w:t>学生：王小明，学号：20261234567。</w:t></w:r></w:p><w:p><w:r><w:t>请于9月10日前向辅导员提交住宿登记表。</w:t></w:r></w:p></w:body></w:document>`);
  const bytes = await zip.generateAsync({ type: "uint8array" });
  const form = new FormData();
  form.append("file", new File([bytes], "新生材料提醒.docx", { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }));
  const analyzeResponse = await fetch(`${baseUrl}/api/materials/analyze`, { method: "POST", headers: localAiHeaders, body: form });
  assert.equal(analyzeResponse.status, 201);
  const analysis = await analyzeResponse.json();
  assert.match(analysis.material.extractedText, /王小明/);
  assert.match(analysis.material.extractedText, /住宿登记表/);
  assert.ok(analysis.material.studentNos.includes("20261234567"));

  const commitResponse = await fetch(`${baseUrl}/api/materials/commit`, {
    method: "POST",
    headers: { ...localAiHeaders, "content-type": "application/json" },
    body: JSON.stringify({
      jobId: analysis.job.id,
      title: analysis.material.title,
      category: analysis.material.category,
      summary: analysis.material.summary,
      confirmed: true,
    }),
  });
  assert.equal(commitResponse.status, 200);
  const committed = await commitResponse.json();
  assert.ok(committed.result.chunkCount >= 1);

  const assistantResponse = await fetch(`${baseUrl}/api/assistant`, {
    method: "POST",
    headers: { ...localAiHeaders, "content-type": "application/json" },
    body: JSON.stringify({ message: "请查看刚才上传的王小明新生材料，列出待办" }),
  });
  assert.equal(assistantResponse.status, 200);
  const reply = await assistantResponse.json();
  assert.ok(reply.tools.includes("search_source_documents"));
  assert.ok(reply.cards.some((card) => /新生材料/.test(card.title)));
});

test("cleans a student roster from a document into student profiles and rolls it back on delete", async () => {
  const suffix = String(Date.now()).slice(-6);
  const firstNo = `2026${suffix}`;
  const secondNo = `2027${suffix}`;
  const roster = [
    "学号\t姓名\t班级\t学院\t手机号",
    `${firstNo}\t文档导入甲\t化工1班\t化学与材料学院\t13800138021`,
    `${secondNo}\t文档导入乙\t化工2班\t化学与材料学院\t13800138022`,
  ].join("\n");
  const form = new FormData();
  form.append("file", new File([roster], "学生名单.txt", { type: "text/plain" }));
  const analyzed = await fetch(`${baseUrl}/api/materials/analyze`, { method: "POST", headers: localAiHeaders, body: form });
  assert.equal(analyzed.status, 201);
  const analysis = await analyzed.json();
  assert.equal(analysis.material.studentRecords.length, 2);
  assert.equal(analysis.material.studentRecords[0].className, "化工1班");

  const committed = await fetch(`${baseUrl}/api/imports/material-students`, {
    method: "POST",
    headers: { ...localAiHeaders, "content-type": "application/json" },
    body: JSON.stringify({ jobId: analysis.job.id, confirmed: true }),
  });
  assert.equal(committed.status, 200);
  assert.equal((await committed.json()).result.inserted, 2);
  const students = await fetch(`${baseUrl}/api/students`).then((response) => response.json());
  assert.ok(students.students.some((student) => student.id === firstNo && student.name === "文档导入甲"));

  const deleted = await fetch(`${baseUrl}/api/imports?id=${analysis.job.id}`, { method: "DELETE" });
  assert.equal(deleted.status, 200);
  const afterDelete = await fetch(`${baseUrl}/api/students`).then((response) => response.json());
  assert.ok(!afterDelete.students.some((student) => student.id === firstNo));
  assert.ok(!afterDelete.students.some((student) => student.id === secondNo));
});

test("extracts searchable text from a text-layer PDF", async () => {
  const content = "BT /F1 12 Tf 72 720 Td (PDF notice student 20261234567 submit form) Tj ET";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => { offsets.push(pdf.length); pdf += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n `).join("\n")}\ntrailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  const form = new FormData();
  form.append("file", new File([pdf], "PDF文字提取测试.pdf", { type: "application/pdf" }));
  const response = await fetch(`${baseUrl}/api/materials/analyze`, { method: "POST", headers: localAiHeaders, body: form });
  assert.equal(response.status, 201);
  const analysis = await response.json();
  assert.match(analysis.material.extractedText, /20261234567/);
  assert.equal(analysis.material.processingMethod, "PDF文字提取");
});

test("accepts browser-local Markdown chunks for large PDF and Word files", async () => {
  const fileName = "大型学生手册.pdf";
  const startResponse = await fetch(`${baseUrl}/api/materials/local-extraction`, {
    method: "POST",
    headers: { ...localAiHeaders, "content-type": "application/json" },
    body: JSON.stringify({ action: "start", fileName, fileSize: 8 * 1024 * 1024, mimeType: "application/pdf" }),
  });
  assert.equal(startResponse.status, 201);
  const { jobId } = await startResponse.json();
  const markdown = `# 学生手册

## 学分绩点

学生完成培养方案规定课程后，可按学校办法查询课程学分与绩点。

## 转专业

学生申请转专业，应当按照学校公布的时间向所在学院提交申请，经学院审核后按规定办理。

## 休学与复学

休学期满的学生应在规定期限内提出复学申请，并提交学校要求的证明材料。

## 课程考核

课程考核不及格的学生，可以按照课程考核管理办法参加补考或者重修；旷考者不予补考。

## 纪律处分

考试作弊按照学生违纪处分规定处理，学生对处分决定有异议的，可以在规定期限内提出申诉。

识别码 LOCAL-MARKDOWN-2026。`;
  const chunkResponse = await fetch(`${baseUrl}/api/materials/local-extraction`, {
    method: "POST",
    headers: { ...localAiHeaders, "content-type": "application/json" },
    body: JSON.stringify({ action: "chunk", jobId, chunkIndex: 0, text: markdown }),
  });
  assert.equal(chunkResponse.status, 200);
  const finishResponse = await fetch(`${baseUrl}/api/materials/local-extraction`, {
    method: "POST",
    headers: { ...localAiHeaders, "content-type": "application/json" },
    body: JSON.stringify({ action: "finish", jobId, processingMethod: "浏览器本地 PDF 转 Markdown（120页）" }),
  });
  assert.equal(finishResponse.status, 201);
  const analysis = await finishResponse.json();
  assert.match(analysis.material.extractedText, /LOCAL-MARKDOWN-2026/);
  assert.match(analysis.material.processingMethod, /本地 PDF 转 Markdown/);

  const committed = await fetch(`${baseUrl}/api/materials/commit`, {
    method: "POST",
    headers: { ...localAiHeaders, "content-type": "application/json" },
    body: JSON.stringify({
      jobId,
      title: analysis.material.title,
      category: analysis.material.category,
      summary: analysis.material.summary,
      visibility: "global",
      confirmed: true,
    }),
  });
  assert.equal(committed.status, 200);
  assert.ok((await committed.json()).result.chunkCount >= 1);
  const studentQuestion = await studentFetch(firstStudentCookie, `${baseUrl}/api/student/chat`, {
    method: "POST", headers: { ...localAiHeaders, "content-type": "application/json" },
    body: JSON.stringify({ messages: [{ role: "student", text: "学分和绩点要怎么查询和计算？" }], mode: "inquiry" }),
  });
  assert.equal(studentQuestion.status, 200);
  const studentAnswer = await studentQuestion.json();
  assert.match(studentAnswer.reply, /学分|绩点/);
  assert.ok(studentAnswer.sources.some((source) => source.title.includes("学生手册")), "学生端应能用同义问法命中学生手册的学分分块");
  for (const [question, expected] of [
    ["我想转专业，要办什么手续？", /转专业|学院|申请/],
    ["休学期满之后怎样回学校继续读？", /复学|休学期满|证明材料/],
    ["课程没考及格还能参加补考吗？", /补考|重修|旷考/],
    ["考试作弊会受到什么处理？", /作弊|处分|申诉/],
  ]) {
    const response = await studentFetch(firstStudentCookie, `${baseUrl}/api/student/chat`, {
      method: "POST", headers: { ...localAiHeaders, "content-type": "application/json" },
      body: JSON.stringify({ messages: [{ role: "student", text: question }], mode: "inquiry" }),
    });
    assert.equal(response.status, 200);
    const answer = await response.json();
    assert.match(answer.reply, expected, `学生手册通用检索应回答：${question}`);
    assert.ok(answer.sources.some((source) => source.title.includes("学生手册")));
  }
  const assistantResponse = await fetch(`${baseUrl}/api/assistant`, {
    method: "POST",
    headers: { ...localAiHeaders, "content-type": "application/json" },
    body: JSON.stringify({ message: "LOCAL-MARKDOWN-2026 资料中怎么说明学分绩点？" }),
  });
  assert.equal(assistantResponse.status, 200);
  assert.ok((await assistantResponse.json()).tools.includes("search_source_documents"));
  const deleted = await fetch(`${baseUrl}/api/imports?id=${encodeURIComponent(jobId)}`, { method: "DELETE" });
  assert.equal(deleted.status, 200);
});

test("does not pretend to read screenshots when vision is not configured", async () => {
  const catalog = await fetch(`${baseUrl}/api/assistant`, { headers: localAiHeaders }).then((response) => response.json());
  if (catalog.modelConfigured) return;
  const form = new FormData();
  form.append("file", new File([Uint8Array.of(137, 80, 78, 71)], "聊天截图.png", { type: "image/png" }));
  const response = await fetch(`${baseUrl}/api/materials/analyze`, { method: "POST", headers: localAiHeaders, body: form });
  assert.equal(response.status, 422);
  assert.match((await response.json()).error, /视觉模型|OPENAI_API_KEY/);
});

test("isolates student requests and private knowledge by teacher while sharing common knowledge", async () => {
  const suffix = String(Date.now()).slice(-7);
  const studentNo = `28${suffix}`;
  const created = await nativeFetch(`${baseUrl}/api/teacher/students`, {
    method: "POST", headers: { "content-type": "application/json", cookie: secondTeacherCookie },
    body: JSON.stringify({ studentNo, name: "隔离测试学生", className: "测试班", password: "Student888" }),
  });
  assert.equal(created.status, 201);
  const studentAccountId = (await created.json()).student.id;
  const login = await nativeFetch(`${baseUrl}/api/auth/login`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: studentNo, password: "Student888" }),
  });
  const isolatedStudentCookie = responseCookie(login);

  const message = await studentFetch(isolatedStudentCookie, `${baseUrl}/api/student/chat`, {
    method: "POST", headers: { ...localAiHeaders, "content-type": "application/json" },
    body: JSON.stringify({ messages: [{ role: "student", text: "隔离测试留言：请我的辅导员核对课程安排" }] }),
  });
  assert.equal(message.status, 200);
  const requestId = (await message.json()).request.id;
  const firstInbox = await fetch(`${baseUrl}/api/requests`).then((response) => response.json());
  assert.ok(!firstInbox.requests.some((item) => item.id === requestId));
  const secondInbox = await nativeFetch(`${baseUrl}/api/requests`, { headers: { cookie: secondTeacherCookie } }).then((response) => response.json());
  assert.ok(secondInbox.requests.some((item) => item.id === requestId));
  const unauthorizedUpdate = await fetch(`${baseUrl}/api/requests`, {
    method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: requestId, status: "resolved" }),
  });
  assert.equal(unauthorizedUpdate.status, 404);

  async function uploadKnowledge(fileName, content, visibility) {
    const form = new FormData();
    form.append("file", new File([content], fileName, { type: "text/plain" }));
    const analyzedResponse = await fetch(`${baseUrl}/api/materials/analyze`, { method: "POST", headers: localAiHeaders, body: form });
    assert.equal(analyzedResponse.status, 201);
    const analyzed = await analyzedResponse.json();
    const committed = await fetch(`${baseUrl}/api/materials/commit`, {
      method: "POST", headers: { ...localAiHeaders, "content-type": "application/json" },
      body: JSON.stringify({ jobId: analyzed.job.id, title: analyzed.material.title, category: analyzed.material.category, summary: analyzed.material.summary, visibility, confirmed: true }),
    });
    assert.equal(committed.status, 200);
    return (await committed.json()).result.id;
  }
  const privateId = await uploadKnowledge("教师专用安排.txt", "专用识别码PRIVATE-ALPHA-7788，仅供本班内部使用。", "teacher_private");
  const globalId = await uploadKnowledge("学校通用办事指南.txt", "通用识别码PUBLIC-BETA-8899，全校学生均可查询。", "global");
  const secondMaterials = await nativeFetch(`${baseUrl}/api/materials`, { headers: { cookie: secondTeacherCookie } }).then((response) => response.json());
  assert.ok(secondMaterials.documents.some((item) => item.id === globalId));
  assert.ok(!secondMaterials.documents.some((item) => item.id === privateId));

  const publicQuestion = await studentFetch(isolatedStudentCookie, `${baseUrl}/api/student/chat`, {
    method: "POST", headers: { ...localAiHeaders, "content-type": "application/json" },
    body: JSON.stringify({ messages: [{ role: "student", text: "请问PUBLIC-BETA-8899是什么意思？" }] }),
  });
  assert.equal(publicQuestion.status, 200);
  assert.match((await publicQuestion.json()).reply, /PUBLIC-BETA-8899|全校学生/);

  const outsideQuestion = await studentFetch(isolatedStudentCookie, `${baseUrl}/api/student/chat`, {
    method: "POST", headers: { ...localAiHeaders, "content-type": "application/json" },
    body: JSON.stringify({ messages: [{ role: "student", text: "火星土壤中高氯酸盐的热分解温度是多少？" }], mode: "inquiry" }),
  });
  assert.equal(outsideQuestion.status, 200);
  const outsideAnswer = await outsideQuestion.json();
  assert.equal(outsideAnswer.reply, "此知识我暂未学会，请通过留言的方式询问教师。");
  assert.deepEqual(outsideAnswer.sources, []);

  await fetch(`${baseUrl}/api/materials?id=${encodeURIComponent(privateId)}`, { method: "DELETE" });
  await fetch(`${baseUrl}/api/materials?id=${encodeURIComponent(globalId)}`, { method: "DELETE" });
  await nativeFetch(`${baseUrl}/api/teacher/students?id=${encodeURIComponent(studentAccountId)}`, { method: "DELETE", headers: { cookie: secondTeacherCookie } });
});

test("allows the administrator to edit and delete all knowledge and student requests", async () => {
  for (const [path, label] of [["/admin/knowledge", "全局知识资料管理"], ["/admin/requests", "全局学生诉求管理"]]) {
    const page = await nativeFetch(`${baseUrl}${path}`, { headers: { cookie: adminCookie, accept: "text/html" } });
    assert.equal(page.status, 200);
    assert.match(await page.text(), new RegExp(label));
  }
  const form = new FormData();
  form.append("file", new File(["管理员全局资料测试 ADMIN-CONTROL-9900"], "管理员权限测试.txt", { type: "text/plain" }));
  const analyzedResponse = await nativeFetch(`${baseUrl}/api/materials/analyze`, {
    method: "POST", headers: { ...localAiHeaders, cookie: adminCookie }, body: form,
  });
  assert.equal(analyzedResponse.status, 201, "管理员应能直接上传公共知识资料");
  const analyzed = await analyzedResponse.json();
  const committedResponse = await nativeFetch(`${baseUrl}/api/materials/commit`, {
    method: "POST", headers: { ...localAiHeaders, cookie: adminCookie, "content-type": "application/json" },
    body: JSON.stringify({ jobId: analyzed.job.id, title: analyzed.material.title, category: analyzed.material.category, summary: analyzed.material.summary, visibility: "teacher_private", confirmed: true }),
  });
  assert.equal(committedResponse.status, 200);
  const documentId = (await committedResponse.json()).result.id;
  const adminKnowledge = await nativeFetch(`${baseUrl}/api/admin/content?type=knowledge`, { headers: { cookie: adminCookie } });
  assert.equal(adminKnowledge.status, 200);
  const adminDocuments = (await adminKnowledge.json()).documents;
  assert.ok(adminDocuments.some((item) => item.id === documentId));
  assert.ok(adminDocuments.some((item) => item.id === "builtin-knowledge-campus-arrival-traffic"));
  assert.ok(adminDocuments.some((item) => item.id === "builtin-knowledge-freshman-breakthrough-guide"));
  assert.ok(adminDocuments.some((item) => item.id === "builtin-knowledge-psychology-development-center"));
  const changedKnowledge = await nativeFetch(`${baseUrl}/api/admin/content`, {
    method: "PATCH", headers: { cookie: adminCookie, "content-type": "application/json" },
    body: JSON.stringify({ type: "knowledge", id: documentId, title: "管理员已修改资料", category: "管理员测试", visibility: "global", reviewStatus: "verified" }),
  });
  assert.equal(changedKnowledge.status, 200);
  assert.equal((await changedKnowledge.json()).document.visibility, "global");

  const studentMessage = await studentFetch(firstStudentCookie, `${baseUrl}/api/student/chat`, {
    method: "POST", headers: { ...localAiHeaders, "content-type": "application/json" },
    body: JSON.stringify({ messages: [{ role: "student", text: "管理员删除测试留言：请老师记录我的材料问题" }] }),
  });
  const requestId = (await studentMessage.json()).request.id;
  const changedRequest = await nativeFetch(`${baseUrl}/api/admin/content`, {
    method: "PATCH", headers: { cookie: adminCookie, "content-type": "application/json" },
    body: JSON.stringify({ type: "request", id: requestId, title: "管理员已修改诉求", category: "管理员测试", status: "processing", reply: "管理员登记处理", replyChannel: "system" }),
  });
  assert.equal(changedRequest.status, 200);
  assert.equal((await changedRequest.json()).request.status, "processing");

  const deleteRequest = await nativeFetch(`${baseUrl}/api/admin/content?type=request&id=${encodeURIComponent(requestId)}`, { method: "DELETE", headers: { cookie: adminCookie } });
  const deleteKnowledge = await nativeFetch(`${baseUrl}/api/admin/content?type=knowledge&id=${encodeURIComponent(documentId)}`, { method: "DELETE", headers: { cookie: adminCookie } });
  assert.equal(deleteRequest.status, 200);
  assert.equal(deleteKnowledge.status, 200);
});

test("creates, renames and safely deletes teacher-owned classes without batch transfer", async () => {
  const initial = await fetch(`${baseUrl}/api/teacher/classes`);
  assert.equal(initial.status, 200);
  const initialWorkspace = await initial.json();
  const original = initialWorkspace.classes.find((item) => item.name === "化工1班");
  assert.ok(original, "已有学生班级应自动成为可管理班级");

  const createdResponse = await fetch(`${baseUrl}/api/teacher/classes`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "自动化临时班", grade: "2026级", department: "测试学院" }),
  });
  assert.equal(createdResponse.status, 201);
  const created = (await createdResponse.json()).class;

  const nonEmptyDelete = await fetch(`${baseUrl}/api/teacher/classes?id=${encodeURIComponent(original.id)}`, { method: "DELETE" });
  assert.equal(nonEmptyDelete.status, 400, "有学生的班级不能删除");

  const renamedResponse = await fetch(`${baseUrl}/api/teacher/classes`, {
    method: "PATCH", headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "update", id: created.id, name: "自动化临时班（已改名）", grade: "2026级", department: "测试学院" }),
  });
  assert.equal(renamedResponse.status, 200);
  assert.equal((await renamedResponse.json()).class.name, "自动化临时班（已改名）");

  const isolatedWorkspace = await nativeFetch(`${baseUrl}/api/teacher/classes`, { headers: { cookie: secondTeacherCookie } }).then((response) => response.json());
  assert.ok(!isolatedWorkspace.classes.some((item) => item.id === created.id), "其他教师不能看到本教师班级");

  const removedBatchAction = await fetch(`${baseUrl}/api/teacher/classes`, {
    method: "PATCH", headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "transfer", targetClassId: original.id, studentNos: ["2026001001"] }),
  });
  assert.equal(removedBatchAction.status, 400, "批量转班接口应已移除");

  const deleted = await fetch(`${baseUrl}/api/teacher/classes?id=${encodeURIComponent(created.id)}`, { method: "DELETE" });
  assert.equal(deleted.status, 200);
  const finalWorkspace = await fetch(`${baseUrl}/api/teacher/classes`).then((response) => response.json());
  assert.ok(!finalWorkspace.classes.some((item) => item.id === created.id));
  assert.equal(finalWorkspace.students.find((item) => item.studentNo === "2026001001").className, "化工1班");
});

test("persists teacher assistant history and exposes a real notification center", async () => {
  const conversationId = crypto.randomUUID();
  const saved = await fetch(`${baseUrl}/api/assistant/history`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ id: conversationId, title: "测试助手历史", messages: [
      { role: "user", text: "整理本周待办" }, { role: "assistant", text: "已整理。" },
    ] }),
  });
  assert.equal(saved.status, 201);
  const history = await fetch(`${baseUrl}/api/assistant/history`).then((response) => response.json());
  assert.equal(history.retentionDays, 7);
  const summary = history.conversations.find((item) => item.id === conversationId);
  assert.ok(summary && !Object.hasOwn(summary, "messages"), "历史列表不应一次载入所有消息");
  const detail = await fetch(`${baseUrl}/api/assistant/history?id=${conversationId}`).then((response) => response.json());
  assert.equal(detail.conversation.messages.length, 2);

  const taskResponse = await fetch(`${baseUrl}/api/tasks`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ title: "通知中心到期任务", module: "测试", dueAt: new Date(Date.now() + 3600_000).toISOString(), priority: "urgent" }),
  });
  assert.equal(taskResponse.status, 201);
  const task = (await taskResponse.json()).task;
  const notifications = await fetch(`${baseUrl}/api/notifications`).then((response) => response.json());
  const taskNotification = notifications.items.find((item) => item.key === `task:${task.id}`);
  assert.ok(taskNotification && !taskNotification.read);
  const read = await fetch(`${baseUrl}/api/notifications`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ keys: [taskNotification.key] }),
  });
  assert.equal(read.status, 200);
  assert.equal((await read.json()).items.find((item) => item.key === taskNotification.key).read, true);

  assert.equal((await fetch(`${baseUrl}/api/tasks?id=${task.id}`, { method: "DELETE" })).status, 200);
  assert.equal((await fetch(`${baseUrl}/api/assistant/history?id=${conversationId}`, { method: "DELETE" })).status, 200);
});

test("deletes a teacher-owned student profile together with its login account", async () => {
  const studentNo = `29${String(Date.now()).slice(-7)}`;
  const created = await fetch(`${baseUrl}/api/teacher/students`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ studentNo, name: "待删除档案", className: "删除测试班", password: "Delete123" }),
  });
  assert.equal(created.status, 201);
  const listedBefore = await fetch(`${baseUrl}/api/students`).then((response) => response.json());
  assert.ok(listedBefore.students.some((item) => item.id === studentNo));
  const deleted = await fetch(`${baseUrl}/api/students?studentNo=${studentNo}`, { method: "DELETE" });
  assert.equal(deleted.status, 200);
  const listedAfter = await fetch(`${baseUrl}/api/students`).then((response) => response.json());
  assert.ok(!listedAfter.students.some((item) => item.id === studentNo));
  const login = await nativeFetch(`${baseUrl}/api/auth/login`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: studentNo, password: "Delete123" }),
  });
  assert.equal(login.status, 401);
});

test("isolates students, tasks, workflows and reports between teachers", async () => {
  const secondStudents = await nativeFetch(`${baseUrl}/api/students`, { headers: { cookie: secondTeacherCookie } }).then((response) => response.json());
  assert.ok(!secondStudents.students.some((item) => item.id === "2026001001"));

  const secondTaskResponse = await nativeFetch(`${baseUrl}/api/tasks`, {
    method: "POST", headers: { cookie: secondTeacherCookie, "content-type": "application/json" },
    body: JSON.stringify({ title: "第二教师私有待办", module: "隔离测试" }),
  });
  assert.equal(secondTaskResponse.status, 201);
  const secondTask = (await secondTaskResponse.json()).task;
  const firstTasks = await fetch(`${baseUrl}/api/tasks`).then((response) => response.json());
  assert.ok(!firstTasks.tasks.some((item) => item.id === secondTask.id));

  const secondFlowResponse = await nativeFetch(`${baseUrl}/api/workflows`, {
    method: "POST", headers: { cookie: secondTeacherCookie, "content-type": "application/json" },
    body: JSON.stringify({ type: "隔离测试", title: "第二教师私有事项", subject: "本班" }),
  });
  assert.equal(secondFlowResponse.status, 201);
  const secondFlow = (await secondFlowResponse.json()).case;
  const firstFlows = await fetch(`${baseUrl}/api/workflows`).then((response) => response.json());
  assert.ok(!firstFlows.cases.some((item) => item.id === secondFlow.id));
  const firstReport = await fetch(`${baseUrl}/api/reports`).then((response) => response.json());
  assert.ok(!firstReport.categories.some((item) => item.name === "隔离测试"));

  await nativeFetch(`${baseUrl}/api/tasks?id=${secondTask.id}`, { method: "DELETE", headers: { cookie: secondTeacherCookie } });
  await nativeFetch(`${baseUrl}/api/workflows?id=${secondFlow.id}`, { method: "DELETE", headers: { cookie: secondTeacherCookie } });
});
