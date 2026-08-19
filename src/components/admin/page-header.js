import Link from "next/link";

export function AdminPageHeader({ eyebrow = "Administración", title, description, actionHref, actionLabel }) {
  return <header className="admin-page-header"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1>{description ? <p>{description}</p> : null}</div>{actionHref ? <Link className="button button-primary" href={actionHref}>{actionLabel}</Link> : null}</header>;
}

