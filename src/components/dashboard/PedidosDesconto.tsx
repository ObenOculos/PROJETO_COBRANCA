import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Hourglass,
  ListChecks,
  Percent,
  XCircle,
} from "lucide-react";
import SummaryCard from "../common/SummaryCard";
import { useCollection } from "../../contexts/CollectionContext";
import { formatCurrency } from "../../utils/formatters";
import { round2 } from "../../filters/clientStatus";
import {
  decidirPedidoDesconto,
  listarPedidosDescontoGestor,
  PedidoDescontoGestor,
} from "../../services/pedidosDesconto";

// Item 71, etapa 2: aba Correcoes -> "Descontos". O cobrador (interno/
// terceirizado/juridico) pede o desconto ANTES de registrar o pagamento; o
// gestor aprova (o valor pedido ou outro) ou recusa com resposta. Aprovado
// vale por 3 dias; a RPC decidir_pedido_desconto decide uma vez.

/** Decididos que ainda aparecem na aba (dias). */
const DIAS_HISTORICO = 30;

const lerValor = (texto: string): number => {
  const t = texto.trim();
  if (!t) return NaN;
  return Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t);
};

const pct = (v: number, base: number) =>
  base > 0 ? `${((v / base) * 100).toFixed(1).replace(".", ",")}%` : "";

const dataBR = (iso: string | null) =>
  iso ? iso.slice(0, 10).split("-").reverse().join("/") : "";

const PedidosDesconto: React.FC = () => {
  const { users } = useCollection();
  const [pedidos, setPedidos] = useState<PedidoDescontoGestor[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aberto, setAberto] = useState<string | null>(null);
  const [acao, setAcao] = useState<"aprovar" | "recusar">("aprovar");
  const [valorTexto, setValorTexto] = useState("");
  const [resposta, setResposta] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erroAcao, setErroAcao] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  // Uma secao por vez: os cards do topo escolhem qual aparece.
  const [secao, setSecao] = useState<"analise" | "decididos">("analise");

  const nomePorId = useMemo(
    () => new Map(users.map((u) => [u.id, u.name])),
    [users],
  );

  const carregar = useCallback(async () => {
    setErro(null);
    try {
      const desde = new Date(
        Date.now() - DIAS_HISTORICO * 86400000,
      ).toISOString();
      setPedidos(await listarPedidosDescontoGestor(desde));
    } catch (e) {
      console.error("Erro ao carregar pedidos de desconto:", e);
      const err = (e ?? {}) as { message?: string; code?: string };
      setErro(
        err.code === "42P01" || err.code === "PGRST205"
          ? "A tabela de pedidos de desconto ainda não existe no banco (falta aplicar a migration)."
          : err.message || "Falha ao carregar os pedidos.",
      );
      setPedidos([]);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const abrir = (p: PedidoDescontoGestor, tipo: "aprovar" | "recusar") => {
    setAberto(p.id);
    setAcao(tipo);
    setValorTexto(p.desconto_pedido.toFixed(2).replace(".", ","));
    setResposta("");
    setErroAcao(null);
  };

  const decidir = async (p: PedidoDescontoGestor) => {
    const valor = lerValor(valorTexto);
    if (
      acao === "aprovar" &&
      !(valor >= 0.01 && valor < p.valor_devido - 0.001)
    ) {
      setErroAcao(
        `Informe um desconto entre R$ 0,01 e menos que ${formatCurrency(p.valor_devido)}.`,
      );
      return;
    }
    if (acao === "recusar" && !resposta.trim()) {
      setErroAcao("Escreva o motivo da recusa para o cobrador.");
      return;
    }
    setSalvando(true);
    setErroAcao(null);
    try {
      const r = await decidirPedidoDesconto({
        id: p.id,
        aprovar: acao === "aprovar",
        descontoAprovado: acao === "aprovar" ? round2(valor) : undefined,
        resposta,
      });
      setAviso(
        r.decisao === "aprovado"
          ? `Desconto de ${formatCurrency(Number(r.desconto ?? valor))} autorizado (${p.cliente ?? p.documento}), válido até ${dataBR(r.valido_ate ?? null)}. O cobrador registra o pagamento.`
          : `Pedido recusado (${p.cliente ?? p.documento}).`,
      );
      setAberto(null);
      await carregar();
    } catch (e) {
      setErroAcao(e instanceof Error ? e.message : "Falha ao registrar.");
    } finally {
      setSalvando(false);
    }
  };

  const abertos = (pedidos ?? []).filter((p) => !p.decisao);
  const decididos = (pedidos ?? []).filter((p) => p.decisao);
  const totalAbertos = abertos.reduce((s, p) => s + p.desconto_pedido, 0);
  const okDecididos = decididos.filter((p) => p.decisao === "aprovado");

  const resumo = (p: PedidoDescontoGestor) =>
    `${p.tipo === "tudo" ? "Quitar a dívida inteira" : `${p.parcelas.length} ${p.parcelas.length === 1 ? "parcela marcada" : "parcelas marcadas"}`}: devia ${formatCurrency(p.valor_devido)}, paga ${formatCurrency(p.valor_pago)}`;

  return (
    <div className="bg-white dark:bg-dark-bg-secondary rounded-2xl shadow-sm border border-gray-200 dark:border-dark-border p-4 lg:p-5 space-y-4">
      <div>
        <h2 className="text-xl lg:text-2xl font-bold text-gray-900 dark:text-dark-text flex items-center">
          <Percent className="h-5 w-5 lg:h-6 lg:w-6 mr-2 text-teal-600 flex-shrink-0" />
          Pedidos de desconto
        </h2>
        <p className="mt-1 text-xs text-gray-500 dark:text-dark-text-secondary">
          O cobrador pede antes de registrar o pagamento. Aprovado, ele pode dar
          até o valor autorizado nos próximos 3 dias. Você pode aprovar um valor
          diferente do pedido.
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
          {/* Cards: cada um junta os numeros da secao e a abre ao clicar
              (mesma forma de "Pagos na loja"). */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <SummaryCard
              selecionado={secao === "analise"}
              icon={Hourglass}
              title="Em análise"
              value={String(abertos.length)}
              valueTone={abertos.length > 0 ? "red" : "neutral"}
              caption={abertos.length === 1 ? "pedido" : "pedidos"}
              rows={[{ label: "Valor", value: formatCurrency(totalAbertos) }]}
              compact
              onClick={() => setSecao("analise")}
              hint="Mostrar esta lista"
            />
            <SummaryCard
              selecionado={secao === "decididos"}
              icon={ListChecks}
              title={`Decididos (${DIAS_HISTORICO} dias)`}
              value={String(decididos.length)}
              valueTone="neutral"
              caption={decididos.length === 1 ? "pedido" : "pedidos"}
              rows={[
                {
                  label: "Aprovados",
                  value: `${okDecididos.length} · ${formatCurrency(okDecididos.reduce((s, p) => s + Number(p.desconto_aprovado), 0))}`,
                  tone: "green",
                },
                {
                  label: "Recusados",
                  value: String(decididos.length - okDecididos.length),
                },
              ]}
              compact
              onClick={() => setSecao("decididos")}
              hint="Mostrar esta lista"
            />
          </div>

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
                {abertos.map((p) => (
                  <div key={p.id} className="px-3 py-3 space-y-2">
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                      <div className="min-w-0 space-y-0.5">
                        <div className="text-sm font-semibold text-gray-900 dark:text-dark-text">
                          {p.cliente ?? "(sem nome)"}{" "}
                          <span className="text-xs font-normal text-gray-400">
                            {p.documento}
                          </span>
                        </div>
                        <div className="text-xs text-gray-600 dark:text-dark-text-secondary">
                          {nomePorId.get(p.solicitado_por_id) ?? "Cobrador"}{" "}
                          pediu em{" "}
                          {new Date(p.created_at).toLocaleString("pt-BR", {
                            dateStyle: "short",
                            timeStyle: "short",
                          })}
                        </div>
                        <div className="text-sm text-gray-800 dark:text-dark-text">
                          Desconto de{" "}
                          <strong>{formatCurrency(p.desconto_pedido)}</strong>{" "}
                          ({pct(p.desconto_pedido, p.valor_devido)}) · {resumo(p)}
                        </div>
                        <div className="text-sm text-gray-700 dark:text-dark-text italic">
                          “{p.motivo}”
                        </div>
                      </div>
                      {aberto !== p.id && (
                        <div className="flex gap-2 flex-shrink-0">
                          <button
                            onClick={() => abrir(p, "aprovar")}
                            className="inline-flex items-center gap-1 rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-700"
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Aprovar
                          </button>
                          <button
                            onClick={() => abrir(p, "recusar")}
                            className="inline-flex items-center gap-1 rounded-lg border border-gray-200 dark:border-dark-border px-3 py-1.5 text-xs font-semibold text-gray-700 dark:text-dark-text hover:bg-gray-50 dark:hover:bg-dark-bg"
                          >
                            <XCircle className="h-3.5 w-3.5" />
                            Recusar
                          </button>
                        </div>
                      )}
                    </div>

                    {aberto === p.id && (
                      <div className="rounded-lg border border-gray-200 dark:border-dark-border p-3 space-y-2">
                        <div className="flex flex-col sm:flex-row gap-2">
                          {acao === "aprovar" && (
                            <label className="sm:w-44">
                              <span className="text-[11px] font-semibold text-gray-600 dark:text-dark-text-secondary">
                                Desconto autorizado
                              </span>
                              <input
                                type="text"
                                inputMode="decimal"
                                value={valorTexto}
                                onChange={(e) => setValorTexto(e.target.value)}
                                className="mt-0.5 w-full rounded-lg border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg px-2.5 py-1.5 text-sm text-gray-900 dark:text-dark-text focus:outline-none focus:ring-2 focus:ring-teal-500"
                              />
                            </label>
                          )}
                          <label className="flex-1">
                            <span className="text-[11px] font-semibold text-gray-600 dark:text-dark-text-secondary">
                              {acao === "aprovar"
                                ? "Resposta ao cobrador (opcional)"
                                : "Motivo da recusa (obrigatório)"}
                            </span>
                            <input
                              type="text"
                              value={resposta}
                              onChange={(e) => setResposta(e.target.value)}
                              className="mt-0.5 w-full rounded-lg border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg px-2.5 py-1.5 text-sm text-gray-900 dark:text-dark-text focus:outline-none focus:ring-2 focus:ring-teal-500"
                            />
                          </label>
                        </div>
                        {acao === "aprovar" &&
                          Math.abs(lerValor(valorTexto) - p.desconto_pedido) >
                            0.009 &&
                          lerValor(valorTexto) > 0 && (
                            <div className="text-xs text-amber-700 dark:text-amber-400">
                              Diferente do pedido: o cliente precisa pagar{" "}
                              {formatCurrency(
                                round2(p.valor_devido - lerValor(valorTexto)),
                              )}{" "}
                              para usar este desconto.
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
                            onClick={() => void decidir(p)}
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
                ))}
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
                {decididos.map((p) => (
                  <li
                    key={p.id}
                    className="px-3 py-2 text-xs text-gray-600 dark:text-dark-text-secondary"
                  >
                    <span
                      className={`inline-flex items-center gap-1 font-semibold ${
                        p.decisao === "aprovado"
                          ? "text-teal-600 dark:text-teal-400"
                          : "text-red-600 dark:text-red-400"
                      }`}
                    >
                      {p.decisao === "aprovado" ? (
                        <CheckCircle2 className="h-3 w-3" />
                      ) : (
                        <XCircle className="h-3 w-3" />
                      )}
                      {p.decisao === "aprovado"
                        ? `Aprovado ${formatCurrency(Number(p.desconto_aprovado))} até ${dataBR(p.valido_ate)}`
                        : "Recusado"}
                    </span>{" "}
                    · {p.cliente ?? p.documento} ·{" "}
                    {nomePorId.get(p.solicitado_por_id) ?? "cobrador"} pediu{" "}
                    {formatCurrency(p.desconto_pedido)} ({p.motivo}) · decidido
                    por{" "}
                    {p.decidido_por_id
                      ? (nomePorId.get(p.decidido_por_id) ?? "gestor")
                      : "gestor"}{" "}
                    em{" "}
                    {p.decidido_em
                      ? new Date(p.decidido_em).toLocaleDateString("pt-BR")
                      : ""}
                    {p.resposta && ` — ${p.resposta}`}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
};

export default PedidosDesconto;
