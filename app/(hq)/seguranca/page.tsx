// Segurança agora fica dentro de Configurações; o endereço antigo continua funcionando.
import { redirect } from "next/navigation";

export default function SegurancaAntiga() {
  redirect("/configuracoes");
}
