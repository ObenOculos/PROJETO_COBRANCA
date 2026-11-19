import { addDaysLocalStr, todayLocalStr } from "./visitStatus";
import { CollectionAttempt, UserType } from "../types";

// Clientes reincidentes (item 83, 2026-11-18). Valem para todo perfil de
// cobrador (interno, terceirizado, juridico, presencial); o gestor e isento.
// Os mesmos numeros estao no banco (migration 20261118000003:
// reagendar_visita, pedir_autorizacao_remarcacao, tentativas_sem_retorno,
// reportar_tentativas_gestor). Mudou aqui, mude la.

/** Nova data da remarcacao: no maximo estes dias depois do agendamento. */
export const PRAZO_MAX_REMARCACAO_DIAS = 60;

/** Remarcacoes seguidas do mesmo agendamento sem autorizacao do gestor. */
export const LIMITE_REMARCACOES = 3;

/** A partir de quantas tentativas sem retorno o cobrador e avisado. */
export const LIMITE_TENTATIVAS_SEM_RETORNO = 5;

/**
 * Escada da Fila de Cobranca (2026-11-19, decisao do usuario): dias de
 * espera depois da ultima tentativa sem retorno, pela quantidade de
 * tentativas (1a, 2a, 3a, 4a). Na LIMITE_TENTATIVAS_SEM_RETORNO-esima o
 * cliente vai para o limbo do gestor. Espelho em SQL:
 * fila_espera_cobrador (migration 20261119000003). Mudou aqui, mude la.
 */
export const ESCADA_SEM_RETORNO_DIAS: readonly number[] = [15, 15, 30, 30];

/** Escada do cliente com acordo quebrado (sem acordo ativo): mais curta,
 * tratativa mais urgente (decisao do usuario 2026-11-19). Espelho em SQL:
 * fila_espera_cobrador (migration 20261119000005). A contagem e so das
 * tentativas do cobrador ATUAL do cliente ("ao trocar, a responsabilidade
 * passa para o novo cobrador"). */
export const ESCADA_ACORDO_QUEBRADO_DIAS: readonly number[] = [3, 3, 7, 7];

/** Texto do selo da fila: por que o cliente voltou / onde esta. */
export const textoEsperaFila = (
  tentativas: number,
  diasDesdeUltima: number,
  emLimbo: boolean,
): string =>
  emLimbo
    ? `Aguardando o gestor: ${tentativas} tentativas sem retorno`
    : `${tentativas}ª tentativa sem retorno · última há ${diasDesdeUltima} ${diasDesdeUltima === 1 ? "dia" : "dias"}`;

/** Tentativas em que o cliente nao respondeu. "Mensagem enviada" entra aqui
 * (cliente nao respondeu) mesmo contando como atendimento nas metricas
 * (EFFECTIVE_ATTEMPT_RESULTS, item 81). Mesma lista do SQL
 * tentativas_sem_retorno. */
export const RESULTADOS_SEM_RETORNO: ReadonlySet<CollectionAttempt["result"]> =
  new Set(["no_answer", "busy", "not_found", "message_sent"]);

export const isentoDaReincidencia = (type?: UserType | null): boolean =>
  type === "manager";

/** Ultima data aceita numa remarcacao: 60 dias do agendamento, ou de hoje
 * se o agendamento ja passou (YYYY-MM-DD local). */
export const dataMaxRemarcacao = (scheduledDate: string): string => {
  const hoje = todayLocalStr();
  const base = scheduledDate > hoje ? scheduledDate : hoje;
  return addDaysLocalStr(base, PRAZO_MAX_REMARCACAO_DIAS);
};

/** Ja passou do limite: a proxima remarcacao precisa do gestor. */
export const precisaAutorizacaoRemarcacao = (
  remarcacoesFeitas: number,
): boolean => remarcacoesFeitas >= LIMITE_REMARCACOES;

/** Dica que o banco poe no erro (RAISE ... USING HINT) para cada limite. */
export const HINT_LIMITE_REMARCACAO = "limite_remarcacao";
export const HINT_PRAZO_REMARCACAO = "prazo_remarcacao";

export const MOTIVO_CASO_LABEL: Record<string, string> = {
  limite_remarcacao: "Limite de remarcações",
  tentativas_sem_retorno: "Tentativas sem retorno",
};
