// Parsing de data usado pelos filtros de cliente. Centralizado aqui para que
// ClientAssignment e os predicados compartilhados usem exatamente a mesma regra
// (normaliza para meia-noite no fuso local). Mantem o comportamento que ja
// existia inline no ClientAssignment. Ver [[datas-timezone-safe]].

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

  try {
    let date: Date;

    // Formato ISO (YYYY-MM-DD ou YYYY-MM-DDTHH:mm:ss)
    if (dateStr.includes("-")) {
      date = new Date(dateStr);
    }
    // Formato brasileiro (DD/MM/YYYY)
    else if (dateStr.includes("/")) {
      const [day, month, year] = dateStr.split("/");
      date = new Date(
        `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`,
      );
    }
    // Outro formato
    else {
      date = new Date(dateStr);
    }

    if (isNaN(date.getTime())) {
      return null;
    }

    // Normaliza para meia-noite no timezone local
    date.setHours(0, 0, 0, 0);
    return date;
  } catch (error) {
    console.error("Erro ao parsear data:", dateStr, error);
    return null;
  }
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

  const parts = dateStr.match(/^(\d{2})[\/-](\d{2})[\/-](\d{4})$/);
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
