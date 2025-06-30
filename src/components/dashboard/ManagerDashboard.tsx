import React, { useState, useRef, useEffect } from 'react';
import { 
  DollarSign, 
  TrendingUp, 
  Users, 
  FileText, 
  BarChart3,
  Download,
  Store,
  UserCheck,
  AlertTriangle,
  ChevronDown
} from 'lucide-react';
import StatsCard from '../common/StatsCard';
import FilterBar from '../common/FilterBar';
import CollectionTable from './CollectionTable';
import EnhancedPerformanceChart from './EnhancedPerformanceChart';
import UserManagement from './UserManagement';
import EnhancedStoreManagement from './EnhancedStoreManagement';
import { ClientAssignment } from '../ClientAssignment';
import VisitTracking from './VisitTracking';
import DailyCashReport from './DailyCashReport';
import { useCollection } from '../../contexts/CollectionContext';
import { FilterOptions } from '../../types';
import { formatCurrency } from '../../utils/mockData';

const ManagerDashboard: React.FC = () => {
  const { getDashboardStats, getCollectorPerformance, getFilteredCollections, getPendingCancellationRequests, collections } = useCollection();
  
  // Recupera a aba ativa do localStorage ou usa 'overview' como padrão
  const [activeTab, setActiveTab] = useState<'overview' | 'collections' | 'performance' | 'users' | 'stores' | 'clients' | 'visit-tracking'>(() => {
    const savedTab = localStorage.getItem('managerActiveTab');
    return (savedTab as any) || 'overview';
  });
  
  const [filters, setFilters] = useState<FilterOptions>({});
  const [collectionsView, setCollectionsView] = useState<'table' | 'cash-report'>('table');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const mobileMenuRef = useRef<HTMLDivElement>(null);

  // Salva a aba ativa no localStorage sempre que mudar
  useEffect(() => {
    localStorage.setItem('managerActiveTab', activeTab);
  }, [activeTab]);

  // Close mobile menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (mobileMenuRef.current && !mobileMenuRef.current.contains(event.target as Node)) {
        setIsMobileMenuOpen(false);
      }
    };

    if (isMobileMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isMobileMenuOpen]);

  const stats = getDashboardStats();
  const performance = getCollectorPerformance();
  const filteredCollections = getFilteredCollections(filters, 'manager');
  const pendingCancellations = getPendingCancellationRequests();

  const tabs = [
    { id: 'overview', name: 'Visão Geral', icon: BarChart3 },
    { id: 'collections', name: 'Cobranças', icon: FileText },
    { id: 'performance', name: 'Desempenho', icon: TrendingUp },
    { id: 'stores', name: 'Lojas', icon: Store },
    { id: 'clients', name: 'Clientes', icon: UserCheck },
    { id: 'visit-tracking', name: 'Acompanhamento', icon: AlertTriangle },
    { id: 'users', name: 'Usuários', icon: Users },
  ];

  const renderTabContent = () => {
    switch (activeTab) {
      case 'overview':
        return (
          <div className="space-y-4 sm:space-y-6">
            {/* Stats Cards - Enhanced Mobile Grid */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-6">
              <StatsCard
                title="Total em Aberto"
                value={formatCurrency(stats.pendingAmount)}
                change="+12% vs mês anterior"
                changeType="positive"
                icon={DollarSign}
                iconColor="bg-red-500"
              />
              <StatsCard
                title="Total Recebido"
                value={formatCurrency(stats.receivedAmount)}
                change="+8% vs mês anterior"
                changeType="positive"
                icon={TrendingUp}
                iconColor="bg-green-500"
              />
              <StatsCard
                title="Taxa de Conversão"
                value={`${stats.conversionRate.toFixed(1)}%`}
                change="+2.1% vs mês anterior"
                changeType="positive"
                icon={BarChart3}
                iconColor="bg-blue-500"
              />
              <StatsCard
                title="Cobradores Ativos"
                value={stats.collectorsCount.toString()}
                icon={Users}
                iconColor="bg-purple-500"
              />
            </div>

            {/* Performance Overview - Enhanced Mobile Optimization */}
            <div className="bg-white rounded-lg sm:rounded-xl shadow-sm border border-gray-200">
              <div className="p-3 sm:p-4 lg:p-6">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4 mb-3 sm:mb-4 lg:mb-6">
                  <div className="min-w-0">
                    <h2 className="text-base sm:text-lg lg:text-xl font-semibold text-gray-900 truncate">Desempenho dos Cobradores</h2>
                    <p className="text-xs sm:text-sm text-gray-600 mt-1">Acompanhamento detalhado por cobrador</p>
                  </div>
                  <button className="inline-flex items-center justify-center px-3 sm:px-3 lg:px-4 py-2 sm:py-2 bg-blue-600 text-white rounded-md sm:rounded-lg hover:bg-blue-700 transition-colors text-xs sm:text-sm font-medium whitespace-nowrap touch-manipulation">
                    <Download className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1.5 sm:mr-2" />
                    <span className="hidden sm:inline">Exportar Dados</span>
                    <span className="sm:hidden">Exportar</span>
                  </button>
                </div>
                
                {/* Mobile-friendly performance cards */}
                <div className="space-y-3 lg:hidden">
                  {performance.map((collector) => (
                    <div key={collector.collectorId} className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="font-medium text-sm text-gray-900 truncate flex-1 mr-2">{collector.collectorName}</h3>
                        <span className={`inline-flex px-2 py-0.5 text-xs font-semibold rounded-full whitespace-nowrap ${
                          collector.conversionRate >= 50 
                            ? 'bg-green-100 text-green-800' 
                            : collector.conversionRate >= 25 
                            ? 'bg-yellow-100 text-yellow-800'
                            : 'bg-red-100 text-red-800'
                        }`}>
                          {collector.conversionRate.toFixed(1)}%
                        </span>
                      </div>
                      
                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div className="bg-white rounded-md p-2">
                          <div className="font-semibold text-sm text-gray-900">{collector.totalAssigned}</div>
                          <div className="text-xs text-gray-600">Vendas</div>
                        </div>
                        <div className="bg-white rounded-md p-2">
                          <div className="font-semibold text-sm text-green-600">{collector.totalReceived}</div>
                          <div className="text-xs text-gray-600">Pagas</div>
                        </div>
                        <div className="bg-white rounded-md p-2">
                          <div className="font-semibold text-xs text-blue-600 truncate">{formatCurrency(collector.receivedAmount)}</div>
                          <div className="text-xs text-gray-600">Valor</div>
                        </div>
                      </div>
                      
                      {/* Additional mobile info */}
                      <div className="mt-2 pt-2 border-t border-gray-200 text-xs text-gray-600">
                        Tempo médio: <span className="font-medium text-gray-900">{collector.averageTime.toFixed(0)} dias</span>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Desktop table */}
                <div className="hidden lg:block overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="text-left py-3 px-4 font-medium text-gray-900">Cobrador</th>
                        <th className="text-left py-3 px-4 font-medium text-gray-900">Vendas Atribuídas</th>
                        <th className="text-left py-3 px-4 font-medium text-gray-900">Vendas Pagas</th>
                        <th className="text-left py-3 px-4 font-medium text-gray-900">Taxa</th>
                        <th className="text-left py-3 px-4 font-medium text-gray-900">Valor Total</th>
                        <th className="text-left py-3 px-4 font-medium text-gray-900">Tempo Médio</th>
                      </tr>
                    </thead>
                    <tbody>
                      {performance.map((collector) => (
                        <tr key={collector.collectorId} className="border-b border-gray-100 hover:bg-gray-50">
                          <td className="py-3 px-4">
                            <div className="font-medium text-gray-900">{collector.collectorName}</div>
                          </td>
                          <td className="py-3 px-4 text-gray-600">{collector.totalAssigned}</td>
                          <td className="py-3 px-4 text-gray-600">{collector.totalReceived}</td>
                          <td className="py-3 px-4">
                            <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                              collector.conversionRate >= 50 
                                ? 'bg-green-100 text-green-800' 
                                : collector.conversionRate >= 25 
                                ? 'bg-yellow-100 text-yellow-800'
                                : 'bg-red-100 text-red-800'
                            }`}>
                              {collector.conversionRate.toFixed(1)}%
                            </span>
                          </td>
                          <td className="py-3 px-4 text-gray-600">
                            {formatCurrency(collector.receivedAmount)}
                          </td>
                          <td className="py-3 px-4 text-gray-600">
                            {collector.averageTime.toFixed(0)} dias
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        );

      case 'collections':
        return (
          <div className="space-y-3 sm:space-y-4">
            {/* View Toggle Buttons - Enhanced Mobile */}
            <div className="bg-white rounded-lg sm:rounded-xl shadow-sm p-3 sm:p-4 border border-gray-200">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
                <h2 className="text-base sm:text-lg lg:text-xl font-semibold text-gray-900">Cobranças</h2>
                <div className="flex bg-gray-100 rounded-md p-0.5 w-full sm:w-auto">
                  <button
                    onClick={() => setCollectionsView('table')}
                    className={`flex-1 sm:flex-none px-2 sm:px-3 lg:px-4 py-1.5 sm:py-2 rounded-md text-xs sm:text-sm font-medium transition-all duration-200 whitespace-nowrap touch-manipulation ${
                      collectionsView === 'table'
                        ? 'bg-white text-blue-600 shadow-sm'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    <FileText className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1 lg:mr-2 inline" />
                    <span className="hidden sm:inline">Todas as Cobranças</span>
                    <span className="sm:hidden">Cobranças</span>
                  </button>
                  <button
                    onClick={() => setCollectionsView('cash-report')}
                    className={`flex-1 sm:flex-none px-2 sm:px-3 lg:px-4 py-1.5 sm:py-2 rounded-md text-xs sm:text-sm font-medium transition-all duration-200 whitespace-nowrap touch-manipulation ${
                      collectionsView === 'cash-report'
                        ? 'bg-white text-blue-600 shadow-sm'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    <DollarSign className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1 lg:mr-2 inline" />
                    <span className="hidden sm:inline">Relatório do Caixa</span>
                    <span className="sm:hidden">Caixa</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Content based on selected view */}
            {collectionsView === 'table' ? (
              <div className="space-y-4">
                <FilterBar 
                  filters={filters} 
                  onFilterChange={setFilters} 
                  userType="manager" 
                />
                <CollectionTable collections={filteredCollections} userType="manager" showGrouped={false} />
              </div>
            ) : (
              <DailyCashReport collections={collections} />
            )}
          </div>
        );

      case 'performance':
        return <EnhancedPerformanceChart />;

      case 'stores':
        return <EnhancedStoreManagement />;

      case 'clients':
        return <ClientAssignment />;

      case 'visit-tracking':
        return <VisitTracking />;

      case 'users':
        return <UserManagement />;

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
            <div ref={mobileMenuRef} className="bg-white rounded-xl shadow-sm border border-gray-200 relative">
              <button
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                className="w-full flex items-center justify-between p-4 text-left hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center">
                  {(() => {
                    const currentTab = tabs.find(tab => tab.id === activeTab);
                    const Icon = currentTab?.icon || BarChart3;
                    return (
                      <>
                        <Icon className="h-5 w-5 mr-3 text-blue-600" />
                        <div>
                          <div className="font-medium text-gray-900">{currentTab?.name}</div>
                          <div className="text-sm text-gray-500">Navegar entre seções</div>
                        </div>
                      </>
                    );
                  })()}
                  {activeTab === 'visit-tracking' && pendingCancellations.length > 0 && (
                    <span className="ml-2 h-5 w-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-medium">
                      {pendingCancellations.length}
                    </span>
                  )}
                </div>
                <ChevronDown className={`h-5 w-5 text-gray-400 transition-transform ${isMobileMenuOpen ? 'rotate-180' : ''}`} />
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
                          setActiveTab(tab.id as any);
                          setIsMobileMenuOpen(false);
                        }}
                        className={`w-full flex items-center px-4 py-3 text-left hover:bg-gray-50 transition-colors relative ${
                          activeTab === tab.id ? 'bg-blue-50 text-blue-600' : 'text-gray-700'
                        }`}
                      >
                        <Icon className={`h-5 w-5 mr-3 ${activeTab === tab.id ? 'text-blue-600' : 'text-gray-400'}`} />
                        <span className="font-medium">{tab.name}</span>
                        {tab.id === 'visit-tracking' && pendingCancellations.length > 0 && (
                          <span className="ml-auto h-5 w-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-medium">
                            {pendingCancellations.length}
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
                      onClick={() => setActiveTab(tab.id as any)}
                      className={`flex items-center py-3 px-4 border-b-2 font-medium text-sm whitespace-nowrap relative transition-colors ${
                        activeTab === tab.id
                          ? 'border-blue-500 text-blue-600'
                          : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                      }`}
                    >
                      <Icon className="h-4 w-4 mr-2 flex-shrink-0" />
                      <span>{tab.name}</span>
                      {tab.id === 'visit-tracking' && pendingCancellations.length > 0 && (
                        <span className="absolute -top-1 -right-1 h-5 w-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-medium">
                          {pendingCancellations.length}
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
        <div className="animate-fadeIn">
          {renderTabContent()}
        </div>
      </div>
    </div>
  );
};

export default ManagerDashboard;