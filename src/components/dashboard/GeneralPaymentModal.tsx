import React, { useState, useEffect, useMemo, useRef, memo } from "react";
import { invalidarHistoricoCliente } from "../../utils/cacheHistoricoCliente";
import {
  X,
  Check,
  CheckCircle,
  ChevronRight,
  TrendingDown,
  Calendar,
  Clock,
  Info,
  AlertTriangle,
} from "lucide-react";
import {
  ClientGroup,
  CollectionAttempt,
  SaleGroup,
  ScheduledVisit,
} from "../../types";
import { useCollection } from "../../contexts/CollectionContext";
import { useAuth } from "../../contexts/AuthContext";
import { useOffline } from "../../hooks/useOffline";
import { calculateOverdueDays, formatCurrency } from "../../utils/formatters";
import { supabase } from "../../lib/supabase";
import { addDaysLocalStr, todayLocalStr } from "../../config/visitStatus";
import {
  isWalletCollectorType,
  podeDarDescontoNaQuitacao,
} from "../../config/profiles";
import { ATTEMPT_RESULT_LABELS } from "../../config/collectionAttempts";
import { isForaDaCobranca } from "../../types/status";
import {
  clientBalanceSplit,
  hasInstallmentBalance,
  round2,
} from "../../filters/clientStatus";
import { encargoParcela, isTituloCiclone } from "../../filters/encargos";
import {
  autorizacaoVigente,
  listarPedidosDescontoDoCliente,
  pedirDesconto,
  PedidoDesconto,
  TipoPedidoDesconto,
} from "../../services/pedidosDesconto";
import { FORMA_PAGAMENTO_LABEL } from "../../config/formasPagamento";

/** A partir deste valor recebido o "Confirmar" pede "Conferi os valores". */
const VALOR_ALTO_CONFERENCIA = 2000;


/**
 * Valor digitado -> numero. Aceita "1.234,56", "1234,56" e "1234.56";
 * "1.234" (so ponto de milhar) vale mil duzentos e trinta e quatro.
 */
const parseValor = (texto: string): number => {
  const t = (texto || "").trim();
  if (!t) return 0;
  const normal = t.includes(",")
    ? t.replace(/\./g, "").replace(",", ".")
    : /^\d{1,3}(\.\d{3})+$/.test(t)
      ? t.replace(/\./g, "")
      : t;
  const n = parseFloat(normal);
  return Number.isFinite(n) ? round2(n) : 0;
};

/** Numero -> texto do campo ("1234,56"). */
const valorParaCampo = (n: number): string => n.toFixed(2).replace(".", ",");

/** Hora local "HH:MM" -- para barrar reagendamento hoje em horario que ja passou. */
const horaLocalAgora = () => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

/**
 * Aviso da tela de pagamento -- um formato so (icone + texto), muda a cor:
 * ok = confere; info = explica; atencao = confira antes de seguir;
 * erro = nao deixa seguir.
 */
const AVISO_ESTILO = {
  ok: "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300",
  info: "border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-800 dark:bg-sky-900/20 dark:text-sky-200",
  atencao:
    "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-200",
  erro: "border-red-300 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300",
} as const;

const Aviso: React.FC<{
  tom: keyof typeof AVISO_ESTILO;
  titulo?: React.ReactNode;
  children: React.ReactNode;
}> = ({ tom, titulo, children }) => {
  const Icone =
    tom === "ok" ? CheckCircle : tom === "info" ? Info : AlertTriangle;
  return (
    <div
      role={tom === "erro" || tom === "atencao" ? "alert" : undefined}
      className={`flex items-start gap-2 p-3 rounded-xl border text-sm ${AVISO_ESTILO[tom]}`}
    >
      <Icone className="h-4 w-4 mt-0.5 shrink-0" />
      <div className="min-w-0 space-y-1">
        {titulo && <p className="font-semibold">{titulo}</p>}
        <div>{children}</div>
      </div>
    </div>
  );
};

/** Segundos de leitura do alerta antes de liberar o boleto fora de ordem. */
const ESPERA_FORA_DE_ORDEM = 10;

/** Cor de cada venda na lista de parcelas (cliente com mais de uma venda). */
const CORES_VENDA = [
  {
    faixa: "border-l-indigo-500",
    etiqueta:
      "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300",
  },
  {
    faixa: "border-l-amber-500",
    etiqueta:
      "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  },
  {
    faixa: "border-l-teal-500",
    etiqueta:
      "bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-300",
  },
  {
    faixa: "border-l-rose-500",
    etiqueta:
      "bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300",
  },
  {
    faixa: "border-l-sky-500",
    etiqueta: "bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-300",
  },
  {
    faixa: "border-l-lime-500",
    etiqueta:
      "bg-lime-100 text-lime-800 dark:bg-lime-900/30 dark:text-lime-300",
  },
] as const;

interface GeneralPaymentModalProps {
  clientGroup: ClientGroup;
  clientSales: SaleGroup[];
  onClose: () => void;
  onSuccess: () => void;
  /** O atendimento ja foi registrado pelo Atender ("Cliente diz que ja
   * pagou" com comprovante): nao grava um segundo contato. */
  contatoJaRegistrado?: boolean;
}

interface SaleDistributionItem {
  sale: SaleGroup;
  currentReceived: number;
  newAmount: number;
  appliedAmount: number;
  appliedDiscount: number;
  willBeComplete: boolean;
}

const GeneralPaymentModal: React.FC<GeneralPaymentModalProps> = memo(
  ({ clientGroup, clientSales, onClose, onSuccess, contatoJaRegistrado }) => {
    const {
      scheduleVisit,
      processSalePayment,
      refreshData,
      getAcordoAtivoDoCliente,
      acordoAtivoOverdueMap,
      scheduledVisits,
      fetchScheduledVisits,
    } = useCollection();
    const acordoAtivo = clientGroup.document
      ? getAcordoAtivoDoCliente(clientGroup.document)
      : undefined;
    const { user } = useAuth();
    const { isOnline } = useOffline();

    // Item 71, etapa 2: quem nao da desconto direto (interno/terceirizado/
    // juridico) pede ao gestor; aprovado, o desconto libera ate o valor
    // autorizado (o process_payment confere de novo).
    const descontoDireto = podeDarDescontoNaQuitacao(user?.type);
    const [pedidosDesconto, setPedidosDesconto] = useState<PedidoDesconto[]>(
      [],
    );
    const [versaoPedidos, setVersaoPedidos] = useState(0);
    useEffect(() => {
      if (descontoDireto || !clientGroup.document || !isOnline) return;
      let cancelado = false;
      listarPedidosDescontoDoCliente(clientGroup.document)
        .then((p) => {
          if (!cancelado) setPedidosDesconto(p);
        })
        .catch((e) => {
          // Sem a migration aplicada o modal segue como antes.
          console.error("Erro ao carregar pedidos de desconto:", e);
        });
      return () => {
        cancelado = true;
      };
    }, [descontoDireto, clientGroup.document, isOnline, versaoPedidos]);
    const autorizacao = descontoDireto
      ? null
      : autorizacaoVigente(pedidosDesconto);
    const pedidoDescontoAberto =
      pedidosDesconto.find((p) => p.decisao === null) ?? null;
    const ultimoPedidoDesconto = pedidosDesconto[0] ?? null;
    /** Teto de desconto de quem registra: sem limite para gestor/externo. */
    const descontoMaximo = descontoDireto
      ? Number.POSITIVE_INFINITY
      : (autorizacao?.disponivel ?? 0);
    // Formulario do pedido ao gestor (tipo escolhido + motivo).
    const [pedidoTipo, setPedidoTipo] = useState<TipoPedidoDesconto | null>(
      null,
    );
    const [pedidoMotivo, setPedidoMotivo] = useState("");
    const [pedidoEnviando, setPedidoEnviando] = useState(false);
    const [pedidoErro, setPedidoErro] = useState<string | null>(null);
    const [pedidoEnviado, setPedidoEnviado] = useState(false);
    const [loading, setLoading] = useState(false);
    const [distributionAmount, setDistributionAmount] = useState<string>("");
    const [paymentMethod, setPaymentMethod] = useState("dinheiro");
    const [withDiscount, setWithDiscount] = useState(false);
    // Desconto so nas parcelas MARCADAS (a diferenca do pagamento parcial
    // vira desconto e elas ficam quitadas); as demais seguem em aberto.
    // "Quitar tudo com desconto" (withDiscount) segue para a divida inteira.
    const [descontoNasMarcadasEscolhido, setDescontoNasMarcadas] =
      useState(false);
    // Proxima visita do cobrador externo quando sobra vencido (etapa 3).
    const [rescheduleDate, setRescheduleDate] = useState("");
    const [rescheduleTime, setRescheduleTime] = useState("");
    const [observations, setObservations] = useState("");
    // Ultimo texto que o sistema pos na observacao (item 67): se o cobrador
    // nao mexeu, pode ser trocado quando a situacao muda.
    const observacaoAutomatica = useRef("");
    const [etapa, setEtapa] = useState<1 | 2 | 3>(1);
    // Trava de confirmacao nos casos de risco (marcar "Conferi os valores");
    // volta a desmarcada a cada troca de etapa.
    const [conferido, setConferido] = useState(false);
    useEffect(() => {
      setConferido(false);
    }, [etapa]);
    const [erroEtapa, setErroEtapa] = useState<string | null>(null);
    // Quantas parcelas (na ordem, da mais antiga) o cliente esta pagando.
    // null = padrao: todas as vencidas.
    const [qtdMarcadasEscolhida, setQtdMarcadasEscolhida] = useState<
      number | null
    >(null);
    // Parcelas a vencer ficam fechadas: adiantar e uma acao deliberada.
    const [mostrarAVencer, setMostrarAVencer] = useState(false);
    // Boleto pago fora de ordem (17/11): o cliente pagou por engano uma
    // parcela mais nova com outra mais antiga em aberto (ex.: o boleto de
    // 17/12 com o de 17/11 aberto). "aviso" = alerta com espera antes de
    // seguir; "ativo" = escolhe UMA parcela e so ela e baixada (p_parcelas do
    // process_payment, migration 20261117000001). Qualquer perfil pode usar.
    const [foraDeOrdem, setForaDeOrdem] = useState<"nao" | "aviso" | "ativo">(
      "nao",
    );
    const [foraDeOrdemId, setForaDeOrdemId] = useState<number | null>(null);
    const [esperaForaDeOrdem, setEsperaForaDeOrdem] = useState(0);
    useEffect(() => {
      if (foraDeOrdem !== "aviso" || esperaForaDeOrdem <= 0) return;
      const t = setTimeout(() => setEsperaForaDeOrdem((n) => n - 1), 1000);
      return () => clearTimeout(t);
    }, [foraDeOrdem, esperaForaDeOrdem]);
    // So muda a exibicao: a marcacao segue sempre a ordem de vencimento.
    const [ordenarPor, setOrdenarPor] = useState<"vencimento" | "venda">(
      "vencimento",
    );
    // Juros/multa: so o que o cobrador INFORMA (acordado com o cliente).
    // O app nunca presume encargo (decisao do usuario 2026-11-13).
    const [mostrarJuros, setMostrarJuros] = useState(false);
    const [jurosTexto, setJurosTexto] = useState("");

    // Perfil de quem registra: cobrador de carteira so registra a interacao
    // (agenda o proximo contato pelo "Atender", nao aqui -- decisao do
    // usuario em 2026-11-09); externo reagenda a VISITA quando sobra vencido;
    // gestor so registra o pagamento.
    const ehCarteira = isWalletCollectorType(user?.type);
    const ehExterno = user?.type === "collector";
    const hoje = todayLocalStr();
    // Dia em que o cliente pagou. O cobrador interno (e o gestor) muitas vezes
    // da a baixa depois -- o Pix caiu ontem, a baixa e lancada hoje. O
    // externo registra na hora, em campo: fica sempre hoje. O banco
    // (process_payment) recusa data futura ou anterior a 30 dias.
    const podeEscolherData = !ehExterno;
    const DIAS_RETROATIVOS = 30;
    const dataMinima = addDaysLocalStr(hoje, -DIAS_RETROATIVOS);
    const [dataPagamento, setDataPagamento] = useState(hoje);
    const dataPagamentoValida =
      !podeEscolherData ||
      (dataPagamento !== "" &&
        dataPagamento >= dataMinima &&
        dataPagamento <= hoje);

    // Contato agendado ATIVO deste cliente, do proprio cobrador de carteira:
    // o pagamento conclui ele (mesma regra do "Atender" -- RPC
    // registrar_contato).
    const contatoAgendado = useMemo(
      () =>
        ehCarteira && user
          ? scheduledVisits.find(
              (v) =>
                v.clientDocument === clientGroup.document &&
                v.status === "agendada" &&
                v.collectorId === user.id &&
                v.channel !== "presencial",
            )
          : undefined,
      [ehCarteira, user, scheduledVisits, clientGroup.document],
    );

    // Parcelas em aberto na MESMA ordem em que o process_payment aplica
    // (vencimento mais antigo primeiro): o vencido e pago antes do a vencer,
    // mesmo quando esta em vendas diferentes. Com acordo ativo, os titulos
    // do acordo nao sao pagaveis aqui e nao temos a lista deles nesta tela --
    // ai a distribuicao segue a regra antiga (por venda) e o excedente nao e
    // tratado como juros.
    const parcelasAbertas = useMemo(() => {
      const lista: {
        sale: SaleGroup;
        idParcela: number;
        vencimento: string;
        saldo: number;
        vencida: boolean;
        diasAtraso: number;
        valorOriginal: number;
        jaPago: number;
        numero: number | null;
        /** Multa + juros do Ciclone ate a data do pagamento (item 67); 0 se nao ha. */
        encargo: number;
      }[] = [];
      (clientSales || []).forEach((sale) =>
        sale.installments?.forEach((inst) => {
          if (isForaDaCobranca(inst.status) || !hasInstallmentBalance(inst)) {
            return;
          }
          const saldo = round2(
            (inst.valor_original || 0) -
              (inst.valor_recebido || 0) -
              (inst.desconto || 0),
          );
          const diasAtraso = Math.max(
            0,
            calculateOverdueDays(inst.data_vencimento),
          );
          lista.push({
            sale,
            idParcela: inst.id_parcela,
            vencimento: inst.data_vencimento ?? "",
            saldo,
            vencida: diasAtraso > 0,
            diasAtraso,
            valorOriginal: round2(inst.valor_original || 0),
            jaPago: round2((inst.valor_recebido || 0) + (inst.desconto || 0)),
            numero: inst.parcela ?? null,
            // Ate o dia em que o cliente pagou (nao ate hoje).
            encargo: encargoParcela(inst, dataPagamento)?.encargo ?? 0,
          });
        }),
      );
      return lista.sort(
        (a, b) =>
          a.vencimento.localeCompare(b.vencimento) || a.idParcela - b.idParcela,
      );
    }, [clientSales, dataPagamento]);
    const qtdVencidas = parcelasAbertas.filter((p) => p.vencida).length;
    // Vendas com parcela em aberto, na ordem em que aparecem (vencimento).
    // Com mais de uma, cada venda ganha uma cor (faixa + etiqueta) -- a lista
    // continua em ordem de vencimento, que e a ordem em que o banco abate.
    const vendasDaLista = useMemo(() => {
      const mapa = new Map<
        number,
        { saleNumber: number; titulo: number; saldo: number; qtd: number }
      >();
      parcelasAbertas.forEach((p) => {
        const v = mapa.get(p.sale.saleNumber) ?? {
          saleNumber: p.sale.saleNumber,
          titulo: p.sale.titleNumber || 0,
          saldo: 0,
          qtd: 0,
        };
        v.saldo = round2(v.saldo + p.saldo);
        v.qtd += 1;
        mapa.set(p.sale.saleNumber, v);
      });
      return Array.from(mapa.values());
    }, [parcelasAbertas]);
    const variasVendas = vendasDaLista.length > 1;
    const corDaVenda = (saleNumber: number) =>
      CORES_VENDA[
        Math.max(
          0,
          vendasDaLista.findIndex((v) => v.saleNumber === saleNumber),
        ) % CORES_VENDA.length
      ];
    // Item 68: mesmo nome da Ficha -- "Titulo N" no Ciclone (busca por
    // titulo + parcela), "Venda N" na SSOtica; "Parcela X de N".
    const infoVenda = useMemo(() => {
      const mapa = new Map<number, { ciclone: boolean; total: number }>();
      (clientSales || []).forEach((sale) =>
        mapa.set(sale.saleNumber, {
          ciclone: sale.installments.some((i) => isTituloCiclone(i)),
          total: Math.max(0, ...sale.installments.map((i) => i.parcela ?? 0)),
        }),
      );
      return mapa;
    }, [clientSales]);
    const nomeVenda = (saleNumber: number) => {
      const ciclone = infoVenda.get(saleNumber)?.ciclone;
      if (saleNumber === 0) return ciclone ? "Outro título" : "Renegociada";
      return `${ciclone ? "Título" : "Venda"} ${saleNumber}`;
    };
    const parcelaDeN = (saleNumber: number, numero: number) => {
      const total = saleNumber === 0 ? 0 : (infoVenda.get(saleNumber)?.total ?? 0);
      return `Parcela ${numero}${total >= numero ? ` de ${total}` : ""}`;
    };
    /** "Titulo X · Parcela N de M" -- com varias vendas, a venda vira etiqueta colorida. */
    const rotuloParcela = (saleNumber: number, numero: number | null) =>
      variasVendas ? (
        <span className="flex flex-wrap items-center gap-1.5">
          <span
            className={`px-1.5 py-0.5 rounded text-[11px] font-semibold ${corDaVenda(saleNumber).etiqueta}`}
          >
            {nomeVenda(saleNumber)}
          </span>
          {numero != null && <span>{parcelaDeN(saleNumber, numero)}</span>}
        </span>
      ) : (
        <>
          {nomeVenda(saleNumber)}
          {numero != null && ` · ${parcelaDeN(saleNumber, numero)}`}
        </>
      );
    // Ordem normal: as N parcelas mais antigas.
    const qtdMarcadasOrdem = Math.min(
      qtdMarcadasEscolhida ?? qtdVencidas,
      parcelasAbertas.length,
    );
    const emForaDeOrdem = foraDeOrdem === "ativo";
    const parcelaForaDeOrdem = emForaDeOrdem
      ? (parcelasAbertas.find((p) => p.idParcela === foraDeOrdemId) ?? null)
      : null;
    // Parcelas mais antigas que a escolhida: continuam em aberto.
    const anterioresForaDeOrdem = parcelaForaDeOrdem
      ? parcelasAbertas.slice(0, parcelasAbertas.indexOf(parcelaForaDeOrdem))
      : [];
    const marcadasLista = useMemo(
      () =>
        emForaDeOrdem
          ? parcelasAbertas.filter((p) => p.idParcela === foraDeOrdemId)
          : parcelasAbertas.slice(0, qtdMarcadasOrdem),
      [emForaDeOrdem, parcelasAbertas, foraDeOrdemId, qtdMarcadasOrdem],
    );
    const qtdMarcadas = marcadasLista.length;
    const sairForaDeOrdem = () => {
      setForaDeOrdem("nao");
      setForaDeOrdemId(null);
      setErroEtapa(null);
    };
    // Item 67: multa + juros do Ciclone das parcelas marcadas (referencia de
    // hoje). So SUGERE o valor -- o juro continua informado pelo cobrador
    // (item 60: o sistema nunca presume encargo).
    const encargoMarcadas = round2(
      marcadasLista.reduce((soma, p) => soma + p.encargo, 0),
    );
    /** Data do pagamento numa linha so ("Pago em"): a multa e os juros do
     * Ciclone sao calculados ate ela. So quem pode lancar baixa depois
     * (externo e sempre hoje). */
    const seletorData = podeEscolherData ? (
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-semibold text-gray-900 dark:text-dark-text">
          Pago em
        </span>
        {(
          [
            ["Hoje", hoje],
            ["Ontem", addDaysLocalStr(hoje, -1)],
          ] as const
        ).map(([rotulo, valor]) => (
          <button
            key={rotulo}
            type="button"
            onClick={() => {
              setDataPagamento(valor);
              setErroEtapa(null);
            }}
            className={`px-2.5 py-1 rounded-lg border text-xs font-medium ${
              dataPagamento === valor
                ? "border-indigo-500 bg-indigo-50 text-indigo-800"
                : "border-gray-200 text-gray-700 hover:border-gray-300"
            }`}
          >
            {rotulo}
          </button>
        ))}
        <input
          id="payment-date"
          name="paymentDate"
          type="date"
          value={dataPagamento}
          min={dataMinima}
          max={hoje}
          onChange={(e) => {
            setDataPagamento(e.target.value);
            setErroEtapa(null);
          }}
          className="px-2 py-1 border border-gray-300 dark:border-dark-border rounded-lg text-xs dark:bg-dark-bg dark:text-dark-text"
          aria-label="Outra data do pagamento"
          title={`Até ${DIAS_RETROATIVOS} dias atrás`}
        />
      </div>
    ) : null;

    /** "ate hoje" ou "ate dd/mm/aaaa" (dia em que o cliente pagou). */
    const ateDataPagamento =
      dataPagamento === hoje
        ? "até hoje"
        : `até ${dataPagamento.split("-").reverse().join("/")}`;
    /** "Recebi com multa e juros": valor = parcelas + encargo e o encargo vai
     * para o campo de juros (um clique do cobrador -- nada presumido). */
    const receberComEncargo = () => {
      setDistributionAmount(
        valorParaCampo(round2(alocacao.somaParcelas + encargoMarcadas)),
      );
      setMostrarJuros(true);
      setJurosTexto(valorParaCampo(encargoMarcadas));
      setErroEtapa(null);
    };
    /** "Recebi so o valor das parcelas" (juro perdoado/negociado a parte). */
    const receberSemEncargo = () => {
      setDistributionAmount(valorParaCampo(alocacao.somaParcelas));
      setMostrarJuros(false);
      setJurosTexto("");
      setErroEtapa(null);
    };
    // Sem nada vencido, a lista a vencer ja aparece aberta.
    // No boleto fora de ordem o pago costuma ser a vencer: lista inteira.
    const aVencerVisivel =
      mostrarAVencer || qtdVencidas === 0 || emForaDeOrdem;

    // Vencido do cliente (mesma regra da carteira: clientBalanceSplit, que
    // com acordo ativo segue o cronograma do acordo).
    const vencidoTotal = useMemo(
      () =>
        clientBalanceSplit(
          { document: clientGroup.document, sales: clientSales },
          acordoAtivoOverdueMap,
        ).vencido,
      [clientGroup.document, clientSales, acordoAtivoOverdueMap],
    );

    // Desabilitar scroll do body quando o modal estiver aberto
    useEffect(() => {
      // Restaura o valor anterior: aberto por cima da Ficha, "unset" soltava
      // a rolagem da pagina com a Ficha ainda aberta.
      const anterior = document.body.style.overflow;
      document.body.style.overflow = "hidden";

      return () => {
        document.body.style.overflow = anterior;
      };
    }, []);

    const totalPending =
      clientSales?.reduce((sum, sale) => {
        return sum + (sale.pendingValue || 0);
      }, 0) || 0;

    const amountToDistribute = parseValor(distributionAmount);

    // Modo "parcelas": o cobrador marca o que o cliente esta pagando e o
    // valor digitado confere. Com desconto (quitacao) ou acordo ativo segue
    // o modo antigo, so por valor (ver parcelasAbertas).
    const modoParcelas = !withDiscount && !acordoAtivo;

    // Juros/multa informados pelo cobrador (0 se nao informou).
    const jurosInformado =
      modoParcelas && mostrarJuros ? parseValor(jurosTexto) : 0;

    /**
     * Para onde vai cada real. A base e sempre o valor ORIGINAL das parcelas
     * marcadas; juros/multa so entram se o cobrador informar (decisao do
     * usuario 2026-11-13: o sistema nunca presume encargo). O juros
     * informado sai do valor recebido; o resto abate as parcelas na ordem do
     * vencimento (a mesma do process_payment):
     *  - "fecha":      resto = parcelas marcadas;
     *  - "parcial":    resto < parcelas -- a ultima fica parcial;
     *  - "acima":      resto > parcelas -- o cobrador diz se o a mais sao
     *                  juros/multa acordados ou erro de digitacao (sem
     *                  parcela vencida marcada, bloqueia: a vencer nao tem
     *                  juros);
     *  - "jurosMaior": juros informado maior que o valor recebido.
     */
    const alocacao = useMemo(() => {
      const marcadas = marcadasLista;
      const somaParcelas = round2(marcadas.reduce((s, p) => s + p.saldo, 0));
      const v = amountToDistribute;
      const disponivel = round2(v - jurosInformado);
      const situacao: "vazio" | "jurosMaior" | "fecha" | "acima" | "parcial" =
        v <= 0 || marcadas.length === 0
          ? "vazio"
          : disponivel < -0.001
            ? "jurosMaior"
            : Math.abs(disponivel - somaParcelas) <= 0.01
              ? "fecha"
              : disponivel > somaParcelas
                ? "acima"
                : "parcial";
      let resto = Math.max(0, Math.min(disponivel, somaParcelas));
      const itens = marcadas.map((p) => {
        const aplicado = round2(Math.max(0, Math.min(resto, p.saldo)));
        resto = round2(resto - aplicado);
        return { ...p, aplicado, quita: aplicado >= p.saldo - 0.01 };
      });
      return {
        itens,
        somaParcelas,
        esperado: round2(somaParcelas + jurosInformado),
        situacao,
        temVencida: marcadas.some((p) => p.vencida),
        principal: round2(itens.reduce((s, p) => s + p.aplicado, 0)),
        aMais: situacao === "acima" ? round2(disponivel - somaParcelas) : 0,
      };
    }, [marcadasLista, amountToDistribute, jurosInformado]);

    // Item 67: o valor "a mais" e exatamente a multa + juros do Ciclone das
    // parcelas marcadas -- o aviso reconhece em vez de perguntar.
    const aMaisEhEncargo =
      modoParcelas &&
      encargoMarcadas > 0.009 &&
      alocacao.situacao === "acima" &&
      Math.abs(alocacao.aMais - encargoMarcadas) <= 0.01;
    // ...ou parte dela (multa e juros com desconto, autorizado pelo gestor).
    const aMaisEhParteDoEncargo =
      modoParcelas &&
      encargoMarcadas > 0.009 &&
      alocacao.situacao === "acima" &&
      jurosInformado <= 0 &&
      alocacao.aMais < encargoMarcadas - 0.01;
    const jurosValor = modoParcelas ? jurosInformado : 0;
    // Principal = o que abate parcelas.
    const principal = modoParcelas ? alocacao.principal : amountToDistribute;

    // Desconto nas parcelas marcadas: pagamento parcial (sem juros informado)
    // de quem pode dar desconto (item 69: gestor e externo). Ex.: marcou
    // R$ 230 em 2 parcelas, recebeu R$ 224 -> R$ 6 de desconto na ultima
    // marcada e as 2 ficam quitadas. Pedido do usuario, 2026-11-16.
    // Interno/terceirizado/juridico: so ate o autorizado pelo gestor (item 71).
    const podeDescontoNasMarcadas =
      modoParcelas &&
      !emForaDeOrdem && // boleto pago: so o valor dele, sem desconto
      alocacao.situacao === "parcial" &&
      jurosInformado <= 0 &&
      alocacao.principal > 0 &&
      round2(alocacao.somaParcelas - alocacao.principal) <=
        descontoMaximo + 0.009;
    const descontoMarcadas =
      descontoNasMarcadasEscolhido && podeDescontoNasMarcadas
        ? round2(alocacao.somaParcelas - alocacao.principal)
        : 0;
    /** Itens da alocacao com o desconto de cada parcela marcada (0 sem
     * desconto). Fonte unica para distribuicao, resumo e conferencia. */
    const itensPagamento = useMemo(
      () =>
        alocacao.itens.map((p) => {
          const descontoParcela =
            descontoMarcadas > 0 ? round2(p.saldo - p.aplicado) : 0;
          return {
            ...p,
            desconto: descontoParcela,
            quita: p.quita || descontoMarcadas > 0,
          };
        }),
      [alocacao, descontoMarcadas],
    );

    const qtdAVencerPagas = modoParcelas
      ? itensPagamento.filter(
          (p) => !p.vencida && (p.aplicado > 0 || p.desconto > 0),
        ).length
      : 0;
    const quitaTudo =
      modoParcelas &&
      alocacao.situacao !== "vazio" &&
      principal > 0 &&
      principal + descontoMarcadas >= totalPending - 0.01;

    // Valor acima: com parcela vencida marcada, pergunta (juros acordados ×
    // erro de digitacao) e nao deixa seguir sem resposta; so com parcelas a
    // vencer, bloqueia.
    const acimaSemJuros =
      modoParcelas && alocacao.situacao === "acima" && !alocacao.temVencida;
    const avisoAcima =
      modoParcelas && alocacao.situacao === "acima" && alocacao.temVencida;

    // Vencido que sobra depois deste pagamento: decide se pede reagendamento.
    const vencidoRestante = useMemo(() => {
      if (withDiscount) return 0; // quitacao total
      if (acordoAtivo) return vencidoTotal; // pagamento aqui nao abate o acordo
      const aplicadoPor = new Map(
        itensPagamento.map((p) => [p.idParcela, p.aplicado + p.desconto]),
      );
      return round2(
        parcelasAbertas
          .filter((p) => p.vencida)
          .reduce(
            (s, p) => s + p.saldo - (aplicadoPor.get(p.idParcela) ?? 0),
            0,
          ),
      );
    }, [withDiscount, acordoAtivo, vencidoTotal, itensPagamento, parcelasAbertas]);
    const precisaAcompanhamento = vencidoRestante > 0.01;

    // Conferencia (etapa 3): o que cada parcela recebe. So no modo parcelas
    // -- nos outros casos a distribuicao e por venda (saleDistribution).
    const abatimentoPorParcela = modoParcelas
      ? itensPagamento.filter((p) => p.aplicado > 0 || p.desconto > 0)
      : null;

    // Item 67: multa/juros do Ciclone que ficaram de fora (todos ou parte),
    // com as parcelas marcadas quitadas pelo valor. So com acordo do gestor:
    // o cobrador justifica na observacao (pedido do usuario, 2026-11-16).
    const encargoNaoCobrado =
      modoParcelas &&
      encargoMarcadas > 0.009 &&
      alocacao.situacao === "fecha"
        ? Math.max(0, round2(encargoMarcadas - jurosInformado))
        : 0;
    const prefixoNaoCobrado = `Multa e juros do Ciclone não cobrados (${formatCurrency(
      encargoNaoCobrado,
    )}). Motivo:`;
    /** O que o cobrador escreveu alem do texto preenchido pelo sistema. */
    const motivoNaoCobrado = observations.trim().startsWith(prefixoNaoCobrado)
      ? observations.trim().slice(prefixoNaoCobrado.length).trim()
      : observations.trim();

    // Observacao obrigatoria quando ha algo a justificar: desconto,
    // juros/multa (regra do item 58) ou multa/juros do Ciclone nao cobrados.
    const observacaoObrigatoria =
      withDiscount ||
      descontoMarcadas > 0 ||
      jurosValor > 0 ||
      encargoNaoCobrado > 0.009;
    const motivoObservacao = withDiscount || descontoMarcadas > 0
      ? "o desconto"
      : encargoNaoCobrado > 0.009
        ? `por que ${formatCurrency(encargoNaoCobrado)} de multa e juros não foram cobrados (combinado com o gestor?)`
        : "os juros/multa acordados";

    // Distribuicao por venda, calculada no render (useMemo): antes ficava num
    // estado atualizado por useEffect, e um Enter logo depois de digitar o
    // valor via a lista ainda vazia ("Não há parcela em aberto").
    const saleDistribution = useMemo((): SaleDistributionItem[] => {
      const paymentAmount = amountToDistribute;
      // Exige um pagamento positivo mesmo na quitação com desconto: não faz
      // sentido "quitar" sem receber nada (desconto de 100%).
      if (paymentAmount <= 0) {
        return [];
      }

      // Sem desconto e sem acordo: distribui parcela a parcela, vencimento
      // mais antigo primeiro (mesma ordem do process_payment), e soma por
      // venda. Antes ia pela venda de MENOR saldo, o que podia mandar o
      // dinheiro para parcela a vencer com outra venda em atraso.
      if (modoParcelas) {
        // Desconto nas marcadas vai por venda junto do pagamento: o
        // process_payment aplica desconto e pagamento as parcelas abertas da
        // venda em ordem de vencimento, e a soma por venda = as marcadas dela
        // (as marcadas sao sempre as mais antigas do cliente).
        const porVenda = new Map<
          number,
          { sale: SaleGroup; aplicado: number; desconto: number }
        >();
        itensPagamento.forEach((p) => {
          if (p.aplicado <= 0 && p.desconto <= 0) return;
          const atual = porVenda.get(p.sale.saleNumber) ?? {
            sale: p.sale,
            aplicado: 0,
            desconto: 0,
          };
          atual.aplicado = round2(atual.aplicado + p.aplicado);
          atual.desconto = round2(atual.desconto + p.desconto);
          porVenda.set(p.sale.saleNumber, atual);
        });
        const saldoDaVenda = (saleNumber: number) =>
          round2(
            parcelasAbertas
              .filter((p) => p.sale.saleNumber === saleNumber)
              .reduce((s, p) => s + p.saldo, 0),
          );
        return Array.from(porVenda.values())
          .filter((v) => v.aplicado > 0 || v.desconto > 0)
          .map(({ sale, aplicado, desconto: descontoVenda }) => ({
            sale,
            currentReceived: sale.totalReceived || 0,
            appliedAmount: aplicado,
            appliedDiscount: descontoVenda,
            newAmount: (sale.totalReceived || 0) + aplicado,
            willBeComplete:
              saldoDaVenda(sale.saleNumber) - aplicado - descontoVenda <= 0.01,
          }));
      }

      let remainingPayment = paymentAmount;
      let remainingDiscount = withDiscount ? totalPending - paymentAmount : 0;
      if (remainingDiscount < 0) remainingDiscount = 0;

      const newDistribution: SaleDistributionItem[] = [];

      const sortedSales = [...(clientSales || [])].sort((a, b) => {
        return (a.pendingValue || 0) - (b.pendingValue || 0);
      });

      for (const sale of sortedSales) {
        let pendingValue = sale.pendingValue || 0;
        if (pendingValue <= 0) continue;

        const discountForThisSale = Math.min(remainingDiscount, pendingValue);
        pendingValue -= discountForThisSale;
        remainingDiscount -= discountForThisSale;

        const paymentForThisSale = Math.min(remainingPayment, pendingValue);
        pendingValue -= paymentForThisSale;
        remainingPayment -= paymentForThisSale;

        if (paymentForThisSale > 0 || discountForThisSale > 0) {
          newDistribution.push({
            sale,
            currentReceived: sale.totalReceived || 0,
            appliedAmount: paymentForThisSale,
            appliedDiscount: discountForThisSale,
            newAmount: (sale.totalReceived || 0) + paymentForThisSale,
            willBeComplete: pendingValue <= 0.01,
          });
        }
      }

      return newDistribution;
    }, [
      amountToDistribute,
      clientSales,
      withDiscount,
      totalPending,
      modoParcelas,
      itensPagamento,
      parcelasAbertas,
    ]);

    // ---------- Etapas: 1 Valor -> 2 Pagamento -> 3 Conferir ----------
    // Cada "Continuar" valida so a sua etapa; o erro aparece na propria tela
    // (sem alert -- dialog nativo trava a aba).

    /** Erro da etapa 1 (valor), ou null. */
    const erroDoValor = (): string | null => {
      if (!dataPagamentoValida) {
        return `Escolha uma data entre ${dataMinima.split("-").reverse().join("/")} e hoje.`;
      }
      if (modoParcelas && emForaDeOrdem && !parcelaForaDeOrdem) {
        return "Escolha a parcela do boleto que o cliente pagou.";
      }
      if (emForaDeOrdem && anterioresForaDeOrdem.length === 0) {
        return "Essa já é a parcela mais antiga em aberto: volte para a ordem normal.";
      }
      if (modoParcelas && qtdMarcadas === 0) {
        return "Marque a(s) parcela(s) que o cliente está pagando.";
      }
      // Exige valor positivo mesmo na quitação com desconto (sem "desconto de 100%").
      if (amountToDistribute <= 0)
        return "Informe o valor que o cliente pagou.";
      if (modoParcelas && alocacao.situacao === "jurosMaior") {
        return "Os juros/multa informados são maiores que o valor recebido.";
      }
      // Opcao de desconto escolhida para PEDIR ao gestor (item 71): nao
      // registra o pagamento enquanto isso -- ou envia e espera, ou volta
      // para "Fica devendo".
      if (pedidoTipoAtivo) {
        return pedidoEnviado
          ? "Pedido enviado ao gestor. Espere a aprovação ou escolha “Fica devendo” para registrar sem desconto."
          : "Envie o pedido de desconto ao gestor ou escolha “Fica devendo”.";
      }
      if (acimaSemJuros) {
        return `Você marcou ${formatCurrency(alocacao.somaParcelas)} em parcelas que ainda não venceram (sem juros). O valor não pode passar disso${qtdMarcadas < parcelasAbertas.length ? " — para adiantar mais, marque mais parcelas" : ""}.`;
      }
      if (avisoAcima) {
        return `Diga se os ${formatCurrency(alocacao.aMais)} a mais são juros/multa acordados ou erro de digitação.`;
      }
      // Sem desconto, não permite abater mais que o saldo devedor (o excedente
      // seria descartado silenciosamente na distribuição). Juros/multa não
      // abatem parcela, por isso ficam fora desta conta.
      if (!withDiscount && principal > totalPending + 0.01) {
        return `O valor não pode ser maior que o saldo devedor (${formatCurrency(totalPending)}).`;
      }
      if (withDiscount && amountToDistribute > totalPending + 0.01) {
        return "Na quitação com desconto o valor pago não pode passar do saldo devedor.";
      }
      if (saleDistribution.length === 0) {
        return acordoAtivo
          ? "Não há títulos fora do acordo para abater. Registre o pagamento na tela do acordo."
          : "Não há parcela em aberto para abater.";
      }
      return null;
    };

    /** Erro da etapa 2 (forma e observação), ou null. A data e da etapa 1. */
    const erroDoPagamento = (): string | null => {
      if (observacaoObrigatoria && !observations.trim()) {
        return `Explique ${motivoObservacao} na observação.`;
      }
      if (encargoNaoCobrado > 0.009 && !motivoNaoCobrado) {
        return `Escreva na observação por que ${formatCurrency(encargoNaoCobrado)} de multa e juros não foram cobrados.`;
      }
      return null;
    };

    /** Erro do agendamento da proxima visita (externo com vencido), ou null. */
    const erroDoAgendamento = (): string | null => {
      if (!(precisaAcompanhamento && ehExterno)) return null;
      if (!rescheduleDate || !rescheduleTime) {
        return "Informe a data e o horário da próxima visita.";
      }
      if (rescheduleDate < hoje)
        return "A data da visita não pode estar no passado.";
      if (rescheduleDate === hoje && rescheduleTime <= horaLocalAgora()) {
        return "Esse horário de hoje já passou.";
      }
      return null;
    };

    const avancar = () => {
      const erro = etapa === 1 ? erroDoValor() : erroDoPagamento();
      setErroEtapa(erro);
      if (erro) return;
      // Item 67: indo para "Pagamento", deixa a observacao pronta quando ha
      // multa/juros do Ciclone. So mexe se o cobrador nao escreveu nada ou se
      // o texto ainda e o que o sistema preencheu (voltou e mudou o valor:
      // o texto antigo nao vale mais).
      if (etapa === 1) {
        const automatica =
          encargoNaoCobrado > 0.009
            ? `${prefixoNaoCobrado} `
            : modoParcelas &&
                encargoMarcadas > 0.009 &&
                Math.abs(jurosInformado - encargoMarcadas) <= 0.01
              ? `Multa e juros do Ciclone ${ateDataPagamento} (${formatCurrency(encargoMarcadas)}).`
              : "";
        if (
          !observations.trim() ||
          observations === observacaoAutomatica.current
        ) {
          setObservations(automatica);
          observacaoAutomatica.current = automatica;
        }
      }
      setEtapa((e) => (e === 1 ? 2 : 3));
    };

    const voltar = () => {
      setErroEtapa(null);
      setEtapa((e) => (e === 3 ? 2 : 1));
    };

    const confirmar = async () => {
      if (!user) {
        setErroEtapa("Usuário não identificado. Entre de novo no app.");
        return;
      }
      const erro = erroDoValor() ?? erroDoPagamento() ?? erroDoAgendamento();
      setErroEtapa(erro);
      if (erro) return;
      if (precisaConferir && !conferido) {
        setErroEtapa('Marque "Conferi os valores" para confirmar.');
        return;
      }
      await registrarPagamento(
        precisaAcompanhamento && ehExterno
          ? { data: rescheduleDate, horario: rescheduleTime }
          : null,
      );
    };

    // Enter no formulario: avanca (ou confirma na ultima etapa).
    const handleSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      if (loading) return;
      if (etapa < 3) avancar();
      else void confirmar();
    };

    /**
     * Texto automatico da interacao gravada junto do pagamento (Historico de
     * Contatos): quanto, como, o que cada parcela recebeu e como o cliente
     * ficou. Ex.: "Pagamento de R$ 150,61 (PIX): parcela de 05/11 quitada;
     * R$ 3,11 de juros/multa. Cliente ficou sem valor vencido."
     */
    const resumoDoPagamento = (): string => {
      const dataBR = (iso: string) =>
        iso ? iso.slice(0, 10).split("-").reverse().slice(0, 2).join("/") : "?";
      const partes: string[] = [];
      if (withDiscount) {
        partes.push(
          `quitação com desconto de ${formatCurrency(Math.max(0, totalPending - amountToDistribute))}`,
        );
      } else if (modoParcelas) {
        // Mesma alocacao da distribuicao (vencimento mais antigo primeiro).
        itensPagamento.forEach((p) => {
          if (p.aplicado <= 0 && p.desconto <= 0) return;
          partes.push(
            p.aplicado + p.desconto >= p.saldo - 0.01
              ? `parcela de ${dataBR(p.vencimento)} quitada`
              : `${formatCurrency(p.aplicado)} abatidos da parcela de ${dataBR(p.vencimento)}`,
          );
        });
        if (descontoMarcadas > 0) {
          partes.push(
            `desconto de ${formatCurrency(descontoMarcadas)} nas parcelas pagas`,
          );
        }
      }
      if (jurosValor > 0) {
        partes.push(`${formatCurrency(jurosValor)} de juros/multa`);
      }
      const forma = FORMA_PAGAMENTO_LABEL[paymentMethod] ?? paymentMethod;
      const situacao = precisaAcompanhamento
        ? `Ainda restam ${formatCurrency(vencidoRestante)} vencidos.`
        : "Cliente ficou sem valor vencido.";
      const quando =
        podeEscolherData && dataPagamento !== hoje
          ? ` pago em ${dataBR(dataPagamento)}`
          : "";
      return `${parcelaForaDeOrdem ? "Boleto pago fora de ordem. " : ""}Pagamento de ${formatCurrency(amountToDistribute)} (${forma})${quando}${
        partes.length ? `: ${partes.join("; ")}` : ""
      }. ${situacao}`;
    };

    /**
     * Grava o pagamento (uma chamada de process_payment por venda) e, para
     * cobrador, o acompanhamento:
     *  - carteira: interacao "Pagamento integral/parcial" + conclusao do
     *    contato agendado, numa transacao (RPC registrar_contato, a mesma do
     *    "Atender"); sem agendar proximo contato;
     *  - externo: nova visita presencial, se ainda sobra vencido.
     * O pagamento e o acompanhamento sao gravados em passos separados: se o
     * segundo falhar, o pagamento continua valendo e o aviso diz o que faltou.
     */
    const registrarPagamento = async (
      agendamento: {
        data: string;
        horario: string;
      } | null,
    ) => {
      if (!user) return;
      try {
        setLoading(true);

        // Juros/multa vao junto da primeira venda (um registro so).
        let jurosPendente = jurosValor;
        let gravouAlgum = false;
        try {
          for (const item of saleDistribution) {
            if (item.appliedAmount > 0 || item.appliedDiscount > 0) {
              await processSalePayment(
                {
                  saleNumber: item.sale.saleNumber,
                  clientDocument: clientGroup.document || "",
                  paymentAmount: item.appliedAmount,
                  paymentMethod: paymentMethod,
                  notes: parcelaForaDeOrdem
                    ? `Boleto pago fora de ordem (parcela de ${dataTexto(parcelaForaDeOrdem.vencimento.slice(0, 10))}; as anteriores continuam em aberto).${observations.trim() ? " " + observations.trim() : ""}`
                    : observations.trim(),
                  discountAmount: item.appliedDiscount,
                  parcelas: parcelaForaDeOrdem
                    ? [parcelaForaDeOrdem.idParcela]
                    : undefined,
                  jurosAmount: jurosPendente,
                  paymentDate: podeEscolherData ? dataPagamento : undefined,
                },
                user.id,
                false, // recarrega uma vez so, abaixo
              );
              jurosPendente = 0;
              gravouAlgum = true;
            }
          }
        } finally {
          // Uma recarga so, mesmo com varias vendas -- e tambem quando uma
          // venda do meio falha, para a tela mostrar o que ja foi gravado.
          // Offline nao recarrega (os pagamentos estao na fila).
          if (gravouAlgum && isOnline) {
            await refreshData().catch((err) =>
              console.error("Erro ao recarregar depois do pagamento:", err),
            );
          }
        }

        // Desconto: o gestor e avisado pela regra de notificacoes
        // (config/notificationRules, "Desconto na Venda"), que le os
        // pagamentos do banco. O aviso local daqui so ficava no aparelho de
        // quem registrou (removido em 17/11).
      } catch (error) {
        console.error("Erro ao aplicar distribuição:", error);
        showErrorNotification(error);
        setLoading(false);
        return;
      }

      let avisoAcompanhamento: string | null = null;
      try {
        if (contatoJaRegistrado && ehCarteira) {
          // Atendimento ja registrado pelo Atender; so o pagamento entra.
        } else if (ehCarteira && isOnline) {
          const resultado: CollectionAttempt["result"] = precisaAcompanhamento
            ? "partial_payment"
            : "full_payment";
          const rotulo = ATTEMPT_RESULT_LABELS[resultado];
          const titulos = Array.from(
            new Set(parcelasAbertas.map((p) => p.idParcela.toString())),
          );
          const detalhe = resumoDoPagamento();
          const tipo =
            contatoAgendado?.channel === "whatsapp" ? "whatsapp" : "call";
          const notas = observations.trim()
            ? `${detalhe}\nObs.: ${observations.trim()}`
            : detalhe;
          if (precisaAcompanhamento && contatoAgendado) {
            // Parcial com contato agendado: so registra a interacao e deixa o
            // agendamento como esta (o cobrador segue acompanhando por ele).
            // A RPC registrar_contato concluiria o agendamento.
            const { error } = await supabase.from("collection_attempts").insert(
              titulos.map((t) => ({
                collection_id: t,
                date: hoje,
                type: tipo,
                result: resultado,
                notes: notas,
                collector_id: user.id,
              })),
            );
            if (error) throw error;
          } else {
            // Ficou sem vencido (ou nao havia agendamento): interacao +
            // conclusao do contato agendado, numa transacao.
            const { error } = await supabase.rpc("registrar_contato", {
              p_documento: clientGroup.document,
              p_nome_cliente: clientGroup.client,
              p_titulos: titulos,
              p_data: hoje,
              p_tipo: tipo,
              p_resultado: resultado,
              p_notas: notas,
              p_visita_id: contatoAgendado?.id,
              p_rotulo_resultado: rotulo,
              p_reagendar: false,
            });
            if (error) throw error;
          }
        } else if (ehCarteira) {
          avisoAcompanhamento =
            "Pagamento na fila offline. Registre o contato pelo “Atender” quando voltar a conexão.";
        } else if (ehExterno && agendamento) {
          const visitData: Omit<ScheduledVisit, "id" | "createdAt"> = {
            collectorId: user.id,
            clientDocument: clientGroup.document,
            clientName: clientGroup.client,
            scheduledDate: agendamento.data,
            scheduledTime: agendamento.horario,
            status: "agendada",
            notes: `Visita reagendada após pagamento parcial — restam ${formatCurrency(vencidoRestante)} vencidos.`,
            clientAddress: clientGroup.address,
            clientNeighborhood: clientGroup.neighborhood,
            clientCity: clientGroup.city,
            totalPendingValue: round2(totalPending - principal),
            overdueCount: 0, // This might need adjustment based on real data
            channel: "presencial",
          };
          await scheduleVisit(visitData);
        }
        if (ehCarteira || ehExterno) await fetchScheduledVisits(false);
      } catch (error) {
        console.error("Erro ao registrar acompanhamento do pagamento:", error);
        const msg =
          error instanceof Error
            ? error.message
            : ((error as { message?: string })?.message ?? String(error));
        avisoAcompanhamento = `Pagamento registrado, mas ${ehCarteira ? "o contato não foi salvo" : "a visita não foi salva"}: ${msg}`;
      }

      setLoading(false);
      if (avisoAcompanhamento) {
        showErrorNotification(new Error(avisoAcompanhamento));
      } else {
        showSuccessNotification(
          agendamento
            ? "Pagamento registrado e visita reagendada!"
            : "Pagamento distribuído com sucesso!",
        );
      }
      invalidarHistoricoCliente(clientGroup.document);
      onSuccess();
      onClose();
    };

    const showSuccessNotification = (message?: string) => {
      const notification = document.createElement("div");
      notification.className =
        "fixed top-4 right-4 bg-green-500 text-white px-4 py-2 rounded-2xl shadow-lg z-50 flex items-center";

      const successMessage =
        message ||
        (isOnline
          ? "Pagamento distribuído com sucesso!"
          : "Pagamento adicionado à fila offline!");

      notification.innerHTML = `
      <svg class="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
        <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"></path>
      </svg>
      ${successMessage}
    `;
      document.body.appendChild(notification);
      setTimeout(() => {
        if (document.body.contains(notification)) {
          document.body.removeChild(notification);
        }
      }, 5000);
    };

    const showErrorNotification = (error: unknown) => {
      const errorMessage =
        error instanceof Error ? error.message : "Erro desconhecido";

      const notification = document.createElement("div");
      notification.className =
        "fixed top-4 right-4 bg-red-500 text-white px-4 py-2 rounded-2xl shadow-lg z-50 flex items-center max-w-md";
      notification.innerHTML = `
      <svg class="w-5 h-5 mr-2 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
        <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"></path>
      </svg>
      <div>
        <div class="font-semibold">Erro ao registrar pagamento</div>
        <div class="text-sm"></div>
      </div>
    `;
      // Mensagem como texto (vem do servidor): nada de HTML injetado.
      const corpo = notification.querySelector("div > div.text-sm");
      if (corpo) corpo.textContent = errorMessage;
      document.body.appendChild(notification);
      setTimeout(() => {
        if (document.body.contains(notification)) {
          document.body.removeChild(notification);
        }
      }, 8000);
    };

    const ETAPAS = ["Valor", "Pagamento", "Conferir"] as const;
    // Modal largo em duas colunas no computador (no modo parcelas); no
    // celular continua uma coluna so.
    const duasColunas = modoParcelas;
    const grade = duasColunas
      ? "space-y-5 md:space-y-0 md:grid md:grid-cols-2 md:gap-6 md:items-start"
      : "space-y-5";
    const formaRotulo = FORMA_PAGAMENTO_LABEL[paymentMethod] ?? paymentMethod;
    const dataTexto = (iso: string) => iso.split("-").reverse().join("/");
    const desconto = withDiscount
      ? round2(Math.max(0, totalPending - amountToDistribute))
      : descontoMarcadas;

    /** "O que fazer com a diferenca?" -- as 3 saidas de um valor menor que o
     * devido, lado a lado e com o desconto em R$ e %: fica devendo (padrao),
     * desconto so nas marcadas, ou quitar a divida inteira. null = nao ha o
     * que perguntar (valor cheio, juros informado, acordo ativo). */
    const escolhaDiferenca = (() => {
      if (acordoAtivo || amountToDistribute <= 0) return null;
      if (!withDiscount && amountToDistribute >= totalPending - 0.01) return null;
      if (modoParcelas && jurosInformado > 0) return null;
      const parcial = alocacao.situacao === "parcial";
      const fecha = alocacao.situacao === "fecha";
      const descontoTudo = round2(Math.max(0, totalPending - amountToDistribute));
      // Gestor/externo: sem teto. Demais: ate o autorizado (item 71).
      const cabe = (v: number) => v <= descontoMaximo + 0.009;
      if (!withDiscount && !(parcial || (fecha && cabe(descontoTudo)))) {
        return null;
      }

      const pct = (v: number, base: number) =>
        base > 0 ? `${((v / base) * 100).toFixed(1).replace(".", ",")}%` : "";
      const n = alocacao.itens.length;
      const nAbertas = parcelasAbertas.length;
      const nOutras = Math.max(0, nAbertas - n);
      const nAVencer = parcelasAbertas.filter((p) => !p.vencida).length;
      const outrasTexto =
        nOutras > 0
          ? ` ${nOutras === 1 ? "A outra parcela continua" : `As outras ${nOutras} continuam`} em aberto.`
          : "";
      const diferenca = round2(alocacao.somaParcelas - alocacao.principal);

      let detalheBase = "Só as parcelas marcadas, sem desconto.";
      if (parcial) {
        const partes: string[] = [];
        const quitadas = alocacao.itens.filter((p) => p.quita).length;
        if (quitadas > 0) {
          partes.push(
            `quita ${quitadas} ${quitadas === 1 ? "parcela" : "parcelas"}`,
          );
        }
        const parcialItem = alocacao.itens.find(
          (p) => !p.quita && p.aplicado > 0,
        );
        if (parcialItem) {
          partes.push(
            `a de ${dataTexto(parcialItem.vencimento.slice(0, 10))} fica faltando ${formatCurrency(round2(parcialItem.saldo - parcialItem.aplicado))}`,
          );
        }
        const semNada = alocacao.itens.filter((p) => p.aplicado <= 0).length;
        if (semNada > 0) {
          partes.push(
            `${semNada} ${semNada === 1 ? "parcela marcada fica" : "parcelas marcadas ficam"} sem pagamento`,
          );
        }
        const t = partes.join(", ") || "nada é quitado";
        detalheBase = t.charAt(0).toUpperCase() + t.slice(1) + ".";
      } else if (fecha) {
        detalheBase = `Quita ${n === 1 ? "a parcela marcada" : `as ${n} parcelas marcadas`}.${outrasTexto}`;
      }

      const opcoes: {
        chave: "devendo" | "marcadas" | "tudo";
        titulo: string;
        detalhe: string;
        /** Interno/terceirizado/juridico sem autorizacao que cubra: clicar
         * abre o pedido ao gestor dentro da propria opcao (item 71). */
        precisaGestor: boolean;
        tipoPedido: TipoPedidoDesconto | null;
      }[] = [
        {
          chave: "devendo",
          titulo: parcial ? "Fica devendo" : "Sem desconto",
          detalhe: detalheBase,
          precisaGestor: false,
          tipoPedido: null,
        },
      ];
      if (parcial) {
        opcoes.push({
          chave: "marcadas",
          titulo: `Desconto de ${formatCurrency(diferenca)} (${pct(diferenca, alocacao.somaParcelas)})`,
          detalhe: `Quita ${n === 1 ? "a parcela marcada" : `as ${n} parcelas marcadas`}.${outrasTexto}`,
          precisaGestor: !cabe(diferenca),
          tipoPedido: "parcelas",
        });
      }
      opcoes.push({
        chave: "tudo",
        titulo: `Quitar a dívida inteira — desconto de ${formatCurrency(descontoTudo)} (${pct(descontoTudo, totalPending)})`,
        detalhe: `Quita ${nAbertas === 1 ? "a parcela" : `as ${nAbertas} parcelas`} do cliente${
          nAVencer > 0
            ? `, inclusive ${nAVencer} que ainda não ${nAVencer === 1 ? "venceu" : "venceram"}`
            : ""
        }.`,
        precisaGestor: !cabe(descontoTudo),
        tipoPedido: "tudo",
      });

      return {
        pergunta: parcial
          ? `O cliente pagou ${formatCurrency(diferenca)} a menos que as parcelas marcadas (${formatCurrency(alocacao.somaParcelas)}). O que fazer com a diferença?`
          : "Dar desconto no restante da dívida?",
        opcoes,
        atual: withDiscount
          ? ("tudo" as const)
          : descontoMarcadas > 0
            ? ("marcadas" as const)
            : ("devendo" as const),
      };
    })();

    /** Pedido escolhido so vale enquanto a opcao dele estiver na tela (mudar
     * o valor pode tira-la; ai volta a valer o registro normal). */
    const pedidoTipoAtivo =
      pedidoTipo &&
      escolhaDiferenca?.opcoes.some(
        (o) => o.precisaGestor && o.tipoPedido === pedidoTipo,
      )
        ? pedidoTipo
        : null;

    /** Pedido de desconto ao gestor (item 71): o banco confere o devido das
     * parcelas marcadas (ou do cliente inteiro) e grava o retrato. */
    const enviarPedidoDesconto = async () => {
      if (!pedidoTipo || !clientGroup.document) return;
      setPedidoEnviando(true);
      setPedidoErro(null);
      try {
        await pedirDesconto({
          documento: clientGroup.document,
          tipo: pedidoTipo,
          parcelas: alocacao.itens.map((p) => p.idParcela),
          valorPago: amountToDistribute,
          motivo: pedidoMotivo,
        });
        // A opcao continua marcada e mostra a confirmacao dentro dela.
        setPedidoEnviado(true);
        setPedidoMotivo("");
        setVersaoPedidos((v) => v + 1);
      } catch (e) {
        setPedidoErro(
          e instanceof Error ? e.message : "Falha ao enviar o pedido.",
        );
      } finally {
        setPedidoEnviando(false);
      }
    };

    // O "Confirmar" so libera depois de marcar "Conferi os valores", em todo
    // pagamento -- evita clique acidental (decisao do usuario, 2026-11-16).
    // Os casos de risco aparecem destacados na mesma caixa.
    const motivosConferencia: string[] = [
      ...(desconto > 0.009
        ? [`desconto de ${formatCurrency(desconto)}`]
        : []),
      ...(encargoNaoCobrado > 0.009
        ? [`${formatCurrency(encargoNaoCobrado)} de multa e juros não cobrados`]
        : []),
      ...(quitaTudo || withDiscount ? ["quita toda a dívida do cliente"] : []),
      ...(amountToDistribute >= VALOR_ALTO_CONFERENCIA
        ? [`valor acima de ${formatCurrency(VALOR_ALTO_CONFERENCIA)}`]
        : []),
    ];
    const precisaConferir = true;

    return (
      <div
        className="fixed inset-0 bg-black/50 flex items-stretch sm:items-center justify-center sm:p-4 z-[110]"
        onClick={(e) => {
          if (e.target === e.currentTarget && !loading) onClose();
        }}
      >
        <form
          onSubmit={handleSubmit}
          className={`bg-white dark:bg-dark-bg-secondary sm:rounded-2xl ${duasColunas ? "max-w-xl md:max-w-4xl" : "max-w-xl"} w-full h-full sm:h-auto sm:max-h-[90vh] flex flex-col overflow-hidden shadow-2xl`}
        >
          {/* Cabecalho */}
          <div className="px-4 sm:px-6 pt-4 pb-3 border-b border-gray-200 dark:border-dark-border shrink-0">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-dark-text">
                  Receber pagamento
                </h2>
                <p className="text-sm text-gray-500 dark:text-dark-text-secondary truncate">
                  {clientGroup.client || "Cliente"}
                </p>
              </div>
              <button
                type="button"
                id="close-button"
                onClick={onClose}
                disabled={loading}
                className="p-2 -mr-2 text-gray-500 hover:text-gray-800 hover:bg-gray-100 dark:hover:bg-dark-bg-tertiary rounded-full transition-colors disabled:opacity-50"
                aria-label="Fechar"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Etapas */}
            <ol className="mt-3 flex items-center gap-2 text-xs">
              {ETAPAS.map((rotulo, i) => {
                const n = (i + 1) as 1 | 2 | 3;
                const feita = n < etapa;
                const atual = n === etapa;
                return (
                  <React.Fragment key={rotulo}>
                    {i > 0 && (
                      <span
                        className={`h-px flex-1 ${feita || atual ? "bg-indigo-300" : "bg-gray-200"}`}
                      />
                    )}
                    <li
                      className={`flex items-center gap-1.5 ${
                        atual
                          ? "text-indigo-700 font-semibold"
                          : feita
                            ? "text-indigo-600"
                            : "text-gray-400"
                      }`}
                      aria-current={atual ? "step" : undefined}
                    >
                      <span
                        className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-semibold ${
                          atual
                            ? "bg-indigo-600 text-white"
                            : feita
                              ? "bg-indigo-100 text-indigo-700"
                              : "bg-gray-100 text-gray-500"
                        }`}
                      >
                        {feita ? <Check className="h-3 w-3" /> : n}
                      </span>
                      {rotulo}
                    </li>
                  </React.Fragment>
                );
              })}
            </ol>

            {!isOnline && (
              <p className="mt-2 flex items-center gap-2 text-xs text-amber-700">
                <span className="w-2 h-2 bg-amber-400 rounded-full animate-pulse" />
                Sem conexão: o pagamento vai para a fila e é enviado depois.
              </p>
            )}
          </div>

          {/* Conteudo da etapa (unica area com rolagem) */}
          <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 py-5 space-y-5">
            {etapa === 1 && (
              <>
                {acordoAtivo && (
                  <div className="p-3 border border-amber-200 bg-amber-50 rounded-xl flex items-start gap-2 text-sm text-amber-800">
                    <Info className="w-4 h-4 mt-0.5 shrink-0" />
                    <p>
                      Cliente com <strong>acordo ativo</strong>: aqui só entram
                      títulos fora do acordo. Parcela do acordo se paga na tela
                      do acordo.
                    </p>
                  </div>
                )}

                <div className={grade}>
                  {modoParcelas && (
                    <div>
                      {seletorData && <div className="mb-4">{seletorData}</div>}
                      <h3 className="text-sm font-semibold text-gray-900 dark:text-dark-text mb-2">
                        O que o cliente está pagando?
                      </h3>
                      {variasVendas && (
                        <div className="mb-2 space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs text-gray-500 dark:text-dark-text-secondary">
                              {vendasDaLista.length} vendas em aberto
                            </span>
                            <div
                              role="group"
                              aria-label="Organizar parcelas"
                              className="inline-flex rounded-lg border border-gray-200 dark:border-dark-border p-0.5 text-xs"
                            >
                              {(
                                [
                                  ["vencimento", "Por vencimento"],
                                  ["venda", "Por venda"],
                                ] as const
                              ).map(([valor, rotulo]) => (
                                <button
                                  key={valor}
                                  type="button"
                                  onClick={() => setOrdenarPor(valor)}
                                  aria-pressed={ordenarPor === valor}
                                  className={`px-2.5 py-1 rounded-md font-medium ${
                                    ordenarPor === valor
                                      ? "bg-indigo-600 text-white"
                                      : "text-gray-600 hover:bg-gray-100 dark:text-dark-text-secondary dark:hover:bg-dark-bg-tertiary"
                                  }`}
                                >
                                  {rotulo}
                                </button>
                              ))}
                            </div>
                          </div>
                          {ordenarPor === "venda" ? (
                            <p className="text-xs text-gray-500 dark:text-dark-text-secondary">
                              O pagamento abate sempre da parcela mais antiga do
                              cliente, em qualquer venda.
                            </p>
                          ) : (
                            <div className="flex flex-wrap gap-1.5">
                              {vendasDaLista.map((v) => (
                                <span
                                  key={v.saleNumber}
                                  className={`px-2 py-0.5 rounded-full text-xs font-medium ${corDaVenda(v.saleNumber).etiqueta}`}
                                >
                                  {nomeVenda(v.saleNumber)}
                                  {v.titulo
                                    ? ` · Título ${v.titulo}`
                                    : ""} · {formatCurrency(v.saldo)}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                      {parcelasAbertas.length === 0 ? (
                        <p className="text-sm text-gray-500">
                          Não há parcela em aberto.
                        </p>
                      ) : (
                        <ul className="divide-y divide-gray-100 dark:divide-dark-border border border-gray-200 dark:border-dark-border rounded-xl overflow-hidden">
                          {(() => {
                            const linha = (
                              p: (typeof parcelasAbertas)[number],
                              i: number,
                            ) => {
                              if (!p.vencida && !aVencerVisivel) return null;
                              const marcada = emForaDeOrdem
                                ? p.idParcela === foraDeOrdemId
                                : i < qtdMarcadasOrdem;
                              return (
                                <li key={p.idParcela}>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (emForaDeOrdem) {
                                        // Uma parcela so, com o valor dela.
                                        setForaDeOrdemId(p.idParcela);
                                        setDistributionAmount(
                                          valorParaCampo(p.saldo),
                                        );
                                      } else {
                                        setQtdMarcadasEscolhida(
                                          marcada ? i : i + 1,
                                        );
                                      }
                                      setErroEtapa(null);
                                    }}
                                    className={`w-full flex items-start gap-3 px-3 py-2.5 text-left text-sm transition-colors ${
                                      variasVendas
                                        ? `border-l-4 ${corDaVenda(p.sale.saleNumber).faixa}`
                                        : ""
                                    } ${
                                      marcada
                                        ? "bg-indigo-50 dark:bg-indigo-900/20"
                                        : "hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary"
                                    }`}
                                    aria-pressed={marcada}
                                  >
                                    <span
                                      className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 ${
                                        marcada
                                          ? "border-indigo-600 bg-indigo-600 text-white"
                                          : "border-gray-300"
                                      }`}
                                    >
                                      {marcada && <Check className="h-3 w-3" />}
                                    </span>
                                    <span className="min-w-0 flex-1">
                                      <span className="block text-gray-900 dark:text-dark-text">
                                        {ordenarPor === "venda"
                                          ? p.numero != null
                                            ? `Parcela ${p.numero}`
                                            : "Parcela"
                                          : rotuloParcela(
                                              p.sale.saleNumber,
                                              p.numero,
                                            )}
                                      </span>
                                      <span
                                        className={`block text-xs ${p.vencida ? "text-red-600" : "text-gray-500"}`}
                                      >
                                        venc.{" "}
                                        {dataTexto(p.vencimento.slice(0, 10))}
                                        {p.vencida &&
                                          ` · ${p.diasAtraso} ${p.diasAtraso === 1 ? "dia" : "dias"} de atraso`}
                                      </span>
                                      {p.jaPago > 0.01 && (
                                        <span className="block text-xs text-gray-500">
                                          já pago {formatCurrency(p.jaPago)} de{" "}
                                          {formatCurrency(p.valorOriginal)}
                                        </span>
                                      )}
                                    </span>
                                    <span className="text-right shrink-0">
                                      <span className="block font-semibold tabular-nums text-gray-900 dark:text-dark-text">
                                        {formatCurrency(p.saldo)}
                                      </span>
                                    </span>
                                  </button>
                                </li>
                              );
                            };
                            if (!(variasVendas && ordenarPor === "venda")) {
                              return parcelasAbertas.map((p, i) => linha(p, i));
                            }
                            // Por venda: cabecalho (venda, titulo, saldo) e as
                            // parcelas dela; o indice continua o global (a
                            // marcacao segue a ordem de vencimento do cliente).
                            return vendasDaLista.map((v) => {
                              const daVenda = parcelasAbertas
                                .map((p, i) => ({ p, i }))
                                .filter(
                                  ({ p }) => p.sale.saleNumber === v.saleNumber,
                                );
                              const visiveis = daVenda.filter(
                                ({ p }) => p.vencida || aVencerVisivel,
                              );
                              if (visiveis.length === 0) return null;
                              return (
                                <React.Fragment key={`venda-${v.saleNumber}`}>
                                  <li
                                    className={`flex items-center justify-between gap-2 px-3 py-2 bg-gray-50 dark:bg-dark-bg-tertiary border-l-4 ${corDaVenda(v.saleNumber).faixa}`}
                                  >
                                    <span className="min-w-0">
                                      <span className="block text-sm font-semibold text-gray-900 dark:text-dark-text">
                                        {nomeVenda(v.saleNumber)}
                                      </span>
                                      {v.titulo > 0 && (
                                        <span className="block text-xs text-gray-500">
                                          Título {v.titulo}
                                        </span>
                                      )}
                                    </span>
                                    <span className="text-right text-xs text-gray-600 dark:text-dark-text-secondary shrink-0">
                                      {v.qtd}{" "}
                                      {v.qtd === 1 ? "parcela" : "parcelas"}
                                      <span className="block font-semibold text-gray-900 dark:text-dark-text tabular-nums">
                                        {formatCurrency(v.saldo)}
                                      </span>
                                    </span>
                                  </li>
                                  {visiveis.map(({ p, i }) => linha(p, i))}
                                </React.Fragment>
                              );
                            });
                          })()}
                          {!emForaDeOrdem &&
                            qtdVencidas > 0 &&
                            parcelasAbertas.length > qtdVencidas && (
                              <li>
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (mostrarAVencer) {
                                      setQtdMarcadasEscolhida(
                                        Math.min(qtdMarcadasOrdem, qtdVencidas),
                                      );
                                    }
                                    setMostrarAVencer(!mostrarAVencer);
                                    setErroEtapa(null);
                                  }}
                                  className="w-full flex items-center gap-2 px-3 py-2.5 text-left text-sm text-indigo-700 hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary"
                                >
                                  <ChevronRight
                                    className={`h-4 w-4 transition-transform ${mostrarAVencer ? "rotate-90" : ""}`}
                                  />
                                  {mostrarAVencer
                                    ? "Esconder parcelas a vencer"
                                    : `Adiantar parcelas a vencer (${parcelasAbertas.length - qtdVencidas})`}
                                </button>
                              </li>
                            )}
                        </ul>
                      )}
                      {parcelasAbertas.length > 1 && foraDeOrdem === "nao" && (
                        <button
                          type="button"
                          onClick={() => {
                            setForaDeOrdem("aviso");
                            setEsperaForaDeOrdem(ESPERA_FORA_DE_ORDEM);
                            setErroEtapa(null);
                          }}
                          className="mt-2 text-xs text-gray-500 dark:text-dark-text-secondary underline hover:text-gray-700"
                        >
                          O cliente pagou um boleto fora de ordem?
                        </button>
                      )}
                      {foraDeOrdem === "aviso" && (
                        <div className="mt-2">
                          <Aviso tom="erro" titulo="Boleto pago fora de ordem">
                            <p>
                              Só para quando o cliente pagou, por engano, um
                              boleto mais novo com outro mais antigo em aberto
                              (ex.: pagou o de dezembro com o de novembro
                              aberto).
                            </p>
                            <p className="mt-1">
                              Só a parcela que você escolher é baixada. As mais
                              antigas <strong>continuam em aberto e
                              vencidas</strong> — avise o cliente.
                            </p>
                            <div className="mt-2 flex flex-wrap gap-2">
                              <button
                                type="button"
                                disabled={esperaForaDeOrdem > 0}
                                onClick={() => {
                                  setForaDeOrdem("ativo");
                                  setForaDeOrdemId(null);
                                  setDistributionAmount("");
                                  setErroEtapa(null);
                                }}
                                className="px-3 py-1.5 text-xs font-semibold rounded-full bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed tabular-nums"
                              >
                                {esperaForaDeOrdem > 0
                                  ? `Leia o aviso (${esperaForaDeOrdem}s)`
                                  : "Entendi, escolher a parcela"}
                              </button>
                              <button
                                type="button"
                                onClick={sairForaDeOrdem}
                                className="px-3 py-1.5 text-xs font-medium rounded-full border border-red-200 bg-white text-red-700 hover:bg-red-50"
                              >
                                Cancelar
                              </button>
                            </div>
                          </Aviso>
                        </div>
                      )}
                      {emForaDeOrdem && (
                        <div className="mt-2">
                          <Aviso tom="erro" titulo="Boleto pago fora de ordem">
                            {!parcelaForaDeOrdem ? (
                              <p>Toque na parcela do boleto que o cliente pagou.</p>
                            ) : anterioresForaDeOrdem.length === 0 ? (
                              <p>
                                Essa já é a parcela mais antiga em aberto: não
                                precisa da exceção.
                              </p>
                            ) : (
                              <p>
                                {anterioresForaDeOrdem.length === 1
                                  ? "1 parcela mais antiga continua"
                                  : `${anterioresForaDeOrdem.length} parcelas mais antigas continuam`}{" "}
                                em aberto (
                                {formatCurrency(
                                  round2(
                                    anterioresForaDeOrdem.reduce(
                                      (s, p) => s + p.saldo,
                                      0,
                                    ),
                                  ),
                                )}
                                ). Avise o cliente.
                              </p>
                            )}
                            <button
                              type="button"
                              onClick={sairForaDeOrdem}
                              className="mt-1 text-xs underline"
                            >
                              Voltar para a ordem normal
                            </button>
                          </Aviso>
                        </div>
                      )}
                      {qtdMarcadas > 0 &&
                        modoParcelas &&
                        encargoMarcadas > 0.009 &&
                        jurosInformado <= 0 && (
                          <div className="mt-2 space-y-2 text-sm">
                            <div className="text-gray-600 dark:text-dark-text-secondary">
                              {dataPagamento === hoje
                                ? "A cobrar hoje"
                                : `A cobrar em ${dataPagamento.split("-").reverse().join("/")}`}{" "}
                              <strong className="text-gray-900 dark:text-dark-text tabular-nums">
                                {formatCurrency(
                                  round2(
                                    alocacao.somaParcelas + encargoMarcadas,
                                  ),
                                )}
                              </strong>
                              <span
                                className="ml-1 text-xs text-amber-700 dark:text-amber-400 whitespace-nowrap"
                                title={`Multa e juros de atraso calculados pela regra do Ciclone (Prev. Baixa), ${ateDataPagamento}`}
                              >
                                · {formatCurrency(alocacao.somaParcelas)} +{" "}
                                {formatCurrency(encargoMarcadas)} multa/juros
                              </span>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={receberComEncargo}
                                className="px-3 py-1.5 text-xs font-medium rounded-full border border-indigo-300 bg-indigo-600 text-white hover:bg-indigo-700"
                              >
                                Recebi{" "}
                                {formatCurrency(
                                  round2(
                                    alocacao.somaParcelas + encargoMarcadas,
                                  ),
                                )}{" "}
                                com multa e juros
                              </button>
                              {/* So quando o valor ainda nao e o das parcelas. */}
                              {Math.abs(
                                amountToDistribute - alocacao.somaParcelas,
                              ) > 0.009 && (
                              <button
                                type="button"
                                onClick={receberSemEncargo}
                                className="px-3 py-1.5 text-xs font-medium rounded-full border border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100"
                              >
                                Recebi só {formatCurrency(alocacao.somaParcelas)}
                              </button>
                              )}
                            </div>
                          </div>
                        )}
                      {qtdMarcadas > 0 &&
                        !(
                          modoParcelas &&
                          encargoMarcadas > 0.009 &&
                          jurosInformado <= 0
                        ) && (
                        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-sm">
                          <span className="text-gray-600 dark:text-dark-text-secondary">
                            A cobrar{" "}
                            <strong className="text-gray-900 dark:text-dark-text tabular-nums">
                              {formatCurrency(alocacao.esperado)}
                            </strong>
                            {jurosInformado > 0 && (
                              <span className="block text-xs">
                                parcelas {formatCurrency(alocacao.somaParcelas)}{" "}
                                + juros/multa {formatCurrency(jurosInformado)}
                              </span>
                            )}
                          </span>
                          {/* So quando o valor ainda nao e este. */}
                          {Math.abs(amountToDistribute - alocacao.esperado) >
                            0.009 && (
                            <button
                              type="button"
                              onClick={() => {
                                setDistributionAmount(
                                  valorParaCampo(alocacao.esperado),
                                );
                                setErroEtapa(null);
                              }}
                              className="px-3 py-1.5 text-xs font-medium rounded-full border border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100"
                            >
                              Recebi exatamente este valor
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  <div className="space-y-5 min-w-0">
                    {!modoParcelas && seletorData}
                    <div>
                      <div className="flex gap-3 items-end">
                      <div className="flex-1 min-w-0">
                      <label
                        htmlFor="distribution-amount"
                        className="block text-sm font-semibold text-gray-900 dark:text-dark-text mb-2"
                      >
                        {modoParcelas
                          ? "Quanto você recebeu?"
                          : "Quanto o cliente pagou?"}
                      </label>
                      <div className="relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-lg font-semibold text-gray-400">
                          R$
                        </span>
                        <input
                          id="distribution-amount"
                          name="distributionAmount"
                          type="text"
                          inputMode="decimal"
                          autoComplete="off"
                          // No modo parcelas a lista vem primeiro (o teclado do
                          // celular cobriria a lista).
                          autoFocus={!modoParcelas}
                          value={distributionAmount}
                          onChange={(e) => {
                            setDistributionAmount(
                              e.target.value.replace(/[^\d.,]/g, ""),
                            );
                            setErroEtapa(null);
                          }}
                          className="w-full pl-12 pr-4 py-3 border border-gray-300 dark:border-dark-border rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-2xl font-semibold tabular-nums dark:bg-dark-bg dark:text-dark-text"
                          placeholder="0,00"
                        />
                      </div>
                      </div>
                      {/* Juros/multa ao lado: estao DENTRO do valor recebido
                      (sai dele e nao abate parcela). So informados pelo
                      cobrador; fechado por padrao. */}
                      {modoParcelas && mostrarJuros && (
                        <div
                          className="w-36 shrink-0"
                          title="Os juros/multa estão dentro do valor recebido: saem dele e não abatem parcela. Explique na observação."
                        >
                          <label
                            htmlFor="juros-informado"
                            className="flex items-center justify-between text-xs font-semibold text-gray-700 dark:text-dark-text mb-2"
                          >
                            dos quais juros/multa
                            <button
                              type="button"
                              onClick={() => {
                                setMostrarJuros(false);
                                setJurosTexto("");
                                setErroEtapa(null);
                              }}
                              className="text-gray-400 hover:text-gray-700"
                              aria-label="Remover juros/multa"
                              title="Remover juros/multa"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </label>
                          <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-gray-400">
                              R$
                            </span>
                            <input
                              id="juros-informado"
                              type="text"
                              inputMode="decimal"
                              autoComplete="off"
                              value={jurosTexto}
                              onChange={(e) => {
                                setJurosTexto(
                                  e.target.value.replace(/[^\d.,]/g, ""),
                                );
                                setErroEtapa(null);
                              }}
                              className="w-full pl-9 pr-2 py-3 border border-gray-300 dark:border-dark-border rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-lg font-semibold tabular-nums dark:bg-dark-bg dark:text-dark-text"
                              placeholder="0,00"
                            />
                          </div>
                        </div>
                      )}
                      </div>
                      {modoParcelas && !mostrarJuros && (
                        <button
                          type="button"
                          onClick={() => setMostrarJuros(true)}
                          className="mt-1.5 text-xs font-medium text-indigo-700 hover:text-indigo-900"
                        >
                          + Juros/multa acordados
                        </button>
                      )}
                      {/* Com acordo ativo (modo so por valor) segue o atalho do
                      saldo; no modo parcelas o atalho e "Recebi exatamente
                      este valor", limitado ao que foi marcado. */}
                      {acordoAtivo && !withDiscount && (
                        <div className="mt-2 flex flex-wrap gap-2">
                          <button
                            id="total-balance-button"
                            type="button"
                            onClick={() => {
                              setDistributionAmount(
                                valorParaCampo(totalPending),
                              );
                              setErroEtapa(null);
                            }}
                            className="px-3 py-1.5 text-xs font-medium rounded-full border border-gray-200 bg-gray-50 text-gray-700 hover:bg-gray-100"
                          >
                            Saldo total · {formatCurrency(totalPending)}
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Item 67: multa/juros do Ciclone sem cobrar (todos ou
                    parte) -- avisa ja aqui que vai pedir o motivo. */}
                    {encargoNaoCobrado > 0.009 && (
                      <Aviso
                        tom="atencao"
                        titulo={`${formatCurrency(encargoNaoCobrado)} de multa e juros não cobrados`}
                      >
                        <p>
                          {jurosInformado > 0
                            ? `Multa e juros do Ciclone ${ateDataPagamento}: ${formatCurrency(encargoMarcadas)}; recebidos ${formatCurrency(jurosInformado)}.`
                            : `O cliente não está pagando a multa e os juros do Ciclone (${formatCurrency(encargoMarcadas)}).`}{" "}
                          Isso só vale com autorização do gestor. Na próxima
                          etapa, escreva o motivo na observação (ex.: "gestor
                          autorizou pagar sem juros").
                        </p>
                      </Aviso>
                    )}

                    {/* Conferencia do valor com as parcelas marcadas: um aviso
                    por situacao, no mesmo formato (Aviso). */}
                    {modoParcelas &&
                      qtdMarcadas === 0 &&
                      amountToDistribute > 0 && (
                        <Aviso tom="info">
                          Marque acima as parcelas que o cliente está pagando —
                          o valor é conferido com elas.
                        </Aviso>
                      )}
                    {acimaSemJuros && (
                      <Aviso
                        tom="erro"
                        titulo={`Valor ${formatCurrency(alocacao.aMais)} acima das parcelas marcadas`}
                      >
                        Você marcou {formatCurrency(alocacao.somaParcelas)} em
                        parcelas que ainda não venceram (sem juros). Confira o
                        valor
                        {qtdMarcadas < parcelasAbertas.length &&
                          " ou marque mais parcelas"}
                        .
                      </Aviso>
                    )}
                    {modoParcelas && alocacao.situacao === "fecha" && (
                      <Aviso tom="ok">Fecha com as parcelas marcadas.</Aviso>
                    )}
                    {modoParcelas && alocacao.situacao === "jurosMaior" && (
                      <Aviso tom="erro">
                        Os juros/multa informados (
                        {formatCurrency(jurosInformado)}) são maiores que o
                        valor recebido.
                      </Aviso>
                    )}
                    {avisoAcima && (
                      <Aviso
                        tom="atencao"
                        titulo={
                          aMaisEhEncargo
                            ? `${formatCurrency(alocacao.aMais)} = multa e juros do Ciclone`
                            : aMaisEhParteDoEncargo
                              ? `${formatCurrency(alocacao.aMais)} de ${formatCurrency(encargoMarcadas)} de multa e juros`
                              : `Valor ${formatCurrency(alocacao.aMais)} acima do esperado`
                        }
                      >
                        {aMaisEhParteDoEncargo ? (
                          <p>
                            A multa e os juros do Ciclone {ateDataPagamento}{" "}
                            são{" "}
                            {formatCurrency(encargoMarcadas)} e você recebeu{" "}
                            <strong>{formatCurrency(alocacao.aMais)}</strong>.
                            Os{" "}
                            {formatCurrency(
                              round2(encargoMarcadas - alocacao.aMais),
                            )}{" "}
                            que faltam só podem ficar de fora com autorização
                            do gestor — você vai explicar o motivo na próxima
                            etapa.
                          </p>
                        ) : aMaisEhEncargo ? (
                          <p>
                            Você digitou{" "}
                            <strong>{formatCurrency(amountToDistribute)}</strong>:
                            parcelas {formatCurrency(alocacao.esperado)} + multa e
                            juros de atraso {ateDataPagamento}{" "}
                            {formatCurrency(alocacao.aMais)}.
                          </p>
                        ) : (
                          <p>
                            As parcelas marcadas somam{" "}
                            {formatCurrency(alocacao.esperado)} e você digitou{" "}
                            <strong>{formatCurrency(amountToDistribute)}</strong>.
                            O que são esses {formatCurrency(alocacao.aMais)}?
                          </p>
                        )}
                        <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setJurosTexto(
                                valorParaCampo(
                                  round2(jurosInformado + alocacao.aMais),
                                ),
                              );
                              setMostrarJuros(true);
                              setErroEtapa(null);
                            }}
                            className="rounded-xl border-2 border-amber-300 bg-white dark:bg-dark-bg px-3 py-2 text-left hover:border-amber-500"
                          >
                            <span className="block font-semibold">
                              {aMaisEhEncargo
                                ? "Confirmar multa e juros"
                                : aMaisEhParteDoEncargo
                                  ? "Multa e juros com desconto"
                                  : "Juros/multa acordados"}
                            </span>
                            <span className="block text-xs">
                              {aMaisEhEncargo
                                ? "Regra do Ciclone; não abate parcela."
                                : aMaisEhParteDoEncargo
                                  ? "Autorizado pelo gestor; não abate parcela."
                                  : "Combinado com o cliente; não abate parcela."}
                            </span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setDistributionAmount("");
                              setErroEtapa(null);
                              document
                                .getElementById("distribution-amount")
                                ?.focus();
                            }}
                            className="rounded-xl border-2 border-amber-300 bg-white dark:bg-dark-bg px-3 py-2 text-left hover:border-amber-500"
                          >
                            <span className="block font-semibold">
                              Erro de digitação
                            </span>
                            <span className="block text-xs">
                              Apaga o valor para digitar de novo.
                            </span>
                          </button>
                        </div>
                        {qtdMarcadas < parcelasAbertas.length && (
                          <p className="mt-2 text-xs">
                            Se o cliente está pagando mais parcelas, marque-as
                            na lista.
                          </p>
                        )}
                      </Aviso>
                    )}

                    {/* Pagamento parcial COM juros informado: explica de onde
                        sai o juro (sem juros, a pergunta "O que fazer com a
                        diferenca?" abaixo cobre o parcial). */}
                    {modoParcelas &&
                      alocacao.situacao === "parcial" &&
                      jurosInformado > 0 && (
                      <Aviso tom="info" titulo="Pagamento parcial">
                        {(() => {
                          const quitadas = alocacao.itens.filter(
                            (p) => p.quita,
                          ).length;
                          const parcial = alocacao.itens.find(
                            (p) => !p.quita && p.aplicado > 0,
                          );
                          const partes: string[] = [];
                          if (quitadas > 0) {
                            partes.push(
                              `quita ${quitadas} ${quitadas === 1 ? "parcela" : "parcelas"}`,
                            );
                          }
                          if (parcial) {
                            partes.push(
                              `abate ${formatCurrency(parcial.aplicado)} da parcela de ${dataTexto(parcial.vencimento.slice(0, 10))}`,
                            );
                          }
                          const t = partes.join(" e ") || "nada é quitado";
                          return t.charAt(0).toUpperCase() + t.slice(1) + ".";
                        })()}
                        {/* Juros informados saem do valor recebido: explica a
                        diferenca e oferece o valor com os juros por cima
                        (confusao vista com o usuario, 2026-11-16). */}
                        {jurosInformado > 0 && (
                          <div className="mt-1 space-y-1.5">
                            <p>
                              Os {formatCurrency(jurosInformado)} de juros/multa
                              saem dos {formatCurrency(amountToDistribute)}{" "}
                              recebidos: só {formatCurrency(alocacao.principal)}{" "}
                              vão para as parcelas (faltam{" "}
                              {formatCurrency(
                                round2(alocacao.somaParcelas - alocacao.principal),
                              )}
                              ).
                            </p>
                            <button
                              type="button"
                              onClick={() => {
                                setDistributionAmount(
                                  valorParaCampo(alocacao.esperado),
                                );
                                setErroEtapa(null);
                              }}
                              className="rounded-full border border-sky-300 bg-white px-3 py-1 text-xs font-semibold text-sky-800 hover:bg-sky-100 dark:bg-dark-bg dark:text-sky-200"
                            >
                              O cliente pagou {formatCurrency(alocacao.esperado)}{" "}
                              (parcelas + juros)
                            </button>
                          </div>
                        )}
                      </Aviso>
                    )}

                    {modoParcelas && quitaTudo && !acimaSemJuros && (
                      <Aviso
                        tom="atencao"
                        titulo="Quita toda a dívida do cliente"
                      >
                        {qtdAVencerPagas > 0
                          ? `Inclusive ${qtdAVencerPagas} ${qtdAVencerPagas === 1 ? "parcela que ainda não venceu" : "parcelas que ainda não venceram"}.`
                          : "Todas as parcelas em aberto ficam pagas."}
                      </Aviso>
                    )}
                    {modoParcelas &&
                      !quitaTudo &&
                      !acimaSemJuros &&
                      qtdAVencerPagas > 0 && (
                        <Aviso tom="info">
                          Inclui {qtdAVencerPagas}{" "}
                          {qtdAVencerPagas === 1
                            ? "parcela a vencer"
                            : "parcelas a vencer"}{" "}
                          (adiantamento).
                        </Aviso>
                      )}

                    {/* Diferenca entre o recebido e as parcelas: UMA pergunta
                        com as respostas lado a lado e o desconto a vista
                        (antes eram 2 caixinhas de "quitar" em lugares
                        diferentes -- confundia, 2026-11-16). Com acordo
                        ativo segue o bloco antigo, abaixo. */}
                    {escolhaDiferenca && (
                      <fieldset className="rounded-xl border border-gray-200 dark:border-dark-border p-3 space-y-2">
                        <legend className="px-1 text-sm font-semibold text-gray-900 dark:text-dark-text">
                          {escolhaDiferenca.pergunta}
                        </legend>
                        {escolhaDiferenca.opcoes.map((o) => {
                          // Opcao que precisa do gestor: marcar = pedir
                          // (item 71). As demais registram o pagamento.
                          const pedindo =
                            o.precisaGestor && pedidoTipo === o.tipoPedido;
                          const marcada = o.precisaGestor
                            ? pedindo
                            : !pedidoTipoAtivo && escolhaDiferenca.atual === o.chave;
                          const indisponivel = o.precisaGestor && !isOnline;
                          return (
                            <div
                              key={o.chave}
                              className={`rounded-lg border transition-colors ${
                                indisponivel
                                  ? "border-gray-100 opacity-60"
                                  : marcada
                                    ? o.chave === "tudo"
                                      ? "border-amber-300 bg-amber-50"
                                      : "border-indigo-300 bg-indigo-50"
                                    : "border-gray-200 hover:bg-gray-50"
                              }`}
                            >
                              <label
                                className={`flex items-start gap-3 p-2.5 ${
                                  indisponivel ? "cursor-not-allowed" : "cursor-pointer"
                                }`}
                              >
                                <input
                                  type="radio"
                                  name="destino-diferenca"
                                  disabled={indisponivel}
                                  checked={marcada}
                                  onChange={() => {
                                    if (o.precisaGestor) {
                                      setWithDiscount(false);
                                      setDescontoNasMarcadas(false);
                                      setPedidoTipo(o.tipoPedido);
                                      setPedidoErro(null);
                                    } else {
                                      setPedidoTipo(null);
                                      setWithDiscount(o.chave === "tudo");
                                      setDescontoNasMarcadas(o.chave === "marcadas");
                                    }
                                    setErroEtapa(null);
                                  }}
                                  className="mt-0.5 h-4 w-4 border-gray-300 text-indigo-600 focus:ring-indigo-500"
                                />
                                <span className="text-sm min-w-0">
                                  <span className="block font-medium text-gray-900 dark:text-dark-text">
                                    {o.titulo}
                                    {o.precisaGestor && (
                                      <span className="ml-1.5 text-xs font-normal text-gray-500">
                                        · pedir ao gestor
                                      </span>
                                    )}
                                    {!o.precisaGestor &&
                                      o.tipoPedido &&
                                      autorizacao && (
                                        <span className="ml-1.5 text-xs font-normal text-emerald-700">
                                          · autorizado até{" "}
                                          {formatCurrency(autorizacao.disponivel)} (até{" "}
                                          {dataTexto(autorizacao.valido_ate ?? "")})
                                        </span>
                                      )}
                                  </span>
                                  <span className="block text-xs text-gray-600 dark:text-dark-text-secondary">
                                    {o.detalhe}
                                  </span>
                                </span>
                              </label>

                              {/* Pedido ao gestor dentro da propria opcao */}
                              {pedindo && (
                                <div className="px-2.5 pb-2.5 pl-9 space-y-1.5 text-xs">
                                  {pedidoDescontoAberto ? (
                                    <p className="text-amber-800 dark:text-amber-300">
                                      Já tem pedido de{" "}
                                      {formatCurrency(pedidoDescontoAberto.desconto_pedido)}{" "}
                                      em análise. Quando o gestor aprovar, abra o
                                      Receber pagamento de novo.
                                    </p>
                                  ) : pedidoEnviado ? (
                                    <p className="font-medium text-emerald-800 dark:text-emerald-300">
                                      Pedido enviado. Quando o gestor aprovar, abra o
                                      Receber pagamento de novo.
                                    </p>
                                  ) : (
                                    <>
                                      {ultimoPedidoDesconto?.decisao === "recusado" && (
                                        <p className="text-red-700 dark:text-red-300">
                                          Último pedido recusado: “
                                          {ultimoPedidoDesconto.resposta}”
                                        </p>
                                      )}
                                      <textarea
                                        value={pedidoMotivo}
                                        onChange={(e) => setPedidoMotivo(e.target.value)}
                                        rows={2}
                                        placeholder="Por que o desconto? (ex.: cliente só tem R$ 224 hoje)"
                                        className="w-full rounded-lg border border-gray-300 dark:border-dark-border px-2 py-1.5 text-xs dark:bg-dark-bg dark:text-dark-text"
                                      />
                                      {pedidoErro && (
                                        <p className="text-red-700 dark:text-red-300">
                                          {pedidoErro}
                                        </p>
                                      )}
                                      <button
                                        type="button"
                                        disabled={
                                          pedidoEnviando || !pedidoMotivo.trim() || !isOnline
                                        }
                                        onClick={() => void enviarPedidoDesconto()}
                                        className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                                      >
                                        {pedidoEnviando ? "Enviando..." : "Enviar ao gestor"}
                                      </button>
                                    </>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </fieldset>
                    )}

                    {/* Com acordo ativo (sem parcelas marcadas): bloco antigo.
                        Item 69: sem desconto para interno/terceirizado/
                        juridico -- diz a quem pedir. */}
                    {acordoAtivo &&
                      !podeDarDescontoNaQuitacao(user?.type) &&
                      amountToDistribute > 0 &&
                      amountToDistribute < totalPending - 0.01 && (
                        <p className="text-xs text-gray-500 dark:text-dark-text-secondary">
                          Cliente pediu desconto para quitar? Só o gestor pode
                          dar: peça para ele registrar este pagamento pela
                          ficha, em seu nome.
                        </p>
                      )}
                    {acordoAtivo &&
                      podeDarDescontoNaQuitacao(user?.type) &&
                      (withDiscount ||
                      amountToDistribute < totalPending - 0.01) && (
                      <label
                        className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                          withDiscount
                            ? "border-indigo-300 bg-indigo-50"
                            : "border-gray-200 hover:bg-gray-50"
                        }`}
                      >
                        <input
                          type="checkbox"
                          id="with-discount"
                          name="withDiscount"
                          checked={withDiscount}
                          onChange={(e) => {
                            setWithDiscount(e.target.checked);
                            setErroEtapa(null);
                          }}
                          className="mt-0.5 h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                        />
                        <span className="text-sm">
                          <span className="flex items-center gap-1.5 font-medium text-gray-900 dark:text-dark-text">
                            <TrendingDown className="h-4 w-4 text-indigo-600" />
                            Quitar tudo com desconto
                          </span>
                          <span className="block text-xs text-gray-600 dark:text-dark-text-secondary">
                            {withDiscount &&
                            amountToDistribute > 0 &&
                            desconto > 0
                              ? `Desconto de ${formatCurrency(desconto)} (${((desconto / totalPending) * 100).toFixed(1)}% do saldo de ${formatCurrency(totalPending)}). Fica registrado no pagamento e aparece para o gestor.`
                              : `O que faltar para ${formatCurrency(totalPending)} vira desconto e todas as parcelas são quitadas.`}
                          </span>
                        </span>
                      </label>
                    )}
                  </div>
                </div>
              </>
            )}

            {etapa === 2 && (
              <>
                <div className={grade.replace("md:items-start", "md:items-stretch")}>
                  <div className="space-y-5">
                    <fieldset>
                      <legend className="text-sm font-semibold text-gray-900 dark:text-dark-text mb-2">
                        Como pagou?
                      </legend>
                      <div className="grid grid-cols-2 gap-2">
                        {Object.entries(FORMA_PAGAMENTO_LABEL).map(
                          ([valor, rotulo]) => (
                            <label
                              key={valor}
                              className={`cursor-pointer rounded-xl border-2 px-3 py-2.5 text-sm font-medium text-center transition-colors ${
                                paymentMethod === valor
                                  ? "border-indigo-500 bg-indigo-50 text-indigo-800"
                                  : "border-gray-200 text-gray-700 hover:border-gray-300"
                              }`}
                            >
                              <input
                                type="radio"
                                name="paymentMethod"
                                value={valor}
                                checked={paymentMethod === valor}
                                onChange={() => setPaymentMethod(valor)}
                                className="sr-only"
                              />
                              {rotulo}
                            </label>
                          ),
                        )}
                      </div>
                    </fieldset>

                  </div>
                  <div className="flex flex-col">
                    <label
                      htmlFor="observations"
                      className="block text-sm font-semibold text-gray-900 dark:text-dark-text mb-2"
                    >
                      Observação{" "}
                      <span className="font-normal text-gray-500">
                        {observacaoObrigatoria
                          ? `(obrigatória: explique ${motivoObservacao})`
                          : "(opcional)"}
                      </span>
                    </label>
                    <textarea
                      id="observations"
                      name="observations"
                      value={observations}
                      onChange={(e) => {
                        setObservations(e.target.value);
                        setErroEtapa(null);
                      }}
                      className="w-full flex-1 min-h-[5rem] resize-none px-3 py-2 border border-gray-300 dark:border-dark-border rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm dark:bg-dark-bg dark:text-dark-text"
                      rows={3}
                      placeholder={
                        encargoNaoCobrado > 0.009
                          ? "Ex.: gestor autorizou pagar sem juros"
                          : "Ex.: comprovante enviado pelo WhatsApp"
                      }
                    />
                  </div>
                </div>
              </>
            )}

            {etapa === 3 && (
              <>
                {parcelaForaDeOrdem && anterioresForaDeOrdem.length > 0 && (
                  <Aviso tom="erro" titulo="Boleto pago fora de ordem">
                    Só a parcela de{" "}
                    {dataTexto(parcelaForaDeOrdem.vencimento.slice(0, 10))} é
                    baixada.{" "}
                    {anterioresForaDeOrdem.length === 1
                      ? "A parcela mais antiga continua em aberto e vencida."
                      : `As ${anterioresForaDeOrdem.length} parcelas mais antigas continuam em aberto e vencidas.`}
                  </Aviso>
                )}
                <div className={grade}>
                  <div className="space-y-5">
                    {/* Resumo do que vai ser gravado */}
                    <div className="rounded-xl bg-gray-50 dark:bg-dark-bg-tertiary p-4">
                      <p className="text-2xl font-semibold text-gray-900 dark:text-dark-text tabular-nums">
                        {formatCurrency(amountToDistribute)}
                      </p>
                      <p className="text-sm text-gray-600 dark:text-dark-text-secondary">
                        {formaRotulo}
                        {podeEscolherData &&
                          ` · pago em ${dataTexto(dataPagamento)}`}
                      </p>
                      {modoParcelas ? (
                        <dl className="mt-3 grid grid-cols-[1fr_auto] gap-x-4 gap-y-0.5 text-sm">
                          <dt className="text-gray-600">Abate das parcelas</dt>
                          <dd className="text-right tabular-nums">
                            {formatCurrency(principal)}
                          </dd>
                          <dt className="text-gray-600">
                            Juros/multa acordados
                          </dt>
                          <dd className="text-right tabular-nums">
                            {formatCurrency(jurosValor)}
                          </dd>
                          <dt className="text-gray-600 pt-1 border-t border-gray-200">
                            Dívida do cliente
                          </dt>
                          <dd className="text-right tabular-nums pt-1 border-t border-gray-200">
                            {formatCurrency(totalPending)} →{" "}
                            <strong>
                              {formatCurrency(
                                round2(Math.max(0, totalPending - principal)),
                              )}
                            </strong>
                          </dd>
                        </dl>
                      ) : (
                        desconto > 0 && (
                          <p className="mt-1 text-sm text-gray-600">
                            Desconto de {formatCurrency(desconto)}
                          </p>
                        )
                      )}
                      {observations.trim() && (
                        <p className="mt-1 text-xs text-gray-500 whitespace-pre-wrap">
                          “{observations.trim()}”
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="space-y-5 min-w-0">
                    <div>
                      <h3 className="text-sm font-semibold text-gray-900 dark:text-dark-text mb-2">
                        Vai abater
                      </h3>
                      {abatimentoPorParcela ? (
                        <ul className="divide-y divide-gray-100 border border-gray-200 rounded-xl">
                          {abatimentoPorParcela.map((p) => (
                            <li
                              key={p.idParcela}
                              className={`flex items-center justify-between gap-3 px-3 py-2 text-sm ${
                                variasVendas
                                  ? `border-l-4 ${corDaVenda(p.sale.saleNumber).faixa}`
                                  : ""
                              }`}
                            >
                              <span className="min-w-0">
                                <span className="block text-gray-900">
                                  {rotuloParcela(p.sale.saleNumber, p.numero)}
                                </span>
                                <span
                                  className={`block text-xs ${p.vencida ? "text-red-600" : "text-gray-500"}`}
                                >
                                  venc. {dataTexto(p.vencimento.slice(0, 10))}
                                  {p.vencida && " (vencida)"}
                                </span>
                              </span>
                              <span className="text-right shrink-0">
                                <span className="block font-medium tabular-nums">
                                  {formatCurrency(p.aplicado)}
                                </span>
                                {p.desconto > 0.009 && (
                                  <span className="block text-xs text-indigo-700 tabular-nums">
                                    + desconto {formatCurrency(p.desconto)}
                                  </span>
                                )}
                                <span
                                  className={`block text-xs ${
                                    p.quita
                                      ? p.vencida
                                        ? "text-emerald-600"
                                        : "text-amber-700"
                                      : "text-gray-500"
                                  }`}
                                >
                                  {p.quita
                                    ? p.vencida
                                      ? "quita"
                                      : "quita (adiantada)"
                                    : `fica faltando ${formatCurrency(round2(p.saldo - p.aplicado))}`}
                                </span>
                              </span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <ul className="divide-y divide-gray-100 border border-gray-200 rounded-xl">
                          {saleDistribution.map((item) => (
                            <li
                              key={item.sale.saleNumber}
                              className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                            >
                              <span className="text-gray-900">
                                {item.sale.saleNumber === 0
                                  ? "Venda renegociada"
                                  : `Venda #${item.sale.saleNumber}`}
                              </span>
                              <span className="text-right">
                                <span className="block font-medium tabular-nums">
                                  {formatCurrency(item.appliedAmount)}
                                </span>
                                <span
                                  className={`block text-xs ${item.willBeComplete ? "text-emerald-600" : "text-gray-500"}`}
                                >
                                  {item.appliedDiscount > 0
                                    ? `+ desconto ${formatCurrency(item.appliedDiscount)} · `
                                    : ""}
                                  {item.willBeComplete
                                    ? "quita a venda"
                                    : "abate parte"}
                                </span>
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                    {quitaTudo && (
                      <Aviso
                        tom="atencao"
                        titulo="Quita toda a dívida do cliente"
                      >
                        {qtdAVencerPagas > 0
                          ? `Inclusive ${qtdAVencerPagas} ${qtdAVencerPagas === 1 ? "parcela que ainda não venceu" : "parcelas que ainda não venceram"}.`
                          : "Todas as parcelas em aberto ficam pagas."}
                      </Aviso>
                    )}

                    <p
                      className={`text-sm ${precisaAcompanhamento ? "text-red-700" : "text-emerald-700"}`}
                    >
                      {precisaAcompanhamento
                        ? `Depois deste pagamento ainda ficam ${formatCurrency(vencidoRestante)} vencidos.`
                        : "Depois deste pagamento o cliente fica sem valor vencido."}
                    </p>

                    {ehCarteira && !contatoJaRegistrado && isOnline && (
                      <p className="text-xs text-gray-500">
                        Fica registrado no histórico como contato “
                        {
                          ATTEMPT_RESULT_LABELS[
                            precisaAcompanhamento
                              ? "partial_payment"
                              : "full_payment"
                          ]
                        }
                        ”.
                      </p>
                    )}

                    {/* Externo com vencido sobrando: proxima visita aqui mesmo */}
                    {precisaAcompanhamento && ehExterno && (
                      <fieldset className="rounded-xl border border-gray-200 p-3">
                        <legend className="px-1 text-sm font-semibold text-gray-900 dark:text-dark-text">
                          Próxima visita
                        </legend>
                        <div className="grid grid-cols-2 gap-2">
                          <label className="text-xs text-gray-600">
                            <span className="flex items-center gap-1 mb-1">
                              <Calendar className="h-3.5 w-3.5" /> Data
                            </span>
                            <input
                              id="reschedule-date"
                              name="reschedule-date"
                              type="date"
                              min={hoje}
                              value={rescheduleDate}
                              onChange={(e) => {
                                setRescheduleDate(e.target.value);
                                setErroEtapa(null);
                              }}
                              className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-xl text-sm dark:bg-dark-bg dark:text-dark-text"
                            />
                          </label>
                          <label className="text-xs text-gray-600">
                            <span className="flex items-center gap-1 mb-1">
                              <Clock className="h-3.5 w-3.5" /> Horário
                            </span>
                            <input
                              id="reschedule-time"
                              name="reschedule-time"
                              type="time"
                              value={rescheduleTime}
                              onChange={(e) => {
                                setRescheduleTime(e.target.value);
                                setErroEtapa(null);
                              }}
                              className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-xl text-sm dark:bg-dark-bg dark:text-dark-text"
                            />
                          </label>
                        </div>
                      </fieldset>
                    )}
                  </div>
                </div>
              </>
            )}

            {etapa === 3 && precisaConferir && (
              <label
                className={`flex items-start gap-3 rounded-xl border-2 p-3 text-sm cursor-pointer ${
                  motivosConferencia.length > 0
                    ? "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-200"
                    : "border-gray-200 bg-gray-50 text-gray-800 dark:border-dark-border dark:bg-dark-bg-tertiary dark:text-dark-text"
                }`}
              >
                <input
                  type="checkbox"
                  checked={conferido}
                  onChange={(e) => {
                    setConferido(e.target.checked);
                    setErroEtapa(null);
                  }}
                  className="mt-0.5 h-4 w-4 rounded border-amber-400 text-amber-600 focus:ring-amber-500"
                />
                <span>
                  <strong>Conferi os valores</strong>
                  <span className="block text-xs">
                    {motivosConferencia.length > 0
                      ? `Atenção: ${motivosConferencia.join(" · ")}.`
                      : "Valor, forma de pagamento e parcelas conferidos com o cliente."}
                  </span>
                </span>
              </label>
            )}

            {erroEtapa && !(etapa === 1 && (acimaSemJuros || avisoAcima)) && (
              <Aviso tom="erro">{erroEtapa}</Aviso>
            )}
          </div>

          {/* Rodape fixo */}
          <div className="px-4 sm:px-6 py-3 border-t border-gray-200 dark:border-dark-border flex gap-3 shrink-0 bg-white dark:bg-dark-bg-secondary">
            <button
              id="cancel-button"
              type="button"
              onClick={etapa === 1 ? onClose : voltar}
              disabled={loading}
              className="px-4 py-2.5 border border-gray-300 dark:border-dark-border text-gray-700 dark:text-dark-text-secondary rounded-xl hover:bg-gray-50 dark:hover:bg-dark-bg-tertiary text-sm font-medium disabled:opacity-50"
            >
              {etapa === 1 ? "Cancelar" : "Voltar"}
            </button>
            <button
              id="confirm-button"
              type="submit"
              disabled={loading || (etapa === 3 && precisaConferir && !conferido)}
              className={`flex-1 px-4 py-2.5 text-white rounded-xl text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed ${
                etapa === 3
                  ? "bg-emerald-600 hover:bg-emerald-700"
                  : "bg-indigo-600 hover:bg-indigo-700"
              }`}
            >
              {loading ? (
                <>
                  <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                  Gravando...
                </>
              ) : etapa === 3 ? (
                <>
                  <CheckCircle className="h-4 w-4" />
                  {precisaAcompanhamento && ehExterno
                    ? "Confirmar pagamento e visita"
                    : `Confirmar ${formatCurrency(amountToDistribute)}`}
                </>
              ) : (
                <>
                  Continuar
                  <ChevronRight className="h-4 w-4" />
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    );
  },
);

export default GeneralPaymentModal;
