import { AllowedVisitDate } from "../types";

/**
 * Resolve as configurações de datas permitidas aplicáveis a um cliente, com a
 * precedência bairro → cidade.
 *
 * As datas são por cobrador + cidade + (bairro opcional):
 *   - bairro NULL  = regra de nível cidade (vale para a cidade inteira);
 *   - bairro != NULL = regra específica daquele bairro.
 *
 * Precedência: se o bairro do cliente tem regra própria, usa-a; caso contrário,
 * cai nas regras de nível cidade (bairro NULL). Regras de OUTROS bairros da mesma
 * cidade não se aplicam ao cliente. Quando `collectorId` é informado, considera
 * apenas as regras daquele cobrador.
 */
export const resolveAllowedConfigs = (
  allowedDates: AllowedVisitDate[],
  city: string,
  neighborhood?: string | null,
  collectorId?: string,
): AllowedVisitDate[] => {
  const base = allowedDates.filter(
    (d) => d.city === city && (!collectorId || d.collector_id === collectorId),
  );

  const specific = neighborhood
    ? base.filter((d) => d.neighborhood === neighborhood)
    : [];

  // Bairro específico tem prioridade; senão, fallback para as regras de cidade
  // (bairro NULL/vazio).
  return specific.length > 0
    ? specific
    : base.filter((d) => !d.neighborhood);
};

/**
 * Calcula a próxima data permitida para visita baseado nas configurações de
 * allowed_visit_dates.
 * @param city - Cidade do cliente
 * @param neighborhood - Bairro do cliente (usa a regra do bairro se houver; senão
 *   cai na regra da cidade)
 * @param allowedDates - Lista de datas permitidas configuradas
 * @param collectorId - Cobrador que fará a visita (respeita a config por cobrador)
 * @param startDate - Data de início para calcular (opcional, padrão é hoje)
 * @returns Data no formato YYYY-MM-DD ou null se não houver data configurada
 */
export const getNextAllowedVisitDate = (
  city: string,
  neighborhood: string | null | undefined,
  allowedDates: AllowedVisitDate[],
  collectorId?: string,
  startDate?: Date,
): string | null => {
  const configs = resolveAllowedConfigs(
    allowedDates,
    city,
    neighborhood,
    collectorId,
  );

  if (configs.length === 0) {
    return null; // Sem configuração, retorna null
  }

  // Obter todos os dias permitidos (ex: [5, 10, 20, 25])
  const allowedDays = configs.map((c) => c.allowed_date).sort((a, b) => a - b);

  const today = startDate || new Date();
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth(); // 0-11
  const currentDay = today.getDate();

  // Função para verificar se um dia é válido em um mês/ano específico
  const isValidDate = (year: number, month: number, day: number): boolean => {
    const date = new Date(year, month, day);
    return date.getDate() === day;
  };

  // Função para calcular datas candidatas
  const getCandidateDates = (): Date[] => {
    const candidates: Date[] = [];

    // Tentar todos os dias permitidos no mês atual (se ainda não passaram)
    for (const day of allowedDays) {
      if (day >= currentDay && isValidDate(currentYear, currentMonth, day)) {
        candidates.push(new Date(currentYear, currentMonth, day));
      }
    }

    // Tentar todos os dias permitidos no próximo mês
    const nextMonth = currentMonth + 1;
    const nextYear = nextMonth > 11 ? currentYear + 1 : currentYear;
    const adjustedMonth = nextMonth > 11 ? 0 : nextMonth;

    for (const day of allowedDays) {
      if (isValidDate(nextYear, adjustedMonth, day)) {
        candidates.push(new Date(nextYear, adjustedMonth, day));
      }
    }

    // Se necessário, tentar no mês seguinte ao próximo
    if (candidates.length === 0) {
      const nextNextMonth = adjustedMonth + 1;
      const nextNextYear = nextNextMonth > 11 ? nextYear + 1 : nextYear;
      const adjustedNextMonth = nextNextMonth > 11 ? 0 : nextNextMonth;

      for (const day of allowedDays) {
        if (isValidDate(nextNextYear, adjustedNextMonth, day)) {
          candidates.push(new Date(nextNextYear, adjustedNextMonth, day));
        }
      }
    }

    return candidates;
  };

  // Obter todas as datas candidatas
  const candidates = getCandidateDates();

  if (candidates.length === 0) {
    return null;
  }

  // Encontrar a data mais próxima (a primeira no futuro)
  candidates.sort((a, b) => a.getTime() - b.getTime());
  const closestDate = candidates[0];

  return formatDateToYYYYMMDD(closestDate);
};

/**
 * Formata uma data para o formato YYYY-MM-DD
 */
const formatDateToYYYYMMDD = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

/**
 * Verifica se existe configuração de data permitida aplicável (bairro → cidade).
 * @param city - Cidade do cliente
 * @param neighborhood - Bairro do cliente
 * @param allowedDates - Lista de datas permitidas configuradas
 * @param collectorId - Cobrador que fará a visita (respeita a config por cobrador)
 */
export const hasAllowedVisitDate = (
  city: string,
  neighborhood: string | null | undefined,
  allowedDates: AllowedVisitDate[],
  collectorId?: string,
): boolean =>
  resolveAllowedConfigs(allowedDates, city, neighborhood, collectorId).length >
  0;

/**
 * Obtém o primeiro dia do mês configurado aplicável (bairro → cidade).
 * @param city - Cidade do cliente
 * @param neighborhood - Bairro do cliente
 * @param allowedDates - Lista de datas permitidas configuradas
 * @param collectorId - Cobrador que fará a visita (respeita a config por cobrador)
 */
export const getAllowedDayOfMonth = (
  city: string,
  neighborhood: string | null | undefined,
  allowedDates: AllowedVisitDate[],
  collectorId?: string,
): number | null => {
  const configs = resolveAllowedConfigs(
    allowedDates,
    city,
    neighborhood,
    collectorId,
  );
  if (configs.length === 0) return null;
  return configs
    .map((c) => c.allowed_date)
    .sort((a, b) => a - b)[0];
};
