import type { Metadata } from "next";
import Link from "next/link";
import { Library, Upload } from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { PortalShell } from "../components/PortalShell";
import { KnowledgeClient } from "../components/KnowledgeClient";

export const metadata: Metadata = { title: "泉师知识库" };

export default function KnowledgePage() {
  return (
    <PortalShell>
      <PageHeader eyebrow="有依据的校务问答" title="泉师知识库" description="统一管理制度、通知、表格与办事指南，保留来源、版本和有效期。" action={<Link className="primary-button" href="/imports?type=knowledge"><Upload size={16}/>上传资料</Link>} icon={Library}/>
      <KnowledgeClient />
    </PortalShell>
  );
}
