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
  // Buscar TODOS os dias permitidos para esta cidade/bairro
  const configs = allowedDates.filter(
    (d) => d.city === city && d.neighborhood === neighborhood,
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
