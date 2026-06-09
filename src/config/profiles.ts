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
};

/**
 * The confirmed situacao set when a client is assigned to a specific user of
 * a given profile (i.e. user_id is set to a real collector).
 */
export const PRIMARY_SITUACAO: Record<
  Exclude<UserType, "manager">,
  string
> = {
  collector: "Em mãos",
  internal_collector: "Cobrança Interna",
  third_party_collector: "Cobrança Terceirizada",
};

export const USER_TYPE_LABELS: Record<UserType, string> = {
  manager: "Gerente",
  collector: "Cobrador",
  internal_collector: "Cobrança Interna",
  third_party_collector: "Cobrança Terceirizada",
};

/** All situacoes that exist outside the given profile's domain. */
export function situacoesOutsideProfile(
  userType: Exclude<UserType, "manager">,
): readonly string[] {
  return Object.entries(SITUACAO_BY_PROFILE)
    .filter(([key]) => key !== userType)
    .flatMap(([, values]) => values as string[]);
}
