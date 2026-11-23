import React from "react";
import {
  ModeloMensagem,
  preencherModelo,
} from "../../config/mensagensAtribuicao";

// Botões de modelo acima de um campo de mensagem (config/mensagensAtribuicao).
// Um clique troca o texto do campo pelo modelo preenchido.

interface Props {
  modelos: ModeloMensagem[];
  cobrador?: string | null;
  data?: string | null;
  onEscolher: (texto: string) => void;
}

export const ModelosMensagem: React.FC<Props> = ({
  modelos,
  cobrador,
  data,
  onEscolher,
}) => (
  <div className="grid grid-cols-2 gap-1.5">
    {modelos.map((m) => {
      const texto = preencherModelo(m.texto, { cobrador, data });
      return (
        <button
          key={m.rotulo}
          type="button"
          onClick={() => onEscolher(texto)}
          title={`${texto}\n\nEdite a parte entre [ ], se houver.`}
          className="px-2.5 py-1.5 rounded-lg border text-[11px] font-medium text-left leading-snug bg-gray-50 text-gray-600 border-gray-200 hover:border-teal-300 hover:bg-teal-50 hover:text-teal-700 dark:bg-dark-bg-secondary dark:border-dark-border dark:text-dark-text-secondary dark:hover:border-teal-700 dark:hover:text-teal-300"
        >
          {m.rotulo}
        </button>
      );
    })}
  </div>
);
