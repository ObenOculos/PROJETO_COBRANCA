import React, { useMemo, useState, useEffect } from "react";
import {
  X,
  TrendingDown,
  DollarSign,
  Hash,
  BarChart2,
  Users,
  PieChart,
} from "lucide-react";
import { formatCurrency } from "../../utils/formatters";
import { useCollection } from "../../contexts/CollectionContext";

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
  const { monthlyGoals, salePayments, scheduledVisits } = useCollection();
  const [showHistory, setShowHistory] = useState(true);

  const performanceHistory = useMemo(() => {
    if (!collector) return [];

    const collectorGoals = monthlyGoals
      .filter((g) => g.user_id === collector.collectorId)
      .sort(
        (a, b) => new Date(b.month).getTime() - new Date(a.month).getTime(),
      );

    return collectorGoals.map((goal) => {
      const goalMonth = new Date(goal.month).getMonth();
      const goalYear = new Date(goal.month).getFullYear();

      const visitsInMonth = scheduledVisits.filter((v) => {
        const visitDate = new Date(v.dataVisitaRealizada || v.scheduledDate);
        return (
          v.collectorId === collector.collectorId &&
          v.status === "realizada" &&
          visitDate.getMonth() === goalMonth &&
          visitDate.getFullYear() === goalYear
        );
      }).length;

      const paymentsInMonth = salePayments
        .filter((p) => {
          const paymentDate = new Date(p.paymentDate);
          return (
            p.collectorId === collector.collectorId &&
            paymentDate.getMonth() === goalMonth &&
            paymentDate.getFullYear() === goalYear
          );
        })
        .reduce((sum, p) => sum + p.paymentAmount, 0);

      return {
        month: new Date(goal.month).toLocaleDateString("pt-BR", {
          month: "long",
          year: "numeric",
        }),
        visitsGoal: goal.visits_goal,
        visitsActual: visitsInMonth,
        paymentsGoal: goal.payments_goal,
        paymentsActual: paymentsInMonth,
      };
    });
  }, [collector, monthlyGoals, salePayments, scheduledVisits]);

  useEffect(() => {
    if (isOpen) {
      document.body.classList.add("overflow-hidden");
    } else {
      document.body.classList.remove("overflow-hidden");
    }

    // Cleanup function to ensure the class is removed when the component unmounts
    return () => {
      document.body.classList.remove("overflow-hidden");
    };
  }, [isOpen]); // Re-run effect when isOpen changes

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
        { // New stat
          icon: Users,
          label: "Aproveitamento de Visitas",
          value: `${collector.clientVisitEfficiency.toFixed(1)}% (${collector.visitedClientsInSelectedMonths}/${collector.totalAssignedClients})`,
          color: "text-purple-600", // Using purple for a new distinct color
        },
      ];

  return (
    <div
      id="teste_teste"
      className="fixed inset-0 bg-black bg-opacity-60 backdrop-blur-sm flex items-center justify-center p-4 z-50"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-3xl shadow-2xl w-full lg:max-w-[80%] mx-auto transform transition-all duration-300 ease-in-out max-h-[90vh] overflow-y-auto"
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
              Desempenho do Cobrador
            </h3>
            <p className="text-lg text-gray-600 mt-1">
              {collector.collectorName}
            </p>
          </div>

          {/* Métricas Principais */}
          <div className="grid grid-cols-1 gap-4 mb-6">
            <div className="bg-green-50 border border-green-200 rounded-2xl p-4 text-center">
              <p className="text-sm text-green-700 font-medium">
                Valor Recebido
              </p>
              <p className="text-3xl font-bold text-green-600">
                {formatCurrency(collector.receivedAmount)}
              </p>
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 text-center">
              <p className="text-sm text-blue-700 font-medium">
                Taxa de Conversão
              </p>
              <p className="text-3xl font-bold text-blue-600">
                {collector.conversionRate.toFixed(1)}%
              </p>
            </div>
          </div>

          {/* Detalhes Adicionais */}
          <div className="space-y-4">
            <h4 className="text-lg font-semibold text-gray-800 mb-2">
              Estatísticas Gerais
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {stats.map((stat, index) => (
                <div
                  key={index}
                  className="bg-gray-50 rounded-xl p-3 flex flex-col items-center justify-center text-center"
                >
                  <stat.icon className={`h-6 w-6 mb-2 ${stat.color}`} />
                  <p className="text-xs text-gray-500">{stat.label}</p>
                  <p className="text-lg font-semibold text-gray-800">
                    {stat.value}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Goal History Section */}
          {performanceHistory.length > 0 && (
            <div className="mt-6">
              <div className="flex justify-between items-center mb-2">
                <h4 className="text-lg font-semibold text-gray-800">
                  Histórico de Metas
                </h4>
                <button
                  onClick={() => setShowHistory(!showHistory)}
                  className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                >
                  {showHistory ? "Ocultar" : "Mostrar"}
                </button>
              </div>
              {showHistory && (
                <div className="space-y-3">
                  {performanceHistory.map((history, index) => (
                    <div key={index} className="bg-gray-50 rounded-xl p-3">
                      <p className="font-semibold text-gray-700 capitalize">
                        {history.month}
                      </p>
                      <div className="mt-2 space-y-2">
                        {/* Visits */}
                        <div>
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-600">Visitas</span>
                            <span>
                              {history.visitsActual} / {history.visitsGoal}
                            </span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-1.5 mt-1">
                            <div
                              className="bg-blue-500 h-1.5 rounded-full"
                              style={{
                                width: `${Math.min(100, (history.visitsActual / history.visitsGoal) * 100)}%`,
                              }}
                            ></div>
                          </div>
                        </div>
                        {/* Payments */}
                        <div>
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-600">Pagamentos</span>
                            <span>
                              {formatCurrency(history.paymentsActual)} /{" "}
                              {formatCurrency(history.paymentsGoal)}
                            </span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-1.5 mt-1">
                            <div
                              className="bg-green-500 h-1.5 rounded-full"
                              style={{
                                width: `${Math.min(100, (history.paymentsActual / history.paymentsGoal) * 100)}%`,
                              }}
                            ></div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CollectorPerformanceModal;
