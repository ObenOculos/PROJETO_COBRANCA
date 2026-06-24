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
