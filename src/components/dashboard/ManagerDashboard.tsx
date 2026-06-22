import React, { useState, useRef, useEffect, useMemo } from "react";
import { DollarSign, FileText, Filter } from "lucide-react";
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

  const renderTabContent = () => {
    switch (activeTab) {
      case "database-upload":
        return <DatabaseUpload />;
      case "collections":
        return (
          <div className="space-y-3 sm:space-y-4">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4 lg:p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex items-center justify-between w-full sm:w-auto">
                <h2 className="text-xl lg:text-2xl font-bold text-gray-900 flex items-center">
                  <FileText className="h-5 w-5 lg:h-6 lg:w-6 mr-2 text-blue-600 flex-shrink-0" />
                  Cobranças
                </h2>
                {collectionsView !== "cash-report" && (
                  <button
                    onClick={() => setIsFilterVisible(!isFilterVisible)}
                    className="md:hidden p-2 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-2xl transition-colors"
                    title="Filtros"
                  >
                    <Filter className="h-5 w-5" />
                  </button>
                )}
              </div>
              <div className="flex bg-gray-100 rounded-md p-0.5 w-full sm:w-auto">
                <button
                  onClick={() => setCollectionsView("table")}
                  className={`flex-1 sm:flex-none px-2 sm:px-3 lg:px-4 py-1.5 sm:py-2 rounded-md text-xs sm:text-sm font-medium transition-all duration-200 whitespace-nowrap touch-manipulation ${
                    collectionsView === "table"
                      ? "bg-white text-blue-600 shadow-sm"
                      : "text-gray-600 hover:text-gray-900"
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
                      ? "bg-white text-blue-600 shadow-sm"
                      : "text-gray-600 hover:text-gray-900"
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
                <CollectionTable
                  ref={collectionTableRef}
                  collections={filteredCollections}
                  userType="manager"
                  showGrouped={false}
                />
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
        return <ClientAssignment />;

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
