import React, { useEffect, useState } from "react";
import { CheckCircle2, ExternalLink, RotateCcw } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { formatCurrency, formatDate } from "../../utils/formatters";
import {
  ConferenciaEstadoMarcacao,
  ConferenciaMarcacao,
  marcacaoPedeObservacao,
} from "../../filters/conferenciaRecebimentos";

// Item 61, etapa B: detalhe de um cliente da Conferencia de recebimentos --
// as parcelas que a base baixou no mes x os lancamentos do app no mes, lado a
// lado. Mesmos criterios da RPC conferencia_recebimentos (migration
// 20261111000004): base sem cancelado e com valor_recebido > 0; app =
// sale_payments sem "Ajuste..." (estornos incluidos) + acordo_pagamentos.
// O documento tem uma grafia so em todas as tabelas (conferido 2026-11-13),
// por isso o filtro e por igualdade.
//
// O que a linha da conferencia nao soma aparece esmaecido, com o motivo:
// na visao "Todos", lancamento de outro cobrador (a linha e por quem
// registrou); na visao "So carteira", baixa de outra carteira.

interface BaseRow {
  id_parcela: number;
  venda_n: number | null;
  numero_titulo: number | null;
  parcela: number | null;
  nome_da_loja: string | null;
  data_vencimento: string | null;
  data_de_recebimento: string;
  valor_recebido: number;
  status: string | null;
  user_id: string | null;
}

interface AppRow {
  chave: string;
  data: string;
  valor: number;
  origem: string; // forma de pagamento ou "Acordo (parcela n)"
  venda: number | null;
  cobradorId: string | null;
  notas: string | null;
  estorno: boolean;
}

/** Dias antes/depois do mes em que o detalhe procura baixa ou lancamento
 * "fora do mes" (diferenca que e so de data). */
const JANELA_DIAS = 45;

/** "YYYY-MM-DD" + n dias, em UTC (sem fuso: so aritmetica de calendario). */
const somarDias = (dia: string, n: number): string => {
  const [y, m, d] = dia.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};

interface Props {
  documento: string;
  cobradorId: string | null;
  visao: "todos" | "carteira";
  inicio: string;
  fim: string;
  nomePorId: Map<string, string>;
  onAbrirFicha: (() => void) | null;
  // Etapa D: marcacao do gestor (valores da linha, historico do mes, gravar).
  baseValor: number;
  appValor: number;
  marcacoes: ConferenciaMarcacao[];
  estadoMarcacao: ConferenciaEstadoMarcacao;
  onMarcar: (
    acao: "conferido" | "reaberto",
    observacao: string,
  ) => Promise<void>;
}

/** Bloco "Conferencia do gestor": historico + marcar/reabrir com observacao. */
const PainelMarcacao: React.FC<{
  baseValor: number;
  appValor: number;
  marcacoes: ConferenciaMarcacao[];
  estado: ConferenciaEstadoMarcacao;
  nomePorId: Map<string, string>;
  onMarcar: Props["onMarcar"];
}> = ({ baseValor, appValor, marcacoes, estado, nomePorId, onMarcar }) => {
  const [obs, setObs] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  // Conferido (e sem mudanca) -> a acao disponivel e reabrir.
  const acao: "conferido" | "reaberto" =
    estado === "conferido" ? "reaberto" : "conferido";
  const pedeObs = marcacaoPedeObservacao(
    acao,
    Math.round(baseValor * 100) / 100,
    Math.round(appValor * 100) / 100,
  );
  const podeSalvar = !salvando && (!pedeObs || obs.trim().length > 0);

  const salvar = async () => {
    if (!podeSalvar) return;
    setSalvando(true);
    setErro(null);
    try {
      await onMarcar(acao, obs);
      setObs("");
    } catch (e) {
      console.error("Erro ao gravar marcação da conferência:", e);
      // PostgrestError: message/code/details (tabela inexistente = PGRST205
      // ou 42P01; sem mensagem, mostra o objeto).
      const err = (e ?? {}) as {
        message?: string;
        code?: string;
        details?: string;
      };
      const msg =
        err.message || err.details || JSON.stringify(e) || "Falha ao gravar";
      setErro(
        err.code === "PGRST205" ||
          err.code === "42P01" ||
          /conferencia_marcacoes|schema cache/i.test(msg)
          ? "A tabela de marcações ainda não existe no banco (falta aplicar a migration)."
          : msg,
      );
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg-secondary px-3 py-2.5 space-y-2">
      <div className="text-xs font-semibold text-gray-700 dark:text-dark-text">
        Conferência do gestor
      </div>
      {marcacoes.length > 0 && (
        <ul className="space-y-1">
          {[...marcacoes].reverse().map((m) => (
            <li
              key={m.id}
              className="text-[11px] text-gray-600 dark:text-dark-text-secondary"
            >
              <span
                className={
                  m.acao === "conferido"
                    ? "font-semibold text-teal-600 dark:text-teal-400"
                    : "font-semibold text-amber-600 dark:text-amber-400"
                }
              >
                {m.acao === "conferido" ? "Conferido" : "Reaberto"}
              </span>{" "}
              por {nomePorId.get(m.registrado_por_id) ?? "gestor"} em{" "}
              {new Date(m.created_at).toLocaleString("pt-BR", {
                dateStyle: "short",
                timeStyle: "short",
              })}{" "}
              (base {formatCurrency(Number(m.base_valor))}, app{" "}
              {formatCurrency(Number(m.app_valor))}
              {m.visao === "carteira" ? ", visão só carteira" : ""})
              {m.observacao && (
                <span className="text-gray-800 dark:text-dark-text">
                  {" "}
                  — {m.observacao}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      {estado === "mudou" && (
        <div className="text-[11px] font-medium text-amber-700 dark:text-amber-400">
          Os valores mudaram depois da última conferência (baixa ou registro
          novo no mês). Confira de novo.
        </div>
      )}
      <div className="flex flex-col sm:flex-row gap-2">
        <input
          type="text"
          value={obs}
          onChange={(e) => setObs(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void salvar();
          }}
          placeholder={
            pedeObs
              ? acao === "reaberto"
                ? "Motivo para reabrir (obrigatório)"
                : "Por que a diferença está certa? (obrigatório)"
              : "Observação (opcional)"
          }
          className="flex-1 rounded-lg border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg px-2.5 py-1.5 text-xs text-gray-900 dark:text-dark-text placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500"
        />
        <button
          onClick={() => void salvar()}
          disabled={!podeSalvar}
          className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40 disabled:cursor-not-allowed ${
            acao === "conferido"
              ? "bg-teal-600 hover:bg-teal-700"
              : "bg-amber-600 hover:bg-amber-700"
          }`}
        >
          {acao === "conferido" ? (
            <CheckCircle2 className="h-3.5 w-3.5" />
          ) : (
            <RotateCcw className="h-3.5 w-3.5" />
          )}
          {salvando
            ? "Gravando…"
            : acao === "conferido"
              ? estado === "mudou"
                ? "Conferir de novo"
                : "Marcar como conferido"
              : "Reabrir"}
        </button>
      </div>
      {erro && (
        <div className="text-[11px] text-red-600 dark:text-red-400">
          Não foi possível gravar: {erro}
        </div>
      )}
    </div>
  );
};

const ConferenciaDetalhe: React.FC<Props> = ({
  documento,
  cobradorId,
  visao,
  inicio,
  fim,
  nomePorId,
  onAbrirFicha,
  baseValor,
  appValor,
  marcacoes,
  estadoMarcacao,
  onMarcar,
}) => {
  const [base, setBase] = useState<BaseRow[] | null>(null);
  const [app, setApp] = useState<AppRow[] | null>(null);
  // Fora do mes, ate JANELA_DIAS antes/depois: nunca entra na soma.
  const [basePerto, setBasePerto] = useState<BaseRow[]>([]);
  const [appPerto, setAppPerto] = useState<AppRow[]>([]);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    const de = somarDias(inicio, -JANELA_DIAS);
    const ate = somarDias(fim, JANELA_DIAS);
    const noMes = (d: string) => d >= inicio && d <= fim;
    (async () => {
      try {
        const [rb, rs, ra] = await Promise.all([
          supabase
            .from("BANCO_DADOS")
            .select(
              "id_parcela, venda_n, numero_titulo, parcela, nome_da_loja, data_vencimento, data_de_recebimento, valor_recebido, status, user_id",
            )
            .eq("documento", documento)
            .gte("data_de_recebimento", de)
            .lte("data_de_recebimento", ate)
            .gt("valor_recebido", 0)
            .order("data_de_recebimento")
            .order("id_parcela"),
          supabase
            .from("sale_payments")
            .select(
              "id, payment_date, payment_amount, payment_method, sale_number, collector_id, notes, estorno_de",
            )
            .eq("client_document", documento)
            .gte("payment_date", de)
            .lte("payment_date", ate)
            .order("payment_date")
            .order("id"),
          supabase
            .from("acordo_pagamentos")
            .select(
              "id, data_pagamento, valor_pago, collector_id, notes, estorno_de, acordo_parcelas!inner(numero, acordos!inner(client_document))",
            )
            .eq("acordo_parcelas.acordos.client_document", documento)
            .gte("data_pagamento", de)
            .lte("data_pagamento", ate)
            .order("data_pagamento")
            .order("id"),
        ]);
        if (rb.error) throw rb.error;
        if (rs.error) throw rs.error;
        if (ra.error) throw ra.error;
        if (cancelado) return;

        const baixas = (rb.data as BaseRow[]).filter(
          (b) => (b.status ?? "").trim().toLowerCase() !== "cancelado",
        );
        setBase(baixas.filter((b) => noMes(b.data_de_recebimento)));
        setBasePerto(baixas.filter((b) => !noMes(b.data_de_recebimento)));

        const linhasApp: AppRow[] = [
          ...rs.data
            .filter((s) => !/^ajuste/i.test(s.payment_method ?? ""))
            .map((s) => ({
              chave: `s:${s.id}`,
              data: s.payment_date,
              valor: Number(s.payment_amount) || 0,
              origem: s.payment_method || "Pagamento",
              venda: s.sale_number,
              cobradorId: s.collector_id,
              notas: s.notes,
              estorno: !!s.estorno_de,
            })),
          ...ra.data.map((a) => {
            const parcela = a.acordo_parcelas as unknown as {
              numero: number;
            } | null;
            return {
              chave: `a:${a.id}`,
              data: a.data_pagamento,
              valor: Number(a.valor_pago) || 0,
              origem: `Acordo${parcela ? ` (parcela ${parcela.numero})` : ""}`,
              venda: null,
              cobradorId: a.collector_id,
              notas: a.notes,
              estorno: !!a.estorno_de,
            };
          }),
        ].sort((x, y) => x.data.localeCompare(y.data));
        setApp(linhasApp.filter((a) => noMes(a.data)));
        setAppPerto(linhasApp.filter((a) => !noMes(a.data)));
      } catch (e) {
        console.error("Erro ao carregar detalhe da conferência:", e);
        if (!cancelado)
          setErro(
            e instanceof Error
              ? e.message
              : typeof e === "object" && e && "message" in e
                ? String((e as { message: unknown }).message)
                : "Falha ao carregar",
          );
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [documento, inicio, fim]);

  const nome = (id: string | null) =>
    id ? (nomePorId.get(id) ?? "Usuário removido") : "Sem cobrador";

  // O que entra na soma da linha da conferencia.
  const baseConta = (b: BaseRow) =>
    visao === "todos" || b.user_id === cobradorId;
  const appConta = (a: AppRow) => a.cobradorId === cobradorId;

  if (erro)
    return (
      <div className="text-xs text-red-600 dark:text-red-400">
        Não foi possível carregar o detalhe: {erro}
      </div>
    );
  if (base === null || app === null)
    return (
      <div className="text-xs text-gray-500 dark:text-dark-text-secondary">
        Carregando detalhe…
      </div>
    );

  const totalBase = base
    .filter(baseConta)
    .reduce((s, b) => s + Number(b.valor_recebido), 0);
  const totalApp = app.filter(appConta).reduce((s, a) => s + a.valor, 0);
  const foraBase = base.filter((b) => !baseConta(b)).length;
  const foraApp = app.filter((a) => !appConta(a)).length;

  const cabecalho =
    "text-left text-[10px] uppercase tracking-wide text-gray-400 dark:text-dark-text-secondary";
  const esmaecido = "opacity-50";

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* Base */}
        <div className="rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg-secondary overflow-x-auto">
          <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 dark:border-dark-border/40">
            <span className="text-xs font-semibold text-gray-700 dark:text-dark-text">
              Baixado na base
            </span>
            <span className="text-xs font-semibold text-gray-900 dark:text-dark-text">
              {formatCurrency(totalBase)}
            </span>
          </div>
          {base.length === 0 ? (
            <div className="px-3 py-3 text-xs text-gray-500 dark:text-dark-text-secondary">
              Nenhuma baixa neste mês.
            </div>
          ) : (
            <table className="min-w-full text-xs">
              <thead>
                <tr className={cabecalho}>
                  <th className="px-3 py-1.5 font-semibold">Baixa</th>
                  <th className="px-3 py-1.5 font-semibold">Venda / parcela</th>
                  <th className="px-3 py-1.5 font-semibold">Vencimento</th>
                  <th className="px-3 py-1.5 font-semibold text-right">
                    Valor
                  </th>
                </tr>
              </thead>
              <tbody>
                {base.map((b) => {
                  const conta = baseConta(b);
                  return (
                    <tr
                      key={b.id_parcela}
                      className={`border-t border-gray-100 dark:border-dark-border/40 ${conta ? "" : esmaecido}`}
                    >
                      <td className="px-3 py-1.5 whitespace-nowrap text-gray-800 dark:text-dark-text">
                        {formatDate(b.data_de_recebimento)}
                      </td>
                      <td className="px-3 py-1.5 text-gray-700 dark:text-dark-text">
                        {b.venda_n
                          ? `#${b.venda_n}`
                          : b.numero_titulo
                            ? `título ${b.numero_titulo}`
                            : "—"}
                        {b.parcela != null && ` · ${b.parcela}ª`}
                        <div className="text-[10px] text-gray-400 dark:text-dark-text-secondary">
                          {b.nome_da_loja ?? ""}
                          {!conta &&
                            ` · carteira de ${nome(b.user_id)} (não somado)`}
                        </div>
                      </td>
                      <td className="px-3 py-1.5 whitespace-nowrap text-gray-500 dark:text-dark-text-secondary">
                        {b.data_vencimento
                          ? formatDate(b.data_vencimento)
                          : "—"}
                      </td>
                      <td className="px-3 py-1.5 text-right whitespace-nowrap font-medium text-gray-900 dark:text-dark-text">
                        {formatCurrency(Number(b.valor_recebido))}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* App */}
        <div className="rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg-secondary overflow-x-auto">
          <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 dark:border-dark-border/40">
            <span className="text-xs font-semibold text-gray-700 dark:text-dark-text">
              Registrado no app
            </span>
            <span className="text-xs font-semibold text-gray-900 dark:text-dark-text">
              {formatCurrency(totalApp)}
            </span>
          </div>
          {app.length === 0 ? (
            <div className="px-3 py-3 text-xs text-gray-500 dark:text-dark-text-secondary">
              Nenhum lançamento no app neste mês.
            </div>
          ) : (
            <table className="min-w-full text-xs">
              <thead>
                <tr className={cabecalho}>
                  <th className="px-3 py-1.5 font-semibold">Data</th>
                  <th className="px-3 py-1.5 font-semibold">Lançamento</th>
                  <th className="px-3 py-1.5 font-semibold">Cobrador</th>
                  <th className="px-3 py-1.5 font-semibold text-right">
                    Valor
                  </th>
                </tr>
              </thead>
              <tbody>
                {app.map((a) => {
                  const conta = appConta(a);
                  return (
                    <tr
                      key={a.chave}
                      className={`border-t border-gray-100 dark:border-dark-border/40 ${conta ? "" : esmaecido}`}
                    >
                      <td className="px-3 py-1.5 whitespace-nowrap text-gray-800 dark:text-dark-text">
                        {formatDate(a.data)}
                      </td>
                      <td className="px-3 py-1.5 text-gray-700 dark:text-dark-text">
                        {a.origem}
                        {a.venda ? ` · #${a.venda}` : ""}
                        {a.estorno && (
                          <span className="ml-1 rounded bg-red-50 px-1 text-[10px] font-medium text-red-600 dark:bg-red-900/20 dark:text-red-300">
                            estorno
                          </span>
                        )}
                        {a.notas && (
                          <div
                            className="max-w-[16rem] truncate text-[10px] text-gray-400 dark:text-dark-text-secondary"
                            title={a.notas}
                          >
                            {a.notas}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-1.5 whitespace-nowrap text-gray-600 dark:text-dark-text-secondary">
                        {nome(a.cobradorId)}
                        {!conta && (
                          <div className="text-[10px]">
                            não somado nesta linha
                          </div>
                        )}
                      </td>
                      <td
                        className={`px-3 py-1.5 text-right whitespace-nowrap font-medium ${a.valor < 0 ? "text-red-600 dark:text-red-400" : "text-gray-900 dark:text-dark-text"}`}
                      >
                        {formatCurrency(a.valor)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {basePerto.length + appPerto.length > 0 && (
        <div className="rounded-xl border border-dashed border-amber-300 dark:border-amber-700/60 bg-amber-50/60 dark:bg-amber-900/10 px-3 py-2">
          <div className="text-xs font-semibold text-amber-800 dark:text-amber-300">
            Fora deste mês ({JANELA_DIAS} dias antes ou depois)
          </div>
          <div className="text-[11px] text-amber-700/80 dark:text-amber-300/80 mb-1.5">
            Não entram na conferência do mês. Se cobrem a diferença acima, é só
            data (baixa ou registro em outro mês).
          </div>
          <table className="min-w-full text-xs">
            <tbody>
              {[
                ...basePerto.map((b) => ({
                  chave: `b:${b.id_parcela}`,
                  data: b.data_de_recebimento,
                  lado: "Base",
                  texto: `${
                    b.venda_n
                      ? `#${b.venda_n}`
                      : b.numero_titulo
                        ? `título ${b.numero_titulo}`
                        : "—"
                  }${b.parcela != null ? ` · ${b.parcela}ª` : ""}`,
                  quem: b.nome_da_loja ?? "",
                  valor: Number(b.valor_recebido),
                })),
                ...appPerto.map((a) => ({
                  chave: a.chave,
                  data: a.data,
                  lado: "App",
                  texto: `${a.origem}${a.venda ? ` · #${a.venda}` : ""}${a.estorno ? " · estorno" : ""}`,
                  quem: nome(a.cobradorId),
                  valor: a.valor,
                })),
              ]
                .sort((x, y) => x.data.localeCompare(y.data))
                .map((r) => (
                  <tr
                    key={r.chave}
                    className="border-t border-amber-200/60 dark:border-amber-800/30"
                  >
                    <td className="py-1 pr-3 whitespace-nowrap text-gray-800 dark:text-dark-text">
                      {formatDate(r.data)}
                    </td>
                    <td className="py-1 pr-3">
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                          r.lado === "Base"
                            ? "bg-gray-200 text-gray-700 dark:bg-dark-bg dark:text-dark-text"
                            : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                        }`}
                      >
                        {r.lado}
                      </span>
                    </td>
                    <td className="py-1 pr-3 text-gray-700 dark:text-dark-text">
                      {r.texto}
                    </td>
                    <td className="py-1 pr-3 text-gray-500 dark:text-dark-text-secondary">
                      {r.quem}
                    </td>
                    <td className="py-1 text-right whitespace-nowrap font-medium text-gray-900 dark:text-dark-text">
                      {formatCurrency(r.valor)}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}

      <PainelMarcacao
        baseValor={baseValor}
        appValor={appValor}
        marcacoes={marcacoes}
        estado={estadoMarcacao}
        nomePorId={nomePorId}
        onMarcar={onMarcar}
      />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[11px] text-gray-500 dark:text-dark-text-secondary">
          {foraBase + foraApp > 0
            ? "Linhas esmaecidas são deste cliente, mas de outra carteira ou de outro cobrador: não entram nesta linha da conferência."
            : ""}
        </span>
        {onAbrirFicha ? (
          <button
            onClick={onAbrirFicha}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 dark:border-dark-border px-3 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-900/20"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Abrir ficha do cliente
          </button>
        ) : (
          <span className="text-[11px] text-gray-400 dark:text-dark-text-secondary">
            Ficha indisponível (cliente não carregado)
          </span>
        )}
      </div>
    </div>
  );
};

export default ConferenciaDetalhe;
