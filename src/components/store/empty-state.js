import Link from "next/link";

export function EmptyState({ title, description, href = "/productos", action = "Ver todo el catálogo" }) {
  return (
    <div className="empty-state"><span aria-hidden="true">IV</span><h2>{title}</h2><p>{description}</p><Link className="button button-secondary" href={href}>{action}</Link></div>
  );
}
