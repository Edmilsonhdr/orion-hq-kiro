// Layout autenticado do grupo (hq) (Requirements 1.4, 9.2).
// O cabeçalho (client) checa a sessão via GET /api/me — se 401, o wrapper de
// lib/api.ts redireciona para /login — e mostra a navegação, o contador de
// aprovações pendentes e a ação de sair. Aqui só montamos a estrutura e
// renderizamos os filhos.

import Header from "../../components/Header";

export default function LayoutHq({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <Header />
      <main style={{ flex: 1, minHeight: 0 }}>{children}</main>
    </div>
  );
}
