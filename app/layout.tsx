import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Orion HQ",
  description: "Ecossistema de agentes de IA do Orion",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR" data-tema="claro" suppressHydrationWarning>
      <head>
        {/* Aplica o tema salvo antes da primeira pintura (sem piscar). */}
        <script dangerouslySetInnerHTML={{ __html: `try{var t=localStorage.getItem("hq:tema");if(t==="escuro"||t==="claro")document.documentElement.dataset.tema=t}catch(e){}` }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:opsz,wght@14..32,400..700&family=JetBrains+Mono:wght@400;500&family=Silkscreen:wght@400;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
