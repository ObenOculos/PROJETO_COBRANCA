import React, { useState, useEffect } from "react";
import { LogOut, User, Menu, X, LucideIcon, ChevronsLeft } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import NotificationDropdown from "./NotificationDropdown";

interface Tab {
  id: string;
  name: string;
  icon: LucideIcon;
}

interface HeaderProps {
  tabs?: Tab[];
  activeTab?: string;
  onTabChange?: (tabId: string) => void;
  pendingCancellations?: number;
}

const Header: React.FC<HeaderProps> = ({
  tabs = [],
  activeTab = "",
  onTabChange = () => {},
  pendingCancellations = 0,
}) => {
  const { user, logout, isLoading } = useAuth();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(true);
  const [showDesktopText, setShowDesktopText] = useState(!isCollapsed);

  useEffect(() => {
    if (isCollapsed) {
      setShowDesktopText(false);
    } else {
      const timer = setTimeout(() => {
        setShowDesktopText(true);
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [isCollapsed]);

  const SidebarContent = ({ isMobile = false }: { isMobile?: boolean }) => {
    return (
      <div
        className={`flex flex-col h-full ${isCollapsed && !isMobile ? "items-center" : ""}`}
      >
        {/* Header */}
        <div
          className={`p-4 border-b border-gray-100 flex items-center ${isCollapsed && !isMobile ? "justify-center" : "justify-between"}`}
        >
          {(showDesktopText || isMobile) && (
            <div className={`flex items-center space-x-3`}>
              <div className="h-8 w-8 bg-blue-600 rounded-2xl flex items-center justify-center flex-shrink-0">
                <span className="text-white font-semibold text-sm">SC</span>
              </div>
              <h2 className="text-lg font-semibold text-gray-900">
                Sistema de Cobrança
              </h2>
            </div>
          )}
          {!isMobile && (
            <button
              onClick={() => setIsCollapsed(!isCollapsed)}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-2xl transition-colors"
            >
              <ChevronsLeft
                className={`h-5 w-5 transition-transform ${isCollapsed ? "rotate-180" : ""}`}
              />
            </button>
          )}
          {isMobile && (
            <button
              onClick={() => setIsMobileMenuOpen(false)}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-2xl transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </div>

        {/* User Info */}
        {(showDesktopText || isMobile) && (
          <div className={`p-4 border-b border-gray-100 w-full`}>
            {isLoading ? (
              <div className="flex items-center justify-between animate-pulse">
                <div className="h-10 w-10 bg-gray-200 rounded-full"></div>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="h-10 w-10 bg-gray-100 rounded-full flex items-center justify-center">
                    <User className="h-5 w-5 text-gray-600" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-900">
                      {user?.name}
                    </p>
                    <p className="text-xs text-gray-500 capitalize">
                      {user?.type === "manager" ? "Gerente" : "Cobrador"}
                    </p>
                  </div>
                </div>
                <NotificationDropdown />
              </div>
            )}
          </div>
        )}

        {/* Navigation */}
        <div className="p-4 flex-1 overflow-y-auto w-full">
          <nav className="space-y-1">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => {
                    onTabChange(tab.id);
                    setIsMobileMenuOpen(false);
                  }}
                  className={`group w-full flex items-center px-3 py-2 rounded-2xl text-left transition-all duration-200 ${isCollapsed && !isMobile ? "justify-center" : ""} ${
                    activeTab === tab.id
                      ? "bg-blue-50 text-blue-700"
                      : "text-gray-700 hover:bg-gray-50"
                  }`}
                  title={isCollapsed && !isMobile ? tab.name : undefined}
                >
                  <Icon
                    className={`h-5 w-5 ${!isCollapsed || isMobile ? "mr-3" : ""} ${activeTab === tab.id ? "text-blue-600" : "text-gray-400"}`}
                  />
                  {(showDesktopText || isMobile) && (
                    <span className={`font-medium`}>{tab.name}</span>
                  )}
                  {(showDesktopText || isMobile) &&
                    tab.id === "visit-tracking" &&
                    pendingCancellations > 0 && (
                      <span
                        className={`ml-auto h-5 w-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-medium`}
                      >
                        {pendingCancellations}
                      </span>
                    )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Logout Button */}
        <div className="mt-auto p-4 border-t border-gray-200 bg-gray-50 w-full">
          <button
            onClick={logout}
            className={`w-full flex items-center justify-center space-x-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50 rounded-2xl transition-colors font-medium ${isCollapsed && !isMobile ? "justify-center" : ""}`}
            title={isCollapsed && !isMobile ? "Sair" : "Sair do Sistema"}
          >
            <LogOut className="h-4 w-4" />
            {(showDesktopText || isMobile) && <span>Sair do Sistema</span>}
          </button>
        </div>
      </div>
    );
  };

  return (
    <>
      {/* Mobile Menu Button */}
      <div className="lg:hidden absolute top-0 right-0 z-30 p-4">
        <button
          onClick={() => setIsMobileMenuOpen(true)}
          className="p-2 text-gray-500 bg-white rounded-md border border-gray-200 shadow-sm hover:bg-gray-100 hover:text-gray-700 transition-colors"
        >
          <Menu className="h-6 w-6" />
        </button>
      </div>

      {/* Mobile Sidebar Overlay */}
      <div
        className={`lg:hidden fixed inset-0 z-50 transition-all duration-300 ease-in-out ${
          isMobileMenuOpen
            ? "opacity-100 pointer-events-auto"
            : "opacity-0 pointer-events-none"
        }`}
      >
        {/* Backdrop */}
        <div
          className={`absolute inset-0 bg-black backdrop-blur-sm transition-all duration-300 ease-in-out ${
            isMobileMenuOpen ? "bg-opacity-50" : "bg-opacity-0"
          }`}
          onClick={() => setIsMobileMenuOpen(false)}
        />

        {/* Sidebar */}
        <div
          className={`fixed left-0 top-0 h-full w-72 bg-white shadow-xl transform transition-all duration-300 ease-out flex flex-col ${
            isMobileMenuOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <SidebarContent isMobile={true} />
        </div>
      </div>

      {/* Desktop Sidebar */}
      <aside
        className={`hidden lg:block bg-white shadow-md flex-shrink-0 transition-all duration-300 z-40 ${isCollapsed ? "w-20" : "w-72"}`}
      >
        <SidebarContent />
      </aside>
    </>
  );
};

export default Header;
