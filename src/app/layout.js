import "./globals.css";

export const metadata = {
  title: { default: "Importadora Valiente", template: "%s | Importadora Valiente" },
  description: "Base técnica del e-commerce de Importadora Valiente.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
