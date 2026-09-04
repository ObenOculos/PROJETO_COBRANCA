import React, { useState, useRef, useEffect, useMemo } from "react";
import { DollarSign, FileText, Filter, Search } from "lucide-react";
import FilterBar from "../common/FilterBar";
import { CollectionTable } from "./CollectionTable";
import EnhancedPerformanceChart from "./EnhancedPerformanceChart";
import UserManagement from "./UserManagement";
import EnhancedStoreManagement from "./EnhancedStoreManagement";
import DatabaseUpload from "../admin/DatabaseUpload";
import { ClientAssignment } from "../ClientAssignment";
import VisitTracking from "./VisitTracking";
import DailyCashReport from "./DailyCashReport";
import AuthorizationManager from "./AuthorizationManager";
import TabTransition from "../common/TabTransition";
import { useCollection } from "../../contexts/CollectionContext";
import { FilterOptions } from "../../types";
import { AuthorizationHistoryService } from "../../services/authorizationHistoryService";
import { CollectionTableRef } from "./CollectionTable";
import { Notification } from "../../contexts/NotificationContext";

// O gestor carrega por padrao so os clientes com algo em aberto (metade das
// linhas). Estas telas somam recebimentos de clientes JA QUITADOS — inclusive
// quem quitou no mes corrente — entao precisam da tabela inteira, carregada sob
// demanda. Ver `collectionsScope` no CollectionContext.
const TABS_NEEDING_FULL_SCOPE = new Set(["performance", "stores", "clients"]);

// Telas que dependem das cobrancas mas nao tem uma consulta propria: como o
// gestor nao carrega mais nada no login, elas precisam pedir os dados ao abrir.
// A Cobranca fica DE FORA de proposito — e justamente onde o gestor escolhe o
// que consultar. (Desempenho/Lojas/Clientes ja se resolvem pelo full scope.)
const TABS_AUTOLOADING_COLLECTIONS = new Set([
  "visit-tracking",
  "authorization",
]);

interface ManagerDashboardProps {
  activeTab?: string;
  onTabChange?: (tabId: string) => void;
}

const ManagerDashboard: React.FC<ManagerDashboardProps> = ({
  activeTab: externalActiveTab,
  onTabChange,
}) => {
  const {
    getFilteredCollections,
    collections,
    ensureAllCollections,
    loadingFullScope,
    collectionsRequested,
    requestCollections,
    loading,
  } = useCollection();

  const [internalActiveTab, setInternalActiveTab] = useState<
    | "collections"
    | "performance"
    | "users"
    | "stores"
    | "clients"
    | "visit-tracking"
    | "authorization"
    | "database-upload"
  >(() => {
    const savedTab = localStorage.getItem("managerActiveTab");
    return (savedTab as any) || "collections";
  });

  const activeTab = externalActiveTab || internalActiveTab;
  const setActiveTab = (tabId: string) => {
    if (onTabChange) {
      onTabChange(tabId);
    } else {
      setInternalActiveTab(tabId as any);
    }
  };

  const [filters, setFilters] = useState<FilterOptions>({});
  const [collectionsView, setCollectionsView] = useState<
    "table" | "cash-report"
  >(() => {
    const saved = localStorage.getItem("managerCollectionsView");
    return (saved as "table" | "cash-report") || "table";
  });

  const [isFilterVisible, setIsFilterVisible] = useState(false);

  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const mobileMenuRef = useRef<HTMLDivElement>(null);
  const [, setPendingAuthorizations] = useState(0);
  const collectionTableRef = useRef<CollectionTableRef>(null);

  const handleNotificationClick = (notification: Notification) => {
    if (notification.relatedId && notification.relatedId.startsWith("sale-")) {
      const parts = notification.relatedId.split("-");
      const saleNumber = parseInt(parts[1], 10);
      const clientDocument = parts[3];
      if (saleNumber && clientDocument && collectionTableRef.current) {
        setActiveTab("collections");
        setTimeout(() => {
          collectionTableRef.current?.openSaleDetails(
            saleNumber,
            clientDocument,
          );
        }, 100);
      }
    }
  };

  useEffect(() => {
    const listener = (e: Event) => {
      const customEvent = e as CustomEvent;
      handleNotificationClick(customEvent.detail);
    };
    window.addEventListener("notificationClick", listener);
    return () => {
      window.removeEventListener("notificationClick", listener);
    };
  }, []);

  useEffect(() => {
    if (!onTabChange) {
      localStorage.setItem("managerActiveTab", internalActiveTab);
    }
  }, [internalActiveTab, onTabChange]);

  useEffect(() => {
    localStorage.setItem("managerCollectionsView", collectionsView);
  }, [collectionsView]);

  useEffect(() => {
    const fetchPendingAuthorizations = async () => {
      try {
        const pendingRequests =
          await AuthorizationHistoryService.getPendingRequests();
        setPendingAuthorizations(pendingRequests.length);
      } catch (error) {
        console.error("Erro ao buscar autorizações pendentes:", error);
      }
    };
    fetchPendingAuthorizations();
    const interval = setInterval(fetchPendingAuthorizations, 30000);
    return () => clearInterval(interval);
  }, []);

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

  const baseFilteredCollections = useMemo(
    () => getFilteredCollections(filters, "manager"),
    [filters, collections],
  );

  const filteredCollections = baseFilteredCollections;

  // Filtrar Cobrancas por "Pago" busca justamente os clientes 100% quitados, que
  // sao os que o escopo padrao exclui — sem promover, a categoria vem vazia.
  // (getClientPaymentStatus so classifica como "pago" quem nao deve mais nada.)
  const filterWantsSettledClients = (() => {
    const status = filters.status;
    if (!status) return false;
    return Array.isArray(status) ? status.includes("pago") : status === "pago";
  })();

  // O Relatorio do Caixa vive dentro da aba de cobrancas, mas soma recebimentos
  // do dia — inclui clientes que quitaram tudo. Entra na mesma regra.
  const needsFullScope =
    TABS_NEEDING_FULL_SCOPE.has(activeTab) ||
    (activeTab === "collections" &&
      (collectionsView === "cash-report" || filterWantsSettledClients));

  useEffect(() => {
    if (needsFullScope) void ensureAllCollections();
    // ensureAllCollections e no-op quando o escopo ja e "all".
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needsFullScope]);

  useEffect(() => {
    if (TABS_AUTOLOADING_COLLECTIONS.has(activeTab)) void requestCollections();
    // requestCollections e no-op se os dados ja foram pedidos.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  const renderTabContent = () => {
    // Segurar e melhor do que exibir total subestimado: sem os clientes
    // quitados, os numeros dessas telas ficam menores do que a realidade.
    if (needsFullScope && loadingFullScope) {
      return (
        <div className="flex items-center justify-center py-16">
          <div className="text-center">
            <div className="flex items-center justify-center space-x-2 mb-3">
              <div
                className="w-2.5 h-2.5 bg-gray-400 rounded-full animate-bounce"
                style={{ animationDelay: "0ms" }}
              />
              <div
                className="w-2.5 h-2.5 bg-gray-400 rounded-full animate-bounce"
                style={{ animationDelay: "150ms" }}
              />
              <div
                className="w-2.5 h-2.5 bg-gray-400 rounded-full animate-bounce"
                style={{ animationDelay: "300ms" }}
              />
            </div>
            <p className="text-gray-600 dark:text-dark-text-secondary text-sm font-medium">
              Carregando histórico completo...
            </p>
          </div>
        </div>
      );
    }

    switch (activeTab) {
      case "database-upload":
        return <DatabaseUpload />;
      case "collections":
        return (
          <div className="space-y-3 sm:space-y-4">
            <div className="bg-white dark:bg-dark-bg-secondary rounded-2xl shadow-sm border border-gray-200 dark:border-dark-border p-4 lg:p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex items-center justify-between w-full sm:w-auto">
                <h2 className="text-xl lg:text-2xl font-bold text-gray-900 dark:text-dark-text flex items-center">
                  <FileText className="h-5 w-5 lg:h-6 lg:w-6 mr-2 text-blue-600 dark:text-blue-400 flex-shrink-0" />
                  Cobranças
                </h2>
                {collectionsView !== "cash-report" && (
                  <button
                    onClick={() => setIsFilterVisible(!isFilterVisible)}
                    className="md:hidden p-2 text-gray-600 dark:text-dark-text-secondary hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-2xl transition-colors"
                    title="Filtros"
                  >
                    <Filter className="h-5 w-5" />
                  </button>
                )}
              </div>
              <div className="flex bg-gray-100 dark:bg-dark-bg rounded-md p-0.5 w-full sm:w-auto">
                <button
                  onClick={() => setCollectionsView("table")}
                  className={`flex-1 sm:flex-none px-2 sm:px-3 lg:px-4 py-1.5 sm:py-2 rounded-md text-xs sm:text-sm font-medium transition-all duration-200 whitespace-nowrap touch-manipulation ${
                    collectionsView === "table"
                      ? "bg-white dark:bg-dark-bg-secondary text-blue-600 dark:text-blue-400 shadow-sm"
                      : "text-gray-600 dark:text-dark-text-secondary hover:text-gray-900 dark:hover:text-dark-text"
                  }`}
                >
                  <FileText className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1 lg:mr-2 inline" />
                  <span className="hidden sm:inline">Todas as Cobranças</span>
                  <span className="sm:hidden">Cobranças</span>
                </button>
                <button
                  onClick={() => setCollectionsView("cash-report")}
                  className={`flex-1 sm:flex-none px-2 sm:px-3 lg:px-4 py-1.5 sm:py-2 rounded-md text-xs sm:text-sm font-medium transition-all duration-200 whitespace-nowrap touch-manipulation ${
                    collectionsView === "cash-report"
                      ? "bg-white dark:bg-dark-bg-secondary text-blue-600 dark:text-blue-400 shadow-sm"
                      : "text-gray-600 dark:text-dark-text-secondary hover:text-gray-900 dark:hover:text-dark-text"
                  }`}
                >
                  <DollarSign className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1 lg:mr-2 inline" />
                  <span className="hidden sm:inline">Relatório do Caixa</span>
                  <span className="sm:hidden">Caixa</span>
                </button>
              </div>
            </div>

            {collectionsView === "table" ? (
              <div>
                <div
                  className={`${isFilterVisible ? "block" : "hidden"} md:block`}
                >
                  <FilterBar
                    filters={filters}
                    onFilterChange={setFilters}
                    userType="manager"
                  />
                </div>
                {collectionsRequested ? (
                  <CollectionTable
                    ref={collectionTableRef}
                    collections={filteredCollections}
                    userType="manager"
                    showGrouped={false}
                  />
                ) : (
                  // Estado inicial do gestor: nada carregado ainda. Note que
                  // isto NAO e "nenhum resultado" — os filtros acima continuam
                  // utilizaveis e a consulta so parte no clique.
                  <div className="bg-white dark:bg-dark-bg-secondary rounded-2xl shadow-sm border border-gray-200 dark:border-dark-border px-6 py-12 text-center">
                    <Search className="h-10 w-10 mx-auto mb-4 text-gray-300 dark:text-dark-text-secondary" />
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-dark-text mb-1">
                      Nenhuma consulta feita ainda
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-dark-text-secondary max-w-md mx-auto mb-6">
                      Ajuste os filtros acima e clique em consultar. As cobranças
                      não são carregadas automaticamente para o gestor.
                    </p>
                    <button
                      onClick={() => void requestCollections()}
                      disabled={loading}
                      className="inline-flex items-center px-5 py-2.5 rounded-2xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors touch-manipulation"
                    >
                      <Search className="h-4 w-4 mr-2" />
                      {loading ? "Consultando..." : "Consultar cobranças"}
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <DailyCashReport collections={collections} />
            )}
          </div>
        );

      case "performance":
        return <EnhancedPerformanceChart />;

      case "stores":
        return <EnhancedStoreManagement />;

      case "clients":
        return (
          <ClientAssignment
            onViewClient={(clientIdentifier) => {
              setFilters({ search: clientIdentifier });
              setActiveTab("collections");
            }}
          />
        );

      case "visit-tracking":
        return <VisitTracking />;

      case "authorization":
        return <AuthorizationManager />;

      case "users":
        return <UserManagement />;

      default:
        return null;
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-16 pt-16 lg:pt-16">
      <TabTransition activeKey={activeTab} avoidTransformConflicts={true}>
        {renderTabContent()}
      </TabTransition>
    </div>
  );
};

export default ManagerDashboard;
