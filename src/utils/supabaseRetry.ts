// Nova tentativa para requisicoes ao Supabase/PostgREST.
//
// Instabilidade passageira (rede caindo, 502/503/504 do gateway, statement
// timeout sob carga, 429) fazia uma pagina falhar no meio de uma carga
// grande -- e a tela ficava com parte dos dados ate o usuario dar F5. Aqui a
// mesma pagina e pedida de novo algumas vezes antes de desistir. Erro que
// nao e passageiro (permissao, consulta invalida, 4xx) volta na hora: tentar
// de novo so atrasaria a mensagem.

type RespostaSupabase<T> = {
  data: T | null;
  error: unknown;
  status?: number;
};

const ESPERAS_MS = [400, 1200, 2500];

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Status HTTP sem corpo/erro que mesmo assim indica falha do servidor. */
const statusDeFalha = (status: number | undefined) =>
  status !== undefined && (status === 0 || status >= 500 || status === 408 || status === 429);

/** O erro vale uma nova tentativa? */
export function erroPassageiro(error: unknown, status?: number): boolean {
  if (statusDeFalha(status)) return true;
  if (!error) return false;
  const e = error as { message?: string; code?: string; name?: string };
  const msg = (e.message ?? String(error)).toLowerCase();
  // fetch do navegador: rede caiu / CORS por queda do gateway.
  if (e.name === "TypeError" || msg.includes("failed to fetch") || msg.includes("network")) {
    return true;
  }
  // 57014 = statement timeout do Postgres; PGRST003 = timeout do pool.
  if (e.code === "57014" || e.code === "PGRST003") return true;
  if (msg.includes("timeout") || msg.includes("timed out")) return true;
  const codigoHttp = Number(e.code);
  return statusDeFalha(Number.isFinite(codigoHttp) ? codigoHttp : undefined);
}

/**
 * Roda `run` e, se a resposta for um erro passageiro, tenta de novo (ate 3
 * vezes a mais, com espera crescente). Uma resposta sem `error` mas com
 * status >= 500 e sem dados (o supabase-js as vezes nao preenche `error`
 * quando o corpo nao e JSON) tambem conta como falha -- senao viraria "lista
 * vazia" para quem chamou.
 */
export async function comRetentativa<T, R extends RespostaSupabase<T>>(
  run: () => PromiseLike<R>,
): Promise<R> {
  let ultima: R | undefined;
  for (let tentativa = 0; tentativa <= ESPERAS_MS.length; tentativa++) {
    try {
      const res = await run();
      const semDadosComFalha =
        !res.error && res.data == null && statusDeFalha(res.status);
      if (!res.error && !semDadosComFalha) return res;
      ultima = semDadosComFalha
        ? ({
            ...res,
            error: { message: `HTTP ${res.status} sem resposta do servidor`, code: String(res.status) },
          } as R)
        : res;
      if (!erroPassageiro(ultima.error, res.status)) return ultima;
    } catch (err) {
      // fetch rejeitado (rede): mesma regra.
      if (!erroPassageiro(err)) throw err;
      ultima = { data: null, error: err } as R;
    }
    if (tentativa < ESPERAS_MS.length) {
      console.warn(
        `Supabase: falha passageira, tentando de novo (${tentativa + 1}/${ESPERAS_MS.length})...`,
        ultima?.error,
      );
      await esperar(ESPERAS_MS[tentativa]);
    }
  }
  return ultima as R;
}
