import { ScheduledVisit } from "../types";

/**
 * Catalogo canonico das observacoes pre-programadas que o cobrador escolhe ao
 * concluir uma visita (modal "Marcar Visita como Realizada" do VisitScheduler).
 *
 * O texto de `note` e exatamente o que fica gravado em scheduled_visits.notes:
 * e a fonte de verdade historica da visita. Editar um `note` existente
 * desclassifica todas as visitas ja gravadas com o texto antigo (elas passam a
 * contar como "Outra"), entao so mude junto de uma migracao dos registros.
 * O `key` e o identificador estavel usado pelos filtros e pela URL/estado — e
 * ele que deve ser referenciado em codigo, nunca o texto.
 *
 * `releasesTo` marca os desfechos TERMINAIS: cobranca presencial nao resolve
 * mais o caso, entao concluir a visita com essa observacao tira o cliente da
 * carteira do cobrador (user_id = null) e grava a situacao correspondente em
 * BANCO_DADOS, devolvendo-o a fila de Atribuicao para o gerente redistribuir.
 */
export interface VisitOutcome {
  /** Identificador estavel (usado em filtros/estado). */
  key: string;
  /** Texto gravado em scheduled_visits.notes. Fonte de verdade historica. */
  note: string;
  /** Rotulo curto para filtros e chips. */
  label: string;
  /** Situacao gravada ao liberar o cliente da carteira. Ausente = nao libera. */
  releasesTo?: string;
}

export const VISIT_OUTCOMES: readonly VisitOutcome[] = [
  {
    key: "pagou_tudo",
    note: "Visitado e o cliente pagou tudo.",
    label: "Pagou tudo",
  },
  {
    key: "pagou_parcial",
    note: "Visitado, mas cliente pagou parcialmente.",
    label: "Pagou parcialmente",
  },
  {
    key: "agendou_pagamento",
    note: "Visitado, mas cliente agendou pagamento.",
    label: "Agendou pagamento",
  },
  {
    key: "ausente",
    note: "Visitado, mas cliente não estava em casa.",
    label: "Não estava em casa",
  },
  {
    key: "revisao",
    note: "Visitado, mas cliente solicitou revisão.",
    label: "Solicitou revisão",
  },
  {
    key: "devolveu",
    note: "Visitado, mas cliente devolveu os óculos.",
    label: "Devolveu os óculos",
  },
  {
    key: "falecido",
    note: "Visitado, mas cliente faleceu.",
    label: "Faleceu",
    releasesTo: "Falecido",
  },
  {
    key: "spc",
    note: "Visitado, mas cliente contestou a dívida - (SPC).",
    label: "Contestou a dívida (SPC)",
    // Divida contestada e caso juridico: entra na fila do perfil Cobranca
    // Juridica, exatamente como "nao encontrado" entra em "Aguardando Interno".
    // O MOTIVO (SPC) fica na observacao da visita, que e filtravel — nao se
    // duplica numa situacao propria que poderia divergir dela.
    releasesTo: "Aguardando Jurídico",
  },
] as const;

/** Chave usada para observacoes digitadas a mao (botao "Outro"). */
export const OUTCOME_OTHER = "outra";

/** Situacoes geradas por desfecho terminal de visita. */
export const TERMINAL_SITUACOES: readonly string[] = VISIT_OUTCOMES.filter(
  (o) => o.releasesTo,
).map((o) => o.releasesTo as string);

/** Textos das observacoes, na ordem de exibicao do modal de conclusao. */
export const VISIT_OUTCOME_NOTES: readonly string[] = VISIT_OUTCOMES.map(
  (o) => o.note,
);

/**
 * Desfecho correspondente a uma observacao, por texto EXATO.
 * Usado no gatilho de saida da carteira: so libera quando a observacao veio do
 * catalogo, nunca por semelhanca de texto digitado.
 */
export const exactVisitOutcome = (
  notes?: string | null,
): VisitOutcome | undefined => {
  const text = (notes ?? "").trim();
  if (!text) return undefined;
  return VISIT_OUTCOMES.find((o) => o.note === text);
};

/**
 * Situacao a gravar quando uma visita e concluida com esta observacao, ou null
 * quando o desfecho nao tira o cliente da carteira.
 */
export const releaseSituacaoFor = (notes?: string | null): string | null =>
  exactVisitOutcome(notes)?.releasesTo ?? null;

/**
 * Classifica uma observacao gravada para fins de FILTRO. Mais tolerante que
 * `exactVisitOutcome`: o texto do catalogo pode aparecer concatenado a outros
 * (o reagendamento acumula observacoes anteriores separadas por \n), entao aqui
 * basta conter. Texto livre que nao casa com nada vira OUTCOME_OTHER.
 */
export const classifyVisitNote = (notes?: string | null): string | null => {
  const text = (notes ?? "").trim();
  if (!text) return null;
  const exact = VISIT_OUTCOMES.find((o) => o.note === text);
  if (exact) return exact.key;
  const contained = VISIT_OUTCOMES.find((o) => text.includes(o.note));
  if (contained) return contained.key;
  return OUTCOME_OTHER;
};

/** Rotulo de uma chave de observacao (para chips de filtro ativo). */
export const visitOutcomeLabel = (key: string): string => {
  if (key === OUTCOME_OTHER) return "Outra (personalizada)";
  return VISIT_OUTCOMES.find((o) => o.key === key)?.label ?? key;
};

/** Opcoes do dropdown de observacao (catalogo + "Outra"). */
export const VISIT_OUTCOME_OPTIONS: { value: string; label: string }[] = [
  ...VISIT_OUTCOMES.map((o) => ({ value: o.key, label: o.label })),
  { value: OUTCOME_OTHER, label: "Outra (personalizada)" },
];

/**
 * Mapeia documento -> chave da observacao da ULTIMA visita realizada do cliente.
 *
 * "Ultima" pela data em que a visita foi de fato realizada, com fallback para
 * updatedAt/createdAt (mesma regra do "ultimo contato" do CollectorDashboard).
 * So considera visitas `realizada` com observacao: e o unico estado em que a
 * observacao descreve um desfecho.
 */
export const lastVisitOutcomeByClient = (
  visits: ScheduledVisit[],
): Map<string, string> => {
  const latest = new Map<string, { key: string; time: number }>();

  visits.forEach((v) => {
    if (v.status !== "realizada" || !v.notes || !v.clientDocument) return;
    const key = classifyVisitNote(v.notes);
    if (!key) return;

    const raw = v.dataVisitaRealizada || v.updatedAt || v.createdAt;
    const time = raw ? new Date(raw).getTime() : 0;
    const current = latest.get(v.clientDocument);
    if (!current || time > current.time) {
      latest.set(v.clientDocument, { key, time });
    }
  });

  const result = new Map<string, string>();
  latest.forEach((value, doc) => result.set(doc, value.key));
  return result;
};
