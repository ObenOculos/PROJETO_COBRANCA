import React, { useState, useEffect } from "react";
import AddressHistoryViewer from "./AddressHistoryViewer";
import {
  X,
  ChevronDown,
  ChevronRight,
  User,
  Edit,
  CreditCard,
  AlertTriangle,
  Phone,
  MessageCircle,
  PhoneCall,
  Handshake,
  MoreHorizontal,
  Store,
  Copy,
  Check,
} from "lucide-react";
import {
  ClientGroup,
  Collection,
  UserType,
  isCollectorType,
} from "../../types";
import {
  formatCurrency,
  calculateOverdueDays,
} from "../../utils/formatters";
import { isForaDaCobranca, seloForaDaCobranca } from "../../types/status";
import {
  clientBalanceSplit,
  clientMaxOverdueDays,
  clientStoresForDisplay,
  hasInstallmentBalance,
  round2,
} from "../../filters/clientStatus";
import { parseAndNormalizeDate } from "../../filters/dates";
import {
  encargoCliente,
  encargoParcela,
  isTituloCiclone,
} from "../../filters/encargos";
import { tituloDaParcela } from "../../filters/sales";
import { useCollection } from "../../contexts/CollectionContext";
import { useClientBirthDate } from "../../hooks/useClientBirthDate";
import { razaoSocialDistinta } from "../../utils/clienteNome";
import { useAuth } from "../../contexts/AuthContext";

import GeneralPaymentModal from "./GeneralPaymentModal";
import CorrigirPagamentoModal from "./CorrigirPagamentoModal";
import AtribuirPagamentoModal from "./AtribuirPagamentoModal";
import LogContactModal from "./LogContactModal";
import AcordoModal from "./AcordoModal";
import AcordoDetailModal from "./AcordoDetailModal";
import LinhaDoTempoCliente from "./LinhaDoTempoCliente";
import { USER_TYPE_LABELS, isWalletCollectorType } from "../../config/profiles";

interface ClientDetailModalProps {
  clientGroup: ClientGroup;
  userType: UserType;
  /** `acordoMexeu`: um acordo foi criado ou o detalhe de um acordo foi
   * aberto (onde se cancela). Sao as unicas acoes da ficha que mudam
   * parcelas sem recarregar a carteira sozinhas -- quem fecha a ficha usa
   * isto para so recarregar quando precisa (item 65). */
  onClose: (acordoMexeu?: boolean) => void;
  /** Abre ja na lista de vendas com esta venda expandida (ex.: "Ver
   * detalhes da venda" na Cobrancas). */
  vendaInicial?: number;
  /** Veio do Atender ("Cliente diz que ja pagou" com comprovante): abre
   * direto o registro do pagamento (do acordo, se houver). */
  abrirPagamento?: boolean;
}

// ============================================
// COMPONENTES AUXILIARES MINIMALISTAS
// ============================================

// Formatar data no padrão brasileiro
const formatDate = (dateString: string | null): string => {
  if (!dateString) return "-";

  try {
    // Trata apenas a parte de DATA (ignora hora/fuso). Isso evita o
    // deslocamento de -1 dia quando o valor vem como ISO com timezone
    // (ex.: "2023-08-26T00:00:00Z"), que ao virar horario local recuava o dia.
    let day: number, month: number, year: number;

    if (dateString.includes("-")) {
      // ISO: YYYY-MM-DD (com ou sem "T...")
      const [y, m, d] = dateString.split("T")[0].split("-");
      year = parseInt(y, 10);
      month = parseInt(m, 10);
      day = parseInt(d, 10);
    } else if (dateString.includes("/")) {
      // Brasileiro: DD/MM/YYYY
      const [d, m, y] = dateString.split("/");
      day = parseInt(d, 10);
      month = parseInt(m, 10);
      year = parseInt(y, 10);
    } else {
      return dateString;
    }

    if (isNaN(day) || isNaN(month) || isNaN(year)) {
      console.warn("Data inválida:", dateString);
      return dateString;
    }

    return `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}/${year}`;
  } catch (error) {
    console.error("Erro ao formatar data:", dateString, error);
    return dateString; // Retorna a string original em caso de erro
  }
};

// Formatar dias de atraso de forma intuitiva
const formatDaysOverdue = (days: number | null): string => {
  if (!days || days <= 0) return "";

  // Os dias que sobram sao o resto DEPOIS de tirar anos e meses: `days % 30`
  // sozinho ignorava os anos (400 dias saia "1ano 1mês 10d" em vez de 5d).
  const years = Math.floor(days / 365);
  const months = Math.floor((days % 365) / 30);
  const remainingDays = (days % 365) % 30;

  const parts: string[] = [];

  if (years > 0) {
    parts.push(`${years}${years === 1 ? "ano" : "a"}`);
  }
  if (months > 0) {
    parts.push(`${months}${months === 1 ? "mês" : "m"}`);
  }
  if (remainingDays > 0 || parts.length === 0) {
    parts.push(`${remainingDays}d`);
  }

  return parts.join(" ");
};

// Badge de status minimalista (outline)
const StatusBadge: React.FC<{
  status: "pending" | "partially_paid" | "fully_paid";
}> = ({ status }) => {
  const styles = {
    fully_paid: "text-green-600 border-green-300 bg-green-50",
    partially_paid: "text-amber-600 border-amber-300 bg-amber-50",
    pending: "text-red-600 border-red-300 bg-red-50",
  };

  const labels = {
    fully_paid: "Pago",
    partially_paid: "Parcial",
    pending: "Pendente",
  };

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs border ${styles[status]}`}
    >
      {labels[status]}
    </span>
  );
};

// Situacao de uma parcela no detalhe. Decidida pelos VALORES (saldo), nao
// pelo texto de `status`: o Ciclone grava "recebido" (sem "pago") e ha
// "Pago"/"Pago Parcial" com saldo -- ver hasInstallmentBalance.
type SituacaoParcela = "fora" | "quitada" | "atrasada" | "a_vencer";

const situacaoParcela = (
  installment: Pick<
    Collection,
    "status" | "valor_original" | "valor_recebido" | "desconto"
  >,
  diasAtraso: number,
): SituacaoParcela => {
  if (isForaDaCobranca(installment.status)) return "fora";
  if (!hasInstallmentBalance(installment)) return "quitada";
  return diasAtraso > 0 ? "atrasada" : "a_vencer";
};

const DOT_SITUACAO: Record<SituacaoParcela, string> = {
  fora: "bg-gray-300",
  quitada: "bg-green-500",
  atrasada: "bg-red-500",
  a_vencer: "bg-gray-400",
};

// Indicador de status para parcelas (dot)
const InstallmentStatusDot: React.FC<{ situacao: SituacaoParcela }> = ({
  situacao,
}) => (
  <div
    className={`w-2 h-2 rounded-full ${DOT_SITUACAO[situacao]} flex-shrink-0`}
  />
);

type AbaVendas = "todos" | "aberto" | "pagos";

const ClientDetailModal: React.FC<ClientDetailModalProps> = ({
  clientGroup,
  userType,
  onClose,
  vendaInicial,
  abrirPagamento,
}) => {
  const {
    getSalesByClient,
    calculateSaleBalance,
    refreshCollections,
    scheduledVisits,
    users,
    getAcordoAtivoDoCliente,
    clientesRegistry,
    acordoAtivoOverdueMap,
  } = useCollection();
  const { user } = useAuth();
  const nomePorUsuario = React.useMemo(
    () => new Map(users.map((u) => [u.id, u.name])),
    [users],
  );

  // Espelho do ERP Ciclone (somente leitura). Lido direto do cadastro porque o
  // ClientGroup chega de varias telas e nem todas montam esses campos.
  const cadastroErp = clientesRegistry.get(clientGroup.document);
  const razaoSocial = razaoSocialDistinta(
    cadastroErp?.razao_social,
    clientGroup.client,
  );
  const telefonesContato = [
    cadastroErp?.contato_telefone,
    cadastroErp?.contato_telefone2,
  ].filter((t): t is string => Boolean(t?.trim()));
  const codigoErp = cadastroErp?.codigo_cliente_erp?.trim() || undefined;
  const temDadosErp = Boolean(
    codigoErp ||
      cadastroErp?.vendedor_responsavel ||
      cadastroErp?.regiao ||
      cadastroErp?.observacao_erp,
  );

  const [isGeneralPaymentModalOpen, setIsGeneralPaymentModalOpen] =
    useState(false);
  const [showAcordoAtivoConfirm, setShowAcordoAtivoConfirm] = useState(false);
  const [isGeneralEditModalOpen, setIsGeneralEditModalOpen] = useState(false);
  const [view, setView] = useState<"vendas" | "dados" | "historico">("vendas");
  const [expandedSales, setExpandedSales] = useState<Set<number>>(
    () => new Set(vendaInicial != null ? [vendaInicial] : []),
  );
  const [refreshKey, setRefreshKey] = useState(0);
  const birthDate = useClientBirthDate(clientGroup.document);

  // Desabilitar scroll do body quando o modal estiver aberto
  React.useEffect(() => {
    const originalBodyOverflow = window.getComputedStyle(
      document.body,
    ).overflow;
    const originalDocElementOverflow = window.getComputedStyle(
      document.documentElement,
    ).overflow;

    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = originalBodyOverflow;
      document.documentElement.style.overflow = originalDocElementOverflow;
    };
  }, []);

  // Obter vendas do cliente usando a nova estrutura
  const clientSales = React.useMemo(() => {
    return getSalesByClient(clientGroup.document);
  }, [getSalesByClient, clientGroup.document, refreshKey]);

  // Atraso do cliente: MESMA regra da carteira (clientMaxOverdueDays) -- com
  // acordo ativo segue o cronograma do acordo, nao o vencimento original dos
  // titulos. Montado sobre clientSales (com quitados/cancelados) porque o
  // clientGroup recebido pode vir de telas que nao trazem todas as vendas.
  const acordoAtivo = getAcordoAtivoDoCliente(clientGroup.document);
  const atrasoCliente = clientMaxOverdueDays(
    { document: clientGroup.document, sales: clientSales },
    acordoAtivoOverdueMap,
  );
  // Vencido x a vencer do cabecalho: mesma regra da carteira (item 34).
  const saldoCliente = clientBalanceSplit(
    { document: clientGroup.document, sales: clientSales },
    acordoAtivoOverdueMap,
  );
  // Item 67: multa e juros do Ciclone sobre o vencido (referencia de hoje).
  const encargoFicha =
    saldoCliente.vencido > 0.01
      ? encargoCliente(
          { document: clientGroup.document, sales: clientSales },
          acordoAtivoOverdueMap,
        )
      : null;
  const [menuMaisAberto, setMenuMaisAberto] = useState(false);
  // Numero do titulo/venda copiado (para buscar no Ciclone/SSOtica).
  const [numeroCopiado, setNumeroCopiado] = useState<number | null>(null);
  const copiarNumero = (numero: number) => {
    void navigator.clipboard?.writeText(String(numero)).then(() => {
      setNumeroCopiado(numero);
      window.setTimeout(() => setNumeroCopiado(null), 1500);
    });
  };
  // Item 66: cliente pagou na loja depois da cobranca -> pedido ao gestor.
  const [isAtribuirOpen, setIsAtribuirOpen] = useState(false);
  // Loja(s) do cliente (a primeira e a da parcela em aberto mais antiga).
  const lojasCliente = clientStoresForDisplay({ sales: clientSales });

  // Saldo de cada venda calculado UMA vez e reaproveitado (pendencia, abas e
  // lista). Antes era recalculado em cada uso e a cada clique no modal.
  const saldoPorVenda = React.useMemo(() => {
    const saldos = new Map<number, ReturnType<typeof calculateSaleBalance>>();
    clientSales.forEach((sale) => {
      saldos.set(
        sale.saleNumber,
        calculateSaleBalance(sale.saleNumber, clientGroup.document),
      );
    });
    return saldos;
  }, [clientSales, calculateSaleBalance, clientGroup.document]);
  const saldoDaVenda = (saleNumber: number) =>
    saldoPorVenda.get(saleNumber) ??
    calculateSaleBalance(saleNumber, clientGroup.document);

  // Gestor atende e faz acordo pelo cobrador (2026-11-10, migration
  // 20261110000004): em cada registro escolhe se fica em nome do cobrador
  // da carteira do cliente ou no dele. Mesmos modais do cobrador (Atender,
  // Acordo) -- a regra fica num lugar so.
  const souGestor = userType === "manager";
  // Ficha unica (item 43, etapa 4): cobrador de carteira tambem atende e faz
  // acordo por aqui, sempre no proprio nome (sem a escolha do gestor).
  const podeAtender = souGestor || isWalletCollectorType(userType);
  const cobradorDaCarteira = React.useMemo(() => {
    const ids = new Set<string>();
    clientSales.forEach((sale) =>
      sale.installments.forEach((i) => {
        if (i.user_id && hasInstallmentBalance(i)) ids.add(i.user_id);
      }),
    );
    // Titulos em aberto com mais de um cobrador: ambiguo, so "eu".
    if (ids.size !== 1) return null;
    return users?.find((u) => u.id === Array.from(ids)[0]) ?? null;
  }, [clientSales, users]);
  const [emNomeDoCobrador, setEmNomeDoCobrador] = useState(true);
  const emNomeDe =
    souGestor && emNomeDoCobrador && cobradorDaCarteira
      ? cobradorDaCarteira.id
      : null;
  // Acordo em nome de cobrador de visita nao existe (perfil sem acordo).
  const acordoEmNomeDe =
    emNomeDe && cobradorDaCarteira && isWalletCollectorType(cobradorDaCarteira.type)
      ? emNomeDe
      : null;
  // Ver `onClose`: criar acordo ou abrir o detalhe de um (cancelamento).
  const acordoMexeuRef = React.useRef(false);
  const fecharFicha = () => onClose(acordoMexeuRef.current);
  const [isAtenderOpen, setIsAtenderOpen] = useState(false);
  // Pagamento aberto depois do Atender: o contato ja foi registrado la.
  const [pagamentoSemContato, setPagamentoSemContato] = useState(false);
  const abrirRegistroDePagamento = () => {
    if (acordoAtivo) {
      setAcordoDetalheId(acordoAtivo.id);
    } else {
      setPagamentoSemContato(true);
      setIsGeneralPaymentModalOpen(true);
    }
  };
  useEffect(() => {
    if (abrirPagamento) abrirRegistroDePagamento();
    // So ao abrir a ficha.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [isAcordoOpen, setIsAcordoOpen] = useState(false);
  const [acordoDetalheId, setAcordoDetalheId] = useState<string | null>(null);
  useEffect(() => {
    if (acordoDetalheId) acordoMexeuRef.current = true;
  }, [acordoDetalheId]);
  // O ClientGroup recebido pode nao trazer todas as vendas: os modais
  // recebem as vendas completas do cliente.
  const clienteCompleto = React.useMemo(
    () => ({ ...clientGroup, sales: clientSales }),
    [clientGroup, clientSales],
  );
  // Contato agendado ativo (ligacao/WhatsApp) do responsavel escolhido: o
  // Atender conclui ou remarca ele na mesma transacao.
  const contatoAgendadoDoResponsavel = scheduledVisits.find(
    (v) =>
      v.clientDocument === clientGroup.document &&
      v.status === "agendada" &&
      !!v.channel &&
      v.channel !== "presencial" &&
      v.collectorId === (emNomeDe ?? user?.id),
  );

  // Calcular se há pendências reais considerando descontos
  const hasRealPendingValue = React.useMemo(() => {
    return Array.from(saldoPorVenda.values()).some(
      (saldo) => saldo.remainingBalance > 0.01,
    );
  }, [saldoPorVenda]);

  // Abas da lista de vendas. "Em aberto" = venda com saldo (mesma conta do
  // "Falta" do cabecalho da venda), mais atrasada primeiro; "Pagos" = sem
  // saldo. Venda toda fora da cobranca (cancelada/agrupada/renegociada no
  // ERP) so aparece em "Todos". Sem escolha do usuario, abre em "Em aberto"
  // quando ha divida.
  // Aberta numa venda especifica: aba "Todos" (a venda pode estar paga).
  const [abaVendas, setAbaVendas] = useState<AbaVendas | null>(
    vendaInicial != null ? "todos" : null,
  );
  // ...e rola ate ela.
  useEffect(() => {
    if (vendaInicial == null) return;
    const t = window.setTimeout(() => {
      document
        .getElementById(`ficha-venda-${vendaInicial}`)
        ?.scrollIntoView({ block: "center", behavior: "smooth" });
    }, 150);
    return () => window.clearTimeout(t);
  }, [vendaInicial]);
  // Por venda: o que esta em atraso x a vencer (mesma regra do cabecalho e
  // da carteira, item 34), para o cobrador achar a venda atrasada sem abrir
  // uma por uma. Com acordo ativo o atraso segue o acordo: nao resume aqui.
  const resumoPorVenda = React.useMemo(() => {
    const mapa = new Map<
      number,
      {
        vencido: number;
        qtdAtrasadas: number;
        maiorAtraso: number;
        encargo: number;
        aVencer: number;
        proximoVencimento: string | null;
      }
    >();
    clientSales.forEach((sale) => {
      const r = {
        vencido: 0,
        qtdAtrasadas: 0,
        maiorAtraso: 0,
        encargo: 0,
        aVencer: 0,
        proximoVencimento: null as string | null,
      };
      let proximoTs = Infinity;
      sale.installments.forEach((inst) => {
        if (isForaDaCobranca(inst.status) || !hasInstallmentBalance(inst)) {
          return;
        }
        const saldo =
          (inst.valor_original || 0) -
          (inst.valor_recebido || 0) -
          (inst.desconto || 0);
        const dias = calculateOverdueDays(inst.data_vencimento);
        if (dias > 0) {
          r.vencido += saldo;
          r.qtdAtrasadas += 1;
          if (dias > r.maiorAtraso) r.maiorAtraso = dias;
          r.encargo += encargoParcela(inst)?.encargo ?? 0;
        } else {
          r.aVencer += saldo;
          const ts =
            parseAndNormalizeDate(inst.data_vencimento)?.getTime() ?? Infinity;
          if (ts < proximoTs) {
            proximoTs = ts;
            r.proximoVencimento = inst.data_vencimento ?? null;
          }
        }
      });
      r.vencido = round2(r.vencido);
      r.aVencer = round2(r.aVencer);
      r.encargo = round2(r.encargo);
      mapa.set(sale.saleNumber, r);
    });
    return mapa;
  }, [clientSales]);

  const vendasPorAba = React.useMemo(() => {
    const classificadas = clientSales.map((sale) => {
      const fora =
        seloForaDaCobranca(sale.installments.map((i) => i.status)) !== null;
      const saldo = saldoPorVenda.get(sale.saleNumber)?.remainingBalance ?? 0;
      const maiorAtraso = resumoPorVenda.get(sale.saleNumber)?.maiorAtraso ?? 0;
      return { sale, fora, aberto: !fora && saldo > 0.01, maiorAtraso };
    });
    const abertas = classificadas
      .filter((c) => c.aberto)
      .sort((a, b) => b.maiorAtraso - a.maiorAtraso);
    return {
      todos: clientSales,
      aberto: abertas.map((c) => c.sale),
      pagos: classificadas.filter((c) => !c.fora && !c.aberto).map((c) => c.sale),
      emAtraso: abertas.filter((c) => c.maiorAtraso > 0).length,
    };
  }, [clientSales, saldoPorVenda, resumoPorVenda]);

  // As vendas com parcela em atraso ja vem abertas. Cada uma abre UMA vez,
  // quando aparece (as vendas podem chegar depois da primeira renderizacao);
  // fechada pelo cobrador, nao reabre. Aberta numa venda especifica
  // (vendaInicial) ou com acordo ativo, nao mexe.
  const vendasAutoAbertas = React.useRef<Set<number>>(new Set());
  useEffect(() => {
    if (vendaInicial != null || acordoAtivo) return;
    const novas = clientSales
      .filter(
        (sale) =>
          (resumoPorVenda.get(sale.saleNumber)?.vencido ?? 0) > 0.01 &&
          !vendasAutoAbertas.current.has(sale.saleNumber),
      )
      .map((sale) => sale.saleNumber);
    if (novas.length === 0) return;
    novas.forEach((n) => vendasAutoAbertas.current.add(n));
    setExpandedSales((atual) => new Set([...atual, ...novas]));
  }, [clientSales, resumoPorVenda, acordoAtivo, vendaInicial]);
  const abaEfetiva: AbaVendas =
    abaVendas ?? (vendasPorAba.aberto.length > 0 ? "aberto" : "todos");
  const vendasVisiveis = vendasPorAba[abaEfetiva];

  const handleGeneralPaymentSuccess = async () => {
    // Pequeno delay para garantir que a operação no banco seja concluída
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Forçar refresh dos dados do contexto
    await refreshCollections();

    // Disparar evento global para atualizar outros componentes
    window.dispatchEvent(
      new CustomEvent("paymentProcessed", {
        detail: {
          clientDocument: clientGroup.document,
          type: "general",
        },
      }),
    );

    // Forçar uma nova renderização local
    setRefreshKey((prev) => prev + 1);
    setIsGeneralPaymentModalOpen(false);
  };

  const handleGeneralEditSuccess = async () => {
    // Pequeno delay para garantir que a operação no banco seja concluída
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Forçar refresh dos dados do contexto
    await refreshCollections();

    // Disparar evento global para atualizar outros componentes
    window.dispatchEvent(
      new CustomEvent("paymentProcessed", {
        detail: {
          clientDocument: clientGroup.document,
          type: "edit",
        },
      }),
    );

    // Forçar uma nova renderização local
    setRefreshKey((prev) => prev + 1);
    setIsGeneralEditModalOpen(false);
  };

  const toggleSaleExpansion = (saleNumber: number) => {
    const newExpanded = new Set(expandedSales);
    if (newExpanded.has(saleNumber)) {
      newExpanded.delete(saleNumber);
    } else {
      newExpanded.add(saleNumber);
    }
    setExpandedSales(newExpanded);
  };

  // Item 62: gestor corrige (estorna) direto; cobrador pede a correcao ao
  // gestor. Sem token: a trava e o banco (estornar_pagamento so aceita
  // gestor; o pedido so aceita pagamento que o proprio cobrador registrou).
  const handleEditPaymentClick = () => {
    setIsGeneralEditModalOpen(true);
  };

  // Um modal ativo por vez: com Receber pagamento / Editar pagamentos /
  // Atender / Acordo aberto por cima, a Ficha fica minimizada (escondida,
  // mas montada -- volta na mesma aba e rolagem ao fechar).
  const fichaMinimizada =
    isGeneralPaymentModalOpen ||
    isGeneralEditModalOpen ||
    isAtenderOpen ||
    isAcordoOpen;

  return (
    <>
      <div
        className={`fixed inset-0 bg-black/50 ${fichaMinimizada ? "hidden" : "flex"} items-stretch sm:items-center justify-center sm:p-4 z-[100]`}
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            fecharFicha();
          }
        }}
      >
        {/* Celular: tela cheia. Computador: janela de ate 90% da altura. Uma
            area de rolagem so (o conteudo da aba), o resto fica fixo. */}
        <div className="bg-white sm:rounded-2xl max-w-6xl w-full h-full sm:h-auto sm:max-h-[90vh] flex flex-col overflow-hidden shadow-2xl">
          {/* Cabecalho: quem e, como falar, situacao e acoes -- em 3 linhas */}
          <div className="relative px-4 lg:px-6 pt-4 pb-3 border-b border-gray-200 shrink-0">
            <button
              id="close-modal"
              name="closeModal"
              onClick={fecharFicha}
              className="absolute top-3 right-3 p-2 text-gray-500 hover:text-gray-800 rounded-full hover:bg-gray-100 transition-colors"
              aria-label="Fechar modal"
            >
              <X className="h-5 w-5" />
            </button>

            {/* 1. Quem e */}
            <div className="pr-10 min-w-0">
              <h2 className="text-base sm:text-lg font-semibold text-gray-900 truncate">
                {clientGroup.client}
              </h2>
              {razaoSocial && (
                <p
                  className="text-xs text-gray-500 truncate"
                  title={`Razão social: ${razaoSocial}`}
                >
                  {razaoSocial}
                </p>
              )}
              {lojasCliente.length > 0 && (
                <p className="text-sm text-indigo-700 font-medium truncate">
                  <span className="font-normal text-gray-500">
                    Loja{lojasCliente.length > 1 ? "s" : ""}:{" "}
                  </span>
                  {lojasCliente.join(" | ")}
                </p>
              )}
              {/* Documento e codigo numa linha so */}
              <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
                <span className="tabular-nums">{clientGroup.document}</span>
                {codigoErp && (
                  <span title="Código do cliente no Ciclone">
                    Cód. {codigoErp}
                  </span>
                )}
              </div>
            </div>

            {/* 2. Situacao (mesma regra da carteira: vencido x a vencer; com
                acordo ativo, as parcelas do acordo) + 3. acoes, lado a lado
                no computador. So mostra o que tem valor. */}
            <div className="mt-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              {/* So o que pede atencao: valor vencido (com o atraso) e acordo
                  ativo. Em dia / a vencer nao aparece (pedido do usuario). */}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                {/* Com multa/juros o aviso "Cobrar hoje" ja traz o vencido e
                    os dias: o selo some para nao repetir. */}
                {saldoCliente.vencido > 0.01 &&
                  !(encargoFicha && encargoFicha.encargo > 0.009) && (
                  <span className="px-2 py-0.5 rounded-md bg-red-50 text-red-700">
                    Vencido{" "}
                    <strong>{formatCurrency(saldoCliente.vencido)}</strong>
                    {atrasoCliente > 0 && (
                      <span className="text-red-600">
                        {" "}
                        · {atrasoCliente} dia{atrasoCliente !== 1 ? "s" : ""}{" "}
                        de atraso
                      </span>
                    )}
                  </span>
                )}
                {acordoAtivo && (
                  <span
                    className="px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 text-xs font-medium"
                    title="Valores e atraso seguem as parcelas do acordo, não o vencimento original dos títulos"
                  >
                    Em acordo
                  </span>
                )}
              </div>

              {/* Atender e Receber pagamento sao o dia a dia; Acordo ao lado;
                  Editar pagamentos (rara, pede autorizacao) no menu. */}
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                {podeAtender && hasRealPendingValue && (
                  <button
                    type="button"
                    onClick={() => setIsAtenderOpen(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium shadow-sm"
                    title="Registrar contato e agendar o próximo"
                  >
                    <PhoneCall className="h-4 w-4" />
                    Atender
                  </button>
                )}
                {(isCollectorType(userType) || souGestor) &&
                  hasRealPendingValue && (
                    <button
                      id="distribute-payment"
                      name="distributePayment"
                      type="button"
                      onClick={() => {
                        if (getAcordoAtivoDoCliente(clientGroup.document)) {
                          setShowAcordoAtivoConfirm(true);
                        } else {
                          setIsGeneralPaymentModalOpen(true);
                        }
                      }}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 text-sm font-medium shadow-sm"
                      title="Lançar o valor recebido; o sistema distribui entre as parcelas"
                    >
                      <CreditCard className="h-4 w-4" />
                      Receber pagamento
                    </button>
                  )}
                {podeAtender &&
                  (acordoAtivo ? (
                    <button
                      type="button"
                      onClick={() => setAcordoDetalheId(acordoAtivo.id)}
                      className="flex items-center gap-1.5 px-3 py-1.5 border border-amber-300 text-amber-800 bg-white rounded-lg hover:bg-amber-50 text-sm font-medium"
                      title="Ver o acordo ativo, registrar pagamento de parcela"
                    >
                      <Handshake className="h-4 w-4" />
                      Ver acordo
                    </button>
                  ) : (
                    hasRealPendingValue && (
                      <button
                        type="button"
                        onClick={() => setIsAcordoOpen(true)}
                        className="flex items-center gap-1.5 px-3 py-1.5 border border-amber-300 text-amber-800 bg-white rounded-lg hover:bg-amber-50 text-sm font-medium"
                        title="Negociar a dívida em parcelas"
                      >
                        <Handshake className="h-4 w-4" />
                        Fazer acordo
                      </button>
                    )
                  ))}
                {(isCollectorType(userType) || souGestor) &&
                  clientSales.some((sale) => sale.totalReceived > 0) && (
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setMenuMaisAberto((v) => !v)}
                        className="p-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"
                        title="Mais ações"
                        aria-label="Mais ações"
                        aria-expanded={menuMaisAberto}
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </button>
                      {menuMaisAberto && (
                        <>
                          <div
                            className="fixed inset-0 z-10"
                            onClick={() => setMenuMaisAberto(false)}
                          />
                          <div className="absolute right-0 mt-1 z-20 w-56 bg-white border border-gray-200 rounded-xl shadow-lg py-1">
                            <button
                              id="edit-payments"
                              name="editPayments"
                              type="button"
                              onClick={() => {
                                setMenuMaisAberto(false);
                                handleEditPaymentClick();
                              }}
                              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 text-left"
                            >
                              <Edit className="h-4 w-4 text-gray-500" />
                              {souGestor
                                ? "Corrigir pagamento"
                                : "Pedir correção de pagamento"}
                            </button>
                            {!souGestor && (
                              <button
                                type="button"
                                onClick={() => {
                                  setMenuMaisAberto(false);
                                  setIsAtribuirOpen(true);
                                }}
                                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 text-left"
                                title="O cliente pagou na loja ou no banco depois que você cobrou: peça ao gestor para registrar o pagamento no seu nome"
                              >
                                <Store className="h-4 w-4 text-gray-500" />
                                Cliente pagou na loja
                              </button>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  )}
              </div>
            </div>

            {/* Item 67: aviso de multa e juros (Ciclone) -- o cobrador nao
                pode cobrar so o vencido. */}
            {encargoFicha && encargoFicha.encargo > 0.009 && (
              <div
                className="mt-2 flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs text-amber-900"
                title="Este cliente tem multa e juros de atraso: cobre o valor de hoje, não só o vencido. Mesma conta do Ciclone (Prev. Baixa); o valor sobe a cada dia de atraso."
              >
                <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                <div>
                  <strong>
                    Cobrar hoje{" "}
                    {formatCurrency(
                      saldoCliente.vencido + encargoFicha.encargo,
                    )}
                  </strong>{" "}
                  — vencido {formatCurrency(saldoCliente.vencido)}
                  {atrasoCliente > 0 &&
                    ` há ${atrasoCliente} dia${atrasoCliente !== 1 ? "s" : ""}`}{" "}
                  + multa{" "}
                  {formatCurrency(encargoFicha.multa)} + juros{" "}
                  {formatCurrency(encargoFicha.juros)}
                </div>
              </div>
            )}
            {encargoFicha?.conferirNoErp && (
              <div className="mt-2 flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                <div>
                  O juro cadastrado no Ciclone para uma parcela deste cliente
                  parece errado. Confira o valor no Ciclone antes de cobrar.
                </div>
              </div>
            )}

            {/* Gestor: em nome de quem fica o registro. Sem cobrador de
                carteira nao ha escolha (fica no nome dele) -- nada a mostrar. */}
            {souGestor && cobradorDaCarteira && (hasRealPendingValue || acordoAtivo) && (
              <label className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-600">
                <span>Registrar em nome de</span>
                <select
                  value={emNomeDoCobrador ? "cobrador" : "eu"}
                  onChange={(e) =>
                    setEmNomeDoCobrador(e.target.value === "cobrador")
                  }
                  className="px-2 py-1 rounded-lg border border-gray-200 bg-white text-xs"
                  title={
                    emNomeDoCobrador
                      ? `Conta para o cobrador e o próximo contato vai para a agenda dele; fica registrado que foi você.${
                          !acordoEmNomeDe
                            ? " Acordo de cobrador de visita fica no seu nome."
                            : ""
                        }`
                      : "Conta para você e o próximo contato fica na sua agenda."
                  }
                >
                  <option value="cobrador">
                    {cobradorDaCarteira.name} (
                    {USER_TYPE_LABELS[cobradorDaCarteira.type] ?? "cobrador"})
                  </option>
                  <option value="eu">Eu ({user?.name ?? "gestor"})</option>
                </select>
                {emNomeDoCobrador && !acordoEmNomeDe && (
                  <span className="text-gray-400">
                    · acordo fica no seu nome
                  </span>
                )}
              </label>
            )}
          </div>

          {/* Abas: navegacao, nao acao. Sem overflow: com overflow-x o
              sublinhado (-mb-px) criava barra de rolagem vertical. */}
          <div
            role="tablist"
            className="flex gap-1 px-4 lg:px-6 border-b border-gray-200 shrink-0"
          >
            {(
              [
                ["vendas", `Vendas (${clientSales.length})`, "Vendas e parcelas do cliente"],
                [
                  "historico",
                  "Histórico",
                  userType === "manager"
                    ? "Contatos, visitas, baixas e quem teve o cliente na carteira"
                    : "Contatos, visitas e baixas do cliente",
                ],
                ["dados", "Cadastro", "Dados de cadastro e endereços"],
              ] as const
            ).map(([aba, rotulo, dica]) => (
              <button
                key={aba}
                type="button"
                role="tab"
                aria-selected={view === aba}
                onClick={() => setView(aba)}
                title={dica}
                className={`px-3 py-2.5 border-b-2 text-sm font-medium whitespace-nowrap transition-colors ${
                  view === aba
                    ? "border-indigo-600 text-indigo-700"
                    : "border-transparent text-gray-500 hover:text-gray-800"
                }`}
              >
                {rotulo}
              </button>
            ))}
          </div>

          {/* Sales and Collections, Client Data or History */}
          {view === "historico" ? (
            <div className="flex-1 min-h-0 overflow-y-auto p-4 lg:p-6">
              <LinhaDoTempoCliente
                clientDocument={clientGroup.document}
                sales={clientSales}
                mostrarCarteira={userType === "manager"}
              />
            </div>
          ) : view === "dados" ? (
            <div className="flex-1 min-h-0 overflow-y-auto p-4 lg:p-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Column 1: Basic and Contact Info */}
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                    <User className="h-5 w-5 mr-2 text-blue-600" />
                    Informações Básicas e de Contato
                  </h3>
                  <div className="bg-gray-50 p-4 rounded-2xl space-y-3 text-sm border border-gray-200">
                    {/* Client Info */}
                    <div className="flex justify-between">
                      <span className="font-medium text-gray-600">
                        {razaoSocial ? "Nome fantasia:" : "Nome:"}
                      </span>
                      <span className="font-semibold text-gray-900 text-right">
                        {clientGroup.client || "-"}
                      </span>
                    </div>
                    {razaoSocial && (
                      <div className="flex justify-between gap-4">
                        <span className="font-medium text-gray-600 shrink-0">
                          Razão social:
                        </span>
                        <span className="font-semibold text-gray-900 text-right">
                          {razaoSocial}
                        </span>
                      </div>
                    )}
                    {clientGroup.apelido && (
                      <div className="flex justify-between">
                        <span className="font-medium text-gray-600">
                          Apelido:
                        </span>
                        <span className="font-semibold text-gray-900 text-right">
                          {clientGroup.apelido}
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="font-medium text-gray-600">
                        Documento:
                      </span>
                      <span className="font-semibold text-gray-900 text-right">
                        {clientGroup.document || "-"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-medium text-gray-600">
                        Data de Nascimento:
                      </span>
                      <span className="font-semibold text-gray-900 text-right">
                        {birthDate ? formatDate(birthDate) : "-"}
                      </span>
                    </div>

                    {/* Contacts */}
                    <div className="pt-4 mt-4 border-t border-gray-200">
                      <h4 className="text-sm font-semibold text-gray-700 mb-2">
                        Contatos
                      </h4>
                      <div className="space-y-2">
                        {clientGroup.phone && (
                          <div className="flex items-center justify-between text-sm">
                            <div className="flex items-center">
                              <Phone className="h-4 w-4 text-gray-400 mr-2" />
                              <span>{clientGroup.phone}</span>
                            </div>
                            <button
                              onClick={() =>
                                window.open(`tel:${clientGroup.phone}`, "_self")
                              }
                              className="text-[10px] font-bold text-blue-600"
                            >
                              Ligar
                            </button>
                          </div>
                        )}
                        {clientGroup.mobile && (
                          <div className="flex items-center justify-between text-sm">
                            <div className="flex items-center">
                              <MessageCircle className="h-4 w-4 text-gray-400 mr-2" />
                              <span>{clientGroup.mobile}</span>
                            </div>
                            <button
                              onClick={() =>
                                window.open(`tel:${clientGroup.mobile}`, "_self")
                              }
                              className="text-[10px] font-bold text-blue-600"
                            >
                              Ligar
                            </button>
                          </div>
                        )}
                        {!clientGroup.phone &&
                          !clientGroup.mobile &&
                          telefonesContato.length === 0 && (
                            <p className="text-xs text-gray-500">
                              Nenhum telefone cadastrado.
                            </p>
                          )}
                      </div>
                    </div>

                    {/* Pessoa de contato (ERP Ciclone) */}
                    {(cadastroErp?.contato_nome ||
                      telefonesContato.length > 0) && (
                      <div className="pt-4 mt-4 border-t border-gray-200">
                        <h4 className="text-sm font-semibold text-gray-700 mb-2">
                          Falar com
                        </h4>
                        <div className="space-y-2">
                          {cadastroErp?.contato_nome && (
                            <div className="flex items-center text-sm">
                              <User className="h-4 w-4 text-gray-400 mr-2" />
                              <span className="font-semibold text-gray-900">
                                {cadastroErp.contato_nome}
                              </span>
                            </div>
                          )}
                          {telefonesContato.map((telefone) => (
                            <div
                              key={telefone}
                              className="flex items-center justify-between text-sm"
                            >
                              <div className="flex items-center">
                                <Phone className="h-4 w-4 text-gray-400 mr-2" />
                                <span>{telefone}</span>
                              </div>
                              <button
                                onClick={() =>
                                  window.open(`tel:${telefone}`, "_self")
                                }
                                className="text-[10px] font-bold text-blue-600"
                              >
                                Ligar
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Dados comerciais (ERP Ciclone) */}
                    {temDadosErp && (
                      <div className="pt-4 mt-4 border-t border-gray-200 space-y-2">
                        <h4 className="text-sm font-semibold text-gray-700">
                          Dados do Ciclone
                        </h4>
                        {codigoErp && (
                          <div className="flex justify-between gap-4">
                            <span className="font-medium text-gray-600 shrink-0">
                              Código do cliente:
                            </span>
                            <span className="font-semibold text-gray-900 text-right">
                              {codigoErp}
                            </span>
                          </div>
                        )}
                        {cadastroErp?.vendedor_responsavel && (
                          <div className="flex justify-between gap-4">
                            <span className="font-medium text-gray-600 shrink-0">
                              Vendedor:
                            </span>
                            <span className="font-semibold text-gray-900 text-right">
                              {cadastroErp.vendedor_responsavel}
                            </span>
                          </div>
                        )}
                        {cadastroErp?.regiao && (
                          <div className="flex justify-between gap-4">
                            <span className="font-medium text-gray-600 shrink-0">
                              Região:
                            </span>
                            <span className="font-semibold text-gray-900 text-right">
                              {cadastroErp.regiao}
                            </span>
                          </div>
                        )}
                        {cadastroErp?.observacao_erp && (
                          <div>
                            <span className="font-medium text-gray-600">
                              Observação do cadastro:
                            </span>
                            <p className="mt-1 text-gray-900 whitespace-pre-line break-words">
                              {cadastroErp.observacao_erp}
                            </p>
                          </div>
                        )}
                        <p className="text-[11px] text-gray-500">
                          Vem do cadastro do Ciclone; correções são feitas lá.
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Column 2: Address History */}
                <AddressHistoryViewer
                  clientDocument={clientGroup.document}
                  initialData={clientGroup}
                />
              </div>
            </div>
          ) : (
            <div className="flex-1 min-h-0 overflow-y-auto">
              <div className="px-4 lg:px-6 py-4">
                {/* Abas: Todos | Em aberto | Pagos */}
                <div
                  role="tablist"
                  className="mb-3 flex gap-1 p-1 bg-gray-100 rounded-xl text-xs"
                >
                  {(
                    [
                      ["todos", "Todos", vendasPorAba.todos.length],
                      ["aberto", "Em aberto", vendasPorAba.aberto.length],
                      ["pagos", "Pagos", vendasPorAba.pagos.length],
                    ] as const
                  ).map(([aba, rotulo, total]) => (
                    <button
                      key={aba}
                      type="button"
                      role="tab"
                      aria-selected={abaEfetiva === aba}
                      onClick={() => setAbaVendas(aba)}
                      className={`flex-1 px-2 py-1.5 rounded-lg font-semibold transition-colors ${
                        abaEfetiva === aba
                          ? "bg-white text-gray-900 shadow-sm"
                          : "text-gray-500 hover:text-gray-700"
                      }`}
                    >
                      {rotulo} ({total})
                      {aba === "aberto" && vendasPorAba.emAtraso > 0 && (
                        <span className="ml-1 text-red-600">
                          · {vendasPorAba.emAtraso} em atraso
                        </span>
                      )}
                    </button>
                  ))}
                </div>

                <div className="space-y-3">
                  {vendasVisiveis.length === 0 && (
                    <p className="py-6 text-center text-xs text-gray-400">
                      {abaEfetiva === "aberto"
                        ? "Nenhuma venda com saldo em aberto."
                        : abaEfetiva === "pagos"
                          ? "Nenhuma venda quitada."
                          : "Nenhuma venda."}
                    </p>
                  )}
                  {vendasVisiveis.map((sale) => {
                    const saleBalance = saldoDaVenda(sale.saleNumber);
                    const saleSeloFora = seloForaDaCobranca(
                      sale.installments.map((i) => i.status),
                    );
                    // Selos de atraso / a vencer (sem acordo ativo).
                    const resumo = acordoAtivo
                      ? undefined
                      : resumoPorVenda.get(sale.saleNumber);
                    const vendaAtrasada = !!resumo && resumo.vencido > 0.01;
                    // Item 68: o nome que o sistema de origem usa -- no
                    // Ciclone e "Titulo" (busca por titulo + parcela), na
                    // SSOtica "Venda". Sem numero, no Ciclone, sao titulos de
                    // texto (PEDIDO.../ACORDO...): cada parcela mostra o dela.
                    const vendaCiclone = sale.installments.some((i) =>
                      isTituloCiclone(i),
                    );
                    const rotuloVenda =
                      sale.saleNumber === 0
                        ? vendaCiclone
                          ? "Outros títulos do Ciclone"
                          : "Venda Renegociada"
                        : `${vendaCiclone ? "Título" : "Venda"} ${sale.saleNumber}`;
                    // "Parcela X de N": N = maior parcela da venda.
                    const totalParcelasVenda =
                      sale.saleNumber === 0
                        ? 0
                        : Math.max(
                            0,
                            ...sale.installments.map((i) => i.parcela ?? 0),
                          );
                    const temSelos =
                      !!resumo &&
                      (resumo.vencido > 0.01 || resumo.aVencer > 0.01);

                    return (
                      <div
                        key={sale.saleNumber}
                        id={`ficha-venda-${sale.saleNumber}`}
                        className={`border rounded-xl overflow-hidden bg-white ${
                          vendaAtrasada
                            ? "border-red-300 border-l-4 border-l-red-500"
                            : "border-gray-200"
                        }`}
                      >
                        {/* Sale Header - Minimalista */}
                        <div
                          className="px-3 py-2 border-b border-gray-100 hover:bg-gray-50 cursor-pointer transition-colors"
                          onClick={() => toggleSaleExpansion(sale.saleNumber)}
                        >
                          <div className="flex items-center justify-between gap-3">
                            {/* Left: Chevron + Info */}
                            <div className="flex items-center gap-2 min-w-0 flex-1">
                              <div className="flex-shrink-0">
                                {expandedSales.has(sale.saleNumber) ? (
                                  <ChevronDown className="h-4 w-4 text-gray-400" />
                                ) : (
                                  <ChevronRight className="h-4 w-4 text-gray-400" />
                                )}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <h4 className="text-sm font-medium text-gray-900">
                                    {rotuloVenda}
                                  </h4>
                                  {sale.saleNumber !== 0 && (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        copiarNumero(sale.saleNumber);
                                      }}
                                      className="p-0.5 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100"
                                      title={`Copiar o número para buscar no ${vendaCiclone ? "Ciclone" : "sistema da loja"}`}
                                      aria-label="Copiar número"
                                    >
                                      {numeroCopiado === sale.saleNumber ? (
                                        <Check className="h-3.5 w-3.5 text-green-600" />
                                      ) : (
                                        <Copy className="h-3.5 w-3.5" />
                                      )}
                                    </button>
                                  )}
                                  {saleSeloFora ? (
                                    <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs border bg-gray-200 text-gray-600 border-gray-300">
                                      {saleSeloFora}
                                    </span>
                                  ) : (
                                    // Em aberto, os selos Em atraso / A
                                    // vencer ja dizem a situacao.
                                    !temSelos && (
                                      <StatusBadge status={saleBalance.status} />
                                    )
                                  )}
                                </div>
                                {resumo &&
                                  (resumo.vencido > 0.01 ||
                                    resumo.aVencer > 0.01) && (
                                    <div className="mt-1 flex flex-wrap gap-1.5 text-[11px]">
                                      {resumo.vencido > 0.01 && (
                                        <span className="inline-flex items-center gap-1 rounded-md bg-red-100 px-1.5 py-0.5 font-semibold text-red-700">
                                          <AlertTriangle className="h-3 w-3" />
                                          Em atraso{" "}
                                          {formatCurrency(resumo.vencido)} ·{" "}
                                          {resumo.maiorAtraso} dia
                                          {resumo.maiorAtraso !== 1 ? "s" : ""}
                                        </span>
                                      )}
                                      {resumo.aVencer > 0.01 && (
                                        <span className="inline-flex items-center rounded-md bg-gray-100 px-1.5 py-0.5 font-medium text-gray-600">
                                          A vencer{" "}
                                          {formatCurrency(resumo.aVencer)}
                                          {resumo.proximoVencimento &&
                                            ` · próx. ${formatDate(resumo.proximoVencimento)}`}
                                        </span>
                                      )}
                                    </div>
                                  )}
                                {(() => {
                                  const lojasVenda =
                                    lojasCliente.length > 1
                                      ? [
                                          ...new Set(
                                            sale.installments
                                              .map((i) => i.nome_da_loja)
                                              .filter(Boolean),
                                          ),
                                        ]
                                      : [];
                                  const partes = [
                                    ...(temSelos
                                      ? []
                                      : [
                                          `${sale.installments.length} parcela${
                                            sale.installments.length !== 1
                                              ? "s"
                                              : ""
                                          }`,
                                        ]),
                                    ...(lojasVenda.length > 0
                                      ? [lojasVenda.join(", ")]
                                      : []),
                                  ];
                                  return partes.length > 0 ? (
                                    <p className="text-xs text-gray-500">
                                      {partes.join(" · ")}
                                    </p>
                                  ) : null;
                                })()}
                              </div>
                            </div>

                            {/* Right: Valores */}
                            <div className="text-right flex-shrink-0">
                              <div className="text-sm font-semibold text-gray-900">
                                {formatCurrency(sale.totalValue)}
                              </div>
                              <div className="text-xs text-gray-500">
                                Pago{" "}
                                <span className="text-green-600">
                                  {formatCurrency(saleBalance.totalPaid)}
                                </span>
                              </div>
                              {saleBalance.remainingBalance > 0.01 && (
                                <div className="text-xs text-gray-500">
                                  Falta{" "}
                                  <span className="font-medium text-red-600">
                                    {formatCurrency(saleBalance.remainingBalance)}
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Expanded Sale Details - Minimalista */}
                        {expandedSales.has(sale.saleNumber) && (
                          <div className="px-3 py-3 bg-white border-t border-gray-100">
                            {/* Tabela de Parcelas */}
                            <div className="space-y-1">

                              {/* Mobile: Cards compactos */}
                              <div className="space-y-1.5">
                                {[...sale.installments]
                                  .sort(
                                    (a, b) =>
                                      (parseAndNormalizeDate(
                                        a.data_vencimento,
                                      )?.getTime() ?? 0) -
                                        (parseAndNormalizeDate(
                                          b.data_vencimento,
                                        )?.getTime() ?? 0) ||
                                      a.id_parcela - b.id_parcela,
                                  )
                                  .map((installment) => {
                                  const diasVencida = calculateOverdueDays(
                                    installment.data_vencimento,
                                  );
                                  const situacao = situacaoParcela(
                                    installment,
                                    diasVencida,
                                  );
                                  const actualAtraso =
                                    situacao === "atrasada" ? diasVencida : 0;
                                  // Mesma base dos totais da venda (Total /
                                  // Pago / Falta): valor_original.
                                  const saldoParcela = round2(
                                    (installment.valor_original || 0) -
                                      (installment.valor_recebido || 0) -
                                      (installment.desconto || 0),
                                  );
                                  // Item 67: multa/juros do Ciclone (sem
                                  // acordo ativo, que tem encargo proprio).
                                  const encargo = acordoAtivo
                                    ? null
                                    : encargoParcela(installment);
                                  const reajusteDiferente =
                                    installment.valor_reajustado > 0 &&
                                    round2(installment.valor_reajustado) !==
                                      round2(installment.valor_original);

                                  return (
                                    <div
                                      key={installment.id_parcela}
                                      className={`flex items-center justify-between py-1.5 px-2 border-b border-gray-100 last:border-0 rounded transition-colors ${
                                        situacao === "atrasada" && !acordoAtivo
                                          ? "bg-red-50 hover:bg-red-100"
                                          : "hover:bg-gray-50"
                                      }`}
                                    >
                                      {/* Left: ID, Data, Status */}
                                      <div className="flex items-center gap-2 min-w-0 flex-1">
                                        <InstallmentStatusDot
                                          situacao={situacao}
                                        />
                                        <div className="min-w-0">
                                          <div className="flex items-center gap-2">
                                            <span
                                              className="text-xs font-medium text-gray-700"
                                              title={`ID da parcela: ${installment.id_parcela}`}
                                            >
                                              {installment.parcela != null
                                                ? `Parcela ${installment.parcela}${
                                                    totalParcelasVenda >=
                                                    installment.parcela
                                                      ? ` de ${totalParcelasVenda}`
                                                      : ""
                                                  }`
                                                : `#${installment.id_parcela}`}
                                            </span>
                                            {isForaDaCobranca(
                                              installment.status,
                                            ) && (
                                              <span className="text-[10px] font-bold tracking-wide px-1.5 py-0.5 rounded bg-gray-200 text-gray-600">
                                                {seloForaDaCobranca([
                                                  installment.status,
                                                ])}
                                              </span>
                                            )}
                                            {actualAtraso > 0 && (
                                              <span
                                                className={`text-xs font-medium ${
                                                  acordoAtivo
                                                    ? "text-gray-500"
                                                    : "text-red-600"
                                                }`}
                                                title={
                                                  acordoAtivo
                                                    ? "Vencimento original do título; com acordo ativo o atraso do cliente segue as parcelas do acordo"
                                                    : `${actualAtraso} dias de atraso`
                                                }
                                              >
                                                {formatDaysOverdue(
                                                  actualAtraso,
                                                )}
                                              </span>
                                            )}
                                          </div>
                                          {/* Titulo do ERP so quando nao e o
                                              do cabecalho (titulos de texto
                                              do Ciclone). */}
                                          {(() => {
                                            const titulo =
                                              tituloDaParcela(installment);
                                            return titulo &&
                                              titulo !==
                                                String(sale.saleNumber) ? (
                                              <div
                                                className="text-[10px] leading-tight text-gray-400 truncate select-all"
                                                title="Título no sistema de origem"
                                              >
                                                {titulo}
                                              </div>
                                            ) : null;
                                          })()}
                                          <div className="text-xs text-gray-600 truncate">
                                            {formatDate(
                                              installment.data_vencimento,
                                            )}
                                          </div>
                                        </div>
                                      </div>

                                      {/* Right: Valores */}
                                      <div className="text-right flex-shrink-0">
                                        <div className="font-medium text-xs text-gray-900">
                                          {formatCurrency(
                                            installment.valor_original,
                                          )}
                                        </div>
                                        {reajusteDiferente && (
                                          <div
                                            className="text-[10px] text-gray-400"
                                            title="Valor reajustado informado na origem; os totais usam o valor original"
                                          >
                                            reaj.{" "}
                                            {formatCurrency(
                                              installment.valor_reajustado,
                                            )}
                                          </div>
                                        )}
                                        {installment.valor_recebido > 0 && (
                                          <div className="text-xs text-green-600">
                                            ✓{" "}
                                            {formatCurrency(
                                              installment.valor_recebido,
                                            )}
                                          </div>
                                        )}
                                        {situacao !== "fora" &&
                                          (installment.desconto || 0) > 0.01 && (
                                            <div className="text-[10px] text-blue-600">
                                              desc.{" "}
                                              {formatCurrency(
                                                installment.desconto || 0,
                                              )}
                                            </div>
                                          )}
                                        {(situacao === "atrasada" ||
                                          situacao === "a_vencer") &&
                                          (installment.valor_recebido > 0 ||
                                            (installment.desconto || 0) >
                                              0.01) && (
                                            <div className="text-[10px] font-semibold text-red-600">
                                              falta{" "}
                                              {formatCurrency(saldoParcela)}
                                            </div>
                                          )}
                                        {encargo && encargo.encargo > 0.009 && (
                                          <div
                                            className="mt-0.5 rounded bg-amber-50 px-1 text-[10px] font-semibold text-amber-800"
                                            title={`Multa ${encargo.percentualMulta}% = ${formatCurrency(encargo.multa)} + juros ${encargo.percentualJurosDia}% ao dia × ${encargo.dias} dias = ${formatCurrency(encargo.juros)}`}
                                          >
                                            + {formatCurrency(encargo.encargo)}{" "}
                                            multa/juros · hoje{" "}
                                            {formatCurrency(encargo.totalHoje)}
                                          </div>
                                        )}
                                        {encargo?.conferirNoErp && (
                                          <div className="mt-0.5 text-[10px] font-semibold text-amber-800">
                                            conferir juros no Ciclone
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>

                              {/* Informações adicionais (se houver desconto) */}
                              {saleBalance.totalDiscount !== undefined &&
                                saleBalance.totalDiscount > 0 && (
                                  <div className="mt-2 pt-2 border-t border-gray-100">
                                    <div className="flex justify-between items-center text-xs">
                                      <span className="text-gray-600">
                                        Desconto total:
                                      </span>
                                      <span className="font-medium text-blue-600">
                                        {formatCurrency(
                                          saleBalance.totalDiscount,
                                        )}
                                      </span>
                                    </div>
                                  </div>
                                )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Aviso de acordo ativo antes de abrir o Distribuir Pagamento --
          titulos vinculados ao acordo nao podem ser pagos por aqui (ver
          migration 20261102000005); o cobrador precisa confirmar que sabe
          disso antes de continuar. */}
      {showAcordoAtivoConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[130]">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4">
            <div className="px-6 py-5">
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2 bg-amber-100 rounded-full">
                  <AlertTriangle className="h-6 w-6 text-amber-600" />
                </div>
                <h3 className="text-base font-bold text-gray-900">
                  Este cliente tem um acordo ativo
                </h3>
              </div>
              <p className="text-sm text-gray-600">
                Títulos vinculados ao acordo não podem ser pagos por aqui — o
                sistema vai recusar e manter o valor neles. Só títulos fora do
                acordo (se houver) serão aplicados. Para pagar o acordo, use a
                tela dele.
              </p>
            </div>
            <div className="px-6 py-4 border-t border-gray-200 flex flex-col sm:flex-row gap-3 sm:justify-end">
              <button
                type="button"
                onClick={() => setShowAcordoAtivoConfirm(false)}
                className="w-full sm:w-auto px-4 py-2 border border-gray-300 text-gray-700 rounded-2xl hover:bg-gray-50 transition-colors font-medium text-sm"
              >
                Voltar
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowAcordoAtivoConfirm(false);
                  setIsGeneralPaymentModalOpen(true);
                }}
                className="w-full sm:w-auto px-4 py-2 bg-amber-600 text-white rounded-2xl hover:bg-amber-700 transition-colors font-medium text-sm"
              >
                Continuar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Gestor: Atender / Acordo (mesmos modais do cobrador) */}
      {isAtenderOpen && (
        <LogContactModal
          client={clienteCompleto}
          linkedVisit={contatoAgendadoDoResponsavel}
          emNomeDe={emNomeDe}
          onClose={() => setIsAtenderOpen(false)}
          onSuccess={() => setIsAtenderOpen(false)}
          onRegistrarPagamento={abrirRegistroDePagamento}
        />
      )}
      {isAcordoOpen && (
        <AcordoModal
          client={clienteCompleto}
          emNomeDe={acordoEmNomeDe}
          onClose={() => setIsAcordoOpen(false)}
          onSuccess={() => {
            acordoMexeuRef.current = true;
            setIsAcordoOpen(false);
          }}
        />
      )}
      {acordoDetalheId && (
        <AcordoDetailModal
          acordoId={acordoDetalheId}
          onClose={() => setAcordoDetalheId(null)}
        />
      )}

      {/* General Payment Modal */}
      {isGeneralPaymentModalOpen && (
        <GeneralPaymentModal
          clientGroup={clientGroup}
          clientSales={clientSales}
          contatoJaRegistrado={pagamentoSemContato}
          onClose={() => {
            setIsGeneralPaymentModalOpen(false);
            setPagamentoSemContato(false);
          }}
          onSuccess={async () => {
            setPagamentoSemContato(false);
            await handleGeneralPaymentSuccess();
          }}
        />
      )}

      {/* Corrigir pagamento (gestor) / Pedir correcao (cobrador) */}
      {isGeneralEditModalOpen && user && (
        <CorrigirPagamentoModal
          clientGroup={clientGroup}
          modo={souGestor ? "estornar" : "pedir"}
          usuarioId={user?.id ?? ""}
          nomePorId={nomePorUsuario}
          onClose={() => setIsGeneralEditModalOpen(false)}
          onSuccess={handleGeneralEditSuccess}
        />
      )}

      {/* Item 66: cliente pagou na loja depois da cobranca (cobrador) */}
      {isAtribuirOpen && (
        <AtribuirPagamentoModal
          clientGroup={clientGroup}
          onClose={() => setIsAtribuirOpen(false)}
        />
      )}

    </>
  );
};

export default ClientDetailModal;
