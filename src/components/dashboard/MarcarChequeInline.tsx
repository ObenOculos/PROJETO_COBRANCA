import React, { useState } from "react";
import { marcarPagaEmCheque, mensagemErroCheque } from "../../utils/cheques";

// Item 87: formulario curto (no lugar, sem modal) para o gestor marcar ou
// desmarcar "Paga em cheque". Motivo obrigatorio -- fica no historico
// (cheque_marcacoes, so INSERT). Usado no painel Cheques e na Ficha.

interface Props {
  documento: string;
  marcar: boolean;
  /** Mostra as classes de modo escuro (painel); a Ficha e clara. */
  escuro?: boolean;
  onFeito: (r: { retirado_da_carteira: boolean; segue_em_condicao: boolean }) => void;
  onCancelar: () => void;
}

const MarcarChequeInline: React.FC<Props> = ({
  documento,
  marcar,
  escuro = false,
  onFeito,
  onCancelar,
}) => {
  const [motivo, setMotivo] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const d = (cls: string) => (escuro ? cls : "");

  const confirmar = async () => {
    if (motivo.trim().length < 3) {
      setErro("Escreva o motivo (mínimo 3 letras).");
      return;
    }
    setSalvando(true);
    setErro(null);
    try {
      onFeito(await marcarPagaEmCheque(documento, marcar, motivo));
    } catch (e) {
      setErro(mensagemErroCheque(e));
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div
      className={`rounded-lg border border-gray-200 p-3 space-y-2 ${d("dark:border-dark-border")}`}
    >
      <p className={`text-xs text-gray-700 ${d("dark:text-dark-text")}`}>
        {marcar
          ? "O cliente sai agora da carteira do cobrador e não volta para nenhum cobrador enquanto estiver marcado. Os agendamentos de cobrador são cancelados. Ele continua no app."
          : "O cliente volta para a distribuição normal da carteira (se ainda tiver cheque em carteira no Ciclone, continua fora)."}
      </p>
      <label className="block">
        <span
          className={`text-[11px] font-semibold text-gray-600 ${d("dark:text-dark-text-secondary")}`}
        >
          Motivo (obrigatório)
        </span>
        <input
          type="text"
          value={motivo}
          autoFocus
          onChange={(e) => setMotivo(e.target.value)}
          placeholder={
            marcar
              ? "Ex.: paga a compra com cheques pré-datados"
              : "Ex.: passou a pagar por boleto"
          }
          className={`mt-0.5 w-full rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-teal-500 ${d("dark:border-dark-border dark:bg-dark-bg dark:text-dark-text")}`}
        />
      </label>
      {erro && <div className="text-xs text-red-600">{erro}</div>}
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancelar}
          className={`rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 ${d("dark:border-dark-border dark:text-dark-text")}`}
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={() => void confirmar()}
          disabled={salvando}
          className={`rounded-lg px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40 ${
            marcar ? "bg-amber-600 hover:bg-amber-700" : "bg-teal-600 hover:bg-teal-700"
          }`}
        >
          {salvando
            ? "Gravando…"
            : marcar
              ? 'Marcar "Paga em cheque"'
              : "Desmarcar"}
        </button>
      </div>
    </div>
  );
};

export default MarcarChequeInline;
