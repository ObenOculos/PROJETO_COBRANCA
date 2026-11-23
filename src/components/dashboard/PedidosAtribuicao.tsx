import React, { useCallback, useEffect, useMemo, useState } from "react";
import { invalidarHistoricoCliente } from "../../utils/cacheHistoricoCliente";
import {
  AlertTriangle,
  CheckCircle2,
  Store,
  Hourglass,
  ListChecks,
  XCircle,
} from "lucide-react";
import { useCollection } from "../../contexts/CollectionContext";
import { formatCurrency, formatDate } from "../../utils/formatters";
import { round2 } from "../../filters/clientStatus";
import { ATTEMPT_RESULT_LABELS } from "../../config/collectionAttempts";
import SummaryCard from "../common/SummaryCard";
import { ModelosMensagem } from "../common/ModelosMensagem";
import { MODELOS_RECUSA_GESTOR } from "../../config/mensagensAtribuicao";
import {
  AtribuicaoPagamento,
  carregarPainelAtribuicao,
  decidirAtribuicaoPagamento,
  LinhaPainelAtribuicao,
  listarAtribuicoesGestor,
} from "../../services/atribuicoesPagamento";

// Item 66 etapa 2: gestor decide os pedidos "Cliente pagou na loja" (baixa do
// ERP creditada ao cobrador que tratou o cliente). So o cobrador pede (decisao
// do usuario, 2026-11-16). A lista "Elegiveis sem pedido" saiu em 17/11: repetia
// a Conferência de recebimentos, que agora mostra a conversa do cobrador antes
// da baixa e o pedido de cada parcela. A decisao e da RPC decidir_atribuicao_pagamento
// (uma vez por lote; confere de novo a parcela no ERP).

/** Decididos que ainda aparecem na aba (dias). */
const DIAS_HISTORICO = 30;

const rotuloResultado = (r: string): string =>
  (ATTEMPT_RESULT_LABELS as Record<string, string>)[r] ?? r;

const dataHora = (iso: string): string =>
  new Date(iso).toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  });

interface Lote {
  lote: string;
  itens: AtribuicaoPagamento[];
  total: number;
}

const PedidosAtribuicao: React.FC = () => {
  const { users } = useCollection();
  const [pedidos, setPedidos] = useState<AtribuicaoPagamento[] | null>(null);
  const [painel, setPainel] = useState<LinhaPainelAtribuicao[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [aberto, setAberto] = useState<string | null>(null);
  const [acao, setAcao] = useState<"aprovar" | "recusar">("aprovar");
  const [resposta, setResposta] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erroAcao, setErroAcao] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  // Uma secao por vez (item 38): os cards do topo escolhem qual aparece.
  const [secao, setSecao] = useState<"analise" | "decididos">("analise");

  const nomePorId = useMemo(
    () => new Map(users.map((u) => [u.id, u.name])),
    [users],
  );
  const nome = (id: string | null | undefined) =>
    (id && nomePorId.get(id)) || "Cobrador";

  const carregar = useCallback(async () => {
    setErro(null);
    try {
      const desde = new Date(
        Date.now() - DIAS_HISTORICO * 86400000,
      ).toISOString();
      const [lista, linhas] = await Promise.all([
        listarAtribuicoesGestor(desde),
        carregarPainelAtribuicao(),
      ]);
      setPedidos(lista);
      setPainel(linhas);
    } catch (e) {
      console.error("Erro ao carregar pagos na loja:", e);
      setErro(e instanceof Error ? e.message : "Falha ao carregar.");
      setPedidos([]);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const agrupar = (lista: AtribuicaoPagamento[]): Lote[] => {
    const m = new Map<string, Lote>();
    lista.forEach((p) => {
      const l = m.get(p.lote) ?? { lote: p.lote, itens: [], total: 0 };
      l.itens.push(p);
      l.total = round2(l.total + Number(p.valor_aprovado ?? p.valor));
      m.set(p.lote, l);
    });
    return [...m.values()];
  };

  const abertos = useMemo(
    () => agrupar((pedidos ?? []).filter((p) => !p.decisao)),
    [pedidos],
  );
  const decididos = useMemo(
    () => agrupar((pedidos ?? []).filter((p) => p.decisao)),
    [pedidos],
  );

  // Conversas por parcela (todos os cobradores), para o detalhe do pedido.
  const conversasPorParcela = useMemo(() => {
    const m = new Map<number, LinhaPainelAtribuicao[]>();
    painel.forEach((l) => {
      const lista = m.get(l.id_parcela) ?? [];
      lista.push(l);
      m.set(l.id_parcela, lista);
    });
    return m;
  }, [painel]);

  const abrir = (lote: string, tipo: "aprovar" | "recusar") => {
    setAberto(lote);
    setAcao(tipo);
    setResposta("");
    setErroAcao(null);
  };

  const decidir = async (l: Lote) => {
    if (acao === "recusar" && !resposta.trim()) {
      setErroAcao("Escreva o motivo da recusa para o cobrador.");
      return;
    }
    setSalvando(true);
    setErroAcao(null);
    try {
      invalidarHistoricoCliente(l.itens[0].documento);
      const r = await decidirAtribuicaoPagamento({
        lote: l.lote,
        aprovar: acao === "aprovar",
        resposta,
      });
      const quem = l.itens[0].cliente ?? l.itens[0].documento;
      setAviso(
        acao === "aprovar"
          ? `Aprovado: ${formatCurrency(Number(r.valor ?? l.total))} creditado a ${nome(
              l.itens[0].solicitado_por_id,
            )} (${quem}).`
          : `Pedido recusado (${quem}).`,
      );
      setAberto(null);
      await carregar();
    } catch (e) {
      setErroAcao(e instanceof Error ? e.message : "Falha ao registrar.");
    } finally {
      setSalvando(false);
    }
  };

  /** Quem conversou com o cliente antes do pagamento, para um lote. */
  const conversasDoLote = (l: Lote) => {
    const porCobrador = new Map<string, LinhaPainelAtribuicao>();
    l.itens.forEach((it) =>
      (conversasPorParcela.get(it.id_parcela) ?? []).forEach((c) => {
        const atual = porCobrador.get(c.cobrador_id);
        if (!atual || c.ultimo_contato_em > atual.ultimo_contato_em)
          porCobrador.set(c.cobrador_id, c);
      }),
    );
    return [...porCobrador.values()];
  };

  const totalAbertos = abertos.reduce((s, l) => s + l.total, 0);
  const aprovados = decididos.filter((l) => l.itens[0].decisao === "aprovado");
  const totalAprovado = aprovados.reduce((s, l) => s + l.total, 0);

  return (
    <div className="bg-white dark:bg-dark-bg-secondary rounded-2xl shadow-sm border border-gray-200 dark:border-dark-border p-4 lg:p-5 space-y-4">
      <div>
        <h2 className="text-xl lg:text-2xl font-bold text-gray-900 dark:text-dark-text flex items-center">
          <Store className="h-5 w-5 lg:h-6 lg:w-6 mr-2 text-teal-600 flex-shrink-0" />
          Pagos na loja depois da cobrança
        </h2>
        <p className="mt-1 text-xs text-gray-500 dark:text-dark-text-secondary">
          Cliente pagou na loja ou no banco depois de conversar com o cobrador.
          Aprovado, fica registrado no nome dele, na data do pagamento — não
          mexe na parcela nem no caixa.
        </p>
      </div>

      {aviso && (
        <div className="flex items-start justify-between gap-3 rounded-lg bg-teal-50 dark:bg-teal-900/20 px-3 py-2 text-sm text-teal-800 dark:text-teal-300">
          <span>{aviso}</span>
          <button
            onClick={() => setAviso(null)}
            className="text-xs font-medium underline"
          >
            ok
          </button>
        </div>
      )}
      {erro && (
        <div className="rounded-lg bg-red-50 dark:bg-red-900/20 px-3 py-2 text-sm text-red-700 dark:text-red-300">
          {erro}
        </div>
      )}

      {pedidos === null ? (
        <div className="py-10 text-center text-sm text-gray-500 dark:text-dark-text-secondary">
          Carregando…
        </div>
      ) : (
        <>
          {/* Cards: cada um junta os numeros da secao e a abre ao clicar */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {(
              [
                {
                  id: "analise",
                  icon: Hourglass,
                  title: "Em análise",
                  value: String(abertos.length),
                  valueTone: abertos.length > 0 ? "red" : "neutral",
                  caption: abertos.length === 1 ? "pedido" : "pedidos",
                  rows: [
                    { label: "Valor", value: formatCurrency(totalAbertos) },
                  ],
                },
                {
                  id: "decididos",
                  icon: ListChecks,
                  title: `Decididos (${DIAS_HISTORICO} dias)`,
                  value: String(decididos.length),
                  valueTone: "neutral",
                  caption: decididos.length === 1 ? "pedido" : "pedidos",
                  rows: [
                    {
                      label: "Aprovados",
                      value: `${aprovados.length} · ${formatCurrency(totalAprovado)}`,
                      tone: "green",
                    },
                    {
                      label: "Recusados",
                      value: String(decididos.length - aprovados.length),
                    },
                  ],
                },
              ] as const
            ).map((c) => (
              <SummaryCard
                key={c.id}
                selecionado={secao === c.id}
                icon={c.icon}
                title={c.title}
                value={c.value}
                valueTone={c.valueTone}
                caption={c.caption}
                rows={[...c.rows]}
                compact
                onClick={() => setSecao(c.id)}
                hint="Mostrar esta lista"
              />
            ))}
          </div>

          {/* Em analise */}
          {secao === "analise" && (
            <section className="space-y-2">
              <h3 className="text-sm font-semibold text-gray-800 dark:text-dark-text">
                Em análise ({abertos.length})
              </h3>
              {abertos.length === 0 ? (
                <div className="rounded-xl border border-dashed border-gray-200 dark:border-dark-border py-6 text-center text-sm text-gray-500 dark:text-dark-text-secondary">
                  Nenhum pedido esperando decisão.
                </div>
              ) : (
                <div className="rounded-xl border border-gray-200 dark:border-dark-border divide-y divide-gray-100 dark:divide-dark-border/40">
                  {abertos.map((l) => {
                    const p0 = l.itens[0];
                    const conversas = conversasDoLote(l);
                    const outros = conversas.filter(
                      (c) => c.cobrador_id !== p0.solicitado_por_id,
                    );
                    return (
                      <div key={l.lote} className="px-3 py-3 space-y-2">
                        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                          <div className="min-w-0 space-y-0.5">
                            <div className="text-sm font-semibold text-gray-900 dark:text-dark-text">
                              {p0.cliente ?? "(sem nome)"}{" "}
                              <span className="text-xs font-normal text-gray-400">
                                {p0.documento}
                              </span>
                            </div>
                            <div className="text-xs text-gray-600 dark:text-dark-text-secondary">
                              {nome(p0.solicitado_por_id)} pediu em{" "}
                              {dataHora(p0.created_at)}
                            </div>
                            <div className="text-sm text-gray-800 dark:text-dark-text">
                              <strong>{formatCurrency(l.total)}</strong> pago em{" "}
                              {formatDate(p0.data_pagamento)} ·{" "}
                              {l.itens
                                .map(
                                  (it) =>
                                    `venda #${it.venda ?? "—"} parc. ${it.parcela ?? "—"} (${formatCurrency(Number(it.valor))})`,
                                )
                                .join(", ")}
                            </div>
                            <div className="text-sm text-gray-700 dark:text-dark-text italic">
                              “{p0.observacao}”
                            </div>
                          </div>
                          {aberto !== l.lote && (
                            <div className="flex gap-2 flex-shrink-0">
                              <button
                                onClick={() => abrir(l.lote, "aprovar")}
                                className="inline-flex items-center gap-1 rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-700"
                              >
                                <CheckCircle2 className="h-3.5 w-3.5" />
                                Aprovar
                              </button>
                              <button
                                onClick={() => abrir(l.lote, "recusar")}
                                className="inline-flex items-center gap-1 rounded-lg border border-gray-200 dark:border-dark-border px-3 py-1.5 text-xs font-semibold text-gray-700 dark:text-dark-text hover:bg-gray-50 dark:hover:bg-dark-bg"
                              >
                                <XCircle className="h-3.5 w-3.5" />
                                Recusar
                              </button>
                            </div>
                          )}
                        </div>

                        {/* Prova da tratativa: quem conversou antes do pagamento */}
                        <div className="rounded-lg bg-gray-50 dark:bg-dark-bg/40 px-3 py-2 text-xs space-y-0.5">
                          <div className="font-semibold text-gray-700 dark:text-dark-text">
                            Conversas nos 30 dias antes do pagamento
                          </div>
                          {conversas.length === 0 ? (
                            <div className="text-gray-500">
                              Não encontradas agora (a parcela pode ter mudado
                              no ERP). Ao aprovar, o sistema confere de novo.
                            </div>
                          ) : (
                            conversas.map((c) => (
                              <div
                                key={c.cobrador_id}
                                className="text-gray-600 dark:text-dark-text-secondary"
                              >
                                <span className="font-medium text-gray-800 dark:text-dark-text">
                                  {nome(c.cobrador_id)}
                                </span>
                                : {c.contatos}{" "}
                                {c.contatos === 1 ? "conversa" : "conversas"} ·
                                última em {dataHora(c.ultimo_contato_em)} (
                                {rotuloResultado(c.ultimo_resultado)})
                              </div>
                            ))
                          )}
                          {outros.length > 0 && (
                            <div className="flex items-center gap-1 pt-1 text-amber-700 dark:text-amber-400 font-medium">
                              <AlertTriangle className="h-3.5 w-3.5" />
                              Outro cobrador também conversou com o cliente
                              antes do pagamento.
                            </div>
                          )}
                        </div>

                        {aberto === l.lote && (
                          <div className="rounded-lg border border-gray-200 dark:border-dark-border p-3 space-y-2">
                            <label className="block">
                              <span className="text-[11px] font-semibold text-gray-600 dark:text-dark-text-secondary">
                                {acao === "aprovar"
                                  ? "Resposta ao cobrador (opcional)"
                                  : "Motivo da recusa (obrigatório)"}
                              </span>
                              {acao === "recusar" && (
                                <div className="mt-1">
                                  <ModelosMensagem
                                    modelos={MODELOS_RECUSA_GESTOR}
                                    onEscolher={setResposta}
                                  />
                                </div>
                              )}
                              <input
                                type="text"
                                value={resposta}
                                onChange={(e) => setResposta(e.target.value)}
                                className="mt-0.5 w-full rounded-lg border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg px-2.5 py-1.5 text-sm text-gray-900 dark:text-dark-text focus:outline-none focus:ring-2 focus:ring-teal-500"
                              />
                            </label>
                            {acao === "aprovar" && (
                              <div className="text-[11px] text-gray-500 dark:text-dark-text-secondary">
                                Credita {formatCurrency(l.total)} a{" "}
                                {nome(p0.solicitado_por_id)} em{" "}
                                {formatDate(p0.data_pagamento)}. O valor vale o
                                que estiver baixado no ERP na hora da aprovação.
                              </div>
                            )}
                            {erroAcao && (
                              <div className="text-xs text-red-600 dark:text-red-400">
                                {erroAcao}
                              </div>
                            )}
                            <div className="flex justify-end gap-2">
                              <button
                                onClick={() => setAberto(null)}
                                className="rounded-lg border border-gray-200 dark:border-dark-border px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-dark-text"
                              >
                                Cancelar
                              </button>
                              <button
                                onClick={() => void decidir(l)}
                                disabled={salvando}
                                className={`rounded-lg px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40 ${
                                  acao === "aprovar"
                                    ? "bg-teal-600 hover:bg-teal-700"
                                    : "bg-red-600 hover:bg-red-700"
                                }`}
                              >
                                {salvando
                                  ? "Gravando…"
                                  : acao === "aprovar"
                                    ? "Confirmar aprovação"
                                    : "Confirmar recusa"}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          )}

          {secao === "decididos" && (
            <section className="space-y-2">
              <h3 className="text-sm font-semibold text-gray-800 dark:text-dark-text">
                Decididos nos últimos {DIAS_HISTORICO} dias
              </h3>
              {decididos.length === 0 && (
                <div className="rounded-xl border border-dashed border-gray-200 dark:border-dark-border py-6 text-center text-sm text-gray-500 dark:text-dark-text-secondary">
                  Nenhum pedido decidido nos últimos {DIAS_HISTORICO} dias.
                </div>
              )}
              <ul className="rounded-xl border border-gray-200 dark:border-dark-border divide-y divide-gray-100 dark:divide-dark-border/40">
                {decididos.map((l) => {
                  const p0 = l.itens[0];
                  const aprovado = p0.decisao === "aprovado";
                  return (
                    <li
                      key={l.lote}
                      className="px-3 py-2 text-xs text-gray-600 dark:text-dark-text-secondary"
                    >
                      <span
                        className={`inline-flex items-center gap-1 font-semibold ${
                          aprovado
                            ? "text-teal-600 dark:text-teal-400"
                            : "text-red-600 dark:text-red-400"
                        }`}
                      >
                        {aprovado ? (
                          <CheckCircle2 className="h-3 w-3" />
                        ) : (
                          <XCircle className="h-3 w-3" />
                        )}
                        {aprovado ? "Aprovado" : "Recusado"}
                      </span>{" "}
                      {p0.excecao && (
                        <span
                          className="rounded bg-amber-50 px-1 text-[10px] font-semibold text-amber-700 dark:bg-amber-900/20 dark:text-amber-300"
                          title={`Atribuído pelo gestor sem pedido: ${p0.observacao}`}
                        >
                          exceção do gestor
                        </span>
                      )}{" "}
                      · {p0.cliente ?? p0.documento} ·{" "}
                      {nome(p0.solicitado_por_id)} · {formatCurrency(l.total)}{" "}
                      pago em {formatDate(p0.data_pagamento)} · decidido por{" "}
                      {(p0.decidido_por_id &&
                        nomePorId.get(p0.decidido_por_id)) ||
                        "gestor"}{" "}
                      em{" "}
                      {p0.decidido_em
                        ? new Date(p0.decidido_em).toLocaleDateString("pt-BR")
                        : ""}
                      {p0.resposta && ` — ${p0.resposta}`}
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
};

export default PedidosAtribuicao;
