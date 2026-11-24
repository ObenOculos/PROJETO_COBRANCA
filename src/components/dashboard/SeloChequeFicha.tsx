import React, { useEffect, useState } from "react";
import { Banknote } from "lucide-react";
import { formatCurrency } from "../../utils/formatters";
import { CondicaoChequeCliente } from "../../utils/cheques";
import MarcarChequeInline from "./MarcarChequeInline";

// Item 87: condicao de cheque na Ficha (fica so com o gestor). Dividido em
// pecas para o cabecalho da Ficha (24/11): o selo vai ao lado do nome,
// o detalhe abre ao clicar nele e "Marcar/Desmarcar" fica no menu "Mais
// acoes" do gestor -- o formulario do motivo abre no cabecalho. A carga
// fica em hooks/useCondicaoCheque.

const dataBR = (iso: string | null) =>
  iso ? iso.slice(0, 10).split("-").reverse().join("/") : "";

/** Selo ao lado do nome. Clicar mostra/esconde o detalhe. */
export const SeloCheque: React.FC<{
  cond: CondicaoChequeCliente | null;
  aberto: boolean;
  onAlternar: () => void;
}> = ({ cond, aberto, onAlternar }) => {
  if (!cond) return null;
  return (
    <button
      type="button"
      onClick={onAlternar}
      aria-expanded={aberto}
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-200 hover:bg-amber-100"
      title="Condição de cheque: fica só com o gestor, não vai para cobrador. Clique para ver."
    >
      <Banknote className="h-3.5 w-3.5" />
      Cheque
    </button>
  );
};

/** Detalhe da condicao (ao clicar no selo) e formulario de marcar/desmarcar. */
export const PainelChequeFicha: React.FC<{
  documento: string;
  cond: CondicaoChequeCliente | null;
  detalheAberto: boolean;
  formAberto: boolean;
  onFecharForm: () => void;
  onRecarregar: () => Promise<void>;
  /** Marcou/desmarcou e o cliente saiu da carteira: recarregar a carteira. */
  onMudouCarteira: () => void;
}> = ({
  documento,
  cond,
  detalheAberto,
  formAberto,
  onFecharForm,
  onRecarregar,
  onMudouCarteira,
}) => {
  const [aviso, setAviso] = useState<string | null>(null);
  const marcado = !!cond?.paga_em_cheque;
  const temCheque = (cond?.cheques_qtd ?? 0) > 0;

  useEffect(() => {
    if (formAberto) setAviso(null);
  }, [formAberto]);

  if (!(cond && detalheAberto) && !aviso && !formAberto) return null;

  return (
    <div className="mt-2 space-y-2">
      {cond && detalheAberto && (
        <div className="text-xs text-amber-900 space-y-0.5 border-l-2 border-amber-300 pl-3">
          <div className="font-medium">
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
      )}

      {aviso && (
        <div className="rounded-lg bg-teal-50 px-3 py-1.5 text-xs text-teal-800">
          {aviso}
        </div>
      )}

      {formAberto && (
        <MarcarChequeInline
          documento={documento}
          marcar={!marcado}
          onCancelar={onFecharForm}
          onFeito={(r) => {
            onFecharForm();
            setAviso(
              !marcado
                ? r.retirado_da_carteira
                  ? "Marcado. O cliente saiu da carteira do cobrador."
                  : "Marcado."
                : r.segue_em_condicao
                  ? "Desmarcado, mas continua fora: ainda tem cheque em carteira no Ciclone."
                  : "Desmarcado. Volta para a distribuição normal da carteira.",
            );
            void onRecarregar();
            if (r.retirado_da_carteira) onMudouCarteira();
          }}
        />
      )}
    </div>
  );
};
