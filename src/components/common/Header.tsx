import React, { useState } from "react";
import { LogOut, User, Menu, X } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import NotificationDropdown from "./NotificationDropdown";

const Header: React.FC = () => {
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

        {/* Mobile Menu */}
        {isMobileMenuOpen && (
          <div className="sm:hidden border-t border-gray-200 py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="h-10 w-10 bg-gray-100 rounded-full flex items-center justify-center">
                  <User className="h-5 w-5 text-gray-600" />
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

              <div className="flex items-center space-x-2">
                <NotificationDropdown />
                <button
                  onClick={logout}
                  className="p-2 text-gray-400 hover:text-red-600 transition-colors"
                  title="Sair"
                >
                  <LogOut className="h-5 w-5" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </header>
  );
};

export default Header;
