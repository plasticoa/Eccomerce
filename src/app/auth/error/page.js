import Link from "next/link";

export default function AuthErrorPage() {
  return <section className="auth-card"><p className="eyebrow">Enlace no válido</p><h1>No pudimos confirmar tu acceso</h1><p>El enlace pudo expirar o ya fue utilizado.</p><Link className="button button-primary" href="/auth/login">Volver al inicio de sesión</Link></section>;
}
