// Modelos de mensagem do "pago na loja" (atribuir baixa do ERP ao cobrador).
// Pedido do usuario (2026-11-23): os textos escritos a mao saiam curtos e sem
// o essencial ("Cobranca interna", "Tratado pela Monalisa" de 7 jeitos), e
// quase nunca diziam COMO (WhatsApp, ligacao, visita) nem QUANDO foi a
// conversa -- justamente o que justifica a atribuicao depois.
//
// Mesmo padrao de config/contactNoteTemplates: um clique troca o texto do
// campo pelo modelo e a pessoa edita o que estiver entre [ ]. {cobrador} e
// {data} sao trocados pela tela quando ela sabe (nome escolhido / ultima
// conversa registrada); senao viram [cobrador] / [data]. Numero par por
// lista, pra preencher as 2 colunas.

export interface ModeloMensagem {
  rotulo: string;
  texto: string;
}

/** Gestor: Atribuir pago na loja (exceção). */
export const MODELOS_EXCECAO_GESTOR: ModeloMensagem[] = [
  {
    rotulo: "Cobrança interna",
    texto:
      "{cobrador} cobrou o cliente pela cobrança interna em {data}; o contato não ficou registrado no app.",
  },
  {
    rotulo: "WhatsApp",
    texto:
      "{cobrador} conversou com o cliente pelo WhatsApp em {data} e ele pagou na loja.",
  },
  {
    rotulo: "Ligação",
    texto:
      "{cobrador} falou com o cliente por ligação em {data} e ele pagou na loja.",
  },
  {
    rotulo: "Visita",
    texto:
      "{cobrador} visitou o cliente em {data} e ele disse que ia pagar na loja.",
  },
  {
    rotulo: "Cliente retornou",
    texto: "O cliente retornou o contato de {cobrador} e pagou na loja.",
  },
  {
    rotulo: "Venda errada",
    texto:
      "{cobrador} recebeu, mas o pagamento foi lançado em outra venda; atribuindo na venda certa.",
  },
];

/** Cobrador: pedir atribuição do pago na loja. */
export const MODELOS_PEDIDO_COBRADOR: ModeloMensagem[] = [
  {
    rotulo: "WhatsApp",
    texto:
      "Cobrei pelo WhatsApp em {data} e o cliente combinou de pagar na loja.",
  },
  {
    rotulo: "Ligação",
    texto:
      "Liguei para o cliente em {data} e ele combinou de pagar na loja.",
  },
  {
    rotulo: "Visita",
    texto: "Visitei o cliente em {data} e ele disse que ia pagar na loja.",
  },
  {
    rotulo: "Cliente retornou",
    texto: "O cliente me retornou e avisou que pagou na loja.",
  },
];

/** Gestor: motivo da recusa de um pedido (Correções). */
export const MODELOS_RECUSA_GESTOR: ModeloMensagem[] = [
  {
    rotulo: "Sem conversa",
    texto: "Não encontrei conversa sua com o cliente antes do pagamento.",
  },
  {
    rotulo: "Pagou antes",
    texto: "O cliente pagou antes do seu contato.",
  },
  {
    rotulo: "Outro cobrador",
    texto: "Esse pagamento já é de outro cobrador.",
  },
  {
    rotulo: "Falta detalhe",
    texto:
      "Falta detalhe: diga quando e por onde falou com o cliente e peça de novo.",
  },
];

/** Troca {cobrador} e {data}; o que a tela não souber vira [ ] para editar. */
export const preencherModelo = (
  texto: string,
  valores: { cobrador?: string | null; data?: string | null },
): string =>
  texto
    .replace(/\{cobrador\}/g, valores.cobrador?.trim() || "[cobrador]")
    .replace(/\{data\}/g, valores.data?.trim() || "[data]");
