import React, { useState, useRef, useEffect } from "react";
import {
  MapPin,
  Target,
  CheckCircle,
  Users,
  Calendar,
  BarChart3,
  ChevronDown,
} from "lucide-react";
import StatsCard from "../common/StatsCard";
import FilterBar from "../common/FilterBar";
import CollectionTable from "./CollectionTable";
import RouteMap from "./RouteMap";
import VisitScheduler from "./VisitScheduler";
import { useCollection } from "../../contexts/CollectionContext";
import { useAuth } from "../../contexts/AuthContext";
import { FilterOptions } from "../../types";
import { formatCurrency } from "../../utils/mockData";

const CollectorDashboard: React.FC = () => {
  const { user } = useAuth();
  const {
    getCollectorCollections,
    getFilteredCollections,
    getClientGroups,
    getVisitsByCollector,
  } = useCollection();

  // Recupera a aba ativa do localStorage ou usa 'overview' como padrão
  const [activeTab, setActiveTab] = useState<
    "overview" | "collections" | "route" | "visits"
  >(() => {
    const savedTab = localStorage.getItem("collectorActiveTab");
    return (savedTab as any) || "overview";
  });

  const [filters, setFilters] = useState<FilterOptions>({});
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const mobileMenuRef = useRef<HTMLDivElement>(null);

  // Salva a aba ativa no localStorage sempre que mudar
  useEffect(() => {
    localStorage.setItem("collectorActiveTab", activeTab);
  }, [activeTab]);

  // Close mobile menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        mobileMenuRef.current &&
        !mobileMenuRef.current.contains(event.target as Node)
      ) {
        setIsMobileMenuOpen(false);
      }
    };

    if (isMobileMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isMobileMenuOpen]);

  const myCollections = getCollectorCollections(user?.id || "");
  const filteredCollections = getFilteredCollections(
    filters,
    "collector",
    user?.id,
  );
  const clientGroups = getClientGroups(user?.id);
  const myVisits = getVisitsByCollector(user?.id || "");

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
  const pendingSales = Array.from(salesMap.values()).filter((s) => s.isPending).length;
  const completedSales = Array.from(salesMap.values()).filter((s) => !s.isPending).length;
  
  // Count unique clients with pending sales
  const clientsWithPending = new Set(
    Array.from(salesMap.values())
      .filter((s) => s.isPending)
      .map((s) => s.clientDocument)
      .filter(Boolean)
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
      <div className="max-w-7xl mx-auto px-3 sm:px-4 md:px-6 lg:px-8 py-3 sm:py-4 lg:py-8">
        {/* Enhanced Mobile-First Tab Navigation */}
        <div className="mb-4 sm:mb-6 lg:mb-8">
          {/* Mobile: Dropdown Menu */}
          <div className="lg:hidden">
            <div
              ref={mobileMenuRef}
              className="bg-white rounded-xl shadow-sm border border-gray-200 relative"
            >
              <button
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                className="w-full flex items-center justify-between p-4 text-left hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center">
                  {(() => {
                    const currentTab = tabs.find((tab) => tab.id === activeTab);
                    const Icon = currentTab?.icon || BarChart3;
                    return (
                      <>
                        <Icon className="h-5 w-5 mr-3 text-blue-600" />
                        <div>
                          <div className="font-medium text-gray-900">
                            {currentTab?.name}
                          </div>
                          <div className="text-sm text-gray-500">
                            Navegar entre seções
                          </div>
                        </div>
                      </>
                    );
                  })()}
                  {activeTab === "visits" && stats.visits > 0 && (
                    <span className="ml-2 h-5 w-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-medium">
                      {stats.visits}
                    </span>
                  )}
                </div>
                <ChevronDown
                  className={`h-5 w-5 text-gray-400 transition-transform ${isMobileMenuOpen ? "rotate-180" : ""}`}
                />
              </button>

              {/* Mobile Dropdown Menu */}
              {isMobileMenuOpen && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-50 overflow-hidden">
                  {tabs.map((tab) => {
                    const Icon = tab.icon;
                    return (
                      <button
                        key={tab.id}
                        onClick={() => {
                          setActiveTab(
                            tab.id as
                              | "overview"
                              | "collections"
                              | "route"
                              | "visits",
                          );
                          setIsMobileMenuOpen(false);
                        }}
                        className={`w-full flex items-center px-4 py-3 text-left hover:bg-gray-50 transition-colors relative ${
                          activeTab === tab.id
                            ? "bg-blue-50 text-blue-600"
                            : "text-gray-700"
                        }`}
                      >
                        <Icon
                          className={`h-5 w-5 mr-3 ${activeTab === tab.id ? "text-blue-600" : "text-gray-400"}`}
                        />
                        <span className="font-medium">{tab.name}</span>
                        {tab.id === "visits" && stats.visits > 0 && (
                          <span className="ml-auto h-5 w-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-medium">
                            {stats.visits}
                          </span>
                        )}
                        {activeTab === tab.id && (
                          <div className="absolute left-0 top-0 bottom-0 w-1 bg-blue-600"></div>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Desktop: Traditional Tab Navigation */}
          <div className="hidden lg:block">
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
        </div>

        {/* Tab Content */}
        {renderTabContent()}
      </div>
    </div>
  );
};

export default CollectorDashboard;
