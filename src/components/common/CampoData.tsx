import React, { useEffect, useRef, useState } from "react";

/** Data completa e plausivel. Ao digitar o ano, o campo passa por "0002",
 * "0020", "0202" antes de "2026": nenhum desses vira filtro. */
const dataCompleta = (v: string): boolean =>
  /^\d{4}-\d{2}-\d{2}$/.test(v) && v >= "2000-01-01" && v <= "2100-12-31";

/** Espera depois da ultima tecla antes de aplicar a data. */
const ESPERA_MS = 500;

/**
 * <input type="date"> que so aplica a data PRONTA (26/11: digitar travava o
 * Resumo e a Atribuicao -- cada tecla virava um filtro novo e a tela refazia
 * as contas da base inteira).
 *
 * - Guarda o que se digita num estado local; so sincroniza com `valor` de
 *   fora quando o campo nao esta em foco (o React reescrevendo o `value` no
 *   meio da digitacao fazia o cursor saltar e o ano virar "200021").
 * - Aplica meio segundo depois da ultima tecla, ou na hora ao sair do campo
 *   ou no Enter.
 * - `permiteVazio`: apagar a data limpa o filtro -- mas so ao sair/Enter,
 *   porque o campo tambem fica vazio no meio da digitacao do ano. Sem ele,
 *   data incompleta volta ao valor atual ao sair.
 */
const CampoData: React.FC<{
  valor: string;
  onAplicar: (v: string) => void;
  permiteVazio?: boolean;
  min?: string;
  className?: string;
  name?: string;
  ariaLabel?: string;
}> = ({
  valor,
  onAplicar,
  permiteVazio = false,
  min,
  className,
  name,
  ariaLabel,
}) => {
  const [rascunho, setRascunho] = useState(valor);
  const editando = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Sempre o onAplicar/valor mais recentes dentro do timer.
  const atual = useRef({ valor, onAplicar });
  atual.current = { valor, onAplicar };

  useEffect(() => {
    if (!editando.current) setRascunho(valor);
  }, [valor]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const aplicar = (v: string) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const ok = dataCompleta(v) || (permiteVazio && v === "");
    if (ok && v !== atual.current.valor) atual.current.onAplicar(v);
  };

  return (
    <input
      type="date"
      name={name}
      aria-label={ariaLabel}
      value={rascunho}
      min={min}
      onFocus={() => {
        editando.current = true;
      }}
      onChange={(e) => {
        const v = e.target.value;
        setRascunho(v);
        if (timer.current) clearTimeout(timer.current);
        if (dataCompleta(v)) {
          timer.current = setTimeout(() => aplicar(v), ESPERA_MS);
        }
      }}
      onBlur={() => {
        editando.current = false;
        if (dataCompleta(rascunho) || (permiteVazio && rascunho === "")) {
          aplicar(rascunho);
        } else {
          if (timer.current) clearTimeout(timer.current);
          setRascunho(valor);
        }
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") aplicar(rascunho);
      }}
      className={className}
    />
  );
};

export default CampoData;
