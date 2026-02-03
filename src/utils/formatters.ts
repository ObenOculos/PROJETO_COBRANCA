import {
  CollectionStatus,
  STATUS_COLORS,
  STATUS_LABELS,
} from "../types/status";

const normalizeStatus = (
  status: string | null | undefined,
): CollectionStatus => {
  if (!status) return CollectionStatus.PENDENTE;

  const normalized = status.toLowerCase().trim();

  if (
    ["recebido", "pago", "paid", "received", "quitado", "finalizado"].includes(
      normalized,
    )
  ) {
    return CollectionStatus.PAGO;
  }

  if (
    [
      "parcialmente_pago",
      "parcialmente pago",
      "pago parcial",
      "partial",
      "parcial",
    ].includes(normalized)
  ) {
    return CollectionStatus.PARCIAL;
  }

  return CollectionStatus.PENDENTE;
};

export const getStatusColor = (status: string | null | undefined): string => {
  const normalizedStatus = normalizeStatus(status);
  return STATUS_COLORS[normalizedStatus] || "bg-gray-100 text-gray-800";
};

export const getStatusLabel = (status: string | null | undefined): string => {
  const normalizedStatus = normalizeStatus(status);
  return STATUS_LABELS[normalizedStatus] || "Indefinido";
};

// Função auxiliar para obter todos os status disponíveis
export const getAllStatuses = (): Array<{
  value: CollectionStatus;
  label: string;
}> => {
  return Object.values(CollectionStatus).map((status) => ({
    value: status,
    label: STATUS_LABELS[status],
  }));
};

// Função auxiliar para status que podem ser usados em cobrança
// Agora usa apenas os 3 status universais
export const getCollectionStatuses = (): Array<{
  value: CollectionStatus;
  label: string;
}> => {
  return [
    {
      value: CollectionStatus.PENDENTE,
      label: STATUS_LABELS[CollectionStatus.PENDENTE],
    },
    {
      value: CollectionStatus.PARCIAL,
      label: STATUS_LABELS[CollectionStatus.PARCIAL],
    },
    {
      value: CollectionStatus.PAGO,
      label: STATUS_LABELS[CollectionStatus.PAGO],
    },
  ];
};

export const formatCurrency = (
  value: number,
  includeCents: boolean = true,
): string => {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: includeCents ? 2 : 0,
    maximumFractionDigits: includeCents ? 2 : 0,
  }).format(value);
};

export const formatSafeDate = (
  date: string | Date | null | undefined,
): string => {
  if (!date) return "Data inválida";

  try {
    let parsedDate: Date;

    if (date instanceof Date) {
      parsedDate = date;
    } else {
      const dateStr = date.toString().trim();

      if (dateStr === "" || dateStr === "null" || dateStr === "undefined") {
        return "Data inválida";
      }

      // Tratar formato brasileiro DD/MM/YYYY
      if (dateStr.includes("/")) {
        const [day, month, year] = dateStr.split("/").map(Number);
        parsedDate = new Date(year, month - 1, day);
      } else if (dateStr.includes("-")) {
        // Tratar formato YYYY-MM-DD sem conversão de timezone
        if (dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
          const [year, month, day] = dateStr.split("-").map(Number);
          parsedDate = new Date(year, month - 1, day);
        } else {
          // Para outros formatos com hífen, usar parsing normal
          parsedDate = new Date(dateStr);
        }
      } else {
        parsedDate = new Date(dateStr);
      }
    }

    // Verificar se a data é válida
    if (isNaN(parsedDate.getTime())) {
      return "Data inválida";
    }

    // Formatar para dd/MM/yyyy
    return parsedDate.toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  } catch (error) {
    console.error("Erro ao formatar data:", date, error);
    return "Data inválida";
  }
};

export const formatDate = (date: string | null | undefined): string => {
  if (
    !date ||
    date.toString().trim() === "" ||
    date === "null" ||
    date === "undefined"
  ) {
    return "-";
  }

  try {
    // Tentar diferentes formatos de data
    let parsedDate: Date;

    const dateStr = date.toString().trim();

    // Formato ISO (2024-01-01 ou 2024-01-01T00:00:00)
    if (dateStr.includes("-") && dateStr.length >= 10) {
      // Para formato YYYY-MM-DD, criar data local evitando timezone UTC
      if (dateStr.length === 10 && dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
        const [year, month, day] = dateStr.split("-").map(Number);
        parsedDate = new Date(year, month - 1, day);
      } else {
        parsedDate = new Date(dateStr);
      }
    }
    // Formato brasileiro (01/01/2024 ou 01-01-2024)
    else if (
      dateStr.includes("/") ||
      (dateStr.includes("-") && dateStr.length === 10)
    ) {
      const parts = dateStr.split(/[\/\-]/);
      if (parts.length === 3) {
        // Tentar dd/mm/yyyy primeiro
        if (parseInt(parts[0]) <= 31 && parseInt(parts[1]) <= 12) {
          parsedDate = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
        } else {
          parsedDate = new Date(dateStr);
        }
      } else {
        parsedDate = new Date(dateStr);
      }
    }
    // Timestamp numérico
    else if (!isNaN(Number(dateStr))) {
      parsedDate = new Date(Number(dateStr));
    }
    // Outros formatos
    else {
      parsedDate = new Date(dateStr);
    }

    // Verificar se a data é válida
    if (isNaN(parsedDate.getTime())) {
      console.warn("Data inválida encontrada:", date);
      return "-";
    }

    return parsedDate.toLocaleDateString("pt-BR");
  } catch (error) {
    console.warn("Erro ao formatar data:", date, error);
    return "-";
  }
};

export const calculateDaysSinceLastVisit = (
  lastVisitCreatedAt: string,
  today: Date,
): number => {
  if (!lastVisitCreatedAt) {
    return 999; // Never visited
  }

  try {
    let lastVisitDate: Date;
    const visitDateStr = lastVisitCreatedAt.split("T")[0];

    if (visitDateStr.includes("-")) {
      // Format YYYY-MM-DD
      const [year, month, day] = visitDateStr.split("-").map(Number);
      lastVisitDate = new Date(year, month - 1, day);
    } else if (visitDateStr.includes("/")) {
      // Format DD/MM/YYYY
      const [day, month, year] = visitDateStr.split("/").map(Number);
      lastVisitDate = new Date(year, month - 1, day);
    } else {
      // Try to parse as is
      lastVisitDate = new Date(visitDateStr);
    }

    lastVisitDate.setHours(0, 0, 0, 0);
    today.setHours(0, 0, 0, 0); // Ensure today is also at start of day for accurate diff

    const daysSinceLastVisit = Math.floor(
      (today.getTime() - lastVisitDate.getTime()) / (1000 * 60 * 60 * 24),
    );

    return Math.max(0, daysSinceLastVisit); // Ensure no negative days
  } catch (error) {
    console.error("Error calculating days since last visit:", error);
    return 999; // Fallback to never visited on error
  }
};

export const parseAndFormatDate = (
  dateStr: string | null | undefined,
): string => {
  if (!dateStr) return "N/A";

  const str = dateStr.trim();
  let date: Date | null = null;

  // Handles YYYY-MM-DD that might come from a date picker or ISO string
  if (str.includes("-")) {
    const parts = str.split("T")[0].split("-");
    if (parts.length === 3) {
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const day = parseInt(parts[2], 10);
      if (!isNaN(day) && !isNaN(month) && !isNaN(year)) {
        date = new Date(Date.UTC(year, month, day));
      }
    }
  }
  // Handles DD/MM/YYYY
  else if (str.includes("/")) {
    const parts = str.split("/");
    if (parts.length === 3) {
      const day = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1; // Month is 0-indexed
      const year = parseInt(parts[2], 10);
      if (!isNaN(day) && !isNaN(month) && !isNaN(year)) {
        // To avoid timezone issues, create date as UTC
        date = new Date(Date.UTC(year, month, day));
      }
    }
  }

  if (date && !isNaN(date.getTime())) {
    // Use UTC methods to format if created as UTC
    const day = String(date.getUTCDate()).padStart(2, "0");
    const month = String(date.getUTCMonth() + 1).padStart(2, "0");
    const year = date.getUTCFullYear();
    return `${day}/${month}/${year}`;
  }

  return "Data Inválida";
};
