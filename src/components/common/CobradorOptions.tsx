import { agruparPorPerfil } from "../../config/profiles";
import { UserType } from "../../types";

interface CobradorOption {
  id: string;
  name: string;
  type?: UserType | null;
}

/**
 * Opcoes de um <select> de cobradores, separadas por perfil (Externo, Interno,
 * Terceirizado, Juridico, Gestor) com <optgroup>. Com um perfil so, fica a
 * lista simples, sem titulo. Vai DENTRO do <select>, depois da opcao "Todos".
 */
export function CobradorOptions({
  cobradores,
  rotulo = (c) => c.name,
}: {
  cobradores: readonly CobradorOption[];
  rotulo?: (c: CobradorOption) => string;
}) {
  const grupos = agruparPorPerfil(cobradores, (c) => c.type);
  const opcoes = (itens: CobradorOption[]) =>
    itens.map((c) => (
      <option key={c.id} value={c.id}>
        {rotulo(c)}
      </option>
    ));
  if (grupos.length <= 1) return <>{opcoes(grupos[0]?.itens ?? [])}</>;
  return (
    <>
      {grupos.map((g) => (
        <optgroup key={g.label} label={g.label}>
          {opcoes(g.itens)}
        </optgroup>
      ))}
    </>
  );
}
