import type { LucideIcon } from "lucide-react";

export function PageHeader({
  eyebrow,
  title,
  description,
  action,
  icon: Icon,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: React.ReactNode;
  icon?: LucideIcon;
}) {
  return (
    <section className="page-heading section-heading">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{Icon && <span className="title-icon"><Icon size={22} /></span>}{title}</h1>
        <p>{description}</p>
      </div>
      {action}
    </section>
  );
}
