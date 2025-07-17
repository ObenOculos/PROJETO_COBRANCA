import React, { useMemo } from "react";
import {
  X,
  Phone,
  MessageCircle,
  MapPin,
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
  const { scheduledVisits, users } = useCollection();
  
  // Desabilitar scroll do body quando o modal estiver aberto
  React.useEffect(() => {
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
    const totalPending = totalOriginal - totalReceived;

    let saleStatus = "pendente";
    if (totalReceived > 0 && totalPending > 0) {
      saleStatus = "parcial";
    } else if (totalPending <= 0.01 && totalReceived > 0) {
      saleStatus = "pago";
    }

    return {
      ...firstCollection,
      totalOriginal,
      totalReceived,
      totalPending,
      saleStatus,
      installmentsCount: collections.length,
      collections: collections.sort(
        (a, b) => (a.parcela || 0) - (b.parcela || 0),
      ),
    };
  }, [collections]);

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
      <div className="bg-white rounded-2xl shadow-xl max-w-5xl w-full max-h-[95vh] overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between bg-gradient-to-r from-blue-600 to-purple-600 text-white">
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
        <div className="p-6 overflow-y-auto max-h-[75vh]">
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
                <Phone className="h-5 w-5 mr-2 text-blue-600" />
                Contato e Endereço
              </h3>

              <div className="bg-gray-50 p-4 rounded-2xl space-y-4">
                <div>
                  <p className="text-sm font-medium text-gray-600 mb-2">
                    Cliente:
                  </p>
                  <p className="font-semibold text-gray-900">
                    {saleData.cliente}
                  </p>
                  <p className="text-sm text-gray-600">{saleData.documento}</p>
                </div>

                {(saleData.telefone || saleData.celular) && (
                  <div>
                    <p className="text-sm font-medium text-gray-600 mb-2">
                      Contatos:
                    </p>
                    <div className="space-y-2">
                      {saleData.telefone && (
                        <div className="flex items-center">
                          <Phone className="h-4 w-4 text-gray-400 mr-2" />
                          <span className="text-sm">{saleData.telefone}</span>
                        </div>
                      )}
                      {saleData.celular && (
                        <div className="flex items-center">
                          <MessageCircle className="h-4 w-4 text-gray-400 mr-2" />
                          <span className="text-sm">{saleData.celular}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                <div>
                  <p className="text-sm font-medium text-gray-600 mb-2">
                    Endereço:
                  </p>
                  <div className="flex items-start">
                    <MapPin className="h-4 w-4 text-gray-400 mr-2 mt-1 flex-shrink-0" />
                    <div className="text-sm">
                      <p>
                        {saleData.endereco}, {saleData.numero}
                      </p>
                      {saleData.complemento && <p>{saleData.complemento}</p>}
                      <p>
                        {saleData.bairro} - {saleData.cidade}/{saleData.estado}
                      </p>
                      <p>{saleData.cep}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Installments Details */}
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
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Parcela
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Vencimento
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Valor Original
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Valor Recebido
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Pendente
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {saleData.collections.map((collection, index) => {
                      const pending =
                        collection.valor_original - collection.valor_recebido;
                      let status = "pendente";
                      if (collection.valor_recebido > 0 && pending > 0) {
                        status = "parcial";
                      } else if (
                        pending <= 0.01 &&
                        collection.valor_recebido > 0
                      ) {
                        status = "pago";
                      }

                      return (
                        <tr
                          key={collection.id_parcela}
                          className={
                            index % 2 === 0 ? "bg-white" : "bg-gray-50"
                          }
                        >
                          <td className="px-4 py-3 text-sm font-medium text-gray-900">
                            {collection.parcela}° Parcela
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600">
                            {formatDate(collection.data_vencimento || "")}
                          </td>
                          <td className="px-4 py-3 text-sm font-semibold text-gray-900">
                            {formatCurrency(collection.valor_original)}
                          </td>
                          <td className="px-4 py-3 text-sm font-semibold text-green-600">
                            {formatCurrency(collection.valor_recebido)}
                          </td>
                          <td className="px-4 py-3 text-sm font-semibold text-orange-600">
                            {formatCurrency(pending)}
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                                status === "pago"
                                  ? "bg-green-100 text-green-800"
                                  : status === "parcial"
                                    ? "bg-yellow-100 text-yellow-800"
                                    : "bg-red-100 text-red-800"
                              }`}
                            >
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

          {/* Visit History */}
          {clientVisits.length > 0 && (
            <div className="mt-8 space-y-4">
              <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                <Clock className="h-5 w-5 mr-2 text-blue-600" />
                Histórico de Acompanhamento
              </h3>
              <div className="space-y-3">
                {clientVisits.map((visit) => (
                  <div
                    key={visit.id}
                    className="bg-gray-50 p-4 rounded-2xl border border-gray-200"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          {getStatusVisitBadge(visit.status)}
                          <span className="text-xs text-gray-500">
                            {formatVisitDate(visit.scheduledDate)}
                            {visit.scheduledTime &&
                              ` às ${visit.scheduledTime}`}
                          </span>
                        </div>

                        <div className="flex items-center text-sm text-gray-600 mb-2">
                          <User className="h-4 w-4 mr-1" />
                          <span className="font-medium">
                            {getCollectorName(visit.collectorId)}
                          </span>
                        </div>

                        {visit.notes && (
                          <div className="bg-white p-3 rounded-2xl border border-gray-200">
                            <p className="text-sm text-gray-700 leading-relaxed">
                              {visit.notes}
                            </p>
                          </div>
                        )}
                      </div>

                      <div className="flex items-center text-xs text-gray-400">
                        <Clock className="h-3 w-3 mr-1" />
                        {visit.updatedAt ? (
                          <>
                            Finalizada em{" "}
                            {formatVisitDate(visit.updatedAt.split("T")[0])}
                          </>
                        ) : (
                          <>
                            Registrada em{" "}
                            {formatVisitDate(visit.createdAt.split("T")[0])}
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Observations */}
          {saleData.obs && (
            <div className="mt-8 space-y-4">
              <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                <FileText className="h-5 w-5 mr-2 text-blue-600" />
                Observações da Venda
              </h3>
              <div className="bg-blue-50 p-4 rounded-2xl border border-blue-200">
                <p className="text-sm text-gray-700">{saleData.obs}</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SaleDetailsModal;
