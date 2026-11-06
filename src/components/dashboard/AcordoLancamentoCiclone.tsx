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
import { AcordoLancamentoCiclone as Lancamento } from "../../types";

interface Props {
  acordoId: string;
}

/**
 * Quadro "Lancamento no Ciclone" do detalhe do acordo: o acordo do app ja foi
 * lancado pelo financeiro no ERP (baixa de RENEGOCIACAO) e bate? So leitura --
 * nao altera nada (RPC acordo_lancamento_ciclone, migration 20261106000002).
 * Os dados do Ciclone chegam pelo sync diario (5h), entao um lancamento feito
 * hoje so aparece amanha.
 */
const AcordoLancamentoCiclone: React.FC<Props> = ({ acordoId }) => {
  const { fetchAcordoLancamentoCiclone } = useCollection();
  const [lancamento, setLancamento] = useState<Lancamento | null>(null);
  const [erro, setErro] = useState("");
  const [aberto, setAberto] = useState(false);

  useEffect(() => {
    let ativo = true;
    setLancamento(null);
    setErro("");
    fetchAcordoLancamentoCiclone(acordoId)
      .then((r) => {
        if (!ativo) return;
        setLancamento(r);
        // Divergencia ja abre a comparacao: e o que precisa de atencao.
        setAberto(r.status === "divergente");
      })
      .catch((err) => {
        if (!ativo) return;
        console.error("Erro ao conferir lançamento no Ciclone:", err);
        setErro("Não foi possível conferir o lançamento no Ciclone.");
      });
    return () => {
      ativo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [acordoId]);

  if (erro) {
    return <p className="text-xs text-gray-400">{erro}</p>;
  }
  if (!lancamento || lancamento.status === "fora_do_ciclone") return null;

  if (lancamento.status === "nao_lancado") {
    return (
      <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl border text-sm bg-amber-50 border-amber-100 text-amber-700">
        <Clock className="w-4 h-4 mt-0.5 shrink-0" />
        <div>
          <p className="font-semibold">Ainda não lançado no Ciclone</p>
          <p className="text-xs opacity-80">
            Quando o financeiro lançar a renegociação, a conferência aparece
            aqui (os dados do Ciclone atualizam todo dia às 5h).
          </p>
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
              ? "Lançado no Ciclone — confere com o acordo"
              : "Lançado no Ciclone com diferenças"}
          </p>
          <p className="text-xs opacity-80">
            Documento {lancamento.novoDocumento}
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
                <th className="py-1.5 px-2 text-right font-bold">Ciclone</th>
                <th className="py-1.5 px-2 text-right font-bold">Pago no Ciclone</th>
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
