import Link from "next/link";

export const metadata = { robots: { index: false, follow: false } };

export default function AuthLayout({ children }) {
  return (
    <main className="auth-shell">
      <Link className="auth-brand" href="/">Importadora Valiente</Link>
      {children}
    </main>
  );
}
