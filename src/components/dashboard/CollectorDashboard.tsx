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
} from "lucide-react";
import StatsCard from "../common/StatsCard";
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
      monthly: { visits: 200, payments: 100000 }
    };

    // Filtrar pagamentos do cobrador atual
    const collectorPayments = payments.filter(p => p.collectorId === user?.id);

    // Função para comparar datas (apenas dia)
    const isSameDay = (date1: Date, date2: Date) => {
      return date1.toISOString().split('T')[0] === date2.toISOString().split('T')[0];
    };

    const today = new Date();
    
    const dailyPayments = collectorPayments.filter(p => {
      // Verificar se a data é uma string no formato YYYY-MM-DD ou se já é um objeto Date
      let paymentDate;
      if (typeof p.paymentDate === 'string') {
        // Se é string, pode ser no formato YYYY-MM-DD (date do SQL)
        paymentDate = new Date(p.paymentDate + 'T00:00:00');
      } else {
        paymentDate = new Date(p.paymentDate);
      }
      
      return isSameDay(paymentDate, today);
    });

    // Função para processar data de visita
    const processVisitDate = (dateStr: string) => {
      if (typeof dateStr === 'string') {
        return new Date(dateStr + 'T00:00:00');
      }
      return new Date(dateStr);
    };

    const todayVisits = visits.filter(v => {
      if (v.status !== 'realizada') return false;
      const dateToCheck = v.dataVisitaRealizada || v.scheduledDate;
      const visitDate = processVisitDate(dateToCheck);
      return isSameDay(visitDate, today);
    });

    // Calcular métricas reais
    const metrics = {
      daily: {
        visits: todayVisits.length,
        payments: dailyPayments.reduce((sum, p) => sum + p.paymentAmount, 0)
      },
      weekly: {
        visits: visits.filter(v => {
          if (v.status !== 'realizada') return false;
          const dateToCheck = v.dataVisitaRealizada || v.scheduledDate;
          const visitDate = processVisitDate(dateToCheck);
          return visitDate >= startOfWeek;
        }).length,
        payments: collectorPayments.filter(p => {
          const paymentDate = new Date(p.paymentDate);
          return paymentDate >= startOfWeek;
        }).reduce((sum, p) => sum + p.paymentAmount, 0)
      },
      monthly: {
        visits: visits.filter(v => {
          if (v.status !== 'realizada') return false;
          const dateToCheck = v.dataVisitaRealizada || v.scheduledDate;
          const visitDate = processVisitDate(dateToCheck);
          return visitDate >= startOfMonth;
        }).length,
        payments: collectorPayments.filter(p => {
          const paymentDate = new Date(p.paymentDate);
          return paymentDate >= startOfMonth;
        }).reduce((sum, p) => sum + p.paymentAmount, 0)
      }
    };

    return { metrics, goals };
  };

  // Funções para gamificação
  const getPerformanceLevel = (current: number, goal: number) => {
    const percentage = goal > 0 ? (current / goal) * 100 : 0;
    if (percentage >= 100) return { 
      icon: Trophy, 
      name: "Lendário", 
      color: "text-yellow-500", 
      bgColor: "bg-yellow-50" 
    };
    if (percentage >= 90) return { 
      icon: Diamond, 
      name: "Diamante", 
      color: "text-blue-500", 
      bgColor: "bg-blue-50" 
    };
    if (percentage >= 70) return { 
      icon: Award, 
      name: "Ouro", 
      color: "text-yellow-600", 
      bgColor: "bg-yellow-50" 
    };
    if (percentage >= 50) return { 
      icon: Medal, 
      name: "Prata", 
      color: "text-gray-500", 
      bgColor: "bg-gray-50" 
    };
    if (percentage >= 30) return { 
      icon: ThumbsUp, 
      name: "Bronze", 
      color: "text-orange-600", 
      bgColor: "bg-orange-50" 
    };
    return { 
      icon: Flame, 
      name: "Iniciante", 
      color: "text-red-500", 
      bgColor: "bg-red-50" 
    };
  };

  const getMotivationalMessage = (current: number, goal: number) => {
    const percentage = goal > 0 ? (current / goal) * 100 : 0;
    if (percentage >= 100) return { text: "Incrível! Meta superada!", icon: Rocket };
    if (percentage >= 90) return { text: "Quase lá! Última tacada!", icon: Zap };
    if (percentage >= 70) return { text: "Excelente progresso!", icon: TrendingUp };
    if (percentage >= 50) return { text: "No caminho certo!", icon: ThumbsUp };
    if (percentage >= 30) return { text: "Vamos acelerar!", icon: Zap };
    return { text: "Hora de começar!", icon: Target };
  };

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
  const { metrics: periodMetrics, goals } = getMetricsByPeriod(salePayments, myVisits);

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

  const stats = {
    total: totalSales,
    clients: clientGroups.length,
    pending: pendingSales,
    completed: completedSales,
    clientsWithPending: clientsWithPending,
    visits: myVisits.filter((v) => v.status === "agendada").length,
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
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-6">
              <StatsCard
                title="Clientes"
                value={stats.clients.toString()}
                icon={Users}
                iconColor="bg-purple-500"
                onClick={() => setActiveTab("collections")}
              />
              <StatsCard
                title="Vendas"
                value={stats.total.toString()}
                icon={Target}
                iconColor="bg-blue-500"
              />
              <StatsCard
                title="Clientes com Pendências"
                value={stats.clientsWithPending.toString()}
                change={`${stats.pending} vendas pendentes`}
                changeType="negative"
                icon={Users}
                iconColor="bg-orange-500"
              />
              <StatsCard
                title="Vendas Finalizadas"
                value={stats.completed.toString()}
                change={`${stats.total > 0 ? ((stats.completed / stats.total) * 100).toFixed(1) : 0}%`}
                changeType="positive"
                icon={CheckCircle}
                iconColor="bg-green-500"
              />
              <StatsCard
                title="Visitas"
                value={stats.visits.toString()}
                icon={Calendar}
                iconColor="bg-orange-500"
                onClick={() => setActiveTab("visits")}
              />
            </div>


            
            {/* Métricas Gamificadas */}
            <div className="bg-gradient-to-r from-indigo-50 to-purple-50 rounded-2xl border border-indigo-200 overflow-hidden">
              {/* Header */}
              <div className="bg-white/80 backdrop-blur-sm p-6 border-b border-indigo-100">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-indigo-100 rounded-xl">
                      <Target className="w-6 h-6 text-indigo-600" />
                    </div>
                    <div>
                      <h2 className="text-xl font-bold text-gray-800">
                        Metas e Conquistas
                      </h2>
                      <p className="text-sm text-gray-600">
                        Acompanhe seu progresso e conquiste suas metas
                      </p>
                    </div>
                  </div>
                  <div className="text-sm text-gray-600 bg-white px-4 py-2 rounded-xl border border-gray-200">
                    <div className="font-medium">
                      {new Date().toLocaleDateString('pt-BR', { 
                        weekday: 'long', 
                        day: 'numeric', 
                        month: 'long' 
                      })}
                    </div>
                  </div>
                </div>
              </div>

              {/* Content */}
              <div className="p-6">
                {/* Layout Desktop: Grid 3x2 */}
                <div className="hidden lg:grid lg:grid-cols-3 lg:gap-8">
                  {/* Coluna Hoje */}
                  <div className="bg-white/70 backdrop-blur-sm rounded-xl p-6 border border-yellow-200">
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
                        level={getPerformanceLevel(periodMetrics.daily.visits, goals.daily.visits)}
                        motivationalMessage={getMotivationalMessage(periodMetrics.daily.visits, goals.daily.visits)}
                      />
                      <RadialApprovalChart
                        current={periodMetrics.daily.payments}
                        goal={goals.daily.payments}
                        title="Valor Recebido"
                        showValues={true}
                        isCurrency={true}
                        level={getPerformanceLevel(periodMetrics.daily.payments, goals.daily.payments)}
                        motivationalMessage={getMotivationalMessage(periodMetrics.daily.payments, goals.daily.payments)}
                      />
                    </div>
                  </div>

                  {/* Coluna Esta Semana */}
                  <div className="bg-white/70 backdrop-blur-sm rounded-xl p-6 border border-blue-200">
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
                        level={getPerformanceLevel(periodMetrics.weekly.visits, goals.weekly.visits)}
                        motivationalMessage={getMotivationalMessage(periodMetrics.weekly.visits, goals.weekly.visits)}
                      />
                      <RadialApprovalChart
                        current={periodMetrics.weekly.payments}
                        goal={goals.weekly.payments}
                        title="Valor Recebido"
                        showValues={true}
                        isCurrency={true}
                        level={getPerformanceLevel(periodMetrics.weekly.payments, goals.weekly.payments)}
                        motivationalMessage={getMotivationalMessage(periodMetrics.weekly.payments, goals.weekly.payments)}
                      />
                    </div>
                  </div>

                  {/* Coluna Este Mês */}
                  <div className="bg-white/70 backdrop-blur-sm rounded-xl p-6 border border-purple-200">
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
                        level={getPerformanceLevel(periodMetrics.monthly.visits, goals.monthly.visits)}
                        motivationalMessage={getMotivationalMessage(periodMetrics.monthly.visits, goals.monthly.visits)}
                      />
                      <RadialApprovalChart
                        current={periodMetrics.monthly.payments}
                        goal={goals.monthly.payments}
                        title="Valor Recebido"
                        showValues={true}
                        isCurrency={true}
                        level={getPerformanceLevel(periodMetrics.monthly.payments, goals.monthly.payments)}
                        motivationalMessage={getMotivationalMessage(periodMetrics.monthly.payments, goals.monthly.payments)}
                      />
                    </div>
                  </div>
                </div>

                {/* Layout Mobile: Stack vertical */}
                <div className="lg:hidden space-y-8">
                  {/* Metas Diárias */}
                  <div className="bg-white/70 backdrop-blur-sm rounded-xl p-6 border border-yellow-200">
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
                        level={getPerformanceLevel(periodMetrics.daily.visits, goals.daily.visits)}
                        motivationalMessage={getMotivationalMessage(periodMetrics.daily.visits, goals.daily.visits)}
                      />
                      <RadialApprovalChart
                        current={periodMetrics.daily.payments}
                        goal={goals.daily.payments}
                        title="Valor Recebido"
                        showValues={true}
                        isCurrency={true}
                        level={getPerformanceLevel(periodMetrics.daily.payments, goals.daily.payments)}
                        motivationalMessage={getMotivationalMessage(periodMetrics.daily.payments, goals.daily.payments)}
                      />
                    </div>
                  </div>
                  
                  {/* Metas Semanais */}
                  <div className="bg-white/70 backdrop-blur-sm rounded-xl p-6 border border-blue-200">
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
                        level={getPerformanceLevel(periodMetrics.weekly.visits, goals.weekly.visits)}
                        motivationalMessage={getMotivationalMessage(periodMetrics.weekly.visits, goals.weekly.visits)}
                      />
                      <RadialApprovalChart
                        current={periodMetrics.weekly.payments}
                        goal={goals.weekly.payments}
                        title="Valor Recebido"
                        showValues={true}
                        isCurrency={true}
                        level={getPerformanceLevel(periodMetrics.weekly.payments, goals.weekly.payments)}
                        motivationalMessage={getMotivationalMessage(periodMetrics.weekly.payments, goals.weekly.payments)}
                      />
                    </div>
                  </div>
                  
                  {/* Metas Mensais */}
                  <div className="bg-white/70 backdrop-blur-sm rounded-xl p-6 border border-purple-200">
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
                        level={getPerformanceLevel(periodMetrics.monthly.visits, goals.monthly.visits)}
                        motivationalMessage={getMotivationalMessage(periodMetrics.monthly.visits, goals.monthly.visits)}
                      />
                      <RadialApprovalChart
                        current={periodMetrics.monthly.payments}
                        goal={goals.monthly.payments}
                        title="Valor Recebido"
                        showValues={true}
                        isCurrency={true}
                        level={getPerformanceLevel(periodMetrics.monthly.payments, goals.monthly.payments)}
                        motivationalMessage={getMotivationalMessage(periodMetrics.monthly.payments, goals.monthly.payments)}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

                        {/* Performance Summary - Mobile Optimized */}
            <div className="bg-white rounded-xl shadow-sm p-4 lg:p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                Resumo Financeiro
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 lg:gap-6">
                <div className="text-center p-4 bg-blue-50 rounded-lg">
                  <div className="text-xl lg:text-2xl font-bold text-blue-600">
                    {formatCurrency(stats.totalAmount)}
                  </div>
                  <div className="text-sm text-gray-600">Valor Total</div>
                </div>
                <div className="text-center p-4 bg-green-50 rounded-lg">
                  <div className="text-xl lg:text-2xl font-bold text-green-600">
                    {formatCurrency(stats.receivedAmount)}
                  </div>
                  <div className="text-sm text-gray-600">Valor Recebido</div>
                </div>
                <div className="text-center p-4 bg-red-50 rounded-lg">
                  <div className="text-xl lg:text-2xl font-bold text-red-600">
                    {formatCurrency(stats.totalAmount - stats.receivedAmount)}
                  </div>
                  <div className="text-sm text-gray-600">Valor Pendente</div>
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
      <div className="p-6 w-full md:max-w-[90%] mx-auto">
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
