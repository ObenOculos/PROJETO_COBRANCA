import React, { useState, useEffect } from "react";
import {
  MapPin,
  Target,
  CheckCircle,
  Users,
  Calendar,
  BarChart3,
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
  Clock,
} from "lucide-react";
import FilterBar from "../common/FilterBar";
import CollectionTable from "./CollectionTable";
import RouteMap from "./RouteMap";
import VisitScheduler from "./VisitScheduler";
import RadialApprovalChart from "./RadialApprovalChart";
import { useCollection } from "../../contexts/CollectionContext";
import { useAuth } from "../../contexts/AuthContext";
import { FilterOptions } from "../../types";
import { formatCurrency } from "../../utils/formatters";

// Export tabs for use in Header
export const getCollectorTabs = () => [
  { id: "overview", name: "Resumo", icon: BarChart3 },
  { id: "collections", name: "Minha Carteira", icon: Target },
  { id: "route", name: "Rota de Cobrança", icon: MapPin },
  { id: "visits", name: "Visitas Agendadas", icon: Calendar },
];

interface CollectorDashboardProps {
  activeTab?: string;
  onTabChange?: (tabId: string) => void;
}

const CollectorDashboard: React.FC<CollectorDashboardProps> = ({
  activeTab: externalActiveTab,
  onTabChange: externalOnTabChange,
}) => {
  const { user } = useAuth();
  const {
    getCollectorCollections,
    getFilteredCollections,
    getClientGroups,
    getVisitsByCollector,
    salePayments,
  } = useCollection();

  // Usa a aba externa se fornecida, senão gerencia internamente
  const [internalActiveTab, setInternalActiveTab] = useState<
    "overview" | "collections" | "route" | "visits"
  >(() => {
    const savedTab = localStorage.getItem("collectorActiveTab");
    return (savedTab as any) || "overview";
  });

  const activeTab = externalActiveTab || internalActiveTab;
  const setActiveTab = (tab: string) => {
    if (externalOnTabChange) {
      externalOnTabChange(tab);
    } else {
      setInternalActiveTab(tab as any);
    }
  };

  const [filters, setFilters] = useState<FilterOptions>({});

  // Funções para calcular métricas por período
  const getMetricsByPeriod = (payments: any[], visits: any[]) => {
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0, 0, 0, 0);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    // Metas (podem ser ajustadas conforme necessário)
    const goals = {
      daily: { visits: 10, payments: 5000 },
      weekly: { visits: 50, payments: 25000 },
      monthly: { visits: 200, payments: 100000 },
    };

    // Filtrar pagamentos do cobrador atual
    const collectorPayments = payments.filter(
      (p) => p.collectorId === user?.id,
    );

    // Função para comparar datas (apenas dia)
    const isSameDay = (date1: Date, date2: Date) => {
      return (
        date1.toISOString().split("T")[0] === date2.toISOString().split("T")[0]
      );
    };

    const today = new Date();

    const dailyPayments = collectorPayments.filter((p) => {
      // Verificar se a data é uma string no formato YYYY-MM-DD ou se já é um objeto Date
      let paymentDate;
      if (typeof p.paymentDate === "string") {
        // Se é string, pode ser no formato YYYY-MM-DD (date do SQL)
        paymentDate = new Date(p.paymentDate + "T00:00:00");
      } else {
        paymentDate = new Date(p.paymentDate);
      }

      return isSameDay(paymentDate, today);
    });

    // Função para processar data de visita
    const processVisitDate = (dateStr: string) => {
      if (typeof dateStr === "string") {
        return new Date(dateStr + "T00:00:00");
      }
      return new Date(dateStr);
    };

    const todayVisits = visits.filter((v) => {
      if (v.status !== "realizada") return false;
      const dateToCheck = v.dataVisitaRealizada || v.scheduledDate;
      const visitDate = processVisitDate(dateToCheck);
      return isSameDay(visitDate, today);
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
          const visitDate = processVisitDate(dateToCheck);
          return visitDate >= startOfWeek;
        }).length,
        payments: collectorPayments
          .filter((p) => {
            const paymentDate = new Date(p.paymentDate);
            return paymentDate >= startOfWeek;
          })
          .reduce((sum, p) => sum + p.paymentAmount, 0),
      },
      monthly: {
        visits: visits.filter((v) => {
          if (v.status !== "realizada") return false;
          const dateToCheck = v.dataVisitaRealizada || v.scheduledDate;
          const visitDate = processVisitDate(dateToCheck);
          return visitDate >= startOfMonth;
        }).length,
        payments: collectorPayments
          .filter((p) => {
            const paymentDate = new Date(p.paymentDate);
            return paymentDate >= startOfMonth;
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

  // Componente consolidado para clientes
  const ClientsCard = () => (
    <div
      className="bg-white rounded-2xl border border-gray-200 p-4 hover:border-purple-300 transition-colors cursor-pointer"
      onClick={() => setActiveTab("collections")}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-purple-500 rounded-lg">
            <Users className="w-4 h-4 text-white" />
          </div>
          <h3 className="font-semibold text-gray-900">Clientes</h3>
        </div>
        <div className="text-1xl font-bold text-gray-900">{stats.clients}</div>
      </div>

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
    </div>
  );

  // Componente consolidado para vendas
  const SalesCard = () => (
    <div className="bg-white rounded-2xl border border-gray-200 p-4 hover:border-blue-300 transition-colors">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-blue-500 rounded-lg">
            <Target className="w-4 h-4 text-white" />
          </div>
          <h3 className="font-semibold text-gray-900">Vendas</h3>
        </div>
        <div className="text-1xl font-bold text-gray-900">{stats.total}</div>
      </div>

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
    </div>
  );

  // Componente consolidado para visitas
  const VisitsCard = () => (
    <div
      className="bg-white rounded-2xl border border-gray-200 p-4 hover:border-orange-300 transition-colors cursor-pointer"
      onClick={() => setActiveTab("visits")}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-orange-500 rounded-lg">
            <Calendar className="w-4 h-4 text-white" />
          </div>
          <h3 className="font-semibold text-gray-900">Visitas</h3>
        </div>
        <div className="text-1xl font-bold text-gray-900">
          {stats.visitStats.scheduled}
        </div>
      </div>

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
    </div>
  );

  // Salva a aba ativa no localStorage apenas quando gerenciado internamente
  useEffect(() => {
    if (!externalActiveTab) {
      localStorage.setItem("collectorActiveTab", internalActiveTab);
    }
  }, [internalActiveTab, externalActiveTab]);

  const myCollections = getCollectorCollections(user?.id || "");
  const filteredCollections = getFilteredCollections(
    filters,
    "collector",
    user?.id,
  );
  const clientGroups = getClientGroups(user?.id);
  const myVisits = getVisitsByCollector(user?.id || "");

  // Calcular métricas gamificadas
  const { metrics: periodMetrics, goals } = getMetricsByPeriod(
    salePayments,
    myVisits,
  );

  // Simplified logic - group by sale to count correctly
  const salesMap = new Map<
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
    if (!salesMap.has(saleKey)) {
      salesMap.set(saleKey, {
        totalValue: 0,
        receivedValue: 0,
        isPending: false,
        clientDocument: collection.documento || "",
      });
    }

    const sale = salesMap.get(saleKey)!;
    sale.totalValue += collection.valor_original;
    sale.receivedValue += collection.valor_recebido;
  });

  // Determine if each sale is pending (has any amount left to receive)
  salesMap.forEach((sale) => {
    const pendingAmount = sale.totalValue - sale.receivedValue;
    sale.isPending = pendingAmount > 0.01; // Consider amounts > 1 cent as pending
  });

  const totalSales = salesMap.size;
  const pendingSales = Array.from(salesMap.values()).filter(
    (s) => s.isPending,
  ).length;
  const completedSales = Array.from(salesMap.values()).filter(
    (s) => !s.isPending,
  ).length;

  // Count unique clients with pending sales
  const clientsWithPending = new Set(
    Array.from(salesMap.values())
      .filter((s) => s.isPending)
      .map((s) => s.clientDocument)
      .filter(Boolean),
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

  const stats = {
    total: totalSales,
    clients: clientGroups.length,
    pending: pendingSales,
    completed: completedSales,
    clientsWithPending: clientsWithPending,
    visits: visitStats.scheduled,
    visitStats: visitStats,
    totalAmount: Array.from(salesMap.values()).reduce(
      (sum, s) => sum + s.totalValue,
      0,
    ),
    receivedAmount: Array.from(salesMap.values()).reduce(
      (sum, s) => sum + s.receivedValue,
      0,
    ),
  };

  const tabs = [
    { id: "overview", name: "Resumo", icon: BarChart3 },
    { id: "collections", name: "Minha Carteira", icon: Target },
    { id: "route", name: "Rota de Cobrança", icon: MapPin },
    { id: "visits", name: "Visitas Agendadas", icon: Calendar },
  ];

  const renderTabContent = () => {
    switch (activeTab) {
      case "overview":
        return (
          <div className="space-y-6">
            {/* Enhanced Mobile Stats Grid */}
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 lg:gap-4">
              <ClientsCard />
              <SalesCard />
              <div className="col-span-2 lg:col-span-1">
                <VisitsCard />
              </div>
            </div>

            {/* Métricas Gamificadas */}
            <div className="bg-gradient-to-r from-indigo-50 to-purple-50 rounded-2xl border border-indigo-200 overflow-hidden">
              {/* Header */}
              <div className="bg-white/80 backdrop-blur-sm p-4 border-b border-indigo-100">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-indigo-100 rounded-xl">
                      <Target className="w-6 h-6 text-indigo-600" />
                    </div>
                    <div>
                      <h2 className="text-xl font-bold text-gray-800">Metas</h2>
                    </div>
                  </div>
                  <div className="text-sm text-gray-600 bg-white px-4 py-2 rounded-xl border border-gray-200">
                    <div className="font-medium">
                      {new Date().toLocaleDateString("pt-BR", {
                        weekday: "long",
                        day: "numeric",
                        month: "long",
                      })}
                    </div>
                  </div>
                </div>
              </div>

              {/* Content */}
              <div className="p-3">
                {/* Layout Desktop: Grid 3x2 */}
                <div className="hidden lg:grid lg:grid-cols-3 lg:gap-8">
                  {/* Coluna Hoje */}
                  <div className="bg-white/70 backdrop-blur-sm rounded-xl p-4 border border-indigo-200">
                    <h3 className="text-lg font-bold text-gray-700 mb-6 flex items-center gap-2 justify-center">
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
                  <div className="bg-white/70 backdrop-blur-sm rounded-xl p-4 border border-blue-200">
                    <h3 className="text-lg font-bold text-gray-700 mb-6 flex items-center gap-2 justify-center">
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
                  <div className="bg-white/70 backdrop-blur-sm rounded-xl p-4 border border-purple-200">
                    <h3 className="text-lg font-bold text-gray-700 mb-6 flex items-center gap-2 justify-center">
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

                {/* Layout Mobile: Stack vertical */}
                <div className="lg:hidden space-y-8">
                  {/* Metas Diárias */}
                  <div className="bg-white/70 backdrop-blur-sm rounded-xl p-4 border border-yellow-200">
                    <h3 className="text-lg font-bold text-gray-700 mb-4 flex items-center gap-2">
                      <Sun className="w-5 h-5 text-yellow-500" />
                      Hoje
                    </h3>
                    <div className="grid grid-cols-2 gap-4">
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

                  {/* Metas Semanais */}
                  <div className="bg-white/70 backdrop-blur-sm rounded-xl p-4 border border-blue-200">
                    <h3 className="text-lg font-bold text-gray-700 mb-4 flex items-center gap-2">
                      <CalendarDays className="w-5 h-5 text-blue-500" />
                      Esta Semana
                    </h3>
                    <div className="grid grid-cols-2 gap-4">
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

                  {/* Metas Mensais */}
                  <div className="bg-white/70 backdrop-blur-sm rounded-xl p-4 border border-purple-200">
                    <h3 className="text-lg font-bold text-gray-700 mb-4 flex items-center gap-2">
                      <CalendarRange className="w-5 h-5 text-purple-500" />
                      Este Mês
                    </h3>
                    <div className="grid grid-cols-2 gap-4">
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
              </div>
            </div>

            {/* Resumo Financeiro */}
            <div className="bg-gradient-to-r from-blue-50 to-green-50 rounded-2xl border border-blue-200 overflow-hidden">
              {/* Header */}
              <div className="bg-white/80 backdrop-blur-sm p-4 border-b border-blue-100">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-100 rounded-xl">
                      <BarChart3 className="w-6 h-6 text-blue-600" />
                    </div>
                    <div>
                      <h2 className="text-xl font-bold text-gray-800">
                        Resumo Financeiro
                      </h2>
                      <p className="text-sm text-gray-600">
                        Acompanhe o desempenho financeiro da sua carteira
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Content */}
              <div className="p-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 lg:gap-4">
                  <div className="bg-white/70 backdrop-blur-sm rounded-xl p-4 border border-blue-200 text-center">
                    <div className="text-1xl lg:text-3xl font-bold text-blue-600 mb-2">
                      {formatCurrency(stats.totalAmount)}
                    </div>
                    <div className="text-sm text-gray-600 font-medium">
                      Valor Total
                    </div>
                  </div>
                  <div className="bg-white/70 backdrop-blur-sm rounded-xl p-4 border border-green-200 text-center">
                    <div className="text-1xl lg:text-3xl font-bold text-green-600 mb-2">
                      {formatCurrency(stats.receivedAmount)}
                    </div>
                    <div className="text-sm text-gray-600 font-medium">
                      Valor Recebido
                    </div>
                  </div>
                  <div className="bg-white/70 backdrop-blur-sm rounded-xl p-4 border border-orange-200 text-center">
                    <div className="text-1xl lg:text-3xl font-bold text-orange-600 mb-2">
                      {formatCurrency(stats.totalAmount - stats.receivedAmount)}
                    </div>
                    <div className="text-sm text-gray-600 font-medium">
                      Valor Pendente
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );

      case "collections":
        return (
          <div>
            <FilterBar
              filters={filters}
              onFilterChange={setFilters}
              userType="collector"
            />
            <CollectionTable
              collections={filteredCollections}
              userType="collector"
              showGrouped={true}
              collectorId={user?.id}
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
    <div className="min-h-screen">
      <div className="p-4 w-full md:max-w-[90%] mx-auto">
        {/* Desktop: Traditional Tab Navigation */}
        <div className="hidden lg:block mb-4 sm:mb-6 lg:mb-8">
          <div className="border-b border-gray-200">
            <nav className="flex space-x-1">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() =>
                      setActiveTab(
                        tab.id as
                          | "overview"
                          | "collections"
                          | "route"
                          | "visits",
                      )
                    }
                    className={`flex items-center py-3 px-4 border-b-2 font-medium text-sm whitespace-nowrap relative transition-colors ${
                      activeTab === tab.id
                        ? "border-blue-500 text-blue-600"
                        : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                    }`}
                  >
                    <Icon className="h-4 w-4 mr-2 flex-shrink-0" />
                    <span>{tab.name}</span>
                    {tab.id === "visits" && stats.visits > 0 && (
                      <span className="absolute -top-1 -right-1 h-5 w-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-medium">
                        {stats.visits}
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>
          </div>
        </div>

        {/* Tab Content */}
        {renderTabContent()}
      </div>
    </div>
  );
};

export default CollectorDashboard;
