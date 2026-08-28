// Parsing de data usado pelos filtros de cliente. Centralizado aqui para que
// ClientAssignment e os predicados compartilhados usem exatamente a mesma regra
// (normaliza para meia-noite no fuso local).
//
// As datas de BANCO_DADOS sao colunas `text` com DOIS formatos convivendo:
// YYYY-MM-DD (71%) e DD/MM/YYYY (29%). Todo parser aqui precisa aceitar os dois.
// Ver [[datas-timezone-safe]] e [[tipo-data-vencimento-resolvido]].

/**
 * Converte uma string de data (ISO `YYYY-MM-DD[...]` ou BR `DD/MM/YYYY`) para um
 * Date normalizado em meia-noite local. Retorna null para entradas vazias ou
 * invalidas.
 */
export const parseAndNormalizeDate = (
  dateStr: string | null | undefined,
): Date | null => {
  if (!dateStr || dateStr === "null" || dateStr === "") {
    return null;
  }

  // Extrai os componentes e monta a data com o construtor LOCAL (ano, mes, dia),
  // que ja nasce a meia-noite local — sem precisar de setHours depois.
  //
  // Nao usar `new Date(str)`: para "YYYY-MM-DD" a spec manda interpretar como
  // meia-noite UTC. O setHours(0,0,0,0) que vinha em seguida normalizava isso no
  // fuso local (UTC-3) e RECUAVA a data em 1 dia. O caminho DD/MM/YYYY caia no
  // mesmo problema, porque remontava a string em ISO antes de parsear.
  const str = dateStr.trim();

  let year: number;
  let month: number;
  let day: number;

  // ISO: YYYY-MM-DD, com ou sem hora/fuso depois (so a parte da data importa).
  const iso = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    year = Number(iso[1]);
    month = Number(iso[2]);
    day = Number(iso[3]);
  } else {
    // BR: DD/MM/YYYY (ou DD-MM-YYYY). 29% das linhas de BANCO_DADOS estao neste
    // formato — ver [[tipo-data-vencimento-resolvido]].
    const br = str.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
    if (!br) return null;
    day = Number(br[1]);
    month = Number(br[2]);
    year = Number(br[3]);
  }

  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  const date = new Date(year, month - 1, day);

  // Rejeita datas que "transbordaram" no construtor (31/02 viraria 03/03).
  if (
    isNaN(date.getTime()) ||
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }

  return date;
};

/**
 * Normaliza uma data (ISO `YYYY-MM-DD[...]` ou BR `DD/MM/YYYY`) para a string
 * comparavel `YYYY-MM-DD`. Usado em filtros de intervalo por comparacao textual
 * (mesma regra do getFilteredCollections). Retorna null se nao reconhecer.
 */
export const toYYYYMMDD = (
  dateStr: string | null | undefined,
): string | null => {
  if (!dateStr || typeof dateStr !== "string") return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr.substring(0, 10))) {
    return dateStr.substring(0, 10);
  }

  const parts = dateStr.match(/^(\d{2})[/-](\d{2})[/-](\d{4})$/);
  if (parts) {
    const [, day, month, year] = parts;
    return `${year}-${month}-${day}`;
  }

  try {
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return `${year}-${month}-${day}`;
    }
  } catch {
    // formato desconhecido
  }

  return null;
};
