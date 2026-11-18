// Modelos rapidos para "Observacoes da Conversa" (LogContactModal). Pedido do
// usuario (2026-11-18): o cobrador reclamava de digitar a mesma observacao do
// zero toda hora -- um clique preenche o campo com o modelo (substitui o que
// tinha) e ele so edita a parte variavel (data, valor, motivo). Numero par
// (min. 4) por chave, pra preencher as 2 colunas sem ficar torto.
//
// Chaves: "sem_retorno"/"com_retorno" (as opcoes do Atender desde o pedido do
// gestor de 2026-11-18 -- o detalhe que antes era opcao propria, como
// telefone errado ou mensagem sem resposta, virou modelo de texto aqui) e os
// status do STATUS_TO_ATTEMPT que tem tela propria (promessa e as acoes).
export const CONTACT_NOTE_TEMPLATES: Record<string, string[]> = {
  sem_retorno: [
    "Liguei, celular não atende.",
    "Caiu na caixa postal.",
    "Telefone errado / número não existe.",
    "Atendeu outra pessoa, não conhece o cliente.",
    "Enviei mensagem no WhatsApp, sem resposta.",
    "Linha ocupada, tentei mais de uma vez.",
  ],
  com_retorno: [
    "Conversei com o cliente, sem acordo fechado ainda.",
    "Cliente pediu mais alguns dias pra se organizar.",
    "Cliente respondeu a mensagem, ficou de retornar.",
    "Enviei o boleto/PIX atualizado, cliente confirmou que recebeu.",
    "Cliente se recusou a pagar, alegou [motivo].",
    "Cliente pediu pra ligar de novo em [data/horário].",
  ],
  promessa_pagamento: [
    "Cliente confirmou pagamento via PIX até [data].",
    "Cliente vai pagar em dinheiro na loja até [data].",
    "Cliente vai pagar via boleto/transferência até [data].",
    "Cliente pediu pra ligar de novo perto da data combinada.",
  ],
  diz_que_pagou: [
    "Cliente alega já ter pago, vai enviar o comprovante.",
    "Cliente diz que pagou direto na loja, sem comprovante em mãos.",
    "Cliente diz que pagou, mas não lembra a data exata.",
    "Cliente afirma ter pago a outro cobrador/vendedor.",
  ],
  venda_cancelada: [
    "Cliente informou que a venda foi cancelada/devolvida na loja.",
    "Cliente diz que a compra foi cancelada por problema com o produto.",
    "Cliente informou que trocou a mercadoria e a venda foi desfeita.",
    "Cliente alega que nunca fez essa compra.",
  ],
  contestou_divida: [
    "Cliente contestou a dívida e disse que vai no SPC/Serasa.",
    "Cliente nega a compra e pede comprovação.",
    "Cliente diz que o valor cobrado está errado.",
    "Cliente alega que já resolveu isso diretamente na loja.",
  ],
};
