/** Data (dd/mm/aaaa, fuso local) da conversa efetiva mais recente entre as
 * parcelas; null se nenhuma tiver. Usada nos modelos de mensagem do pago na
 * loja (config/mensagensAtribuicao). */
export const ultimaConversa = (
  parcelas: { ultimo_contato_em: string | null }[],
): string | null => {
  const ultima = parcelas
    .map((p) => p.ultimo_contato_em)
    .filter((d): d is string => !!d)
    .sort()
    .pop();
  return ultima ? new Date(ultima).toLocaleDateString("pt-BR") : null;
};
