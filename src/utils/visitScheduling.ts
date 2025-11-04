import { AllowedVisitDate } from "../types";

/**
 * Calcula a próxima data permitida para visita baseado nas configurações de allowed_visit_dates
 * @param city - Cidade do cliente
 * @param neighborhood - Bairro do cliente
 * @param allowedDates - Lista de datas permitidas configuradas
 * @param startDate - Data de início para calcular (opcional, padrão é hoje)
 * @returns Data no formato YYYY-MM-DD ou null se não houver data configurada
 */
export const getNextAllowedVisitDate = (
  city: string,
  neighborhood: string,
  allowedDates: AllowedVisitDate[],
  startDate?: Date,
): string | null => {
  // Verificar se existe configuração para esta cidade/bairro
  const config = allowedDates.find(
    (d) => d.city === city && d.neighborhood === neighborhood,
  );

  if (!config) {
    return null; // Sem configuração, retorna null
  }

  const allowedDay = config.allowed_date; // Dia do mês (1-31)
  const today = startDate || new Date();
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth(); // 0-11
  const currentDay = today.getDate();

  // Função para verificar se um dia é válido em um mês/ano específico
  const isValidDate = (year: number, month: number, day: number): boolean => {
    const date = new Date(year, month, day);
    return date.getDate() === day;
  };

  // Tentar no mês atual
  if (allowedDay >= currentDay && isValidDate(currentYear, currentMonth, allowedDay)) {
    const date = new Date(currentYear, currentMonth, allowedDay);
    return formatDateToYYYYMMDD(date);
  }

  // Tentar no próximo mês
  const nextMonth = currentMonth + 1;
  const nextYear = nextMonth > 11 ? currentYear + 1 : currentYear;
  const adjustedMonth = nextMonth > 11 ? 0 : nextMonth;

  if (isValidDate(nextYear, adjustedMonth, allowedDay)) {
    const date = new Date(nextYear, adjustedMonth, allowedDay);
    return formatDateToYYYYMMDD(date);
  }

  // Se o dia não existe no próximo mês (ex: 31 em fevereiro), tentar o mês seguinte
  const nextNextMonth = adjustedMonth + 1;
  const nextNextYear = nextNextMonth > 11 ? nextYear + 1 : nextYear;
  const adjustedNextMonth = nextNextMonth > 11 ? 0 : nextNextMonth;

  if (isValidDate(nextNextYear, adjustedNextMonth, allowedDay)) {
    const date = new Date(nextNextYear, adjustedNextMonth, allowedDay);
    return formatDateToYYYYMMDD(date);
  }

  // Fallback: retornar null se não conseguir calcular
  return null;
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
 * Verifica se existe configuração de data permitida para uma cidade/bairro
 */
export const hasAllowedVisitDate = (
  city: string,
  neighborhood: string,
  allowedDates: AllowedVisitDate[],
): boolean => {
  return allowedDates.some(
    (d) => d.city === city && d.neighborhood === neighborhood,
  );
};

/**
 * Obtém o dia do mês configurado para uma cidade/bairro
 */
export const getAllowedDayOfMonth = (
  city: string,
  neighborhood: string,
  allowedDates: AllowedVisitDate[],
): number | null => {
  const config = allowedDates.find(
    (d) => d.city === city && d.neighborhood === neighborhood,
  );
  return config ? config.allowed_date : null;
};
