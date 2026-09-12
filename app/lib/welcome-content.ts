export type WelcomeImage = {
  src: string;
  alt: string;
  caption: string;
  width: number;
  height: number;
  fit?: "cover" | "contain";
};

export type WelcomeBlock =
  | { type: "heading"; eyebrow: string; title: string }
  | { type: "paragraph"; text: string }
  | { type: "list"; items: string[] }
  | { type: "steps"; items: Array<{ title: string; detail?: string }> }
  | { type: "callout"; title: string; text: string }
  | ({ type: "image" } & WelcomeImage)
  | { type: "gallery"; images: WelcomeImage[] };

export type WelcomeArticle = {
  slug: string;
  category: "报到交通" | "适应指南" | "心理服务";
  title: string;
  shortTitle: string;
  intro: string;
  readingTime: string;
  cover: WelcomeImage;
  source: string;
  editorNote: string;
  knowledgeSummary: string;
  knowledgeTags: string[];
  blocks: WelcomeBlock[];
};

const image = (src: string, alt: string, caption: string, width: number, height: number, fit?: "cover" | "contain"): WelcomeImage =>
  ({ src: `/welcome/${src}`, alt, caption, width, height, fit });

export const welcomeArticles: WelcomeArticle[] = [
  {
    slug: "campus-arrival-traffic",
    category: "报到交通",
    title: "2026级新生报到校园交通指南",
    shortTitle: "新生报到交通指南",
    intro: "从校门入口、下客点到六处停车区域，一篇看懂东海校区迎新期间的人车通行方式。",
    readingTime: "约 4 分钟",
    cover: image("campus-traffic-map.png", "泉州师范学院2026级新生报到校园交通路线图", "路线图标注主校门、临时入口、离校出口、接驳点及 P1—P6 停车区域。", 826, 1033, "contain"),
    source: "泉州师范学院保卫处、泉州师范学院学生校卫总队",
    editorNote: "依据用户提供的2026级迎新交通文字与路线图整理，路线名称和停车点未作扩写。",
    knowledgeSummary: "2026级新生东海校区报到期间的行人安全、车辆即停即走路线、三条校内停车路线、P1至P6停车区域及校外停车建议。",
    knowledgeTags: ["2026级新生", "东海校区", "迎新交通", "停车", "接驳车", "报到"],
    blocks: [
      { type: "paragraph", text: "亲爱的2026级新同学，欢迎加入泉师大家庭。为帮助大家便捷入校、顺利报到，这份指南集中说明行人通行安全、接送车辆路线、停车区域和迎新高峰注意事项。" },
      { type: "image", ...image("campus-traffic-map.png", "2026级新生报到校园交通路线图", "建议到校前保存路线图；现场路线以迎新期间安保人员指引为准。", 826, 1033, "contain") },
      { type: "heading", eyebrow: "PEDESTRIAN FIRST", title: "一、行人通行安全" },
      { type: "paragraph", text: "校园内全面实行“行人优先”。步行时请走人行道和步道砖，不横穿机动车道，不在道路中央停留或追逐打闹。" },
      { type: "paragraph", text: "行走时不要低头玩手机，也不要戴双耳机听高分贝音乐。报到点、宿舍区、食堂等人员密集区域，请留意周围人车动态，避免碰撞。" },
      { type: "heading", eyebrow: "DROP-OFF", title: "二、即停即走车辆" },
      { type: "steps", items: [
        { title: "主校门入口", detail: "按现场指引进入校园" },
        { title: "荣茂楼前小广场", detail: "新生下车并卸取行李" },
        { title: "主校门出口", detail: "完成下客后立即驶离" },
      ] },
      { type: "heading", eyebrow: "PARKING ROUTES", title: "三、需要校内停放的车辆" },
      { type: "callout", title: "路线一｜主校门进入", text: "主校门入口 → 荣茂楼下穿通道 → 学术大道（求是路）→ P5祖昌礼堂停车场（有接驳点）→ P3工科大楼停车场（有接驳点和离校出口）→ P2明德体育馆旁篮球场（有接驳点）→ P1环文馨苑C区宿舍楼外侧校道 → 文博苑D区宿舍旁临时侧门出口。" },
      { type: "callout", title: "路线二｜南侧门进入", text: "南侧门临时入口 → 正心路（音舞学院前校道）→ P6音舞学院停车场及环音舞学院单侧停车区域（有接驳点）→ 工科大楼旁临东门出口。" },
      { type: "callout", title: "路线三｜南侧门进入", text: "南侧门临时入口 → 正心路（音舞学院前校道）→ P4清源湖（实训湖）旁校道单侧停放 → 工科大楼旁临东门出口。" },
      { type: "heading", eyebrow: "P1 — P6", title: "四、停车区域速查" },
      { type: "list", items: [
        "P1：学生宿舍C区外侧校道，按标识单侧停放。",
        "P2：明德体育馆旁篮球场，设有接驳点。",
        "P3：工科大楼地下停车场，设有接驳点和离校出口。",
        "P4：清源湖（实训湖）旁校道，按标识单侧停放。",
        "P5：祖昌礼堂停车场，设有接驳点。",
        "P6：音舞学院停车场及周边指定区域，设有接驳点。",
      ] },
      { type: "heading", eyebrow: "NOTICE", title: "五、车辆通行注意事项" },
      { type: "paragraph", text: "接送新生车辆入校后请勿占用主干道，应先驶入指定停车区域，再换乘接驳车前往宿舍区。学术大道（求是路）、生活大道（善学路）实行单向通行，全路段禁止社会车辆停放，仅限接驳车、迎新大巴及特种车辆停靠。" },
      { type: "callout", title: "校内车位已满怎么办？", text: "请服从安保人员指引，可前往东海大街、主校门前方约200米的东海湾1+1广场、柯厝村口停车场或市政府停车场。校内停车位有限，建议优先搭乘公共交通。" },
      { type: "paragraph", text: "迎新期间，安保人员、学生干部和志愿者将开展交通疏导。高峰时段可能出现短时拥堵，请有序通行、规范停车，并以现场指挥为准。" },
    ],
  },
  {
    slug: "freshman-breakthrough-guide",
    category: "适应指南",
    title: "大学，请多指教——给大一新生的“破局”攻略",
    shortTitle: "大一新生破局攻略",
    intro: "关于室友、学业、思乡与期待落差：四个大概率会遇到的问题，八个可以马上开始的小行动。",
    readingTime: "约 7 分钟",
    cover: image("psychology-channel-cover.jpg", "心天地知识频道迎新封面", "走近心理学，走进心世界。", 1280, 2879, "cover"),
    source: "校自律会心灵护航部（两份同主题材料已合并去重）",
    editorNote: "“温暖迎新季”与“美润心·知识频道015期”正文基本一致，知识库仅保留一份，避免智能体重复引用。",
    knowledgeSummary: "面向2026级新生的大学适应建议，涵盖宿舍人际边界、大学学习节奏、五分钟启动法、分离焦虑、双重叙事法、比较焦虑和目标拆解。",
    knowledgeTags: ["2026级新生", "大学适应", "宿舍关系", "学习方法", "想家", "情绪调适"],
    blocks: [
      { type: "paragraph", text: "亲爱的2026级新同学：开学在即，你或许正反复查看校园攻略，或是一边收拾行李，一边担心室友、课程和第一次远离家乡后的生活。因为在乎，所以紧张；因为期待，所以不安。未知并不是用来惧怕的，而是值得说一声“请多指教”。" },
      { type: "heading", eyebrow: "RELATIONSHIPS", title: "01 人际关系｜先立规矩，再谈感情" },
      { type: "image", ...image("freshman-roommates.png", "新生在宿舍交流生活习惯", "开学第一周，把作息、卫生、空调和访客规则说清楚。", 646, 483) },
      { type: "paragraph", text: "许多宿舍矛盾源于最初没有说清生活习惯和底线。开学第一周，不妨约室友坐下来聊一聊：几点熄灯、卫生如何轮值、空调温度如何协调、带人回宿舍是否提前知会。把规则说明白，是对彼此最基本的尊重。" },
      { type: "paragraph", text: "室友不必自动成为最好的朋友。合得来可以深交；暂时聊不来，就保持礼貌、边界和尊重。放下“必须成为挚友”的执念，出现噪音、作息等问题时反而更容易直接沟通。" },
      { type: "heading", eyebrow: "STUDY", title: "02 学业变化｜先摸清每门课的规则" },
      { type: "image", ...image("freshman-study.png", "学生在书桌前制定学习计划", "把大作业、期中和期末节点提前写进日历。", 599, 448) },
      { type: "paragraph", text: "大学里需要自己掌舵。第一周先了解每门课的平时成绩占比、作业分值、期末考核方式和考试范围，再把大作业、期中、期末的截止日期放进日历，倒推到每周安排。" },
      { type: "callout", title: "五分钟启动法", text: "不要对自己说“今晚全部学完”，只需要说“先学五分钟”。关掉手机、翻开书、看第一道例题。即使真的只做了五分钟，也比在焦虑中继续刷手机更接近目标。启动往往比宏大的计划更重要。" },
      { type: "heading", eyebrow: "HOMESICKNESS", title: "03 分离焦虑｜想家并不丢人" },
      { type: "image", ...image("freshman-homesick.png", "新生通过手机和家人视频", "适度连接家人，同时在新环境中建立自己的生活节奏。", 606, 453) },
      { type: "paragraph", text: "可以和家人约定固定的通话节奏，例如每周三和周日晚上视频二十分钟。固定联系让心里有底，也给自己留下在新环境中建立安全感的空间。平日想家时，可用语音或一张食堂照片保持轻松联系。" },
      { type: "callout", title: "双重叙事法", text: "把纸分成两栏：左边写客观事实，例如“今天上课有一段没听懂”；右边写可以采取的积极行动，例如“课后请教老师，明天再复习一次”。它不是假装一切都好，而是在承认困难的同时找到下一步。" },
      { type: "heading", eyebrow: "YOUR OWN PACE", title: "04 期待落差｜只和过去的自己比较" },
      { type: "image", ...image("freshman-self-growth.png", "学生在校园看台阅读", "大学不是统一配速的竞技场，每个人都可以按自己的节奏成长。", 648, 485) },
      { type: "paragraph", text: "不要拿想象中的完美大学，对比别人朋友圈里经过选择的精彩片段，也不要拿自己的短板对比他人的长处。更值得回答的问题是：我今天是否比昨天多知道一点、多做到一点？" },
      { type: "paragraph", text: "把“成为很厉害的人”拆成这周能完成的小步骤，例如认真写完一次作业、每周去两次图书馆。方向常常不是坐在原地想出来的，而是在行动和调整中逐渐清楚。第一学期不是决定一生的决战。" },
      { type: "callout", title: "需要更多支持时", text: "如果持续感到难以承受，或日常学习、睡眠和生活受到明显影响，可以向辅导员、心理发展指导中心等正式支持渠道求助。主动求助是一种能力。" },
    ],
  },
  {
    slug: "psychology-development-center",
    category: "心理服务",
    title: "我是心理发展指导中心，很高兴认识你",
    shortTitle: "认识心理发展指导中心",
    intro: "中心简介、服务内容、公众号预约步骤，以及东海校区工作日和周末的开放时间地点。",
    readingTime: "约 5 分钟",
    cover: image("psychology-center-poster.jpg", "心理发展指导中心宣传海报", "拥抱心理发展指导中心，拥抱全世界。", 1280, 2879, "cover"),
    source: "泉州师范学院心理发展指导中心、校自律会心灵护航部",
    editorNote: "预约方式、开放时间和地点按用户提供材料录入；实际服务安排如有临时调整，以中心公众号最新通知为准。",
    knowledgeSummary: "泉州师范学院心理发展指导中心的历史、团队、服务范围、公众号预约路径，以及工作日和周末开放时间与特教大楼B201、C211服务地点。",
    knowledgeTags: ["心理发展指导中心", "心理咨询", "预约方式", "服务时间", "特教大楼", "朋辈辅导"],
    blocks: [
      { type: "heading", eyebrow: "ABOUT US", title: "一、心理中心简介" },
      { type: "paragraph", text: "泉州师范学院心理发展指导中心成立于1999年，前身为泉州师专心理咨询中心。2019年12月，中心整合原心理咨询中心与教育科学学院专业教师资源，正式组建为心理发展指导中心；自2023年起划归学生工作部（处）管理。" },
      { type: "paragraph", text: "中心先后于2011年入选福建省首批高校学生心理健康教育工作基本建设标准示范校，2015年获评福建省大学生心理健康教育工作优秀机构，2018年获福建省大学生心理健康教育工作先进集体，2022年成为福建省高等院校心理援助联盟成员单位。" },
      { type: "gallery", images: [
        image("psychology-honors.jpg", "心理中心荣誉牌匾", "心理援助联盟成员单位、心理健康教育工作先进集体和优秀机构等荣誉。", 810, 810),
        image("psychology-team-wall.jpg", "心理中心团队照片墙", "中心团队与活动影像。", 810, 810),
      ] },
      { type: "heading", eyebrow: "SERVICES", title: "二、可以获得哪些心理服务" },
      { type: "paragraph", text: "心理中心拥有4名专职心理教师、20余名兼职心理咨询师和心理督导师，以及100余名朋辈心理互助员，并整合校自律会心灵护航部、咨询师助理、实习教师和朋辈队伍，形成分层联动的支持网络。" },
      { type: "paragraph", text: "中心建有沙盘治疗室、团体训练室、情绪宣泄室等服务空间，并配备事件相关电位系统（脑电）实验室、基础心理学实验室、心理测评中心、心理督导室和心灵健康加油站。" },
      { type: "paragraph", text: "面向在校大学生提供心理问诊、个体心理咨询、朋辈心理辅导等分级服务，同时开展心理健康教育活动、团体辅导和危机干预，形成“预防—干预—发展”三位一体的心理健康促进体系。" },
      { type: "gallery", images: [
        image("psychology-counseling.jpg", "心理咨询交流场景", "心理咨询与沟通服务。", 549, 549),
        image("psychology-sandplay.jpg", "心理中心沙盘治疗室", "心理中心的沙盘治疗空间。", 720, 720),
        image("psychology-outreach.jpg", "心理健康义诊活动", "校园心理健康宣传与体验活动。", 810, 810),
        image("psychology-center-team.jpg", "心灵护航志愿团队", "参与心理健康服务的学生志愿者。", 942, 942),
      ] },
      { type: "heading", eyebrow: "RESERVATION", title: "三、公众号预约方式" },
      { type: "paragraph", text: "遇到自己暂时难以解决的烦恼、困境或其他心理问题，可以通过心理发展指导中心公众号预约心理咨询。" },
      { type: "steps", items: [
        { title: "关注公众号", detail: "搜索并关注“心理发展指导中心”" },
        { title: "进入咨询服务", detail: "选择学生登录" },
        { title: "选择心理咨询", detail: "进入预约咨询或即时咨询" },
        { title: "选择咨询师与时段", detail: "确认后完成预约" },
      ] },
      { type: "gallery", images: [
        image("psychology-qr.jpg", "心理发展指导中心公众号二维码", "可使用微信识别二维码进入心理发展指导中心公众号。", 860, 860, "contain"),
        image("psychology-portal.jpg", "心理服务公众号功能页面", "公众号内包含心理测评、心理咨询、心理活动、心理微课和心灵驿站等入口。", 1280, 2844, "contain"),
      ] },
      { type: "heading", eyebrow: "OPENING HOURS", title: "四、服务时间与地点" },
      { type: "callout", title: "工作日", text: "上午 8:30—12:00；下午 14:30—17:00；晚上 19:00—21:00。地点：特教大楼 B201、C211。" },
      { type: "callout", title: "周末", text: "上午 9:00—11:00；下午 15:00—17:00；晚上 19:00—21:00。地点：特教大楼 C211。" },
      { type: "paragraph", text: "如遇开放时间临时调整，请以心理发展指导中心公众号最新通知为准。若处于需要即时保护或紧急协助的情形，请优先联系身边老师、学校相关部门或当地紧急服务。" },
    ],
  },
];

export function getWelcomeArticle(slug: string) {
  return welcomeArticles.find((article) => article.slug === slug) ?? null;
}

export function welcomeArticleToKnowledgeText(article: WelcomeArticle) {
  const blocks = article.blocks.flatMap((block) => {
    if (block.type === "heading") return [`${block.eyebrow} ${block.title}`];
    if (block.type === "paragraph") return [block.text];
    if (block.type === "list") return block.items;
    if (block.type === "steps") return block.items.map((item, index) => `${index + 1}. ${item.title}${item.detail ? `：${item.detail}` : ""}`);
    if (block.type === "callout") return [`${block.title}：${block.text}`];
    if (block.type === "image") return [`图片信息：${block.caption}`];
    return block.images.map((item) => `图片信息：${item.caption}`);
  });
  return [
    article.title,
    `资料分类：${article.category}`,
    `内容摘要：${article.knowledgeSummary}`,
    `来源：${article.source}`,
    `整理说明：${article.editorNote}`,
    ...blocks,
  ].join("\n\n");
}
