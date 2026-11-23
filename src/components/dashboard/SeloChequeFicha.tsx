import React, { useCallback, useEffect, useState } from "react";
import { Banknote } from "lucide-react";
import { formatCurrency } from "../../utils/formatters";
import {
  CondicaoChequeCliente,
  carregarCondicaoCheque,
} from "../../utils/cheques";
import MarcarChequeInline from "./MarcarChequeInline";

// Item 87: na Ficha, avisa que o cliente esta em condicao de cheque (fica so
// com o gestor) e deixa o gestor marcar/desmarcar "Paga em cheque".
// Cobrador so ve o aviso. Sem condicao e sem ser gestor, nao renderiza.

const dataBR = (iso: string | null) =>
  iso ? iso.slice(0, 10).split("-").reverse().join("/") : "";

interface Props {
  documento: string;
  souGestor: boolean;
  /** Marcou/desmarcou e o cliente saiu da carteira: recarregar a carteira. */
  onMudouCarteira: () => void;
}

const SeloChequeFicha: React.FC<Props> = ({
  documento,
  souGestor,
  onMudouCarteira,
}) => {
  const [cond, setCond] = useState<CondicaoChequeCliente | null>(null);
  const [carregado, setCarregado] = useState(false);
  const [aberto, setAberto] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    try {
      setCond(await carregarCondicaoCheque(documento));
    } catch (e) {
      // Migration ainda nao aplicada ou falha de rede: a Ficha segue sem o selo.
      console.warn("Condição de cheque indisponível:", e);
      setCond(null);
    } finally {
      setCarregado(true);
    }
  }, [documento]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  if (!carregado) return null;
  if (!cond && !souGestor) return null;

  const marcado = !!cond?.paga_em_cheque;
  const temCheque = (cond?.cheques_qtd ?? 0) > 0;

  return (
    <div className="mt-2 space-y-2">
      {cond && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <Banknote className="h-4 w-4 flex-shrink-0 text-amber-600" />
          <div className="min-w-0 space-y-0.5">
            <div className="font-semibold">
              Condição de cheque — fica só com o gestor, não vai para cobrador
            </div>
            {temCheque && (
              <div>
                {cond.cheques_qtd} cheque{cond.cheques_qtd !== 1 ? "s" : ""} em
                carteira no Ciclone · {formatCurrency(Number(cond.cheques_valor))}
                {cond.cheque_venc_mais_antigo &&
                  ` · mais antigo vence(u) em ${dataBR(cond.cheque_venc_mais_antigo)}`}
              </div>
            )}
            {marcado && <div>Marcado pelo gestor como &quot;Paga em cheque&quot;.</div>}
          </div>
        </div>
      )}

      {aviso && (
        <div className="rounded-lg bg-teal-50 px-3 py-1.5 text-xs text-teal-800">
          {aviso}
        </div>
      )}

      {souGestor && !aberto && (
        <button
          type="button"
          onClick={() => {
            setAberto(true);
            setAviso(null);
          }}
          className="text-xs font-medium text-amber-700 underline hover:text-amber-800"
        >
          {marcado ? 'Desmarcar "Paga em cheque"' : 'Marcar "Paga em cheque"'}
        </button>
      )}

      {souGestor && aberto && (
        <MarcarChequeInline
          documento={documento}
          marcar={!marcado}
          onCancelar={() => setAberto(false)}
          onFeito={(r) => {
            setAberto(false);
            setAviso(
              !marcado
                ? r.retirado_da_carteira
                  ? "Marcado. O cliente saiu da carteira do cobrador."
                  : "Marcado."
                : r.segue_em_condicao
                  ? "Desmarcado, mas continua fora: ainda tem cheque em carteira no Ciclone."
                  : "Desmarcado. Volta para a distribuição normal da carteira.",
            );
            void carregar();
            if (r.retirado_da_carteira) onMudouCarteira();
          }}
        />
      )}
    </div>
  );
};

export default SeloChequeFicha;
