// Status universais do sistema - simplificados
export enum CollectionStatus {
  PENDENTE = 'pendente',
  PAGO = 'pago',
  PARCIAL = 'parcial'
}

// Labels amigáveis para exibição
export const STATUS_LABELS: Record<CollectionStatus, string> = {
  [CollectionStatus.PENDENTE]: 'Pendente',
  [CollectionStatus.PAGO]: 'Pago',
  [CollectionStatus.PARCIAL]: 'Parcial'
};

// Cores para cada status
export const STATUS_COLORS: Record<CollectionStatus, string> = {
  [CollectionStatus.PENDENTE]: 'bg-yellow-100 text-yellow-800',
  [CollectionStatus.PAGO]: 'bg-green-100 text-green-800',
  [CollectionStatus.PARCIAL]: 'bg-blue-100 text-blue-800'
};


// Status que indicam que a parcela pode receber pagamento
export const PAYABLE_STATUSES: CollectionStatus[] = [
  CollectionStatus.PENDENTE,
  CollectionStatus.PARCIAL
];

// Status que indicam tentativas de cobrança
export const COLLECTION_ATTEMPT_STATUSES: CollectionStatus[] = [
  CollectionStatus.PENDENTE
];