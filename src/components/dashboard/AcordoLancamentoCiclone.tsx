import React, { useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
} from "lucide-react";
import { useCollection } from "../../contexts/CollectionContext";
import { formatCurrency, formatDate } from "../../utils/formatters";
import {
  AcordoLancamentoCiclone as Lancamento,
  SistemaLancamentoAcordo,
} from "../../types";

interface Props {
  acordoId: string;
  /** Ciclone (Focco Brasil, padrao) ou SSOtica (oticas). */
  sistema?: SistemaLancamentoAcordo;
}

// Textos por sistema. Ciclone: o financeiro lanca a renegociacao, sync as
// 5h. SSOtica: a loja lanca a "Renegociacao de Parcelas", importacao as 6h;
// la a parcela paga na loja ja da baixa no acordo (migration 20261112000003).
const TEXTOS: Record<
  SistemaLancamentoAcordo,
  { nome: string; no: string; naoLancado: string; documento: string }
> = {
  ciclone: {
    nome: "Ciclone",
    no: "no Ciclone",
    naoLancado:
      "Quando o financeiro lançar a renegociação, a conferência aparece aqui (os dados do Ciclone atualizam todo dia às 5h).",
    documento: "Documento",
  },
  ssotica: {
    nome: "SSÓtica",
    no: "na SSÓtica",
    naoLancado:
      "Quando a loja lançar a renegociação na SSÓtica, a conferência aparece aqui (atualiza todo dia às 6h). Depois disso, parcela paga na loja dá baixa aqui no acordo.",
    documento: "Loja",
  },
};

/**
 * Quadro "Lancamento no Ciclone" do detalhe do acordo: o acordo do app ja foi
 * lancado pelo financeiro no ERP (baixa de RENEGOCIACAO) e bate? So leitura --
 * nao altera nada (RPC acordo_lancamento_ciclone, migration 20261106000002).
 * Os dados do Ciclone chegam pelo sync diario (5h), entao um lancamento feito
 * hoje so aparece amanha. Com sistema="ssotica", o mesmo quadro para a
 * renegociacao lancada pela loja na SSOtica (acordo_lancamento_ssotica).
 */
const AcordoLancamentoCiclone: React.FC<Props> = ({
  acordoId,
  sistema = "ciclone",
}) => {
  const textos = TEXTOS[sistema];
  const { fetchAcordoLancamentoCiclone } = useCollection();
  const [lancamento, setLancamento] = useState<Lancamento | null>(null);
  const [erro, setErro] = useState("");
  const [aberto, setAberto] = useState(false);

  useEffect(() => {
    let ativo = true;
    setLancamento(null);
    setErro("");
    fetchAcordoLancamentoCiclone(acordoId, sistema)
      .then((r) => {
        if (!ativo) return;
        setLancamento(r);
        // Divergencia ja abre a comparacao: e o que precisa de atencao.
        setAberto(r.status === "divergente");
      })
      .catch((err) => {
        if (!ativo) return;
        console.error(`Erro ao conferir lançamento ${textos.no}:`, err);
        setErro(`Não foi possível conferir o lançamento ${textos.no}.`);
      });
    return () => {
      ativo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [acordoId, sistema]);

  if (erro) {
    return <p className="text-xs text-gray-400">{erro}</p>;
  }
  if (
    !lancamento ||
    lancamento.status === "fora_do_ciclone" ||
    lancamento.status === "fora_da_ssotica"
  )
    return null;

  if (lancamento.status === "nao_lancado") {
    return (
      <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl border text-sm bg-amber-50 border-amber-100 text-amber-700">
        <Clock className="w-4 h-4 mt-0.5 shrink-0" />
        <div>
          <p className="font-semibold">Ainda não lançado {textos.no}</p>
          <p className="text-xs opacity-80">{textos.naoLancado}</p>
        </div>
      </div>
    );
  }

  const ok = lancamento.status === "lancado";
  return (
    <div
      className={`rounded-xl border text-sm ${
        ok
          ? "bg-green-50 border-green-100 text-green-700"
          : "bg-red-50 border-red-100 text-red-700"
      }`}
    >
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        className="w-full flex items-start gap-2 px-3 py-2.5 text-left"
      >
        {ok ? (
          <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
        ) : (
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <p className="font-semibold">
            {ok
              ? `Lançado ${textos.no} — confere com o acordo`
              : `Lançado ${textos.no} com diferenças`}
          </p>
          <p className="text-xs opacity-80">
            {textos.documento} {lancamento.novoDocumento}
            {lancamento.dataBaixa
              ? ` · ${formatDate(lancamento.dataBaixa)}`
              : ""}
          </p>
          {!ok && lancamento.divergencias.length > 0 && (
            <ul className="mt-1 text-xs list-disc pl-4 space-y-0.5">
              {lancamento.divergencias.map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
          )}
        </div>
        {aberto ? (
          <ChevronDown className="w-4 h-4 mt-0.5 shrink-0" />
        ) : (
          <ChevronRight className="w-4 h-4 mt-0.5 shrink-0" />
        )}
      </button>

      {aberto && lancamento.parcelas.length > 0 && (
        <div className="px-3 pb-3 overflow-x-auto">
          <table className="w-full text-xs text-gray-700 dark:text-dark-text bg-white dark:bg-dark-bg rounded-lg overflow-hidden">
            <thead>
              <tr className="text-[10px] uppercase text-gray-400 border-b border-gray-100 dark:border-dark-border">
                <th className="py-1.5 px-2 text-left font-bold">Parc.</th>
                <th className="py-1.5 px-2 text-right font-bold">App</th>
                <th className="py-1.5 px-2 text-right font-bold">{textos.nome}</th>
                <th className="py-1.5 px-2 text-right font-bold">
                  Pago {textos.no}
                </th>
                <th className="py-1.5 px-2" />
              </tr>
            </thead>
            <tbody>
              {lancamento.parcelas.map((p) => (
                <tr
                  key={p.ordem}
                  className={`border-b border-gray-50 dark:border-dark-border last:border-0 ${
                    p.bate ? "" : "bg-red-50/60 dark:bg-red-900/10"
                  }`}
                >
                  <td className="py-1.5 px-2">{p.numeroApp ?? "—"}</td>
                  <td className="py-1.5 px-2 text-right whitespace-nowrap">
                    {p.valorApp !== null ? formatCurrency(p.valorApp) : "—"}
                    <span className="block text-[10px] text-gray-400">
                      {p.vencimentoApp ? formatDate(p.vencimentoApp) : ""}
                    </span>
                  </td>
                  <td className="py-1.5 px-2 text-right whitespace-nowrap">
                    {p.valorErp !== null ? formatCurrency(p.valorErp) : "—"}
                    <span className="block text-[10px] text-gray-400">
                      {p.vencimentoErp ? formatDate(p.vencimentoErp) : ""}
                    </span>
                  </td>
                  <td className="py-1.5 px-2 text-right whitespace-nowrap">
                    {p.recebidoErp !== null ? formatCurrency(p.recebidoErp) : "—"}
                  </td>
                  <td className="py-1.5 px-2 text-center">
                    {p.bate ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-green-500 inline" />
                    ) : (
                      <AlertTriangle className="w-3.5 h-3.5 text-red-500 inline" />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default AcordoLancamentoCiclone;
