import React, { useState, useMemo } from "react";
import {
  Eye,
  CheckCircle,
  Clock,
  AlertCircle,
  MapPin,
  User,
  Loader2,
  ChevronLeft,
  ChevronRight,
  DollarSign,
  TrendingUp,
  Filter,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Collection, ClientGroup, SaleGroup } from "../../types";
import { formatCurrency } from "../../utils/mockData";
import CollectionModal from "./CollectionModal";
import ClientDetailModal from "./ClientDetailModal";
import SaleDetailsModal from "./SaleDetailsModal";
import { useCollection } from "../../contexts/CollectionContext";

interface ClientGroupWithMapSales extends Omit<ClientGroup, "sales"> {
  sales: Map<string, SaleGroup>;
}

interface CollectionTableProps {
  collections: Collection[];
  userType: "manager" | "collector";
  showGrouped?: boolean;
  collectorId?: string;
}

const CollectionTable: React.FC<CollectionTableProps> = React.memo(
  ({ collections, userType, showGrouped = true, collectorId }) => {
    const { getClientGroups, loading } = useCollection();
    const [selectedCollection, setSelectedCollection] =
      useState<Collection | null>(null);
    const [selectedClientGroup, setSelectedClientGroup] =
      useState<ClientGroup | null>(null);
    const [selectedSale, setSelectedSale] = useState<Collection[]>([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isClientModalOpen, setIsClientModalOpen] = useState(false);
    const [isSaleModalOpen, setIsSaleModalOpen] = useState(false);

    // Paginação
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(10);

    // Estados para classificação
    const [sortField, setSortField] = useState<
      "cliente" | "valor" | "vencimento" | "status" | "cidade"
    >("vencimento");
    const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

    // Estados para filtros
    const [statusFilter, setStatusFilter] = useState<string>("");
    const [showFilters, setShowFilters] = useState(false);

    // Estado para controlar quais clientes estão expandidos
    const [expandedClients, setExpandedClients] = useState<Set<string>>(
      new Set(),
    );

    const handleSort = (field: typeof sortField) => {
      if (sortField === field) {
        setSortDirection(sortDirection === "asc" ? "desc" : "asc");
      } else {
        setSortField(field);
        setSortDirection("asc");
      }
    };

    const getSortIcon = (field: typeof sortField) => {
      if (sortField !== field) {
        return <ArrowUpDown className="h-4 w-4 text-gray-400" />;
      }
      return sortDirection === "asc" ? (
        <ArrowUp className="h-4 w-4 text-white" />
      ) : (
        <ArrowDown className="h-4 w-4 text-white" />
      );
    };

    const toggleClientExpansion = (clientDocument: string) => {
      const newExpanded = new Set(expandedClients);
      if (newExpanded.has(clientDocument)) {
        newExpanded.delete(clientDocument);
      } else {
        newExpanded.add(clientDocument);
      }
      setExpandedClients(newExpanded);
    };

    const expandAll = () => {
      const allClientDocuments = new Set(
        paginatedSalesGroups.map((group) => group.document),
      );
      setExpandedClients(allClientDocuments);
    };

    const collapseAll = () => {
      setExpandedClients(new Set());
    };

    const handleCloseModal = () => {
      setSelectedCollection(null);
      setIsModalOpen(false);
    };

    const handleViewClient = (clientGroup: ClientGroup) => {
      setSelectedClientGroup(clientGroup);
      setIsClientModalOpen(true);
    };

    const handleCloseClientModal = () => {
      setSelectedClientGroup(null);
      setIsClientModalOpen(false);
    };

    const getStatusIcon = (status: string | null) => {
      if (!status) return <Clock className="h-4 w-4 text-gray-600" />;

      switch (status.toLowerCase()) {
        case "recebido":
          return <CheckCircle className="h-4 w-4 text-green-600" />;
        case "pendente":
          return <Clock className="h-4 w-4 text-yellow-600" />;
        default:
          return <AlertCircle className="h-4 w-4 text-red-600" />;
      }
    };

    // Para gerentes, criar grupos de clientes baseados nas collections filtradas
    const clientGroups = useMemo(() => {
      if (userType === "manager") {
        const groupsMap = new Map<string, ClientGroupWithMapSales>();

        collections.forEach((collection) => {
          const key = (collection.documento || collection.cliente || "").trim();
          if (!key) return;

          if (!groupsMap.has(key)) {
            groupsMap.set(key, {
              clientId: key,
              client: collection.cliente || "Cliente não informado",
              document: collection.documento || "",
              phone: collection.telefone || "",
              mobile: collection.celular || "",
              address:
                `${collection.endereco || ""}, ${collection.numero || ""}`.trim(),
              number: collection.numero || "",
              neighborhood: collection.bairro || "",
              city: collection.cidade || "",
              state: collection.estado || "",
              totalValue: 0,
              totalReceived: 0,
              pendingValue: 0,
              sales: new Map<string, SaleGroup>(),
            });
          }

          const group = groupsMap.get(key)!;
          group.totalValue += collection.valor_original || 0;
          group.totalReceived += collection.valor_recebido || 0;
          group.pendingValue = parseFloat((group.totalValue - group.totalReceived).toFixed(2));

          const saleKey = `${collection.venda_n}-${collection.documento}`;
          if (!group.sales.has(saleKey)) {
            group.sales.set(saleKey, {
              saleNumber: collection.venda_n || 0,
              titleNumber: collection.numero_titulo || 0,
              description: collection.descricao || "",
              totalValue: 0,
              totalReceived: 0,
              pendingValue: 0,
              saleStatus: "pending" as const,
              payments: [],
              clientDocument: collection.documento || "",
              installments: [],
            });
          }

          const sale = group.sales.get(saleKey)!;
          sale.totalValue += collection.valor_original || 0;
          sale.totalReceived += collection.valor_recebido || 0;
          sale.pendingValue = sale.totalValue - sale.totalReceived;
          sale.installments.push(collection);

          if (sale.totalReceived === 0) {
            sale.saleStatus = "pending";
          } else if (sale.totalReceived >= sale.totalValue) {
            sale.saleStatus = "fully_paid";
          } else {
            sale.saleStatus = "partially_paid";
          }
        });

        return Array.from(groupsMap.values()).map((group) => ({
          ...group,
          sales: Array.from(group.sales.values()),
        })) as ClientGroup[];
      } else {
        return getClientGroups(collectorId);
      }
    }, [userType, collections, getClientGroups, collectorId]);

    const filteredClientGroups = useMemo(() => {
      if (!showGrouped) return [];
      const collectionIds = new Set(collections.map((c) => c.id_parcela));
      return clientGroups.filter((group) =>
        group.sales.some((sale) =>
          sale.installments.some((inst) => collectionIds.has(inst.id_parcela)),
        ),
      );
    }, [showGrouped, clientGroups, collections]);

    // Paginação para grupos de clientes
    const paginatedClientGroups = useMemo(() => {
      if (!showGrouped) return [];
      
      // Apply sorting before pagination
      let sortedGroups = [...filteredClientGroups];
      if (userType === "collector") {
        sortedGroups.sort((a, b) => {
          switch (sortField) {
            case "cliente":
              return sortDirection === "asc"
                ? a.client.localeCompare(b.client)
                : b.client.localeCompare(a.client);
            case "valor":
              return sortDirection === "asc"
                ? a.totalValue - b.totalValue
                : b.totalValue - a.totalValue;
            case "cidade":
              return sortDirection === "asc"
                ? a.city.localeCompare(b.city)
                : b.city.localeCompare(a.city);
            default:
              return 0;
          }
        });
      }
      
      const startIndex = (currentPage - 1) * itemsPerPage;
      const endIndex = startIndex + itemsPerPage;
      return sortedGroups.slice(startIndex, endIndex);
    }, [filteredClientGroups, currentPage, itemsPerPage, showGrouped, userType, sortField, sortDirection]);

    // Filtrar e agrupar sales por cliente (para view simples)
    const filteredAndGroupedSales = useMemo(() => {
      if (showGrouped) return [];

      let filteredGroups = clientGroups;
      if (userType === "collector" && statusFilter) {
        filteredGroups = clientGroups.filter((group) =>
          group.sales.some((sale) => {
            let saleRealStatus: string;
            if (sale.totalReceived > 0 && sale.pendingValue > 0) {
              saleRealStatus = "parcial";
            } else if (sale.pendingValue <= 0.01 && sale.totalReceived > 0) {
              saleRealStatus = "pago";
            } else {
              saleRealStatus = "pendente";
            }
            return saleRealStatus === statusFilter.toLowerCase();
          }),
        );
      }

      const simpleSalesGroups = filteredGroups.map((group) => ({
        client: group.client,
        document: group.document,
        cidade: group.city,
        bairro: group.neighborhood,
        sales: group.sales,
        totalValue: group.totalValue,
        totalReceived: group.totalReceived,
        pendingValue: group.pendingValue,
      }));

      simpleSalesGroups.sort((a, b) => {
        let aValue: string | number | undefined,
          bValue: string | number | undefined;

        switch (sortField) {
          case "cliente":
            aValue = a.client;
            bValue = b.client;
            break;
          case "valor":
            aValue = a.totalValue;
            bValue = b.totalValue;
            break;
          case "cidade":
            aValue = a.cidade;
            bValue = b.cidade;
            break;
          default:
            aValue = a.client;
            bValue = b.client;
            break;
        }

        if (typeof aValue === "string" && typeof bValue === "string") {
          const result = aValue.localeCompare(bValue);
          return sortDirection === "asc" ? result : -result;
        }

        if (aValue < bValue) return sortDirection === "asc" ? -1 : 1;
        if (aValue > bValue) return sortDirection === "asc" ? 1 : -1;
        return 0;
      });

      return simpleSalesGroups;
    }, [
      showGrouped,
      clientGroups,
      userType,
      statusFilter,
      sortField,
      sortDirection,
    ]);

    // Paginação para sales agrupadas por cliente
    const paginatedSalesGroups = useMemo(() => {
      if (showGrouped) return [];
      const startIndex = (currentPage - 1) * itemsPerPage;
      const endIndex = startIndex + itemsPerPage;
      return filteredAndGroupedSales.slice(startIndex, endIndex);
    }, [filteredAndGroupedSales, currentPage, itemsPerPage, showGrouped]);

    // Informações da paginação
    const totalItems = showGrouped
      ? filteredClientGroups.length
      : filteredAndGroupedSales.length;
    const totalPages = Math.ceil(totalItems / itemsPerPage);
    const startItem = totalItems > 0 ? (currentPage - 1) * itemsPerPage + 1 : 0;
    const endItem = Math.min(currentPage * itemsPerPage, totalItems);

    if (loading) {
      return (
        <div className="bg-white rounded-xl shadow-sm p-8">
          <div className="flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600 mr-3" />
            <span className="text-gray-600">Carregando dados...</span>
          </div>
        </div>
      );
    }

    if (showGrouped && filteredClientGroups.length > 0) {
      return (
        <>
          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            <div className="px-4 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">
                {userType === "manager"
                  ? "Clientes e Cobranças"
                  : "Meus Clientes"}
              </h2>
              <div className="flex justify-between items-center mt-1">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <p className="text-sm text-gray-600">
                    {filteredClientGroups.length} cliente
                    {filteredClientGroups.length !== 1 ? "s" : ""} com cobranças
                  </p>
                  <div className="flex items-center gap-4">
                    {totalPages > 1 && (
                      <p className="text-sm text-gray-500">
                        Mostrando {startItem} a {endItem} de {totalItems}
                      </p>
                    )}
                    <div className="flex items-center gap-2">
                      <label className="text-sm text-gray-600">
                        Por página:
                      </label>
                      <select
                        value={itemsPerPage}
                        onChange={(e) => {
                          setItemsPerPage(Number(e.target.value));
                          setCurrentPage(1);
                        }}
                        className="text-sm border border-gray-300 rounded px-2 py-1 focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                      >
                        <option value={10}>10</option>
                        <option value={20}>20</option>
                        <option value={50}>50</option>
                        <option value={100}>100</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Controles de Ordenação para Cobrador */}
            {userType === "collector" && (
              <div className="px-4 py-3 bg-gradient-to-r from-gray-50 to-blue-50 border-b border-gray-200">
                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                  <span className="text-sm font-semibold text-gray-700">
                    Ordenar por:
                  </span>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => handleSort("cliente")}
                      className={`flex items-center space-x-1 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                        sortField === "cliente"
                          ? "bg-blue-600 text-white shadow-md"
                          : "bg-white text-gray-600 hover:text-gray-900 border border-gray-300 hover:border-gray-400"
                      }`}
                    >
                      <span>Nome</span>
                      {getSortIcon("cliente")}
                    </button>
                    <button
                      onClick={() => handleSort("valor")}
                      className={`flex items-center space-x-1 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                        sortField === "valor"
                          ? "bg-blue-600 text-white shadow-md"
                          : "bg-white text-gray-600 hover:text-gray-900 border border-gray-300 hover:border-gray-400"
                      }`}
                    >
                      <span>Valor</span>
                      {getSortIcon("valor")}
                    </button>
                    <button
                      onClick={() => handleSort("cidade")}
                      className={`flex items-center space-x-1 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                        sortField === "cidade"
                          ? "bg-blue-600 text-white shadow-md"
                          : "bg-white text-gray-600 hover:text-gray-900 border border-gray-300 hover:border-gray-400"
                      }`}
                    >
                      <span>Cidade</span>
                      {getSortIcon("cidade")}
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div className="divide-y divide-gray-200">
              {paginatedClientGroups.map((clientGroup) => (
                <div key={clientGroup.clientId} className="bg-white">
                  <div
                    className="px-4 py-4 hover:bg-gray-50 cursor-pointer"
                    onClick={() => handleViewClient(clientGroup)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center flex-1 min-w-0">
                        <div className="flex-shrink-0 mr-3">
                          <User className="h-5 w-5 text-blue-600" />
                        </div>

                        <div className="flex-1 min-w-0">
                          <h3 className="text-base font-medium text-gray-900 truncate">
                            {clientGroup.client}
                          </h3>
                          <p className="text-sm text-gray-500 truncate">
                            {clientGroup.document}
                          </p>
                          <div className="flex items-center text-xs text-gray-500 mt-1">
                            <MapPin className="h-3 w-3 mr-1" />
                            <span className="truncate">
                              {clientGroup.neighborhood}, {clientGroup.city}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex-shrink-0 text-right">
                        <div className="text-sm font-medium text-gray-900">
                          {formatCurrency(clientGroup.totalValue)}
                        </div>
                        <div className="text-xs text-gray-500">
                          {clientGroup.sales.length} venda
                          {clientGroup.sales.length !== 1 ? "s" : ""}
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      {clientGroup.totalReceived > 0 && (
                        <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">
                          {formatCurrency(clientGroup.totalReceived)} recebido
                        </span>
                      )}
                      {clientGroup.pendingValue > 0.01 && (
                        <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-red-100 text-red-800">
                          {formatCurrency(clientGroup.pendingValue)} pendente
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {filteredClientGroups.length === 0 && (
              <div className="py-12 text-center">
                <div className="text-gray-500">
                  <Clock className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Nenhuma cobrança encontrada</p>
                </div>
              </div>
            )}
          </div>

          {/* Controles de Paginação */}
          {totalPages > 1 && (
            <div className="bg-gradient-to-r from-purple-600 to-indigo-600 px-4 sm:px-6 py-4 rounded-b-xl">
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="text-sm text-white text-center sm:text-left">
                  <span className="font-semibold">Página {currentPage}</span> de{" "}
                  <span className="font-semibold">{totalPages}</span>
                  <span className="hidden sm:inline text-purple-100 ml-2">
                    • {totalItems} clientes total
                  </span>
                  <div className="sm:hidden text-xs text-purple-100 mt-1">
                    {totalItems} clientes total
                  </div>
                </div>

                <div className="flex items-center space-x-1 sm:space-x-2">
                  {/* Botão Início */}
                  <button
                    onClick={() => setCurrentPage(1)}
                    disabled={currentPage === 1}
                    className="flex items-center px-2 sm:px-3 py-2 border border-white border-opacity-30 rounded-lg text-sm font-medium text-white bg-white bg-opacity-10 hover:bg-opacity-20 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
                  >
                    <span className="text-xs">Início</span>
                  </button>

                  {/* Botão Anterior */}
                  <button
                    onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                    disabled={currentPage === 1}
                    className="flex items-center px-2 sm:px-3 py-2 border border-white border-opacity-30 rounded-lg text-sm font-medium text-white bg-white bg-opacity-10 hover:bg-opacity-20 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
                  >
                    <ChevronLeft className="h-4 w-4 sm:mr-1" />
                    <span className="hidden sm:inline">Anterior</span>
                  </button>

                  {/* Números das páginas */}
                  <div className="flex space-x-1">
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                      let pageNum;
                      if (totalPages <= 5) {
                        pageNum = i + 1;
                      } else if (currentPage <= 3) {
                        pageNum = i + 1;
                      } else if (currentPage >= totalPages - 2) {
                        pageNum = totalPages - 4 + i;
                      } else {
                        pageNum = currentPage - 2 + i;
                      }

                      return (
                        <button
                          key={pageNum}
                          onClick={() => setCurrentPage(pageNum)}
                          className={`px-2 sm:px-3 py-2 text-sm font-semibold rounded-lg transition-all duration-200 ${
                            pageNum === currentPage
                              ? "bg-white text-purple-600 shadow-lg transform scale-105"
                              : "text-white bg-white bg-opacity-10 border border-white border-opacity-30 hover:bg-opacity-20"
                          }`}
                        >
                          {pageNum}
                        </button>
                      );
                    })}
                  </div>

                  {/* Botão Próxima */}
                  <button
                    onClick={() =>
                      setCurrentPage(Math.min(totalPages, currentPage + 1))
                    }
                    disabled={currentPage === totalPages}
                    className="flex items-center px-2 sm:px-3 py-2 border border-white border-opacity-30 rounded-lg text-sm font-medium text-white bg-white bg-opacity-10 hover:bg-opacity-20 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
                  >
                    <span className="hidden sm:inline">Próxima</span>
                    <ChevronRight className="h-4 w-4 sm:ml-1" />
                  </button>

                  {/* Botão Fim */}
                  <button
                    onClick={() => setCurrentPage(totalPages)}
                    disabled={currentPage === totalPages}
                    className="flex items-center px-2 sm:px-3 py-2 border border-white border-opacity-30 rounded-lg text-sm font-medium text-white bg-white bg-opacity-10 hover:bg-opacity-20 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
                  >
                    <span className="text-xs">Fim</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Collection Modal */}
          {isModalOpen && selectedCollection && (
            <CollectionModal
              collection={selectedCollection}
              userType={userType}
              onClose={handleCloseModal}
            />
          )}

          {/* Client Detail Modal */}
          {isClientModalOpen && selectedClientGroup && (
            <ClientDetailModal
              clientGroup={selectedClientGroup}
              userType={userType}
              onClose={handleCloseClientModal}
            />
          )}

          {/* Sale Details Modal */}
          {isSaleModalOpen && selectedSale.length > 0 && (
            <SaleDetailsModal
              collections={selectedSale}
              onClose={() => {
                setSelectedSale([]);
                setIsSaleModalOpen(false);
              }}
            />
          )}
        </>
      );
    }

    // Fallback to simple list view
    return (
      <>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200">
          <div className="px-4 sm:px-6 py-4 sm:py-6 border-b border-gray-200">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h2 className="text-xl sm:text-2xl font-bold text-gray-900 flex items-center">
                  <DollarSign className="h-6 w-6 sm:h-7 sm:w-7 text-blue-600 mr-3" />
                  {userType === "manager"
                    ? "Todas as Cobranças"
                    : "Minha Carteira"}
                </h2>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mt-1">
                  <p className="text-sm sm:text-base text-gray-600">
                    {filteredAndGroupedSales.length} cliente
                    {filteredAndGroupedSales.length !== 1 ? "s" : ""} com vendas
                  </p>
                  <div className="flex items-center gap-4">
                    {totalPages > 1 && (
                      <p className="text-sm text-gray-500">
                        Mostrando {startItem}-{endItem} de {totalItems}
                      </p>
                    )}
                    <div className="flex items-center gap-2">
                      <label className="text-sm text-gray-600">
                        Por página:
                      </label>
                      <select
                        value={itemsPerPage}
                        onChange={(e) => {
                          setItemsPerPage(Number(e.target.value));
                          setCurrentPage(1);
                        }}
                        className="text-sm border border-gray-300 rounded px-2 py-1 focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                      >
                        <option value={10}>10</option>
                        <option value={20}>20</option>
                        <option value={50}>50</option>
                        <option value={100}>100</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>

              {userType === "collector" && (
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setShowFilters(!showFilters)}
                    className={`flex items-center px-4 py-2 rounded-lg font-medium text-sm transition-all duration-200 ${
                      showFilters
                        ? "bg-blue-600 text-white shadow-md hover:bg-blue-700"
                        : "bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-200"
                    }`}
                  >
                    <Filter className="h-4 w-4 mr-2" />
                    Filtros
                  </button>
                </div>
              )}
            </div>

            {/* Filtros */}
            {userType === "collector" && showFilters && (
              <div className="mt-6 p-4 bg-gradient-to-r from-gray-50 to-blue-50 rounded-lg border border-gray-200 animate-in slide-in-from-top-2 duration-200">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Status da Cobrança
                    </label>
                    <select
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value)}
                      className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white shadow-sm transition-all duration-200 hover:border-gray-400"
                    >
                      <option value="">Todos os status</option>
                      <option value="pendente">Pendente</option>
                      <option value="pago">Pago</option>
                      <option value="parcial">Parcial</option>
                    </select>
                  </div>
                  {statusFilter && (
                    <div className="flex items-end">
                      <button
                        onClick={() => setStatusFilter("")}
                        className="px-3 py-2.5 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors text-sm font-medium"
                      >
                        Limpar filtro
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {totalPages > 1 && (
              <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mt-4 p-4 bg-gradient-to-r from-purple-50 to-indigo-50 rounded-lg border border-purple-200">
                <div className="flex items-center gap-4">
                  <span className="text-sm text-gray-600 font-medium">
                    Mostrando{" "}
                    <span className="text-purple-600 font-bold">
                      {startItem}
                    </span>{" "}
                    a{" "}
                    <span className="text-purple-600 font-bold">{endItem}</span>{" "}
                    de{" "}
                    <span className="text-purple-600 font-bold">
                      {totalItems}
                    </span>{" "}
                    clientes
                  </span>
                  <div className="flex items-center space-x-2 text-sm text-gray-500">
                    <TrendingUp className="h-4 w-4 text-purple-500" />
                    <span>
                      Página{" "}
                      <span className="font-semibold text-gray-700">
                        {currentPage}
                      </span>{" "}
                      de{" "}
                      <span className="font-semibold text-gray-700">
                        {totalPages}
                      </span>
                    </span>
                  </div>
                </div>

                {/* Navegação rápida */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCurrentPage(1)}
                    disabled={currentPage === 1}
                    className="px-3 py-1.5 text-sm bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Início
                  </button>
                  <button
                    onClick={() => setCurrentPage(totalPages)}
                    disabled={currentPage === totalPages}
                    className="px-3 py-1.5 text-sm bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Fim
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Controles de Ordenação e Expansão */}
          <div className="px-4 sm:px-6 py-4 bg-gradient-to-r from-gray-50 to-blue-50 border-b border-gray-200">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <span className="text-sm font-semibold text-gray-700">
                  Ordenar por:
                </span>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => handleSort("cliente")}
                    className={`flex items-center space-x-1 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                      sortField === "cliente"
                        ? "bg-blue-600 text-white shadow-md"
                        : "bg-white text-gray-600 hover:text-gray-900 border border-gray-300 hover:border-gray-400"
                    }`}
                  >
                    <span>Cliente</span>
                    {getSortIcon("cliente")}
                  </button>
                  <button
                    onClick={() => handleSort("valor")}
                    className={`flex items-center space-x-1 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                      sortField === "valor"
                        ? "bg-blue-600 text-white shadow-md"
                        : "bg-white text-gray-600 hover:text-gray-900 border border-gray-300 hover:border-gray-400"
                    }`}
                  >
                    <span>Valor Total</span>
                    {getSortIcon("valor")}
                  </button>
                  <button
                    onClick={() => handleSort("cidade")}
                    className={`flex items-center space-x-1 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                      sortField === "cidade"
                        ? "bg-blue-600 text-white shadow-md"
                        : "bg-white text-gray-600 hover:text-gray-900 border border-gray-300 hover:border-gray-400"
                    }`}
                  >
                    <span>Cidade</span>
                    {getSortIcon("cidade")}
                  </button>
                </div>
              </div>

              {userType === "manager" ? (
                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                  <span className="text-sm font-semibold text-gray-700">
                    Vendas:
                  </span>
                  <div className="flex gap-2">
                    <button
                      onClick={expandAll}
                      className="flex items-center px-3 py-2 bg-green-100 text-green-700 rounded-lg hover:bg-green-200 transition-all duration-200 text-sm font-medium shadow-sm"
                    >
                      <ChevronDown className="h-4 w-4 mr-1" />
                      <span className="hidden sm:inline">Expandir Todas</span>
                      <span className="sm:hidden">Expandir</span>
                    </button>
                    <button
                      onClick={collapseAll}
                      className="flex items-center px-3 py-2 bg-orange-100 text-orange-700 rounded-lg hover:bg-orange-200 transition-all duration-200 text-sm font-medium shadow-sm"
                    >
                      <ChevronUp className="h-4 w-4 mr-1" />
                      <span className="hidden sm:inline">Retrair Todas</span>
                      <span className="sm:hidden">Retrair</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                  <span className="text-sm font-semibold text-gray-700">
                    Vendas:
                  </span>
                  <div className="flex gap-2">
                    <button
                      onClick={expandAll}
                      className="flex items-center px-3 py-2 bg-green-100 text-green-700 rounded-lg hover:bg-green-200 transition-all duration-200 text-sm font-medium shadow-sm"
                    >
                      <ChevronDown className="h-4 w-4 mr-1" />
                      <span className="hidden sm:inline">Expandir</span>
                      <span className="sm:hidden">Exp.</span>
                    </button>
                    <button
                      onClick={collapseAll}
                      className="flex items-center px-3 py-2 bg-orange-100 text-orange-700 rounded-lg hover:bg-orange-200 transition-all duration-200 text-sm font-medium shadow-sm"
                    >
                      <ChevronUp className="h-4 w-4 mr-1" />
                      <span className="hidden sm:inline">Retrair</span>
                      <span className="sm:hidden">Ret.</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Lista de Clientes Agrupados */}
          <div className="divide-y divide-gray-100">
            {paginatedSalesGroups.map((clientGroup) => (
              <div
                key={clientGroup.document}
                className="bg-white hover:shadow-sm transition-all duration-200"
              >
                {/* Cabeçalho do Cliente */}
                <div
                  className="px-4 sm:px-6 py-4 sm:py-5 bg-gradient-to-r from-gray-50 to-blue-50 cursor-pointer hover:from-gray-100 hover:to-blue-100 transition-all duration-200 border-l-4 border-transparent hover:border-blue-400"
                  onClick={() => toggleClientExpansion(clientGroup.document)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center flex-1 min-w-0">
                      <div className="flex-shrink-0 mr-3">
                        <button className="p-1 rounded-full bg-white shadow-sm hover:shadow-md transition-all duration-200 border border-gray-200">
                          {expandedClients.has(clientGroup.document) ? (
                            <ChevronUp className="h-4 w-4 text-blue-600" />
                          ) : (
                            <ChevronDown className="h-4 w-4 text-blue-600" />
                          )}
                        </button>
                      </div>

                      <div className="flex-shrink-0 mr-3">
                        <div className="p-2 bg-blue-100 rounded-full">
                          <User className="h-5 w-5 text-blue-600" />
                        </div>
                      </div>

                      <div className="flex-1 min-w-0">
                        <h3 className="text-lg font-bold text-gray-900 truncate">
                          {clientGroup.client}
                        </h3>
                        <p className="text-sm text-gray-600 truncate font-mono bg-gray-100 px-2 py-1 rounded mt-1 inline-block">
                          {clientGroup.document}
                        </p>
                        <div className="flex items-center text-xs text-gray-500 mt-2">
                          <MapPin className="h-3 w-3 mr-1 text-gray-400" />
                          <span className="truncate">
                            {clientGroup.bairro}, {clientGroup.cidade}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex-shrink-0 text-right">
                      <div className="text-xl font-bold text-gray-900">
                        {formatCurrency(clientGroup.totalValue)}
                      </div>
                      <div className="text-sm text-gray-600 mt-1">
                        {clientGroup.sales.length} venda
                        {clientGroup.sales.length !== 1 ? "s" : ""}
                      </div>
                      <div className="flex flex-col sm:flex-row justify-end gap-1 sm:gap-2 mt-3">
                        {clientGroup.totalReceived > 0 && (
                          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-800 shadow-sm">
                            {formatCurrency(clientGroup.totalReceived)} recebido
                          </span>
                        )}
                        {clientGroup.pendingValue > 0 && (
                          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-800 shadow-sm">
                            {formatCurrency(clientGroup.pendingValue)} pendente
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Lista de Vendas do Cliente - Condicional */}
                {expandedClients.has(clientGroup.document) && (
                  <div className="px-4 sm:px-6 py-4 border-t border-gray-200 bg-gray-50 animate-in slide-in-from-top-2 duration-200">
                    <div className="space-y-3">
                      {clientGroup.sales.map((sale: SaleGroup) => {
                        // Determinar o status real da venda baseado nos valores
                        let displayStatus: string;
                        let statusColor: string;

                        if (sale.totalReceived > 0 && sale.pendingValue > 0) {
                          displayStatus = "Parcial";
                          statusColor = "bg-yellow-100 text-yellow-800";
                        } else if (sale.pendingValue <= 0.01) {
                          displayStatus = "Quitado";
                          statusColor = "bg-green-100 text-green-800";
                        } else {
                          displayStatus = "Pendente";
                          statusColor = "bg-red-100 text-red-800";
                        }

                        return (
                          <div
                            key={sale.saleNumber}
                            className="group flex flex-col lg:flex-row lg:items-center lg:justify-between p-5 bg-gradient-to-r from-white to-gray-50 rounded-xl border border-gray-200 hover:border-blue-400 hover:shadow-xl hover:shadow-blue-100/50 transition-all duration-300 hover:scale-[1.02] hover:bg-gradient-to-r hover:from-blue-50 hover:to-indigo-50"
                          >
                            <div className="flex flex-col sm:flex-row sm:items-center space-y-2 sm:space-y-0 sm:space-x-6 flex-1">
                              <div className="flex-shrink-0 min-w-0">
                                <div className="text-sm font-bold text-gray-900 group-hover:text-blue-900 transition-colors">
                                  Venda #{sale.saleNumber}
                                </div>
                                <div className="text-xs text-gray-500 mt-1 group-hover:text-blue-600 transition-colors">
                                  {sale.installments.length} parcela
                                  {sale.installments.length !== 1 ? "s" : ""}
                                </div>
                              </div>

                              <div className="flex-shrink-0 text-center">
                                <div className="text-sm font-bold text-gray-900 group-hover:text-gray-800 transition-colors">
                                  {formatCurrency(sale.totalValue)}
                                </div>
                                <div className="text-xs text-gray-500 mt-1 group-hover:text-gray-600">
                                  Valor Total
                                </div>
                              </div>

                              {sale.totalReceived > 0 && (
                                <div className="flex-shrink-0 text-center">
                                  <div className="text-sm font-bold text-green-600 group-hover:text-green-700 transition-colors">
                                    {formatCurrency(sale.totalReceived)}
                                  </div>
                                  <div className="text-xs text-green-500 mt-1 group-hover:text-green-600">
                                    Recebido
                                  </div>
                                </div>
                              )}

                              <div className="flex-shrink-0 text-center">
                                <div
                                  className={`text-sm font-bold transition-colors ${
                                    sale.pendingValue > 0
                                      ? "text-red-600 group-hover:text-red-700"
                                      : "text-green-600 group-hover:text-green-700"
                                  }`}
                                >
                                  {sale.pendingValue > 0
                                    ? formatCurrency(sale.pendingValue)
                                    : "Quitado"}
                                </div>
                                <div
                                  className={`text-xs mt-1 transition-colors ${
                                    sale.pendingValue > 0
                                      ? "text-red-500 group-hover:text-red-600"
                                      : "text-green-500 group-hover:text-green-600"
                                  }`}
                                >
                                  {sale.pendingValue > 0
                                    ? "Pendente"
                                    : "Finalizado"}
                                </div>
                              </div>

                              <div className="flex-shrink-0">
                                <div className="flex items-center justify-center">
                                  <div className="mr-2 group-hover:scale-110 transition-transform">
                                    {getStatusIcon(
                                      displayStatus === "Quitado"
                                        ? "recebido"
                                        : "pendente",
                                    )}
                                  </div>
                                  <span
                                    className={`inline-flex px-4 py-2 text-xs font-bold rounded-full shadow-md group-hover:shadow-lg transition-all duration-200 ${statusColor} group-hover:scale-105`}
                                  >
                                    {displayStatus}
                                  </span>
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center justify-end space-x-2 mt-3 lg:mt-0">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  // Pegar todas as parcelas da venda
                                  const saleCollections = sale.installments
                                    .map((inst: Collection) =>
                                      collections.find(
                                        (c: Collection) =>
                                          c.id_parcela === inst.id_parcela,
                                      ),
                                    )
                                    .filter(
                                      (c: Collection | undefined) =>
                                        c !== undefined,
                                    ) as Collection[];

                                  if (saleCollections.length > 0) {
                                    setSelectedSale(saleCollections);
                                    setIsSaleModalOpen(true);
                                  }
                                }}
                                className="flex items-center px-4 py-2.5 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-lg hover:from-blue-600 hover:to-blue-700 hover:shadow-lg hover:shadow-blue-200 transition-all duration-200 text-sm font-semibold transform hover:scale-105"
                                title="Ver detalhes da venda"
                              >
                                <Eye className="h-4 w-4 mr-1" />
                                <span className="hidden sm:inline">
                                  Ver Venda
                                </span>
                              </button>
                              {userType === "collector" && (
                                <>
                                  {/* Phone actions removed - client data structure doesn't include phone/mobile */}
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      // Convert to ClientGroup format for modal
                                      const clientGroupForModal =
                                        clientGroups.find(
                                          (cg) =>
                                            cg.document ===
                                            clientGroup.document,
                                        );
                                      if (clientGroupForModal) {
                                        handleViewClient(clientGroupForModal);
                                      }
                                    }}
                                    className="flex items-center px-4 py-2.5 bg-gradient-to-r from-purple-500 to-purple-600 text-white rounded-lg hover:from-purple-600 hover:to-purple-700 hover:shadow-lg hover:shadow-purple-200 transition-all duration-200 text-sm font-semibold transform hover:scale-105"
                                    title="Gerenciar pagamentos"
                                  >
                                    <DollarSign className="h-4 w-4 mr-1" />
                                    <span className="hidden sm:inline">
                                      Pagar
                                    </span>
                                  </button>
                                </>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          {filteredAndGroupedSales.length === 0 && (
            <div className="py-16 text-center">
              <div className="text-gray-500">
                <div className="mx-auto w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mb-6">
                  <Clock className="h-8 w-8 text-gray-400" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  Nenhum cliente com vendas encontrado
                </h3>
                <p className="text-gray-600 max-w-md mx-auto">
                  {userType === "collector" && statusFilter
                    ? "Tente ajustar os filtros para ver mais resultados."
                    : "Não há clientes com vendas disponíveis no momento."}
                </p>
                {userType === "collector" && statusFilter && (
                  <button
                    onClick={() => setStatusFilter("")}
                    className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
                  >
                    Limpar filtros
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Controles de Paginação */}
        {totalPages > 1 && (
          <div className="bg-gradient-to-r from-purple-600 to-indigo-600 border-t border-gray-200 px-4 sm:px-6 py-4 rounded-b-xl">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="text-sm text-white text-center sm:text-left">
                <span className="font-semibold">Página {currentPage}</span> de{" "}
                <span className="font-semibold">{totalPages}</span>
                <span className="hidden sm:inline text-purple-100">
                  {" "}
                  • {totalItems} clientes total
                </span>
                <div className="sm:hidden text-xs text-purple-100 mt-1">
                  {totalItems} clientes total
                </div>
              </div>

              <div className="flex items-center space-x-1 sm:space-x-2">
                {/* Botão Início */}
                <button
                  onClick={() => setCurrentPage(1)}
                  disabled={currentPage === 1}
                  className="flex items-center px-2 sm:px-3 py-2 border border-white border-opacity-30 rounded-lg text-sm font-medium text-white bg-white bg-opacity-10 hover:bg-opacity-20 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
                >
                  <span className="text-xs">Início</span>
                </button>

                {/* Botão Anterior */}
                <button
                  onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                  disabled={currentPage === 1}
                  className="flex items-center px-2 sm:px-3 py-2 border border-white border-opacity-30 rounded-lg text-sm font-medium text-white bg-white bg-opacity-10 hover:bg-opacity-20 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
                >
                  <ChevronLeft className="h-4 w-4 sm:mr-1" />
                  <span className="hidden sm:inline">Anterior</span>
                </button>

                {/* Números das páginas */}
                <div className="flex space-x-1">
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    let pageNum;
                    if (totalPages <= 5) {
                      pageNum = i + 1;
                    } else if (currentPage <= 3) {
                      pageNum = i + 1;
                    } else if (currentPage >= totalPages - 2) {
                      pageNum = totalPages - 4 + i;
                    } else {
                      pageNum = currentPage - 2 + i;
                    }

                    return (
                      <button
                        key={pageNum}
                        onClick={() => setCurrentPage(pageNum)}
                        className={`px-2 sm:px-3 py-2 text-sm font-semibold rounded-lg transition-all duration-200 ${
                          pageNum === currentPage
                            ? "bg-white text-purple-600 shadow-lg transform scale-105"
                            : "text-white bg-white bg-opacity-10 border border-white border-opacity-30 hover:bg-opacity-20"
                        }`}
                      >
                        {pageNum}
                      </button>
                    );
                  })}
                </div>

                {/* Botão Próxima */}
                <button
                  onClick={() =>
                    setCurrentPage(Math.min(totalPages, currentPage + 1))
                  }
                  disabled={currentPage === totalPages}
                  className="flex items-center px-2 sm:px-3 py-2 border border-white border-opacity-30 rounded-lg text-sm font-medium text-white bg-white bg-opacity-10 hover:bg-opacity-20 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
                >
                  <span className="hidden sm:inline">Próxima</span>
                  <ChevronRight className="h-4 w-4 sm:ml-1" />
                </button>

                {/* Botão Fim */}
                <button
                  onClick={() => setCurrentPage(totalPages)}
                  disabled={currentPage === totalPages}
                  className="flex items-center px-2 sm:px-3 py-2 border border-white border-opacity-30 rounded-lg text-sm font-medium text-white bg-white bg-opacity-10 hover:bg-opacity-20 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
                >
                  <span className="text-xs">Fim</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Collection Modal */}
        {isModalOpen && selectedCollection && (
          <CollectionModal
            collection={selectedCollection}
            userType={userType}
            onClose={handleCloseModal}
          />
        )}

        {/* Sale Details Modal */}
        {isSaleModalOpen && selectedSale.length > 0 && (
          <SaleDetailsModal
            collections={selectedSale}
            onClose={() => {
              setSelectedSale([]);
              setIsSaleModalOpen(false);
            }}
          />
        )}
      </>
    );
  },
);

export default CollectionTable;
