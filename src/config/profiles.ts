import { UserType } from "../types";

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
  internal_collector: ["Cobrança Interna", "Aguardando Interno"],
  third_party_collector: ["Cobrança Terceirizada", "Aguardando Terceirizado"],
  legal_collector: ["Cobrança Jurídica", "Aguardando Jurídico"],
};

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

/** All situacoes that exist outside the given profile's domain. */
export function situacoesOutsideProfile(
  userType: Exclude<UserType, "manager">,
): readonly string[] {
  return Object.entries(SITUACAO_BY_PROFILE)
    .filter(([key]) => key !== userType)
    .flatMap(([, values]) => values as string[]);
}
