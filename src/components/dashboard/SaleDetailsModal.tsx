import React, { useMemo, useState, useEffect } from "react";
import AddressHistoryViewer from "./AddressHistoryViewer";
import {
  X,
  Phone,
  MessageCircle,
  DollarSign,
  Calendar,
  Store,
  FileText,
  Package,
  Clock,
  User,
} from "lucide-react";
import { Collection } from "../../types";
import {
  formatCurrency,
  formatDate,
  getStatusLabel,
} from "../../utils/formatters";
import { useCollection } from "../../contexts/CollectionContext";


interface SaleDetailsModalProps {
  collections: Collection[];
  onClose: () => void;
}

const SaleDetailsModal: React.FC<SaleDetailsModalProps> = ({
  collections,
  onClose,
}) => {
  const { scheduledVisits, users, salePayments } = useCollection();
  const [activeTab, setActiveTab] = useState("installments");


  // Desabilitar scroll do body quando o modal estiver aberto
  useEffect(() => {
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = "unset";
    };
  }, []);

  const saleData = useMemo(() => {
    if (!collections.length) return null;

    const firstCollection = collections[0];
    const totalOriginal = collections.reduce(
      (sum, c) => sum + c.valor_original,
      0,
    );
    const totalReceived = collections.reduce(
      (sum, c) => sum + c.valor_recebido,
      0,
    );
    const totalDiscount = collections.reduce(
      (sum, c) => sum + (c.desconto || 0),
      0,
    );

    const totalPending = totalOriginal - totalReceived - totalDiscount;

    let saleStatus = "pendente";
    if (totalReceived > 0 && totalPending > 0.01) {
      saleStatus = "parcial";
    } else if (
      totalPending <= 0.01 &&
      (totalReceived > 0 || totalDiscount > 0)
    ) {
      saleStatus = "pago";
    }

    return {
      ...firstCollection,
      totalOriginal,
      totalReceived,
      totalDiscount,
      totalPending,
      saleStatus,
      installmentsCount: collections.length,
      collections: collections.sort(
        (a, b) => (a.parcela || 0) - (b.parcela || 0),
      ),
    };
  }, [collections]);





  const salePaymentHistory = useMemo(() => {
    if (!saleData || !salePayments) return [];

    return salePayments
      .filter(
        (p) =>
          String(p.saleNumber ?? 0) === String(saleData.venda_n ?? 0) &&
          p.clientDocument === saleData.documento,
      )
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
  }, [saleData, salePayments]);

  // Buscar visitas relacionadas a este cliente
  const clientVisits = useMemo(() => {
    if (!saleData?.documento || !scheduledVisits) return [];

    return scheduledVisits
      .filter((visit) => visit.clientDocument === saleData.documento)
      .filter((visit) => visit.status === "realizada" && visit.notes) // Apenas visitas realizadas com observações
      .sort((a, b) => {
        const dateA = new Date(a.updatedAt || a.createdAt);
        const dateB = new Date(b.updatedAt || b.createdAt);
        return dateB.getTime() - dateA.getTime(); // Mais recentes primeiro
      });
  }, [saleData, scheduledVisits]);

  const getCollectorName = (collectorId: string) => {
    const collector = users?.find((u) => u.id === collectorId);
    return collector?.name || "Cobrador não identificado";
  };

  const formatVisitDate = (dateString: string) => {
    try {
      const [year, month, day] = dateString.split("-");
      const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
      return date.toLocaleDateString("pt-BR");
    } catch {
      return dateString;
    }
  };

  const getStatusVisitBadge = (status: string) => {
    const config = {
      realizada: {
        bg: "bg-green-100",
        text: "text-green-800",
        label: "Realizada",
      },
      cancelada: {
        bg: "bg-gray-100",
        text: "text-gray-800",
        label: "Cancelada",
      },
      nao_encontrado: {
        bg: "bg-yellow-100",
        text: "text-yellow-800",
        label: "Não Encontrado",
      },
    };

    const statusConfig =
      config[status as keyof typeof config] || config["realizada"];

    return (
      <span
        className={`px-2 py-1 rounded-full text-xs font-semibold ${statusConfig.bg} ${statusConfig.text}`}
      >
        {statusConfig.label}
      </span>
    );
  };

  if (!saleData) return null;

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="bg-white rounded-2xl shadow-xl w-[90%] max-h-[95vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between bg-gradient-to-r from-blue-600 to-purple-600 text-white flex-shrink-0">
          <div>
            <h2 className="text-xl font-semibold">{saleData.cliente}</h2>
            <p className="text-blue-100 text-sm">
              Venda #{saleData.venda_n} • {saleData.nome_da_loja}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-blue-100 hover:text-white transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto min-h-0">
          {/* Sale Summary */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
            <div className="bg-gradient-to-br from-green-50 to-emerald-50 p-4 rounded-2xl border border-green-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-green-700">
                    Valor Total
                  </p>
                  <p className="text-2xl font-bold text-green-900">
                    {formatCurrency(saleData.totalOriginal)}
                  </p>
                </div>
                <DollarSign className="h-8 w-8 text-green-600" />
              </div>
            </div>

            <div className="bg-gradient-to-br from-blue-50 to-indigo-50 p-4 rounded-2xl border border-blue-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-blue-700">
                    Já Recebido
                  </p>
                  <p className="text-2xl font-bold text-blue-900">
                    {formatCurrency(saleData.totalReceived)}
                  </p>
                </div>
                <Package className="h-8 w-8 text-blue-600" />
              </div>
            </div>

            {saleData.saleStatus === "pago" && saleData.totalDiscount > 0 ? (
              <div className="bg-gradient-to-br from-purple-50 to-indigo-50 p-4 rounded-2xl border border-purple-200">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-purple-700">
                      Desconto Total
                    </p>
                    <p className="text-2xl font-bold text-purple-900">
                      {formatCurrency(saleData.totalDiscount)}
                    </p>
                  </div>
                  <Calendar className="h-8 w-8 text-purple-600" />
                </div>
              </div>
            ) : (
              <div className="bg-gradient-to-br from-orange-50 to-red-50 p-4 rounded-2xl border border-orange-200">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-orange-700">
                      Pendente
                    </p>
                    <p className="text-2xl font-bold text-orange-900">
                      {formatCurrency(saleData.totalPending)}
                    </p>
                  </div>
                  <Calendar className="h-8 w-8 text-orange-600" />
                </div>
              </div>
            )}
          </div>

          {/* Sale Information */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
            {/* Basic Info */}
            <div className="space-y-6">
              <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                <Store className="h-5 w-5 mr-2 text-blue-600" />
                Informações da Venda
              </h3>

              <div className="bg-gray-50 p-4 rounded-2xl space-y-3">
                <div className="flex justify-between">
                  <span className="text-sm font-medium text-gray-600">
                    Loja:
                  </span>
                  <span className="text-sm font-semibold text-gray-900">
                    {saleData.nome_da_loja}
                  </span>
                </div>

                <div className="flex justify-between">
                  <span className="text-sm font-medium text-gray-600">
                    Número da Venda:
                  </span>
                  <span className="text-sm font-semibold text-gray-900">
                    {saleData.venda_n}
                  </span>
                </div>

                <div className="flex justify-between">
                  <span className="text-sm font-medium text-gray-600">
                    Número de Parcelas:
                  </span>
                  <span className="text-sm font-semibold text-gray-900">
                    {saleData.installmentsCount}
                  </span>
                </div>

                <div className="flex justify-between">
                  <span className="text-sm font-medium text-gray-600">
                    Tipo de Cobrança:
                  </span>
                  <span className="text-sm font-semibold text-gray-900">
                    {saleData.tipo_de_cobranca}
                  </span>
                </div>

                <div className="flex justify-between">
                  <span className="text-sm font-medium text-gray-600">
                    Cobrador:
                  </span>
                  <span className="text-sm font-semibold text-gray-900">
                    {getCollectorName(saleData.user_id || "")}
                  </span>
                </div>

                <div className="flex justify-between">
                  <span className="text-sm font-medium text-gray-600">
                    Status da Venda:
                  </span>
                  <span
                    className={`text-sm font-semibold px-2 py-1 rounded-full ${
                      saleData.saleStatus === "pago"
                        ? "bg-green-100 text-green-800"
                        : saleData.saleStatus === "parcial"
                          ? "bg-yellow-100 text-yellow-800"
                          : "bg-red-100 text-red-800"
                    }`}
                  >
                    {getStatusLabel(saleData.saleStatus)}
                  </span>
                </div>
              </div>
            </div>

            {/* Contact Info */}
            <div className="space-y-6">
                <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                    <User className="h-5 w-5 mr-2 text-blue-600" />
                    Informações do Cliente
                </h3>
                <div className="bg-gray-50 p-4 rounded-2xl space-y-4">
                    <div>
                        <p className="text-sm font-medium text-gray-600 mb-1">Cliente:</p>
                        <p className="font-semibold text-gray-900">{saleData.cliente}</p>
                        <p className="text-sm text-gray-600">{saleData.documento}</p>
                    </div>

                    {saleData.apelido && (
                        <div>
                            <p className="text-sm font-medium text-gray-600 mb-1">Apelido:</p>
                            <p className="font-semibold text-gray-900">{saleData.apelido}</p>
                        </div>
                    )}

                    {(saleData.telefone || saleData.celular) && (
                        <div>
                            <p className="text-sm font-medium text-gray-600 mb-1">Contatos:</p>
                            <div className="space-y-1">
                                {saleData.telefone && (
                                <div className="flex items-center text-sm">
                                    <Phone className="h-4 w-4 text-gray-400 mr-2" />
                                    <span>{saleData.telefone}</span>
                                </div>
                                )}
                                {saleData.celular && (
                                <div className="flex items-center text-sm">
                                    <MessageCircle className="h-4 w-4 text-gray-400 mr-2" />
                                    <span>{saleData.celular}</span>
                                </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {saleData.documento && <AddressHistoryViewer clientDocument={saleData.documento} />}
            </div>
          </div>


          <div className="border-b border-gray-200 mb-4">
            <nav className="-mb-px flex space-x-6" aria-label="Tabs">
              <button
                onClick={() => setActiveTab('installments')}
                className={`whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm transition-colors ${
                  activeTab === 'installments'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Parcelas
              </button>
              <button
                onClick={() => setActiveTab('payments')}
                className={`whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm transition-colors ${
                  activeTab === 'payments'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Pagamentos
              </button>
              <button
                onClick={() => setActiveTab('visits')}
                className={`whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm transition-colors ${
                  activeTab === 'visits'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Acompanhamento
              </button>
            </nav>
          </div>

          {/* Tab Content */}
          <div>
            {activeTab === 'installments' && (
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                  <FileText className="h-5 w-5 mr-2 text-blue-600" />
                  Detalhes das Parcelas
                </h3>
                <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ID</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Parcela</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Vencimento</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Valor Original</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Valor Recebido</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Desconto</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Pendente</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {saleData.collections.map((collection, index) => {
                          const discount = collection.desconto || 0;
                          const pending = Math.max(0, collection.valor_original - collection.valor_recebido - discount);
                          const dbStatus = collection.status?.toLowerCase() || "pendente";
                          let status = "pendente";
                          if (dbStatus === "pago" || dbStatus === "pago com desconto" || pending <= 0.01) {
                            status = "pago";
                          } else if (collection.valor_recebido > 0 || discount > 0) {
                            status = "parcial";
                          }
                          return (
                            <tr key={collection.id_parcela} className={index % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                              <td className="px-4 py-3 text-sm font-medium text-gray-500">{collection.id_parcela}</td>
                              <td className="px-4 py-3 text-sm font-medium text-gray-900">{collection.parcela}° Parcela</td>
                              <td className="px-4 py-3 text-sm text-gray-600">{formatDate(collection.data_vencimento || "")}</td>
                              <td className="px-4 py-3 text-sm font-semibold text-gray-900">{formatCurrency(collection.valor_original)}</td>
                              <td className="px-4 py-3 text-sm font-semibold text-green-600">{formatCurrency(collection.valor_recebido)}</td>
                              <td className="px-4 py-3 text-sm font-semibold text-blue-600">{formatCurrency(discount)}</td>
                              <td className="px-4 py-3 text-sm font-semibold text-orange-600">{formatCurrency(pending)}</td>
                              <td className="px-4 py-3">
                                <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${status === "pago" ? "bg-green-100 text-green-800" : status === "parcial" ? "bg-yellow-100 text-yellow-800" : "bg-red-100 text-red-800"}`}>
                                  {getStatusLabel(status)}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'payments' && (
              <div className="space-y-6">
                {salePaymentHistory.length > 0 && (
                  <div className="space-y-4">
                    <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                      <DollarSign className="h-5 w-5 mr-2 text-blue-600" />
                      Histórico de Pagamentos
                    </h3>
                    <div className="space-y-3">
                      {salePaymentHistory.map((payment) => (
                        <div key={payment.id} className="bg-gray-50 p-4 rounded-2xl border border-gray-200">
                          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-2">
                                <span className="font-semibold text-gray-800">{formatCurrency(payment.paymentAmount)}</span>
                                <span className="text-xs text-gray-500">- {payment.paymentMethod}</span>
                              </div>
                            </div>
                            <div className="flex items-center text-xs text-gray-400">
                              <Calendar className="h-3 w-3 mr-1" />
                              {formatDate(payment.paymentDate)}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {salePaymentHistory.some((p) => p.notes) && (
                    <div className="space-y-4">
                        <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                            <FileText className="h-5 w-5 mr-2 text-blue-600" />
                            Observações de Pagamentos
                        </h3>
                        {salePaymentHistory.map((payment) =>
                            payment.notes && (
                            <div key={payment.id} className="bg-blue-50 p-4 rounded-2xl border border-blue-200">
                                <p className="text-sm text-gray-700 whitespace-pre-line">{payment.notes}</p>
                                <p className="text-xs text-gray-500 mt-2 text-right">Registrado em {formatDate(payment.paymentDate)}</p>
                            </div>
                            )
                        )}
                    </div>
                )}
                {salePaymentHistory.length === 0 && (
                    <p className="text-sm text-gray-500">Nenhum pagamento registrado para esta venda.</p>
                )}
              </div>
            )}

            {activeTab === 'visits' && (
              <div className="space-y-4">
                {clientVisits.length > 0 ? (
                  <>
                    <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                      <Clock className="h-5 w-5 mr-2 text-blue-600" />
                      Histórico de Acompanhamento
                    </h3>
                    <div className="space-y-3">
                      {clientVisits.map((visit) => (
                        <div key={visit.id} className="bg-gray-50 p-4 rounded-2xl border border-gray-200">
                          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-2">
                                {getStatusVisitBadge(visit.status)}
                                <span className="text-xs text-gray-500">
                                  {formatVisitDate(visit.scheduledDate)}
                                  {visit.scheduledTime && ` às ${visit.scheduledTime}`}
                                </span>
                              </div>
                              <div className="flex items-center text-sm text-gray-600 mb-2">
                                <User className="h-4 w-4 mr-1" />
                                <span className="font-medium">{getCollectorName(visit.collectorId)}</span>
                              </div>
                              {visit.notes && (
                                <div className="bg-white p-3 rounded-2xl border border-gray-200">
                                  <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">{visit.notes}</p>
                                </div>
                              )}
                            </div>
                            <div className="flex items-center text-xs text-gray-400">
                              <Clock className="h-3 w-3 mr-1" />
                              {visit.updatedAt ? `Finalizada em ${formatVisitDate(visit.updatedAt.split("T")[0])}` : `Registrada em ${formatVisitDate(visit.createdAt.split("T")[0])}`}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-gray-500">Nenhuma visita com observações encontrada para este cliente.</p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

    </div>
  );
};
export default SaleDetailsModal;
