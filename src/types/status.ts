// Status universais do sistema - simplificados
export enum CollectionStatus {
  PENDENTE = "Em atraso",
  PAGO = "Pago",
  PARCIAL = "Pago Parcial",
  CANCELADO = "Cancelado",
}

// Labels amigáveis para exibição
export const STATUS_LABELS: Record<CollectionStatus, string> = {
  [CollectionStatus.PENDENTE]: "Em atraso",
  [CollectionStatus.PAGO]: "Pago",
  [CollectionStatus.PARCIAL]: "Pago Parcial",
  [CollectionStatus.CANCELADO]: "Cancelado",
};

// Cores para cada status
export const STATUS_COLORS: Record<CollectionStatus, string> = {
  [CollectionStatus.PENDENTE]: "bg-yellow-100 text-yellow-800",
  [CollectionStatus.PAGO]: "bg-green-100 text-green-800",
  [CollectionStatus.PARCIAL]: "bg-blue-100 text-blue-800",
  [CollectionStatus.CANCELADO]: "bg-gray-200 text-gray-600 line-through",
};

// Status que indicam que a parcela pode receber pagamento
export const PAYABLE_STATUSES: CollectionStatus[] = [
  CollectionStatus.PENDENTE,
  CollectionStatus.PARCIAL,
];

// Status que indicam tentativas de cobrança
export const COLLECTION_ATTEMPT_STATUSES: CollectionStatus[] = [
  CollectionStatus.PENDENTE,
];

// Valor cru, vindo da origem na coluna `status`, que marca um titulo/parcela
// como cancelado. Titulos cancelados saem de toda a cobranca ativa (totais,
// atribuicao, rota/visitas, desempenho). Comparacao tolerante a caixa/espaco.
export const isCancelado = (status: string | null | undefined): boolean =>
  (status ?? "").trim().toLowerCase() === "cancelado";
