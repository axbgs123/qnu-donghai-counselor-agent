import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  BriefcaseBusiness,
  CalendarCheck,
  CircleDollarSign,
  ClipboardCheck,
  Flag,
  GraduationCap,
  HeartHandshake,
  Medal,
  Megaphone,
  Users,
} from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { PortalShell } from "../components/PortalShell";

export const metadata: Metadata = { title: "学生工作全景" };

const domains = [
  { icon: Megaphone, tone: "blue", title: "思想引领与班团建设", desc: "主题班会、形势政策、党团活动、学生骨干和温暖集体建设。", tasks: ["班会方案", "签到纪要", "班级公约", "骨干台账"] },
  { icon: GraduationCap, tone: "cyan", title: "迎新、入学与军训", desc: "新生分班、报到核验、入学教育、军训组织和适应性回访。", tasks: ["新生名单", "报到缺项", "军训考勤", "适应回访"] },
  { icon: BookOpen, tone: "red", title: "学风、考勤与学业预警", desc: "请销假、课堂考勤、考风考纪、预警分级、家长告知和学业帮扶。", tasks: ["请销假", "旷课汇总", "三级预警", "帮扶计划"] },
  { icon: CircleDollarSign, tone: "amber", title: "资助、奖学金与评优", desc: "困难认定、助学贷款、勤工助学、奖助评定、先进个人和班集体。", tasks: ["困难认定", "班级评议", "材料核验", "公示归档"] },
  { icon: HeartHandshake, tone: "violet", title: "心理健康与谈心谈话", desc: "谈心记录、心理委员线索、预约、转介与持续回访。", tasks: ["谈心记录", "朋辈线索", "中心预约", "回访提醒"] },
  { icon: BriefcaseBusiness, tone: "cyan", title: "就业、升学与毕业去向", desc: "生源信息、推荐表、招聘活动、考研帮扶、去向登记和档案查询。", tasks: ["就业意向", "岗位推荐", "去向核验", "未就业帮扶"] },
  { icon: Medal, tone: "amber", title: "四个100%成长发展", desc: "按学生和班级跟踪运动、学科竞赛、社团协会、志愿服务参与情况。", tasks: ["运动参与", "学科竞赛", "社团协会", "志愿服务"] },
  { icon: Users, tone: "violet", title: "日常事务、纪律与家校沟通", desc: "请销假、学生证明、信息维护、家长沟通、纪律处理、学生申诉和诉求反馈。", tasks: ["请销假", "证明申请", "纪律申诉", "家长联系"] },
  { icon: CalendarCheck, tone: "green", title: "毕业离校与持续跟进", desc: "优秀毕业生、文明离校、档案确认和离校未就业跟进。", tasks: ["离校清单", "档案核验", "去向确认", "毕业回访"] },
  { icon: Flag, tone: "red", title: "国防教育与征兵", desc: "主题班会、政策宣讲、意向登记、报名材料和保留学籍复学衔接。", tasks: ["政策宣讲", "意向登记", "报名指导", "学籍衔接"] },
];

const calendar = [
  ["开学前后", "迎新报到、入学教育、军训与适应回访"],
  ["学期前段", "困难认定、奖助申请、班团建设、学业预警与家长告知"],
  ["学期中段", "心理排查、四个100%、就业与考研帮扶"],
  ["期末假期", "考风考纪、留校离校、成绩预警、毕业去向与工作总结"],
];

export default function ServicesPage() {
  return (
    <PortalShell>
      <PageHeader eyebrow="东海校区 · 高频学生工作地图" title="学生工作全景" description="覆盖辅导员日常学生工作的主干场景；低频特殊情况统一进入通用事项，不单独堆叠模块。" action={<Link className="primary-button" href="/workflows"><ClipboardCheck size={16} />进入事项中心</Link>} />

      <section className="coverage-hero panel">
        <div><span className="coverage-kicker">辅导员职责范围</span><h2>10 类高频学生工作已纳入</h2><p>聚焦学生成长、班级治理与日常事务；宿管负责的社区公寓管理不纳入平台。</p></div>
        <dl><div><dt>业务覆盖</dt><dd>10<small>类</small></dd></div><div><dt>可复用流程</dt><dd>10<small>条</small></dd></div><div><dt>宿管模块</dt><dd>0<small>个</small></dd></div></dl>
      </section>

      <div className="service-domain-grid">
        {domains.map(({ icon: Icon, tone, title, desc, tasks }) => (
          <article className="panel service-domain" key={title}>
            <header><span className={`domain-icon ${tone}`}><Icon size={20} /></span><div><h2>{title}</h2><p>{desc}</p></div></header>
            <div>{tasks.map((task) => <span key={task}>{task}</span>)}</div>
            <footer><Link href={`/assistant?prompt=${encodeURIComponent(`帮我处理${title}`)}`}>让助手处理 <ArrowRight size={14} /></Link><Link href="/workflows">查看流程</Link></footer>
          </article>
        ))}
      </div>

      <div className="coverage-bottom">
        <section className="panel term-calendar"><div className="panel-head"><div><h2>辅导员学期工作节奏</h2><span>高频事项按时间聚合，减少重复建任务</span></div></div>{calendar.map(([period, detail], index) => <article key={period}><span>{index + 1}</span><div><b>{period}</b><p>{detail}</p></div></article>)}</section>
        <aside className="panel evidence-panel"><h2>业务依据</h2><p>学校公开信息明确出现思想教育、资助、就业、心理、国防教育、学业预警和“四个100%”等学生工作线。</p><a href="https://www.qztc.edu.cn/xsc/main.htm" target="_blank" rel="noreferrer">学生工作部公开栏目 <ArrowRight size={13} /></a><a href="https://www.qztc.edu.cn/_upload/article/files/2b/92/12d7dc4a44f3a254595e6436ccd7/1899f582-a3d6-4449-9640-46bcd508c15f.pdf" target="_blank" rel="noreferrer">学分制与学业预警规定 <ArrowRight size={13} /></a></aside>
      </div>
    </PortalShell>
  );
}
