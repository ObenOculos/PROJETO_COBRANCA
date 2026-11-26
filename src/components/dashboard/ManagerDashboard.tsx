import React, { useState, useRef, useEffect, useMemo } from "react";
import {
  CalendarClock,
  ClipboardList,
  DollarSign,
  FileText,
  Filter,
  Scale,
  Search,
  Shuffle,
  UserStar,
  Users,
  CloudUpload,
  FileSignature,
} from "lucide-react";
import FilterBar from "../common/FilterBar";
import { CollectionTable } from "./CollectionTable";
import UserManagement from "./UserManagement";
import DatabaseUpload from "../admin/DatabaseUpload";
import { ClientAssignment } from "../ClientAssignment";
import VisitTracking from "./VisitTracking";
import CollectorsSummary from "./CollectorsSummary";
import AcompanhamentoInadimplencia from "./AcompanhamentoInadimplencia";
import CabecalhoResumoGeral, {
  AbaResumoGeral,
  lerAbaResumoGeral,
  salvarAbaResumoGeral,
} from "./CabecalhoResumoGeral";
import ConferenciaRecebimentos from "./ConferenciaRecebimentos";
import DailyCashReport from "./DailyCashReport";
import AbaPedidosGestor from "./AbaPedidosGestor";
import AcordoConfiguracaoPadrao from "./AcordoConfiguracaoPadrao";
import CarteiraDistribuicao from "./CarteiraDistribuicao";
import TabTransition from "../common/TabTransition";
import { useCollection } from "../../contexts/CollectionContext";
import { FilterOptions } from "../../types";
import { CollectionTableRef } from "./CollectionTable";
import VendasAguardandoConferencia from "./VendasAguardandoConferencia";
import { Notification } from "../../contexts/NotificationContext";

// O gestor carrega por padrao so os clientes com algo em aberto (metade das
// linhas). Estas telas somam recebimentos de clientes JA QUITADOS — inclusive
// quem quitou no mes corrente — entao precisam do complemento tambem, pedido
// sob demanda por ensureSettledCollections (migration 20261029000003:
// banco_dados_clientes_ativos + banco_dados_clientes_quitados particionam
// BANCO_DADOS exatamente, entao o resultado e identico ao escopo "all", so
// que em duas buscas menores em vez de uma varredura da tabela inteira).
const TABS_NEEDING_FULL_SCOPE = new Set(["clients", "collectors-summary"]);

// Telas que dependem das cobrancas mas nao tem uma consulta propria: como o
// gestor nao carrega mais nada no login, elas precisam pedir os dados ao abrir.
// A Cobranca fica DE FORA de proposito — e justamente onde o gestor escolhe o
// que consultar. (Desempenho/Lojas/Clientes ja se resolvem pelo full scope.)
// "authorization" (Correções, item 62) tem consulta propria: nao carrega.
const TABS_AUTOLOADING_COLLECTIONS = new Set(["visit-tracking"]);

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
    ensureSettledCollections,
    loadingSettledCollections,
    loadingFullScope,
    collectionsRequested,
    requestCollections,
    loading,
    getPendingCancellationRequests,
  } = useCollection();

  const [internalActiveTab, setInternalActiveTab] = useState<
    | "collections"
    | "collectors-summary"
    | "users"
    | "clients"
    | "visit-tracking"
    | "authorization"
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
  // Abas da pagina Cobradores (reuniao 16/11, itens 3/7/12): Resumo por
  // Cobrador, Acompanhamento de Visitas e Conferencia de recebimentos.
  type SummaryView = "resumo" | "acompanhamento" | "conferencia";
  const [summaryView, setSummaryView] = useState<SummaryView>(() => {
    try {
      const saved = localStorage.getItem("managerSummaryView");
      return saved === "conferencia" || saved === "acompanhamento"
        ? saved
        : "resumo";
    } catch {
      return "resumo";
    }
  });
  // Aba do Resumo Geral (Geral / Por cobrador / Por loja / Inadimplencia),
  // aqui em cima para decidir se precisa da carga completa.
  const [resumoAba, setResumoAba] = useState<AbaResumoGeral>(lerAbaResumoGeral);
  // 26/11: depois da 1a vez, o Resumo (CollectorsSummary) fica montado e so
  // e escondido ao ir para Visitas, Conferencia ou a aba Inadimplencia. Antes
  // ele era desmontado e, na volta, refazia todas as contas sobre a base
  // inteira (~3 s de tela travada a cada volta).
  const [resumoMontado, setResumoMontado] = useState(false);
  const mudarResumoAba = (aba: AbaResumoGeral) => {
    setResumoAba(aba);
    salvarAbaResumoGeral(aba);
  };
  const changeSummaryView = (v: SummaryView) => {
    setSummaryView(v);
    try {
      localStorage.setItem("managerSummaryView", v);
    } catch {
      // sem storage: so nao lembra a aba
    }
  };
  const [collectionsView, setCollectionsView] = useState<
    "table" | "cash-report"
  >(() => {
    const saved = localStorage.getItem("managerCollectionsView");
    return (saved as "table" | "cash-report") || "table";
  });

  const [isFilterVisible, setIsFilterVisible] = useState(false);

  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const mobileMenuRef = useRef<HTMLDivElement>(null);
  const collectionTableRef = useRef<CollectionTableRef>(null);

  // Preset da Atribuicao vindo de notificacao; o nonce remonta a tela para
  // o filtro valer mesmo se ela ja estiver aberta.
  const [assignmentPreset, setAssignmentPreset] = useState<{
    status: "without_collector";
    nonce: number;
  } | null>(null);

  // Abas da pagina Atribuicao (reuniao 16/11, itens 5/6).
  type AtribuicaoView = "manual" | "automatica";
  const [atribuicaoView, setAtribuicaoView] = useState<AtribuicaoView>(() => {
    try {
      return localStorage.getItem("managerAtribuicaoView") === "automatica"
        ? "automatica"
        : "manual";
    } catch {
      return "manual";
    }
  });
  const changeAtribuicaoView = (v: AtribuicaoView) => {
    setAtribuicaoView(v);
    try {
      localStorage.setItem("managerAtribuicaoView", v);
    } catch {
      // sem storage: so nao lembra a aba
    }
  };

  // Abas de Configuracoes Gerais (reuniao 16/11, item 9).
  type ConfigView = "usuarios" | "acordos" | "upload";
  const [configView, setConfigView] = useState<ConfigView>(() => {
    try {
      const saved = localStorage.getItem("managerConfigView");
      return saved === "acordos" || saved === "upload" ? saved : "usuarios";
    } catch {
      return "usuarios";
    }
  });
  const changeConfigView = (v: ConfigView) => {
    setConfigView(v);
    try {
      localStorage.setItem("managerConfigView", v);
    } catch {
      // sem storage: so nao lembra a aba
    }
  };

  const handleNotificationClick = (notification: Notification) => {
    // A aba ja foi trocada pelo App; aqui so os filtros da tela de destino.
    const destino = notification.destino;
    if (destino) {
      if (destino.filtros) {
        setFilters(destino.filtros);
        setIsFilterVisible(true);
      }
      if (destino.aba === "collections") {
        setCollectionsView(destino.visao ?? "table");
        void requestCollections();
      }
      if (destino.cobradores) changeSummaryView(destino.cobradores);
      if (destino.atribuicao) {
        setAssignmentPreset({ status: destino.atribuicao, nonce: Date.now() });
        changeAtribuicaoView("manual");
      }
      return;
    }

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

  // O listener e registrado uma vez; o ref aponta sempre para o handler atual
  // (requestCollections e os setters mudam a cada render).
  const notificationHandlerRef = useRef(handleNotificationClick);
  notificationHandlerRef.current = handleNotificationClick;

  useEffect(() => {
    const listener = (e: Event) => {
      const customEvent = e as CustomEvent;
      notificationHandlerRef.current(customEvent.detail);
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

  // Filtrar Cobrancas por "Pago" busca justamente os clientes 100% quitados, que
  // sao os que o escopo padrao exclui — sem promover, a categoria vem vazia.
  // (getClientPaymentStatus so classifica como "pago" quem nao deve mais nada.)
  const filterWantsSettledClients = (() => {
    const status = filters.status;
    if (!status) return false;
    return Array.isArray(status) ? status.includes("pago") : status === "pago";
  })();

  // O Relatorio do Caixa vive dentro da aba de cobrancas, mas soma recebimentos
  // do dia — inclui clientes que quitaram tudo. Entra na mesma regra.
  // A aba Automatica da Atribuicao (CarteiraDistribuicao) tem consulta
  // propria e nao usa os titulos: nao dispara a carga completa.
  // A aba Inadimplencia do Resumo Geral tem consulta propria (RPC
  // inadimplencia_historico): nao baixa a base inteira (egress, 25/11).
  const tabNeedsFullScope =
    TABS_NEEDING_FULL_SCOPE.has(activeTab) &&
    !(activeTab === "clients" && atribuicaoView === "automatica") &&
    !(
      activeTab === "collectors-summary" &&
      summaryView === "resumo" &&
      resumoAba === "inadimplencia"
    ) &&
    // A Conferencia de recebimentos tem RPC propria (conferencia_recebimentos):
    // a base inteira so servia para abrir a Ficha, que agora carrega sob
    // demanda (26/11 -- antes cada entrada na aba baixava todos os titulos).
    !(activeTab === "collectors-summary" && summaryView === "conferencia");
  const needsFullScope =
    tabNeedsFullScope ||
    (activeTab === "collections" &&
      (collectionsView === "cash-report" || filterWantsSettledClients));

  // Motivo da promoção, pra quem clicou num filtro ou abriu uma aba entender
  // por que a tela parou pra carregar tudo em vez de só trocar de conteúdo.
  const fullScopeReason = tabNeedsFullScope
    ? "para calcular os números completos desta tela"
    : collectionsView === "cash-report"
      ? "para montar o Relatório de Caixa"
      : filterWantsSettledClients
        ? "para mostrar os clientes que já quitaram tudo"
        : "";

  useEffect(() => {
    // ensureSettledCollections cobre todo caso de needsFullScope: o
    // complemento (quitados) somado ao escopo "active" ja carregado e
    // identico ao escopo "all" (ver comentario de TABS_NEEDING_FULL_SCOPE).
    // E no-op se ja foi pedido ou se o escopo ja esta em "all".
    if (needsFullScope) void ensureSettledCollections();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needsFullScope]);

  useEffect(() => {
    if (TABS_AUTOLOADING_COLLECTIONS.has(activeTab)) void requestCollections();
    // requestCollections e no-op se os dados ja foram pedidos.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  // Base inteira ainda carregando: a carga "all" (loadingFullScope) ou o
  // complemento dos quitados (loadingSettledCollections). 26/11: so o segundo
  // era olhado e o Resumo aparecia zerado durante a carga "all".
  const baseCarregando = loadingSettledCollections || loadingFullScope;
  // Abas da Atribuicao ja abertas (ficam montadas). A Manual so conta como
  // aberta depois da base carregada (ela precisa dos titulos todos).
  const [atribuicaoVisitadas, setAtribuicaoVisitadas] = useState({
    manual: false,
    automatica: false,
  });
  useEffect(() => {
    if (activeTab !== "clients") return;
    if (atribuicaoView === "manual" && baseCarregando) return;
    setAtribuicaoVisitadas((v) =>
      v[atribuicaoView] ? v : { ...v, [atribuicaoView]: true },
    );
  }, [activeTab, atribuicaoView, baseCarregando]);

  const mostrarResumo =
    activeTab === "collectors-summary" &&
    summaryView === "resumo" &&
    resumoAba !== "inadimplencia";
  useEffect(() => {
    if (mostrarResumo && !baseCarregando) setResumoMontado(true);
  }, [mostrarResumo, baseCarregando]);

  const renderTabContent = () => {
    // Segurar e melhor do que exibir total subestimado: sem os clientes
    // quitados, os numeros dessas telas ficam menores do que a realidade.
    const telaCarregandoTudo = (
      <div className="flex items-center justify-center py-16">
        <div className="text-center">
          <div className="flex items-center justify-center space-x-2 mb-3">
            <div
              className="w-2.5 h-2.5 bg-gray-400 rounded-full animate-bounce"
              style={{ animationDelay: "0ms" }}
            />
            <div
              className="w-2.5 h-2.5 bg-gray-400 rounded-full animate-bounce"
              style={{ animationDelay: "150ms" }}
            />
            <div
              className="w-2.5 h-2.5 bg-gray-400 rounded-full animate-bounce"
              style={{ animationDelay: "300ms" }}
            />
          </div>
          <p className="text-gray-600 dark:text-dark-text-secondary text-sm font-medium">
            Carregando todos os registros
            {fullScopeReason ? ` ${fullScopeReason}` : ""}...
          </p>
          <p className="text-gray-400 dark:text-dark-text-secondary text-xs mt-1">
            Pode levar alguns segundos — é uma base grande.
          </p>
        </div>
      </div>
    );
    const carregandoTudo = needsFullScope && baseCarregando;
    // 26/11: Atribuicao e Cobradores mostram a barra de abas durante a carga
    // da base -- antes a tela inteira virava "Carregando" e quem queria a
    // Automatica (ou a Conferencia) tinha de esperar a Manual (ou o Resumo).
    if (
      carregandoTudo &&
      activeTab !== "clients" &&
      activeTab !== "collectors-summary"
    ) {
      return telaCarregandoTudo;
    }

    switch (activeTab) {
      case "collections":
        return (
          <div className="space-y-3 sm:space-y-4">
            <div className="bg-white dark:bg-dark-bg-secondary rounded-2xl shadow-sm border border-gray-200 dark:border-dark-border p-4 lg:p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex items-center justify-between w-full sm:w-auto">
                <h2 className="text-xl lg:text-2xl font-bold text-gray-900 dark:text-dark-text flex items-center">
                  <FileText className="h-5 w-5 lg:h-6 lg:w-6 mr-2 text-blue-600 dark:text-blue-400 flex-shrink-0" />
                  Caixa
                </h2>
                {collectionsView !== "cash-report" && (
                  <button
                    onClick={() => setIsFilterVisible(!isFilterVisible)}
                    className="md:hidden p-2 text-gray-600 dark:text-dark-text-secondary hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-2xl transition-colors"
                    title="Filtros"
                  >
                    <Filter className="h-5 w-5" />
                  </button>
                )}
              </div>
              <div className="flex bg-gray-100 dark:bg-dark-bg rounded-md p-0.5 w-full sm:w-auto">
                <button
                  onClick={() => setCollectionsView("table")}
                  className={`flex-1 sm:flex-none px-2 sm:px-3 lg:px-4 py-1.5 sm:py-2 rounded-md text-xs sm:text-sm font-medium transition-all duration-200 whitespace-nowrap touch-manipulation ${
                    collectionsView === "table"
                      ? "bg-white dark:bg-dark-bg-secondary text-blue-600 dark:text-blue-400 shadow-sm"
                      : "text-gray-600 dark:text-dark-text-secondary hover:text-gray-900 dark:hover:text-dark-text"
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
                      ? "bg-white dark:bg-dark-bg-secondary text-blue-600 dark:text-blue-400 shadow-sm"
                      : "text-gray-600 dark:text-dark-text-secondary hover:text-gray-900 dark:hover:text-dark-text"
                  }`}
                >
                  <DollarSign className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1 lg:mr-2 inline" />
                  <span className="hidden sm:inline">Relatório do Caixa</span>
                  <span className="sm:hidden">Caixa</span>
                </button>
              </div>
            </div>

            {collectionsView === "table" ? (
              <div className="space-y-3 sm:space-y-4">
                {/* Vendas informadas como canceladas no atendimento: so
                    aparece com pendencia (migration 20261110000008). */}
                <VendasAguardandoConferencia />
                <div
                  className={`${isFilterVisible ? "block" : "hidden"} md:block`}
                >
                  <FilterBar
                    filters={filters}
                    onFilterChange={setFilters}
                    userType="manager"
                  />
                </div>
                {collectionsRequested ? (
                  <CollectionTable
                    ref={collectionTableRef}
                    collections={filteredCollections}
                    userType="manager"
                    showGrouped={false}
                  />
                ) : (
                  // Estado inicial do gestor: nada carregado ainda. Note que
                  // isto NAO e "nenhum resultado" — os filtros acima continuam
                  // utilizaveis e a consulta so parte no clique.
                  <div className="bg-white dark:bg-dark-bg-secondary rounded-2xl shadow-sm border border-gray-200 dark:border-dark-border px-6 py-12 text-center">
                    <Search className="h-10 w-10 mx-auto mb-4 text-gray-300 dark:text-dark-text-secondary" />
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-dark-text mb-1">
                      Nenhuma consulta feita ainda
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-dark-text-secondary max-w-md mx-auto mb-6">
                      Ajuste os filtros acima e clique em consultar. As
                      cobranças não são carregadas automaticamente para o
                      gestor.
                    </p>
                    <button
                      onClick={() => void requestCollections()}
                      disabled={loading}
                      className="inline-flex items-center px-5 py-2.5 rounded-2xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors touch-manipulation"
                    >
                      <Search className="h-4 w-4 mr-2" />
                      {loading ? "Consultando..." : "Consultar cobranças"}
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <DailyCashReport collections={collections} />
            )}
          </div>
        );

      case "collectors-summary": {
        const cancelamentosPendentes = getPendingCancellationRequests().length;
        const abasCobradores: {
          id: SummaryView;
          icon: React.ElementType;
          label: string;
          short: string;
          badge?: number;
        }[] = [
          {
            id: "resumo",
            icon: ClipboardList,
            label: "Resumo",
            short: "Resumo",
          },
          {
            id: "acompanhamento",
            icon: CalendarClock,
            label: "Acompanhamento de Visitas",
            short: "Visitas",
            badge: cancelamentosPendentes,
          },
          {
            id: "conferencia",
            icon: Scale,
            label: "Conferência de recebimentos",
            short: "Conferência",
          },
        ];
        return (
          <div className="space-y-4">
            <div className="flex bg-gray-100 dark:bg-dark-bg rounded-md p-0.5 w-full sm:w-fit">
              {abasCobradores.map((aba) => {
                const Icon = aba.icon;
                return (
                  <button
                    key={aba.id}
                    onClick={() => changeSummaryView(aba.id)}
                    className={`flex-1 sm:flex-none inline-flex items-center justify-center px-3 lg:px-4 py-1.5 sm:py-2 rounded-md text-xs sm:text-sm font-medium transition-all duration-200 whitespace-nowrap touch-manipulation ${
                      summaryView === aba.id
                        ? "bg-white dark:bg-dark-bg-secondary text-blue-600 dark:text-blue-400 shadow-sm"
                        : "text-gray-600 dark:text-dark-text-secondary hover:text-gray-900 dark:hover:text-dark-text"
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1 lg:mr-2" />
                    <span className="hidden sm:inline">{aba.label}</span>
                    <span className="sm:hidden">{aba.short}</span>
                    {!!aba.badge && (
                      <span
                        className="ml-1.5 h-5 min-w-5 px-1 bg-red-500 text-white text-[11px] rounded-full flex items-center justify-center font-medium"
                        title={`${aba.badge} pedido(s) de cancelamento aguardando decisão`}
                      >
                        {aba.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            {carregandoTudo && telaCarregandoTudo}
            {(resumoMontado || (mostrarResumo && !carregandoTudo)) && (
              <div className={mostrarResumo ? "" : "hidden"}>
                <CollectorsSummary aba={resumoAba} onAba={mudarResumoAba} />
              </div>
            )}
            {summaryView === "resumo" ? (
              resumoAba === "inadimplencia" && (
                // Leve: so o cabecalho + a aba (nao monta o Resumo se ele
                // ainda nao foi aberto -- sem a carga da base inteira).
                <div className="space-y-4">
                  <CabecalhoResumoGeral
                    aba={resumoAba}
                    onAba={mudarResumoAba}
                  />
                  <AcompanhamentoInadimplencia />
                </div>
              )
            ) : summaryView === "acompanhamento" ? (
              !carregandoTudo && <VisitTracking />
            ) : (
              <ConferenciaRecebimentos />
            )}
          </div>
        );
      }

      case "clients": {
        const abasAtribuicao: {
          id: AtribuicaoView;
          icon: React.ElementType;
          label: string;
          short: string;
        }[] = [
          { id: "manual", icon: UserStar, label: "Manual", short: "Manual" },
          {
            id: "automatica",
            icon: Shuffle,
            label: "Automática / Alcance",
            short: "Automática",
          },
        ];
        return (
          <div className="space-y-4">
            <div className="flex bg-gray-100 dark:bg-dark-bg rounded-md p-0.5 w-full sm:w-fit">
              {abasAtribuicao.map((aba) => {
                const Icon = aba.icon;
                return (
                  <button
                    key={aba.id}
                    onClick={() => changeAtribuicaoView(aba.id)}
                    className={`flex-1 sm:flex-none inline-flex items-center justify-center px-3 lg:px-4 py-1.5 sm:py-2 rounded-md text-xs sm:text-sm font-medium transition-all duration-200 whitespace-nowrap touch-manipulation ${
                      atribuicaoView === aba.id
                        ? "bg-white dark:bg-dark-bg-secondary text-blue-600 dark:text-blue-400 shadow-sm"
                        : "text-gray-600 dark:text-dark-text-secondary hover:text-gray-900 dark:hover:text-dark-text"
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1 lg:mr-2" />
                    <span className="hidden sm:inline">{aba.label}</span>
                    <span className="sm:hidden">{aba.short}</span>
                  </button>
                );
              })}
            </div>
            {/* 26/11: Manual e Automatica ficam montadas depois da 1a vez
                (so escondidas) -- trocar entre elas nao refaz as contas nem
                as buscas. */}
            {atribuicaoView === "manual" && carregandoTudo && telaCarregandoTudo}
            {((atribuicaoView === "manual" && !carregandoTudo) ||
              atribuicaoVisitadas.manual) && (
              <div className={atribuicaoView === "manual" ? "" : "hidden"}>
                <ClientAssignment
                  key={assignmentPreset?.nonce}
                  initialAssignmentFilter={assignmentPreset?.status}
                  onViewClient={(clientIdentifier) => {
                    setFilters({ search: clientIdentifier });
                    setActiveTab("collections");
                  }}
                />
              </div>
            )}
            {(atribuicaoView === "automatica" ||
              atribuicaoVisitadas.automatica) && (
              <div className={atribuicaoView === "automatica" ? "" : "hidden"}>
                <CarteiraDistribuicao />
              </div>
            )}
          </div>
        );
      }

      case "authorization":
        return <AbaPedidosGestor />;

      case "users": {
        const abasConfig: {
          id: ConfigView;
          icon: React.ElementType;
          label: string;
        }[] = [
          { id: "usuarios", icon: Users, label: "Usuários" },
          { id: "acordos", icon: FileSignature, label: "Acordos" },
          { id: "upload", icon: CloudUpload, label: "Upload de Dados" },
        ];
        return (
          <div className="space-y-4">
            <div className="flex bg-gray-100 dark:bg-dark-bg rounded-md p-0.5 w-full sm:w-fit">
              {abasConfig.map((aba) => {
                const Icon = aba.icon;
                return (
                  <button
                    key={aba.id}
                    onClick={() => changeConfigView(aba.id)}
                    className={`flex-1 sm:flex-none inline-flex items-center justify-center px-3 lg:px-4 py-1.5 sm:py-2 rounded-md text-xs sm:text-sm font-medium transition-all duration-200 whitespace-nowrap touch-manipulation ${
                      configView === aba.id
                        ? "bg-white dark:bg-dark-bg-secondary text-blue-600 dark:text-blue-400 shadow-sm"
                        : "text-gray-600 dark:text-dark-text-secondary hover:text-gray-900 dark:hover:text-dark-text"
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1 lg:mr-2" />
                    {aba.label}
                  </button>
                );
              })}
            </div>
            {configView === "usuarios" ? (
              <UserManagement
                onOpenDistribuicao={() => {
                  changeAtribuicaoView("automatica");
                  setActiveTab("clients");
                }}
              />
            ) : configView === "acordos" ? (
              <AcordoConfiguracaoPadrao />
            ) : (
              <DatabaseUpload />
            )}
          </div>
        );
      }

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
