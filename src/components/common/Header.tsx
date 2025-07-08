import React, { useState } from "react";
import { LogOut, User, Menu, X } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import NotificationDropdown from "./NotificationDropdown";

interface Tab {
  id: string;
  name: string;
  icon: React.ComponentType<{ className?: string }>;
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
  pendingCancellations = 0 
}) => {
  const { user, logout } = useAuth();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  return (
    <header className="bg-white shadow-sm border-b border-gray-200 sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center py-3 lg:py-4">
          <div className="flex items-center flex-1 min-w-0">
            <div className="h-8 w-8 bg-blue-600 rounded-lg flex items-center justify-center mr-3 flex-shrink-0">
              <span className="text-white font-bold text-sm">SC</span>
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-lg lg:text-xl font-bold text-gray-900 truncate">
                Sistema de Cobrança
              </h1>
              <p className="text-xs lg:text-sm text-gray-500 truncate">
                {user?.type === "manager"
                  ? "Painel Gerencial"
                  : "Carteira de Cobrança"}
              </p>
            </div>
          </div>

          {/* Desktop Menu */}
          <div className="hidden sm:flex items-center space-x-4">
            <NotificationDropdown />

            <div className="flex items-center space-x-3">
              <div className="flex items-center space-x-2">
                <div className="h-8 w-8 bg-gray-100 rounded-full flex items-center justify-center">
                  <User className="h-4 w-4 text-gray-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {user?.name}
                  </p>
                  <p className="text-xs text-gray-500 capitalize">
                    {user?.type === "manager" ? "Gerente" : "Cobrador"}
                  </p>
                </div>
              </div>

              <button
                onClick={logout}
                className="p-2 text-gray-400 hover:text-red-600 transition-colors"
                title="Sair"
              >
                <LogOut className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Mobile Menu Button */}
          <div className="sm:hidden">
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
            >
              {isMobileMenuOpen ? (
                <X className="h-6 w-6" />
              ) : (
                <Menu className="h-6 w-6" />
              )}
            </button>
          </div>
        </div>

        {/* Mobile Sidebar Overlay */}
        <div className={`sm:hidden fixed inset-0 z-50 transition-all duration-300 ease-in-out ${
          isMobileMenuOpen 
            ? 'opacity-100 pointer-events-auto' 
            : 'opacity-0 pointer-events-none'
        }`}>
          {/* Backdrop with enhanced blur */}
          <div 
            className={`absolute inset-0 bg-black backdrop-blur-md transition-all duration-300 ease-in-out ${
              isMobileMenuOpen ? 'bg-opacity-60' : 'bg-opacity-0'
            }`}
            onClick={() => setIsMobileMenuOpen(false)}
          />
          
          {/* Sidebar */}
          <div 
            className={`fixed left-0 top-0 h-full w-80 bg-white shadow-2xl transform transition-all duration-300 ease-out overflow-hidden ${
              isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
            }`}
          >
            {/* Gradient header */}
            <div className="p-4 border-b border-gray-200 bg-gradient-to-r from-blue-50 to-indigo-50 relative overflow-hidden">
              {/* Animated background elements */}
              <div className="absolute top-0 right-0 w-32 h-32 bg-blue-100 rounded-full -translate-y-16 translate-x-16 opacity-30"></div>
              <div className="absolute bottom-0 left-0 w-20 h-20 bg-indigo-100 rounded-full translate-y-10 -translate-x-10 opacity-40"></div>
              
              <div className="flex items-center justify-between relative z-10">
                <div className="flex items-center space-x-2">
                  <div className="h-8 w-8 bg-blue-600 rounded-lg flex items-center justify-center animate-pulse">
                    <span className="text-white font-bold text-sm">SC</span>
                  </div>
                  <h2 className="text-lg font-bold text-blue-900 tracking-wide">Sistema de Cobrança</h2>
                </div>
                <button
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="p-2 text-gray-400 hover:text-gray-600 hover:bg-white hover:bg-opacity-50 rounded-full transition-all duration-200 transform hover:scale-110"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Enhanced User Info */}
            <div className="p-4 border-b border-gray-100 bg-gradient-to-b from-gray-50 to-white">
              <div className="flex items-center space-x-3 mb-3">
                <div className="relative">
                  <div className="h-12 w-12 bg-gradient-to-br from-blue-100 to-blue-200 rounded-full flex items-center justify-center ring-2 ring-blue-200 ring-offset-2 transition-all duration-300 hover:scale-105">
                    <User className="h-6 w-6 text-blue-600" />
                  </div>
                  <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-green-400 rounded-full border-2 border-white animate-pulse"></div>
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-gray-900 tracking-wide">
                    {user?.name}
                  </p>
                  <p className="text-xs text-gray-500 capitalize font-medium">
                    {user?.type === "manager" ? "🏢 Gerente" : "📋 Cobrador"}
                  </p>
                </div>
              </div>
              
              <div className="flex items-center justify-between pt-3 border-t border-gray-200">
                <div className="transform hover:scale-105 transition-transform duration-200">
                  <NotificationDropdown />
                </div>
                <button
                  onClick={logout}
                  className="flex items-center space-x-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-all duration-200 transform hover:scale-105 hover:shadow-md"
                  title="Sair"
                >
                  <LogOut className="h-4 w-4" />
                  <span className="font-medium">Sair</span>
                </button>
              </div>
            </div>

            {/* Enhanced Navigation */}
            {tabs.length > 0 && (
              <div className="p-4 h-full overflow-y-auto">
                <div className="flex items-center space-x-2 mb-4">
                  <div className="w-6 h-6 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
                    <span className="text-white text-xs">📱</span>
                  </div>
                  <h3 className="text-sm font-bold text-gray-700 tracking-wide">Navegação</h3>
                </div>
                
                <nav className="space-y-2">
                  {tabs.map((tab, index) => {
                    const Icon = tab.icon;
                    return (
                      <button
                        key={tab.id}
                        onClick={() => {
                          onTabChange(tab.id);
                          setIsMobileMenuOpen(false);
                        }}
                        className={`group w-full flex items-center px-4 py-3 rounded-xl text-left transition-all duration-300 transform hover:scale-105 hover:shadow-lg relative overflow-hidden ${
                          activeTab === tab.id
                            ? "bg-gradient-to-r from-blue-50 to-indigo-50 text-blue-700 shadow-md border-l-4 border-blue-500"
                            : "text-gray-700 hover:bg-gradient-to-r hover:from-gray-50 hover:to-blue-50"
                        }`}
                        style={{
                          animationDelay: `${index * 50}ms`
                        }}
                      >
                        {/* Animated background for active state */}
                        {activeTab === tab.id && (
                          <div className="absolute inset-0 bg-gradient-to-r from-blue-100 to-transparent opacity-20 animate-pulse"></div>
                        )}
                        
                        <div className={`p-2 rounded-lg mr-3 transition-all duration-300 ${
                          activeTab === tab.id 
                            ? "bg-blue-100 text-blue-600 shadow-sm" 
                            : "bg-gray-100 text-gray-400 group-hover:bg-blue-100 group-hover:text-blue-500"
                        }`}>
                          <Icon className="h-5 w-5" />
                        </div>
                        
                        <span className="font-semibold tracking-wide flex-1">{tab.name}</span>
                        
                        {tab.id === "visit-tracking" && pendingCancellations > 0 && (
                          <span className="ml-auto h-6 w-6 bg-gradient-to-r from-red-500 to-pink-500 text-white text-xs rounded-full flex items-center justify-center font-bold shadow-lg animate-bounce">
                            {pendingCancellations}
                          </span>
                        )}
                        
                        {/* Hover indicator */}
                        <div className={`absolute right-2 opacity-0 group-hover:opacity-100 transition-all duration-300 ${
                          activeTab === tab.id ? 'text-blue-500' : 'text-gray-400'
                        }`}>
                          →
                        </div>
                      </button>
                    );
                  })}
                </nav>
                
                {/* Footer with version */}
                <div className="mt-8 pt-4 border-t border-gray-100">
                  <p className="text-xs text-gray-400 text-center">
                    Sistema v2.0 • Desenvolvido com ❤️
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;
