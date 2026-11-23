import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Banknote,
  ExternalLink,
  Lightbulb,
  Tag,
} from "lucide-react";
import SummaryCard from "../common/SummaryCard";
import { SaldoAberto } from "../common/SaldoAberto";
import { useCollection } from "../../contexts/CollectionContext";
import { useAuth } from "../../contexts/AuthContext";
import { ClientGroup } from "../../types";
import { formatCurrency } from "../../utils/formatters";
import {
  DIAS_CONFERIR_CHEQUE,
  GRUPO_CHEQUE_LABEL,
  GrupoCheque,
  MESES_SUGESTAO_CHEQUE,
} from "../../config/cheque";
import {
  LinhaPainelCheque,
  carregarPainelCheques,
  mensagemErroCheque,
} from "../../utils/cheques";
import MarcarChequeInline from "./MarcarChequeInline";
import ClientDetailModal from "./ClientDetailModal";

// Item 87 (2026-11-23): painel do gestor para clientes em CONDICAO DE
// CHEQUE. Nenhum deles fica com cobrador -- a trava e no banco
// (clientes_condicao_cheque). Aqui o gestor acompanha os cheques em carteira
// do Ciclone, marca/desmarca "Paga em cheque" e ve as sugestoes.

const dataBR = (iso: string | null) =>
  iso ? iso.slice(0, 10).split("-").reverse().join("/") : "";

const ORDEM: GrupoCheque[] = [
  "cheque_conferir",
  "cheque_carteira",
  "paga_em_cheque",
  "sugestao",
];

const PainelCheques: React.FC = () => {
  const { users, getClientGroups, refreshCollections } = useCollection();
  const { user } = useAuth();
  const [linhas, setLinhas] = useState<LinhaPainelCheque[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [grupo, setGrupo] = useState<GrupoCheque>("cheque_conferir");
  const [aberto, setAberto] = useState<string | null>(null);
  const [ficha, setFicha] = useState<ClientGroup | null>(null);

  const nomePorId = useMemo(
    () => new Map(users.map((u) => [u.id, u.name])),
    [users],
  );

  const carregar = useCallback(async () => {
    setErro(null);
    try {
      setLinhas(await carregarPainelCheques());
    } catch (e) {
      console.error("Erro ao carregar painel de cheques:", e);
      setErro(mensagemErroCheque(e));
      setLinhas([]);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const porGrupo = useMemo(() => {
    const m = new Map<GrupoCheque, LinhaPainelCheque[]>(
      ORDEM.map((g) => [g, []]),
    );
    (linhas ?? []).forEach((l) => m.get(l.grupo as GrupoCheque)?.push(l));
    return m;
  }, [linhas]);

  // Abre no primeiro grupo com algo, na primeira carga.
  useEffect(() => {
    if (!linhas) return;
    if ((porGrupo.get(grupo) ?? []).length === 0) {
      const primeiro = ORDEM.find((g) => (porGrupo.get(g) ?? []).length > 0);
      if (primeiro) setGrupo(primeiro);
    }
    // so na carga
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linhas]);

  const lista = porGrupo.get(grupo) ?? [];
  const soma = (g: GrupoCheque, f: (l: LinhaPainelCheque) => number) =>
    (porGrupo.get(g) ?? []).reduce((s, l) => s + (Number(f(l)) || 0), 0);
  const qtd = (g: GrupoCheque) => (porGrupo.get(g) ?? []).length;

  const fichaDe = (documento: string): (() => void) | null => {
    const g = getClientGroups().find((c) => c.document === documento);
    return g ? () => setFicha(g) : null;
  };

  const depoisDeMarcar = async (
    l: LinhaPainelCheque,
    marcar: boolean,
    r: { retirado_da_carteira: boolean; segue_em_condicao: boolean },
  ) => {
    setAberto(null);
    setAviso(
      marcar
        ? `${l.cliente} marcado como "Paga em cheque".${r.retirado_da_carteira ? " Saiu da carteira do cobrador." : ""}`
        : r.segue_em_condicao
          ? `${l.cliente} desmarcado, mas continua fora da carteira: ainda tem cheque em carteira no Ciclone.`
          : `${l.cliente} desmarcado. Volta para a distribuição normal da carteira.`,
    );
    await Promise.all([
      carregar(),
      r.retirado_da_carteira ? refreshCollections() : Promise.resolve(),
    ]);
  };

  return (
    <div className="bg-white dark:bg-dark-bg-secondary rounded-2xl shadow-sm border border-gray-200 dark:border-dark-border p-4 lg:p-5 space-y-4">
      <div>
        <h2 className="text-xl lg:text-2xl font-bold text-gray-900 dark:text-dark-text flex items-center">
          <Banknote className="h-5 w-5 lg:h-6 lg:w-6 mr-2 text-amber-600 flex-shrink-0" />
          Clientes em condição de cheque
        </h2>
        <p className="mt-1 text-xs text-gray-500 dark:text-dark-text-secondary">
          Estes clientes não ficam com nenhum cobrador: só o gestor trata.
          Cheque em carteira no Ciclone entra e sai sozinho (quando o financeiro
          dá baixa ou passa para devolvido). &quot;Paga em cheque&quot; é marcado aqui
          ou na ficha do cliente.
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

      {linhas === null ? (
        <div className="py-10 text-center text-sm text-gray-500 dark:text-dark-text-secondary">
          Carregando…
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2">
            <SummaryCard
              selecionado={grupo === "cheque_conferir"}
              icon={AlertTriangle}
              title={GRUPO_CHEQUE_LABEL.cheque_conferir}
              value={String(qtd("cheque_conferir"))}
              valueTone={qtd("cheque_conferir") > 0 ? "red" : "neutral"}
              caption={qtd("cheque_conferir") === 1 ? "cliente" : "clientes"}
              rows={[
                {
                  label: `Cheques vencidos há +${DIAS_CONFERIR_CHEQUE} dias`,
                  value: formatCurrency(soma("cheque_conferir", (l) => l.cheques_valor)),
                },
              ]}
              compact
              onClick={() => setGrupo("cheque_conferir")}
              hint="Compensou (falta baixa) ou voltou? Confirmar com o financeiro"
            />
            <SummaryCard
              selecionado={grupo === "cheque_carteira"}
              icon={Banknote}
              title={GRUPO_CHEQUE_LABEL.cheque_carteira}
              value={String(qtd("cheque_carteira"))}
              valueTone="neutral"
              caption={qtd("cheque_carteira") === 1 ? "cliente" : "clientes"}
              rows={[
                {
                  label: "Cheques no prazo",
                  value: formatCurrency(soma("cheque_carteira", (l) => l.cheques_valor)),
                },
              ]}
              compact
              onClick={() => setGrupo("cheque_carteira")}
              hint="Mostrar esta lista"
            />
            <SummaryCard
              selecionado={grupo === "paga_em_cheque"}
              icon={Tag}
              title={GRUPO_CHEQUE_LABEL.paga_em_cheque}
              value={String(qtd("paga_em_cheque"))}
              valueTone="neutral"
              caption="marcados pelo gestor"
              rows={[
                {
                  label: "Vencido",
                  value: formatCurrency(soma("paga_em_cheque", (l) => l.vencido)),
                  tone: "red",
                },
                {
                  label: "A vencer",
                  value: formatCurrency(soma("paga_em_cheque", (l) => l.a_vencer)),
                },
              ]}
              compact
              onClick={() => setGrupo("paga_em_cheque")}
              hint="Mostrar esta lista"
            />
            <SummaryCard
              selecionado={grupo === "sugestao"}
              icon={Lightbulb}
              title={GRUPO_CHEQUE_LABEL.sugestao}
              value={String(qtd("sugestao"))}
              valueTone="neutral"
              caption={`pagaram em cheque (${MESES_SUGESTAO_CHEQUE} meses)`}
              rows={[
                {
                  label: "Vencido",
                  value: formatCurrency(soma("sugestao", (l) => l.vencido)),
                  tone: "red",
                },
                {
                  label: "A vencer",
                  value: formatCurrency(soma("sugestao", (l) => l.a_vencer)),
                },
              ]}
              compact
              onClick={() => setGrupo("sugestao")}
              hint="Clientes que pagaram em cheque no Ciclone. Nada é marcado sozinho"
            />
          </div>

          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-gray-800 dark:text-dark-text">
              {GRUPO_CHEQUE_LABEL[grupo]} ({lista.length})
            </h3>
            {grupo === "sugestao" && lista.length > 0 && (
              <p className="text-xs text-gray-500 dark:text-dark-text-secondary">
                Pagaram alguma vez em cheque, mas o Ciclone não diz se a dívida
                de agora também vai ser em cheque. Confira antes de marcar: quem
                deve de verdade precisa continuar na cobrança.
              </p>
            )}
            {lista.length === 0 ? (
              <div className="rounded-xl border border-dashed border-gray-200 dark:border-dark-border py-6 text-center text-sm text-gray-500 dark:text-dark-text-secondary">
                Nenhum cliente nesta lista.
              </div>
            ) : (
              <div className="rounded-xl border border-gray-200 dark:border-dark-border divide-y divide-gray-100 dark:divide-dark-border/40">
                {lista.map((l) => {
                  const abrirFicha = fichaDe(l.documento);
                  const podeDesmarcar = l.paga_em_cheque;
                  const podeMarcar = !l.paga_em_cheque;
                  return (
                    <div key={l.documento} className="px-3 py-3 space-y-2">
                      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                        <div className="min-w-0 space-y-1">
                          <div className="text-sm font-semibold text-gray-900 dark:text-dark-text">
                            {l.cliente}{" "}
                            <span className="text-xs font-normal text-gray-400">
                              {l.codigo_cliente_erp
                                ? `cód. ${l.codigo_cliente_erp}`
                                : l.documento}
                              {l.loja ? ` · ${l.loja}` : ""}
                            </span>
                          </div>

                          {l.cheques_qtd > 0 && (
                            <div
                              className={`text-sm ${
                                l.grupo === "cheque_conferir"
                                  ? "text-red-700 dark:text-red-400"
                                  : "text-gray-800 dark:text-dark-text"
                              }`}
                            >
                              {l.cheques_qtd} cheque{l.cheques_qtd !== 1 ? "s" : ""}{" "}
                              em carteira ·{" "}
                              <strong>{formatCurrency(Number(l.cheques_valor))}</strong>
                              {l.cheque_venc_mais_antigo &&
                                (l.dias_cheque_vencido
                                  ? ` · venceu em ${dataBR(l.cheque_venc_mais_antigo)} (${l.dias_cheque_vencido} dias)`
                                  : ` · vence em ${dataBR(l.cheque_venc_mais_antigo)}`)}
                            </div>
                          )}

                          {l.paga_em_cheque && (
                            <div className="text-xs text-gray-600 dark:text-dark-text-secondary">
                              <span className="font-semibold text-amber-700 dark:text-amber-400">
                                Paga em cheque
                              </span>{" "}
                              · marcado por{" "}
                              {(l.marcado_por && nomePorId.get(l.marcado_por)) || "gestor"}{" "}
                              em {dataBR(l.marcado_em)}
                              {l.motivo && (
                                <span className="italic"> — “{l.motivo}”</span>
                              )}
                            </div>
                          )}

                          {l.grupo === "sugestao" && l.ultima_baixa_cheque && (
                            <div className="text-xs text-gray-600 dark:text-dark-text-secondary">
                              Última baixa em cheque no Ciclone:{" "}
                              {dataBR(l.ultima_baixa_cheque)}
                              {l.cobrador_atual && (
                                <>
                                  {" "}· hoje com{" "}
                                  {nomePorId.get(l.cobrador_atual) ?? "cobrador"}
                                </>
                              )}
                            </div>
                          )}

                          <div className="flex flex-wrap items-center gap-1.5">
                            <SaldoAberto
                              saldo={{
                                vencido: Number(l.vencido) || 0,
                                aVencer: Number(l.a_vencer) || 0,
                              }}
                            />
                          </div>

                          {l.grupo !== "sugestao" && l.saiu_de && (
                            <div className="text-[11px] text-gray-500 dark:text-dark-text-secondary">
                              Saiu da carteira de{" "}
                              {nomePorId.get(l.saiu_de) ?? "cobrador"} em{" "}
                              {dataBR(l.saiu_em)}
                            </div>
                          )}
                        </div>

                        {aberto !== l.documento && (
                          <div className="flex flex-wrap gap-2 flex-shrink-0">
                            {abrirFicha && (
                              <button
                                onClick={abrirFicha}
                                className="inline-flex items-center gap-1 rounded-lg border border-gray-200 dark:border-dark-border px-3 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-900/20"
                              >
                                <ExternalLink className="h-3.5 w-3.5" />
                                Abrir ficha
                              </button>
                            )}
                            {podeMarcar && (
                              <button
                                onClick={() => setAberto(l.documento)}
                                className="inline-flex items-center gap-1 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700"
                              >
                                <Tag className="h-3.5 w-3.5" />
                                Marcar &quot;Paga em cheque&quot;
                              </button>
                            )}
                            {podeDesmarcar && (
                              <button
                                onClick={() => setAberto(l.documento)}
                                className="inline-flex items-center gap-1 rounded-lg border border-teal-200 dark:border-teal-800 px-3 py-1.5 text-xs font-medium text-teal-700 hover:bg-teal-50 dark:text-teal-300 dark:hover:bg-teal-900/20"
                              >
                                Desmarcar
                              </button>
                            )}
                          </div>
                        )}
                      </div>

                      {aberto === l.documento && (
                        <MarcarChequeInline
                          documento={l.documento}
                          marcar={!l.paga_em_cheque}
                          escuro
                          onCancelar={() => setAberto(null)}
                          onFeito={(r) => void depoisDeMarcar(l, !l.paga_em_cheque, r)}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </>
      )}

      {ficha && (
        <ClientDetailModal
          clientGroup={ficha}
          userType={user?.type || "manager"}
          onClose={() => {
            setFicha(null);
            void carregar();
          }}
        />
      )}
    </div>
  );
};

export default PainelCheques;
