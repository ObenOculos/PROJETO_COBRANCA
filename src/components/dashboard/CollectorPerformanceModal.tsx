import React from "react";
import { X, TrendingUp, TrendingDown, DollarSign, Hash, BarChart2, Users, PieChart } from "lucide-react";
import { formatCurrency } from "../../utils/formatters";

interface CollectorPerformanceModalProps {
  isOpen: boolean;
  onClose: () => void;
  collector: any; 
}

const CollectorPerformanceModal: React.FC<CollectorPerformanceModalProps> = ({
  isOpen,
  onClose,
  collector,
}) => {
  if (!isOpen || !collector) {
    return null;
  }

  const pendingAmount = collector.totalAmount - collector.receivedAmount;

  const stats = [
    {
      icon: BarChart2,
      label: "Vendas Finalizadas",
      value: `${collector.completedSales}/${collector.totalSales}`,
      color: "text-green-600",
    },
    {
      icon: TrendingDown,
      label: "Vendas Pendentes",
      value: collector.pendingSales,
      color: "text-red-600",
    },
    {
      icon: Users,
      label: "Clientes com Pendências",
      value: collector.clientsWithPending,
      color: "text-yellow-600",
    },
    {
      icon: DollarSign,
      label: "Valor Pendente",
      value: formatCurrency(pendingAmount),
      color: "text-red-700",
    },
    {
      icon: PieChart,
      label: "Eficiência",
      value: `${collector.efficiency.toFixed(1)}%`,
      color: "text-blue-600",
    },
    {
      icon: Hash,
      label: "Total de Clientes",
      value: collector.clientsCount,
      color: "text-indigo-600",
    },
  ];

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-60 backdrop-blur-sm flex items-center justify-center p-4 z-50"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-3xl shadow-2xl w-full max-w-md mx-auto transform transition-all duration-300 ease-in-out"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 relative">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X size={24} />
          </button>

          <div className="text-center mb-6">
            <h3 className="text-2xl font-bold text-gray-900">
              {collector.collectorName}
            </h3>
            <p className="text-gray-600">Desempenho Detalhado</p>
          </div>

          {/* Métricas Principais */}
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="bg-green-50 border border-green-200 rounded-2xl p-4 text-center">
              <p className="text-sm text-green-700 font-medium">Valor Recebido</p>
              <p className="text-3xl font-bold text-green-600">
                {formatCurrency(collector.receivedAmount)}
              </p>
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 text-center">
              <p className="text-sm text-blue-700 font-medium">Taxa de Conversão</p>
              <p className="text-3xl font-bold text-blue-600">
                {collector.conversionRate.toFixed(1)}%
              </p>
            </div>
          </div>

          {/* Detalhes Adicionais */}
          <div className="space-y-4">
            <h4 className="text-lg font-semibold text-gray-800 mb-2">Estatísticas Gerais</h4>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {stats.map((stat, index) => (
                <div key={index} className="bg-gray-50 rounded-xl p-3 flex flex-col items-center justify-center text-center">
                  <stat.icon className={`h-6 w-6 mb-2 ${stat.color}`} />
                  <p className="text-xs text-gray-500">{stat.label}</p>
                  <p className="text-lg font-semibold text-gray-800">{stat.value}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CollectorPerformanceModal;
