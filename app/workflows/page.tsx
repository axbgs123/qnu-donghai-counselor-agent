import type { Metadata } from "next";
import { Plus, Workflow } from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { PortalShell } from "../components/PortalShell";
import { WorkflowsClient } from "../components/WorkflowsClient";

export const metadata: Metadata = { title: "事项流程" };

export default function WorkflowsPage() {
  return <PortalShell><PageHeader eyebrow="从事情出发，不用先懂流程" title="学生事项办理" description="选择对象和事项类型，保存后形成可追踪的真实工作台账。" action={<button className="primary-button" data-action="create-flow" data-context="从空白事项开始"><Plus size={16}/>新建学生事项</button>} icon={Workflow}/><WorkflowsClient/></PortalShell>;
}
