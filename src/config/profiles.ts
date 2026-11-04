import { ScheduledVisitChannel, UserType } from "../types";

/**
 * Maps each collector profile to the situacao values that belong to its domain.
 * Managers are excluded — they see everything.
 *
 * Adding a new collection phase requires only a new entry here; all filter
 * functions that consume this map will automatically include the new phase.
 */
export const SITUACAO_BY_PROFILE: Record<
  Exclude<UserType, "manager">,
  readonly string[]
> = {
  collector: ["Em mãos", "Em tratamento"],
  internal_collector: ["Cobrança Interna", "Aguardando Interno", "Em acordo"],
  third_party_collector: [
    "Cobrança Terceirizada",
    "Aguardando Terceirizado",
    "Em acordo",
  ],
  legal_collector: ["Cobrança Jurídica", "Aguardando Jurídico", "Em acordo"],
};

/**
 * Situacao de cliente com acordo de renegociacao ativo (tabela `acordos`).
 * So existe nos 3 perfis "carteira" (Interno/Terceirizado/Juridico) -- ver
 * [[WALLET_COLLECTOR_TYPES]]. Cobrador Externo (campo/visita) fica de fora:
 * nao cria acordo. Espelha a CHECK constraint do banco (migration
 * 20261030000005).
 */
export const SITUACAO_EM_ACORDO = "Em acordo";

/** Perfis que podem criar/gerenciar acordo de renegociacao (telefone +
 * negociacao, sem rota de visita em campo). Mesmo conjunto de
 * `isWalletCollector` em CollectorDashboard.tsx. */
export const WALLET_COLLECTOR_TYPES: Exclude<UserType, "manager">[] = [
  "internal_collector",
  "third_party_collector",
  "legal_collector",
];

/**
 * The confirmed situacao set when a client is assigned to a specific user of
 * a given profile (i.e. user_id is set to a real collector).
 */
export const PRIMARY_SITUACAO: Record<Exclude<UserType, "manager">, string> = {
  collector: "Em mãos",
  internal_collector: "Cobrança Interna",
  third_party_collector: "Cobrança Terceirizada",
  legal_collector: "Cobrança Jurídica",
};

/**
 * Canais de agendamento (`scheduled_visits.channel`) que cada perfil de
 * cobrador de fato usa/le na sua tela — Externo so trabalha com visita
 * presencial (VisitScheduler); carteira (WALLET_COLLECTOR_TYPES) so
 * trabalha com ligacao/whatsapp (CollectorDashboard). Fonte unica pra
 * decidir se um agendamento pode seguir junto numa reatribuicao de cliente
 * entre cobradores (ver transferVisits em CollectionContext) -- sem isso,
 * transferir um cliente de carteira pra um cobrador externo (ou vice-versa)
 * movia o agendamento pro novo cobrador mesmo que o canal nao exista na
 * tela dele, deixando o contato invisivel/orfao.
 */
export const CHANNELS_BY_PROFILE: Record<
  Exclude<UserType, "manager">,
  readonly ScheduledVisitChannel[]
> = {
  collector: ["presencial"],
  internal_collector: ["ligacao", "whatsapp"],
  third_party_collector: ["ligacao", "whatsapp"],
  legal_collector: ["ligacao", "whatsapp"],
};

/** Canais compativeis com o perfil (vazio para `manager`/indefinido). */
export function channelsForCollectorType(
  userType: UserType | undefined,
): readonly ScheduledVisitChannel[] {
  if (!userType || userType === "manager") return [];
  return CHANNELS_BY_PROFILE[userType];
}

export const USER_TYPE_LABELS: Record<UserType, string> = {
  manager: "Gerente",
  collector: "Cobrador",
  internal_collector: "Cobrança Interna",
  third_party_collector: "Cobrança Terceirizada",
  legal_collector: "Cobrança Jurídica",
};

/** Como a atribuicao a um perfil resolve a situacao de cada cliente. */
export interface AssignmentSituacaoRule {
  /**
   * Situacao a gravar quando a atual esta FORA do dominio do perfil de destino.
   * Ausente quando o destino nao e um perfil de cobranca (gerente).
   */
  confirm?: string;
  /** Situacoes do dominio do perfil: preservadas como estao. */
  keep: readonly string[];
}

/**
 * Regra de situacao na atribuicao.
 *
 * Confirma PRIMARY_SITUACAO **apenas** quando a situacao atual nao pertence ao
 * perfil de destino. Isso resolve os dois casos de uma vez:
 *
 *  - preserva nuance dentro do dominio: reatribuir um cliente "Em tratamento"
 *    a outro cobrador externo NAO o rebaixa para "Em mãos";
 *  - fecha a fase anterior ao trocar de dominio: devolver um cliente
 *    "Aguardando Jurídico" a um cobrador externo grava "Em mãos". Sem isso ele
 *    seria atribuido mas ficaria invisivel para o proprio cobrador, porque
 *    situacoesOutsideProfile esconde situacoes de outros perfis.
 *
 * Situacao NULL/vazia conta como fora do dominio (recebe a confirmacao).
 */
export function assignmentSituacaoRule(
  userType: UserType | undefined,
): AssignmentSituacaoRule {
  if (!userType || userType === "manager") return { keep: [] };
  return {
    confirm: PRIMARY_SITUACAO[userType],
    keep: SITUACAO_BY_PROFILE[userType],
  };
}

/** Aplica a regra a UMA situacao atual, devolvendo a situacao resultante. */
export function resolveSituacaoOnAssign(
  current: string | null | undefined,
  rule: AssignmentSituacaoRule,
): string | null | undefined {
  if (!rule.confirm) return current;
  return current && rule.keep.includes(current) ? current : rule.confirm;
}

/**
 * Situacoes de encerramento: nao pertencem a perfil nenhum e nao entram em fila
 * de redistribuicao (nao ha a quem atribuir). Ver src/config/visitOutcomes.
 */
export const ENCERRAMENTO_SITUACOES: readonly string[] = ["Falecido"];

/**
 * TODAS as situacoes validas de BANCO_DADOS.situacao — espelha a CHECK
 * constraint do banco (ver supabase/migrations/*_situacao*.sql).
 *
 * Fonte unica para qualquer lista de situacao na UI (upload, cadastro de
 * titulo, alteracao em lote). Antes cada tela mantinha sua propria copia e as
 * tres ficaram defasadas quando o perfil Terceirizado foi criado — no upload
 * isso apagava silenciosamente a situacao dos clientes dessas fases, porque
 * valor desconhecido vira NULL.
 *
 * Deduplicada: "Em acordo" aparece nos 3 perfis carteira em
 * SITUACAO_BY_PROFILE (ver [[SITUACAO_EM_ACORDO]]), mas telas como
 * AddTituloModal/BulkAssignmentModal renderizam esta lista direto como
 * opcoes de dropdown — sem dedupe ela apareceria repetida.
 */
export const ALL_SITUACOES: readonly string[] = [
  ...new Set([
    ...Object.values(SITUACAO_BY_PROFILE).flat(),
    ...ENCERRAMENTO_SITUACOES,
  ]),
];

/** All situacoes that exist outside the given profile's domain. */
export function situacoesOutsideProfile(
  userType: Exclude<UserType, "manager">,
): readonly string[] {
  return Object.entries(SITUACAO_BY_PROFILE)
    .filter(([key]) => key !== userType)
    .flatMap(([, values]) => values as string[]);
}
