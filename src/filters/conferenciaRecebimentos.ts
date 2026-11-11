// Fonte unica da regra de conferencia mensal (item 50): o que a base do app
// (BANCO_DADOS, atualizada todo dia pelo Ciclone e pelas lojas) baixou como
// recebido x o que o cobrador registrou no app, por cliente.
//
// A base guarda so o PRINCIPAL em valor_recebido (nem o Ciclone nem as lojas
// preenchem juros_pago); o app registra o que o cliente pagou, as vezes com juros
// dentro do valor (ex.: importacao do Cedrus). Por isso "app maior" pequeno
// costuma ser juros, e nao erro.

/** Diferenca ate este valor (R$) conta como "confere" (arredondamento). */
export const CONFERENCIA_TOLERANCIA = 1;

export type ConferenciaSituacao =
  | "confere"
  | "sem_registro_app"
  | "sem_baixa_base"
  | "app_maior"
  | "base_maior";

export const CONFERENCIA_SITUACAO_LABEL: Record<ConferenciaSituacao, string> = {
  confere: "Confere",
  sem_registro_app: "Pagou sem registro no app",
  sem_baixa_base: "Registrado, sem baixa na base",
  app_maior: "App maior que a base",
  base_maior: "Base maior que o app",
};

export const CONFERENCIA_SITUACAO_DICA: Record<ConferenciaSituacao, string> = {
  confere: "Valor do app igual ao baixado na base.",
  sem_registro_app:
    "A base baixou pagamento deste cliente e ninguém registrou no app (ex.: pagou na loja sem avisar o cobrador).",
  sem_baixa_base:
    "O cobrador registrou e a base ainda não baixou neste período (baixa atrasada ou em outro mês).",
  app_maior:
    "O app tem mais que a base. Diferença pequena costuma ser juros (a base só guarda o principal).",
  base_maior:
    "A base baixou mais do que o cobrador registrou (parcela paga sem registro ou registro a menor).",
};

export const classificarConferencia = (
  baseValor: number,
  appValor: number,
): ConferenciaSituacao => {
  const temBase = baseValor > CONFERENCIA_TOLERANCIA;
  const temApp = Math.abs(appValor) > CONFERENCIA_TOLERANCIA;
  if (Math.abs(appValor - baseValor) <= CONFERENCIA_TOLERANCIA) return "confere";
  if (temBase && !temApp) return "sem_registro_app";
  if (!temBase && temApp) return "sem_baixa_base";
  return appValor > baseValor ? "app_maior" : "base_maior";
};
