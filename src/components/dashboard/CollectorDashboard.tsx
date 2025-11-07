import React, { useState, useEffect, useMemo } from "react";
import {
  Target,
  Clock,
  CheckCircle,
  Users,
  Calendar,
  Trophy,
  Diamond,
  Medal,
  Award,
  Flame,
  Sun,
  CalendarDays,
  CalendarRange,
  TrendingUp,
  Zap,
  Rocket,
  ThumbsUp,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Settings,
} from "lucide-react";
import FilterBar from "../common/FilterBar";
import { CollectionTable } from "./CollectionTable";
import RouteMap from "./RouteMap";
import VisitScheduler from "./VisitScheduler";
import RadialApprovalChart from "./RadialApprovalChart";
import TabTransition from "../common/TabTransition";
import { useCollection } from "../../contexts/CollectionContext";
import { useAuth } from "../../contexts/AuthContext";
import { FilterOptions } from "../../types";

const toDate = (dateInput: string | Date | null | undefined): Date | null => {
  if (!dateInput) return null;
  if (dateInput instanceof Date) return new Date(dateInput);
  if (typeof dateInput === "string") {
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateInput)) {
      return new Date(dateInput + "T00:00:00");
    }
  }
  return new Date(dateInput);
};

const INITIAL_CARD_IDS = [
  "clients",
  "sales",
  "visits",
  "schedulesByCity",
  "clientsByCity",
];

interface CollectorDashboardProps {
  activeTab?: string;
  onTabChange?: (tabId: string) => void;
}

interface CardProps {
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
  cardId: string;
  minimized: boolean;
  onToggleMinimize: (cardId: string) => void;
}

const Card: React.FC<CardProps> = ({
  title,
  icon: Icon,
  children,
  cardId,
  minimized,
  onToggleMinimize,
}) => {
  return (
    <div
      className={`bg-white rounded-2xl border border-gray-200 p-4 transition-all duration-300 ease-in-out ${minimized ? "h-20 overflow-hidden" : ""}`}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className={`p-2 bg-purple-500 rounded-2xl`}>
            <Icon className="w-4 h-4 text-white" />
          </div>
          <h3 className="font-semibold text-gray-900">{title}</h3>
        </div>
        <button
          onClick={() => onToggleMinimize(cardId)}
          className="p-1 rounded-md hover:bg-gray-200"
        >
          {minimized ? (
            <ChevronDown className="w-4 h-4" />
          ) : (
            <ChevronUp className="w-4 h-4" />
          )}
        </button>
      </div>
      {!minimized && children}
    </div>
  );
};

const CollectorDashboard: React.FC<CollectorDashboardProps> = ({
  activeTab: externalActiveTab,
}) => {
  const { user } = useAuth();
  const {
    getCollectorCollections,
    getFilteredCollections,
    getClientGroups,
    getVisitsByCollector,
    salePayments,
    monthlyGoals,
  } = useCollection();

  // Usa a aba externa se fornecida, senão gerencia internamente
  const internalActiveTab: "overview" | "collections" | "route" | "visits" =
    (localStorage.getItem("collectorActiveTab") as any) || "overview";

  const activeTab = externalActiveTab || internalActiveTab;

  const [filters, setFilters] = useState<FilterOptions>({});
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);
  const [showFilterBar, setShowFilterBar] = useState(false);
  const [isAutoSliding, setIsAutoSliding] = useState(true);
  const [showAllCities, setShowAllCities] = useState(false);
  const [showAllSchedules, setShowAllSchedules] = useState(false);

  const [cardOrder, setCardOrder] = useState<string[]>(INITIAL_CARD_IDS);
  const [visibleCards, setVisibleCards] = useState<string[]>(INITIAL_CARD_IDS);
  const [isCustomizeMenuOpen, setIsCustomizeMenuOpen] = useState(false);
  const [minimizedCards, setMinimizedCards] = useState<string[]>([]);

  // Configuração dos slides para mobile
  const mobileSlides = [
    { id: "daily", title: "Hoje", icon: Sun, color: "yellow" },
    { id: "weekly", title: "Esta Semana", icon: CalendarDays, color: "blue" },
    { id: "monthly", title: "Este Mês", icon: CalendarRange, color: "purple" },
  ];

  // Auto-slide effect
  useEffect(() => {
    if (!isAutoSliding || activeTab !== "overview") return;

    const interval = setInterval(() => {
      setCurrentSlideIndex((prevIndex) => {
        // Volta para o primeiro slide após o último
        return prevIndex === mobileSlides.length - 1 ? 0 : prevIndex + 1;
      });
    }, 5000); // 5 segundos

    return () => clearInterval(interval);
  }, [isAutoSliding, activeTab, mobileSlides.length]);

  // Função para pausar e reiniciar auto-slide
  const pauseAutoSlide = () => {
    setIsAutoSliding(false);
    // Reinicia após 10 segundos de inatividade
    setTimeout(() => {
      setIsAutoSliding(true);
    }, 10000);
  };

  // Funções de controle do slide
  const handleTouchStart = (e: React.TouchEvent) => {
    pauseAutoSlide();
    setTouchEnd(null);
    setTouchStart(e.targetTouches[0].clientX);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    setTouchEnd(e.targetTouches[0].clientX);
  };

  const handleTouchEnd = () => {
    if (!touchStart || !touchEnd) return;

    const distance = touchStart - touchEnd;
    const isLeftSwipe = distance > 50;
    const isRightSwipe = distance < -50;

    if (isLeftSwipe && currentSlideIndex < mobileSlides.length - 1) {
      setCurrentSlideIndex(currentSlideIndex + 1);
    }
    if (isRightSwipe && currentSlideIndex > 0) {
      setCurrentSlideIndex(currentSlideIndex - 1);
    }
  };

  const goToSlide = (index: number) => {
    pauseAutoSlide();
    setCurrentSlideIndex(index);
  };

  // Funções para calcular métricas por período
  const getMetricsByPeriod = (payments: any[], visits: any[]) => {
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0, 0, 0, 0);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const currentMonthStr = now.toISOString().slice(0, 7); // "YYYY-MM"

    // Find the goal for the current month
    const currentMonthGoal = monthlyGoals.find(
      (g) => g.user_id === user?.id && g.month.startsWith(currentMonthStr),
    );

    // Define default goals
    const defaultGoals = {
      visits: 200,
      payments: 100000,
    };

    const monthlyVisitsGoal =
      currentMonthGoal?.visits_goal ?? defaultGoals.visits;
    const monthlyPaymentsGoal =
      currentMonthGoal?.payments_goal ?? defaultGoals.payments;

    // Derive daily and weekly goals from monthly
    const goals = {
      daily: {
        visits: Math.ceil(monthlyVisitsGoal / 22), // Assuming 22 working days
        payments: Math.ceil(monthlyPaymentsGoal / 22),
      },
      weekly: {
        visits: Math.ceil(monthlyVisitsGoal / 4),
        payments: Math.ceil(monthlyPaymentsGoal / 4),
      },
      monthly: {
        visits: monthlyVisitsGoal,
        payments: monthlyPaymentsGoal,
      },
    };

    // Filtrar pagamentos do cobrador atual
    const collectorPayments = payments.filter(
      (p) => p.collectorId === user?.id,
    );

    // Função para comparar datas (apenas dia)
    const isSameDay = (d1: Date | string, d2: Date | string) => {
      const date1 = toDate(d1);
      const date2 = toDate(d2);
      if (!date1 || !date2) return false;
      return date1.toISOString().split("T")[0] === date2.toISOString().split("T")[0];
    };

    const today = new Date();

    const dailyPayments = collectorPayments.filter((p) =>
      isSameDay(p.paymentDate, today),
    );

    const todayVisits = visits.filter((v) => {
      if (v.status !== "realizada") return false;
      const dateToCheck = v.dataVisitaRealizada || v.scheduledDate;
      return isSameDay(dateToCheck, today);
    });

    // Calcular métricas reais
    const metrics = {
      daily: {
        visits: todayVisits.length,
        payments: dailyPayments.reduce((sum, p) => sum + p.paymentAmount, 0),
      },
      weekly: {
        visits: visits.filter((v) => {
          if (v.status !== "realizada") return false;
          const dateToCheck = v.dataVisitaRealizada || v.scheduledDate;
          const visitDate = toDate(dateToCheck);
          return visitDate && visitDate >= startOfWeek;
        }).length,
        payments: collectorPayments
          .filter((p) => {
            const paymentDate = toDate(p.paymentDate);
            return paymentDate && paymentDate >= startOfWeek;
          })
          .reduce((sum, p) => sum + p.paymentAmount, 0),
      },
      monthly: {
        visits: visits.filter((v) => {
          if (v.status !== "realizada") return false;
          const dateToCheck = v.dataVisitaRealizada || v.scheduledDate;
          const visitDate = toDate(dateToCheck);
          return visitDate && visitDate >= startOfMonth;
        }).length,
        payments: collectorPayments
          .filter((p) => {
            const paymentDate = toDate(p.paymentDate);
            return paymentDate && paymentDate >= startOfMonth;
          })
          .reduce((sum, p) => sum + p.paymentAmount, 0),
      },
    };

    return { metrics, goals };
  };

  // Funções para gamificação
  const getPerformanceLevel = (current: number, goal: number) => {
    const percentage = goal > 0 ? (current / goal) * 100 : 0;
    if (percentage >= 100)
      return {
        icon: Trophy,
        name: "Lendário",
        color: "text-yellow-500",
        bgColor: "bg-yellow-50",
      };
    if (percentage >= 90)
      return {
        icon: Diamond,
        name: "Diamante",
        color: "text-blue-500",
        bgColor: "bg-blue-50",
      };
    if (percentage >= 70)
      return {
        icon: Award,
        name: "Ouro",
        color: "text-yellow-600",
        bgColor: "bg-yellow-50",
      };
    if (percentage >= 50)
      return {
        icon: Medal,
        name: "Prata",
        color: "text-gray-500",
        bgColor: "bg-gray-50",
      };
    if (percentage >= 30)
      return {
        icon: ThumbsUp,
        name: "Bronze",
        color: "text-orange-600",
        bgColor: "bg-orange-50",
      };
    return {
      icon: Flame,
      name: "Iniciante",
      color: "text-red-500",
      bgColor: "bg-red-50",
    };
  };

  const getMotivationalMessage = (current: number, goal: number) => {
    const percentage = goal > 0 ? (current / goal) * 100 : 0;
    if (percentage >= 100)
      return { text: "Incrível! Meta superada!", icon: Rocket };
    if (percentage >= 90)
      return { text: "Quase lá! Última tacada!", icon: Zap };
    if (percentage >= 70)
      return { text: "Excelente progresso!", icon: TrendingUp };
    if (percentage >= 50) return { text: "No caminho certo!", icon: ThumbsUp };
    if (percentage >= 30) return { text: "Vamos acelerar!", icon: Zap };
    return { text: "Hora de começar!", icon: Target };
  };

  // Card Content Components
  const ClientsCardContent = () => (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-1">
          <AlertCircle className="w-3 h-3 text-orange-500" />
          <span className="text-gray-600">Pendentes</span>
        </div>
        <span className="font-medium text-orange-600">
          {stats.clientsWithPending}
        </span>
      </div>

      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-1">
          <CheckCircle className="w-3 h-3 text-green-500" />
          <span className="text-gray-600">Em dia</span>
        </div>
        <span className="font-medium text-green-600">
          {stats.clients - stats.clientsWithPending}
        </span>
      </div>

      <div className="pt-2 border-t border-gray-100">
        <div className="text-xs text-gray-500">
          {stats.pending} vendas pendentes
        </div>
      </div>
    </div>
  );

  const SalesCardContent = () => (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-1">
          <CheckCircle className="w-3 h-3 text-green-500" />
          <span className="text-gray-600">Finalizadas</span>
        </div>
        <span className="font-medium text-green-600">{stats.completed}</span>
      </div>

      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-1">
          <Clock className="w-3 h-3 text-orange-500" />
          <span className="text-gray-600">Pendentes</span>
        </div>
        <span className="font-medium text-orange-600">{stats.pending}</span>
      </div>

      <div className="pt-2 border-t border-gray-100">
        <div className="text-xs text-gray-500">
          {stats.total > 0
            ? ((stats.completed / stats.total) * 100).toFixed(1)
            : 0}
          % concluídas
        </div>
      </div>
    </div>
  );

  const VisitsCardContent = () => (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-1">
          <Sun className="w-3 h-3 text-yellow-500" />
          <span className="text-gray-600">Hoje</span>
        </div>
        <span className="font-medium text-yellow-600">
          {stats.visitStats.today}
        </span>
      </div>

      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-1">
          <CheckCircle className="w-3 h-3 text-green-500" />
          <span className="text-gray-600">Realizadas</span>
        </div>
        <span className="font-medium text-green-600">
          {stats.visitStats.completed}
        </span>
      </div>

      <div className="pt-2 border-t border-gray-100">
        <div className="text-xs text-gray-500">
          {stats.visitStats.scheduled + stats.visitStats.completed} visitas no
          total
        </div>
      </div>
    </div>
  );

  const ClientsByCityCardContent = () => {
    const sortedCities = useMemo(() => {
      return Object.entries(clientsByCity).sort(
        ([, countA], [, countB]) => countB - countA,
      );
    }, [clientsByCity]);

    const visibleCities = showAllCities
      ? sortedCities
      : sortedCities.slice(0, 4);

    return (
      <>
        <div className="grid grid-cols-2 gap-2 text-sm">
          {visibleCities.map(([city, count]) => (
            <div key={city} className="bg-gray-50 p-2 rounded-lg text-center">
              <div className="font-bold text-gray-800">{count}</div>
              <div className="text-gray-600">{city}</div>
            </div>
          ))}
        </div>
        {sortedCities.length > 10 && (
          <div className="mt-4 text-center">
            <button
              onClick={() => setShowAllCities(!showAllCities)}
              className="text-sm font-medium text-indigo-600 hover:text-indigo-500 flex items-center justify-center w-full"
            >
              {showAllCities ? "Mostrar Menos" : "Mostrar Mais"}
              {showAllCities ? (
                <ChevronUp className="w-4 h-4 ml-1" />
              ) : (
                <ChevronDown className="w-4 h-4 ml-1" />
              )}
            </button>
          </div>
        )}
      </>
    );
  };

  const SchedulesByCityCardContent = () => {
    const sortedSchedules = useMemo(() => {
      return Object.entries(schedulesByCity).sort(
        ([, dataA], [, dataB]) => dataB.count - dataA.count,
      );
    }, [schedulesByCity]);

    const visibleSchedules = showAllSchedules
      ? sortedSchedules
      : sortedSchedules.slice(0, 4);

    return (
      <>
        <div className="grid grid-cols-2 gap-2 text-sm">
          {visibleSchedules.map(([city, data]) => (
            <div key={city} className="bg-gray-50 p-2 rounded-lg text-center">
              <div className="font-bold text-gray-800">{data.count}</div>
              <div className="text-gray-600">{city}</div>
            </div>
          ))}
        </div>
        {sortedSchedules.length > 10 && (
          <div className="mt-4 text-center">
            <button
              onClick={() => setShowAllSchedules(!showAllSchedules)}
              className="text-sm font-medium text-indigo-600 hover:text-indigo-500 flex items-center justify-center w-full"
            >
              {showAllSchedules ? "Mostrar Menos" : "Mostrar Mais"}
              {showAllSchedules ? (
                <ChevronUp className="w-4 h-4 ml-1" />
              ) : (
                <ChevronDown className="w-4 h-4 ml-1" />
              )}
            </button>
          </div>
        )}
      </>
    );
  };



  const myCollections = useMemo(
    () => getCollectorCollections(user?.id || ""),
    [user?.id],
  );
  const filteredCollections = useMemo(
    () => getFilteredCollections(filters, "collector", user?.id),
    [filters, user?.id],
  );
  const clientGroups = useMemo(() => getClientGroups(user?.id), [user?.id]);
  const myVisits = useMemo(
    () => getVisitsByCollector(user?.id || ""),
    [user?.id],
  );

  // Calcular métricas gamificadas
  const { metrics: periodMetrics, goals } = useMemo(
    () => getMetricsByPeriod(salePayments, myVisits),
    [salePayments, myVisits, monthlyGoals, user],
  );

  // Simplified logic - group by sale to count correctly
  const salesMap = useMemo(() => {
    const map = new Map<
      string,
      {
        totalValue: number;
        receivedValue: number;
        isPending: boolean;
        clientDocument: string;
      }
    >();

    myCollections.forEach((collection) => {
      const saleKey = `${collection.venda_n}-${collection.documento}`;
      if (!map.has(saleKey)) {
        map.set(saleKey, {
          totalValue: 0,
          receivedValue: 0,
          isPending: false,
          clientDocument: collection.documento || "",
        });
      }

      const sale = map.get(saleKey)!;
      sale.totalValue =
        Number(sale.totalValue) + Number(collection.valor_original);
      sale.receivedValue =
        Number(sale.receivedValue) + Number(collection.valor_recebido);
    });

    // Determine if each sale is pending (has any amount left to receive)
    map.forEach((sale) => {
      const pendingAmount = sale.totalValue - sale.receivedValue;
      sale.isPending = pendingAmount > 0.01; // Consider amounts > 1 cent as pending
    });

    return map;
  }, [myCollections]);

  const clientsByCity = useMemo(() => {
    return clientGroups.reduce(
      (acc, group) => {
        const city = group.city || "Sem cidade";
        acc[city] = (acc[city] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );
  }, [clientGroups]);

  const schedulesByCity = useMemo(() => {
    const scheduled = myVisits.filter((v) => v.status === "agendada");
    return scheduled.reduce(
      (acc, visit) => {
        const city = visit.clientCity || "Sem cidade";
        if (!acc[city]) {
          acc[city] = { count: 0, dates: new Set<string>() };
        }
        acc[city].count++;
        acc[city].dates.add(visit.scheduledDate);
        return acc;
      },
      {} as Record<string, { count: number; dates: Set<string> }>,
    );
  }, [myVisits]);

  const stats = useMemo(() => {
    const salesArray = Array.from(salesMap.values());
    const pendingSales = salesArray.filter((s) => s.isPending);
    const completedSales = salesArray.filter((s) => !s.isPending);

    // Count unique clients with pending sales
    const clientsWithPending = new Set(
      pendingSales.map((s) => s.clientDocument).filter(Boolean),
    ).size;

    // Calcular métricas de visitas
    const today = new Date();
    const todayStr = today.toISOString().split("T")[0];

    const visitStats = {
      today: myVisits.filter((v) => {
        // Para visitas agendadas, usar scheduled_date
        // Para visitas realizadas, usar data_visita_realizada se existir
        if (v.status === "agendada") {
          return v.scheduledDate === todayStr;
        } else if (v.status === "realizada" && v.dataVisitaRealizada) {
          return v.dataVisitaRealizada === todayStr;
        }
        return false;
      }).length,
      scheduled: myVisits.filter((v) => v.status === "agendada").length,
      completed: myVisits.filter((v) => v.status === "realizada").length,
    };

    return {
      total: salesMap.size,
      clients: clientGroups.length,
      pending: pendingSales.length,
      completed: completedSales.length,
      clientsWithPending: clientsWithPending,
      visits: visitStats.scheduled,
      visitStats: visitStats,
      totalAmount: salesArray.reduce((sum, s) => sum + s.totalValue, 0),
      receivedAmount: salesArray.reduce((sum, s) => sum + s.receivedValue, 0),
    };
  }, [salesMap, clientGroups, myVisits]);

  const handleToggleMinimize = (cardId: string) => {
    setMinimizedCards((prev) =>
      prev.includes(cardId)
        ? prev.filter((id) => id !== cardId)
        : [...prev, cardId],
    );
  };

  const renderTabContent = () => {
    const dashboardCards = [
      {
        id: "clients",
        Component: ClientsCardContent,
        title: "Clientes",
        icon: Users,
      },
      {
        id: "sales",
        Component: SalesCardContent,
        title: "Vendas",
        icon: Target,
      },
      {
        id: "visits",
        Component: VisitsCardContent,
        title: "Visitas",
        icon: Calendar,
      },

      {
        id: "schedulesByCity",
        Component: SchedulesByCityCardContent,
        title: "Agendamentos por Cidade",
        icon: Calendar,
      },
      {
        id: "clientsByCity",
        Component: ClientsByCityCardContent,
        title: "Clientes por Cidade",
        icon: Users,
      },
    ];



    const orderedAndVisibleCards = cardOrder
      .map((id) => dashboardCards.find((c) => c.id === id))
      .filter((c) => c && visibleCards.includes(c.id));

    switch (activeTab) {
      case "overview":
        return (
          <div className="space-y-6">
            {/* Customize Button */}
            <div className="flex mb-4">
              <button
                onClick={() => setIsCustomizeMenuOpen(!isCustomizeMenuOpen)}
                className="flex items-center gap-2 text-sm font-medium text-gray-600 bg-white px-4 py-2 rounded-2xl border border-gray-200 hover:bg-gray-50"
              >
                <Settings className="w-4 h-4" />
                <span>Personalizar</span>
              </button>
            </div>

            {/* Customize Menu */}
            {isCustomizeMenuOpen && (
              <div className="bg-white rounded-2xl border border-gray-200 p-4 mb-4">
                <h3 className="font-semibold text-gray-900 mb-3">
                  Personalizar Cards
                </h3>
                <div className="space-y-2">
                  <h4 className="font-medium text-sm text-gray-700">
                    Ordem e Visibilidade
                  </h4>
                  {cardOrder.map((cardId, index) => {
                    const card = dashboardCards.find((c) => c.id === cardId);
                    if (!card) return null;

                    return (
                      <div
                        key={card.id}
                        className="flex items-center justify-between p-2 rounded-lg bg-gray-50"
                      >
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={visibleCards.includes(card.id)}
                            onChange={() => {
                              if (visibleCards.includes(card.id)) {
                                setVisibleCards(
                                  visibleCards.filter((id) => id !== card.id),
                                );
                              } else {
                                setVisibleCards([...visibleCards, card.id]);
                              }
                            }}
                            className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                          />
                          <span className="text-sm font-medium text-gray-800">
                            {card.title}
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => {
                              if (index > 0) {
                                const newOrder = [...cardOrder];
                                const temp = newOrder[index];
                                newOrder[index] = newOrder[index - 1];
                                newOrder[index - 1] = temp;
                                setCardOrder(newOrder);
                              }
                            }}
                            disabled={index === 0}
                            className="p-1 rounded-md hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <ChevronUp className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => {
                              if (index < cardOrder.length - 1) {
                                const newOrder = [...cardOrder];
                                const temp = newOrder[index];
                                newOrder[index] = newOrder[index + 1];
                                newOrder[index + 1] = temp;
                                setCardOrder(newOrder);
                              }
                            }}
                            disabled={index === cardOrder.length - 1}
                            className="p-1 rounded-md hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <ChevronDown className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Enhanced Mobile Stats Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-3 gap-4">
              {orderedAndVisibleCards.map((card) => {
                if (!card) return null;
                const { Component, ...rest } = card;
                return (
                  <div
                    key={card.id}
                    className="transition duration-300 hover:scale-105"
                  >
                    <Card
                      {...rest}
                      cardId={card.id}
                      minimized={minimizedCards.includes(card.id)}
                      onToggleMinimize={handleToggleMinimize}
                    >
                      <Component />
                    </Card>
                  </div>
                );
              })}
            </div>

            {/* Métricas Gamificadas */}
            <div className="bg-gradient-to-r from-indigo-50 to-purple-50 rounded-2xl border border-indigo-200 overflow-hidden">
              {/* Header */}
              <div className="bg-white/80 backdrop-blur-sm p-4 border-b border-indigo-100">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-indigo-100 rounded-2xl">
                      <Target className="w-6 h-6 text-indigo-600" />
                    </div>
                    <div>
                      <h2 className="font-semibold text-gray-900">Metas</h2>
                    </div>
                  </div>
                  <div className="text-sm text-gray-600 bg-white px-4 py-2 rounded-2xl border border-gray-200">
                    <div className="font-medium">
                      {new Date().toLocaleDateString("pt-BR", {
                        weekday: "short",
                        day: "numeric",
                        month: "short",
                      })}
                    </div>
                  </div>
                </div>
              </div>

              {/* Content */}
              <div className="p-3">
                {/* Layout Desktop: Grid 3x2 */}
                <div className="hidden lg:grid lg:grid-cols-3 lg:gap-4">
                  {/* Coluna Hoje */}
                  <div className="bg-white/70 backdrop-blur-sm rounded-2xl p-4 border border-indigo-200">
                    <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2 justify-center">
                      <Sun className="w-5 h-5 text-yellow-500" />
                      Hoje
                    </h3>
                    <div className="space-y-6">
                      <RadialApprovalChart
                        current={periodMetrics.daily.visits}
                        goal={goals.daily.visits}
                        title="Visitas Realizadas"
                        showValues={true}
                        isCurrency={false}
                        level={getPerformanceLevel(
                          periodMetrics.daily.visits,
                          goals.daily.visits,
                        )}
                        motivationalMessage={getMotivationalMessage(
                          periodMetrics.daily.visits,
                          goals.daily.visits,
                        )}
                      />
                      <RadialApprovalChart
                        current={periodMetrics.daily.payments}
                        goal={goals.daily.payments}
                        title="Valor Recebido"
                        showValues={true}
                        isCurrency={true}
                        level={getPerformanceLevel(
                          periodMetrics.daily.payments,
                          goals.daily.payments,
                        )}
                        motivationalMessage={getMotivationalMessage(
                          periodMetrics.daily.payments,
                          goals.daily.payments,
                        )}
                      />
                    </div>
                  </div>

                  {/* Coluna Esta Semana */}
                  <div className="bg-white/70 backdrop-blur-sm rounded-2xl p-4 border border-blue-200">
                    <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2 justify-center">
                      <CalendarDays className="w-5 h-5 text-blue-500" />
                      Esta Semana
                    </h3>
                    <div className="space-y-6">
                      <RadialApprovalChart
                        current={periodMetrics.weekly.visits}
                        goal={goals.weekly.visits}
                        title="Visitas Realizadas"
                        showValues={true}
                        isCurrency={false}
                        level={getPerformanceLevel(
                          periodMetrics.weekly.visits,
                          goals.weekly.visits,
                        )}
                        motivationalMessage={getMotivationalMessage(
                          periodMetrics.weekly.visits,
                          goals.weekly.visits,
                        )}
                      />
                      <RadialApprovalChart
                        current={periodMetrics.weekly.payments}
                        goal={goals.weekly.payments}
                        title="Valor Recebido"
                        showValues={true}
                        isCurrency={true}
                        level={getPerformanceLevel(
                          periodMetrics.weekly.payments,
                          goals.weekly.payments,
                        )}
                        motivationalMessage={getMotivationalMessage(
                          periodMetrics.weekly.payments,
                          goals.weekly.payments,
                        )}
                      />
                    </div>
                  </div>

                  {/* Coluna Este Mês */}
                  <div className="bg-white/70 backdrop-blur-sm rounded-2xl p-4 border border-purple-200">
                    <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2 justify-center">
                      <CalendarRange className="w-5 h-5 text-purple-500" />
                      Este Mês
                    </h3>
                    <div className="space-y-6">
                      <RadialApprovalChart
                        current={periodMetrics.monthly.visits}
                        goal={goals.monthly.visits}
                        title="Visitas Realizadas"
                        showValues={true}
                        isCurrency={false}
                        level={getPerformanceLevel(
                          periodMetrics.monthly.visits,
                          goals.monthly.visits,
                        )}
                        motivationalMessage={getMotivationalMessage(
                          periodMetrics.monthly.visits,
                          goals.monthly.visits,
                        )}
                      />
                      <RadialApprovalChart
                        current={periodMetrics.monthly.payments}
                        goal={goals.monthly.payments}
                        title="Valor Recebido"
                        showValues={true}
                        isCurrency={true}
                        level={getPerformanceLevel(
                          periodMetrics.monthly.payments,
                          goals.monthly.payments,
                        )}
                        motivationalMessage={getMotivationalMessage(
                          periodMetrics.monthly.payments,
                          goals.monthly.payments,
                        )}
                      />
                    </div>
                  </div>
                </div>

                {/* Layout Mobile: Slides */}
                <div className="lg:hidden">
                  <div
                    className="relative overflow-hidden"
                    onTouchStart={handleTouchStart}
                    onTouchMove={handleTouchMove}
                    onTouchEnd={handleTouchEnd}
                  >
                    <div
                      className="flex transition-transform duration-300 ease-in-out"
                      style={{
                        transform: `translateX(-${currentSlideIndex * 100}%)`,
                      }}
                    >
                      {mobileSlides.map((slide) => {
                        const metrics =
                          slide.id === "daily"
                            ? periodMetrics.daily
                            : slide.id === "weekly"
                              ? periodMetrics.weekly
                              : periodMetrics.monthly;
                        const goalsPeriod =
                          slide.id === "daily"
                            ? goals.daily
                            : slide.id === "weekly"
                              ? goals.weekly
                              : goals.monthly;
                        const Icon = slide.icon;

                        return (
                          <div key={slide.id} className="w-full flex-shrink-0">
                            <div
                              className={`bg-white/70 backdrop-blur-sm rounded-2xl p-2 border ${
                                slide.color === "yellow"
                                  ? "border-yellow-200"
                                  : slide.color === "blue"
                                    ? "border-blue-200"
                                    : "border-purple-200"
                              }`}
                            >
                              <h3 className="font-semibold text-gray-900 mb-2 flex items-center gap-2">
                                <Icon
                                  className={`w-5 h-5 ${
                                    slide.color === "yellow"
                                      ? "text-yellow-500"
                                      : slide.color === "blue"
                                        ? "text-blue-500"
                                        : "text-purple-500"
                                  }`}
                                />
                                {slide.title}
                              </h3>
                              <div className="grid grid-cols-1 gap-2">
                                <RadialApprovalChart
                                  current={metrics.visits}
                                  goal={goalsPeriod.visits}
                                  title="Visitas Realizadas"
                                  showValues={true}
                                  isCurrency={false}
                                  level={getPerformanceLevel(
                                    metrics.visits,
                                    goalsPeriod.visits,
                                  )}
                                  motivationalMessage={getMotivationalMessage(
                                    metrics.visits,
                                    goalsPeriod.visits,
                                  )}
                                />
                                <RadialApprovalChart
                                  current={metrics.payments}
                                  goal={goalsPeriod.payments}
                                  title="Valor Recebido"
                                  showValues={true}
                                  isCurrency={true}
                                  level={getPerformanceLevel(
                                    metrics.payments,
                                    goalsPeriod.payments,
                                  )}
                                  motivationalMessage={getMotivationalMessage(
                                    metrics.payments,
                                    goalsPeriod.payments,
                                  )}
                                />
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Indicadores de navegação */}
                  <div className="flex justify-center mt-2 space-x-2">
                    {mobileSlides.map((slide, index) => (
                      <button
                        key={slide.id}
                        onClick={() => goToSlide(index)}
                        className={`h-2 rounded-full transition-all duration-300 ${
                          index === currentSlideIndex
                            ? "w-8 bg-indigo-600"
                            : "w-2 bg-gray-300 hover:bg-gray-400"
                        }`}
                        aria-label={`Ir para ${slide.title}`}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        );

      case "collections":
        return (
          <div>
            {showFilterBar && (
              <FilterBar
                filters={filters}
                onFilterChange={setFilters}
                userType="collector"
              />
            )}
            <CollectionTable
              collections={filteredCollections}
              userType="collector"
              showGrouped={true}
              collectorId={user?.id}
              showFilterBar={showFilterBar}
              onToggleFilterBar={() => setShowFilterBar(!showFilterBar)}
            />
          </div>
        );

      case "route":
        return <RouteMap clientGroups={getClientGroups(user?.id)} />;

      case "visits":
        return <VisitScheduler />;

      default:
        return null;
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-16 pt-16 lg:pt-16">
      {/* Tab Content */}
      <TabTransition activeKey={activeTab}>{renderTabContent()}</TabTransition>
    </div>
  );
};

export default CollectorDashboard;
