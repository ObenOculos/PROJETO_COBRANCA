import React, { useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import {
  X,
  Save,
  AlertCircle,
  Plus,
  Trash2,
  Copy,
  CheckCircle2,
  QrCode,
} from "lucide-react";
import { useCollection } from "../../contexts/CollectionContext";
import { hasInstallmentBalance } from "../../filters/clientStatus";
import {
  formatCurrency,
  formatDate,
  calculateOverdueDays,
} from "../../utils/formatters";
import { todayLocalStr } from "../../config/visitStatus";
import { ClientGroup } from "../../types";
import { gerarPixCopiaECola } from "../../utils/pix";
import { gerarTermoAcordoPdf, nomeArquivoTermoAcordo } from "../../utils/termoAcordo";

interface AcordoModalProps {
  client: ClientGroup;
  onClose: () => void;
  onSuccess: () => void;
}

interface ParcelaDraft {
  numero: number;
  valor: string;
  data: string;
}

interface TituloAberto {
  collectionId: number;
  saldo: number;
  vencimento: string | null;
  saleNumber: number;
  saleLabel: string;
  vencido: boolean;
  diasAtraso: number;
}

const FORMAS_PAGAMENTO_PARCELAS = [
  "Boleto",
  "Pix",
  "Dinheiro",
  "Cartão de crédito",
  "Cartão de débito",
  "Transferência",
];

/** Soma dois dias YYYY-MM-DD evitando problema de fuso (ver todayLocalStr). */
const addDaysLocal = (dateStr: string, days: number): string => {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + days);
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

const AcordoModal: React.FC<AcordoModalProps> = ({
  client,
  onClose,
  onSuccess,
}) => {
  const {
    criarAcordo,
    acordoConfiguracaoPadrao,
    fetchAcordoDetalhe,
    registrarPagamentoAcordo,
  } = useCollection();

  const titulosEmAberto = useMemo<TituloAberto[]>(() => {
    const list: TituloAberto[] = [];
    client.sales?.forEach((sale) => {
      sale.installments?.forEach((inst) => {
        if (hasInstallmentBalance(inst)) {
          const diasAtraso = calculateOverdueDays(inst.data_vencimento);
          list.push({
            collectionId: inst.id_parcela,
            saldo:
              (inst.valor_original || 0) -
              (inst.valor_recebido || 0) -
              (inst.desconto || 0),
            vencimento: inst.data_vencimento,
            saleNumber: sale.saleNumber,
            saleLabel: sale.description || `Venda ${sale.titleNumber}`,
            vencido: diasAtraso > 0,
            diasAtraso,
          });
        }
      });
    });
    return list;
  }, [client]);

  const gruposPorVenda = useMemo(() => {
    const map = new Map<number, { saleLabel: string; titulos: TituloAberto[] }>();
    titulosEmAberto.forEach((t) => {
      const grupo = map.get(t.saleNumber);
      if (grupo) grupo.titulos.push(t);
      else map.set(t.saleNumber, { saleLabel: t.saleLabel, titulos: [t] });
    });
    return Array.from(map.entries()).map(([saleNumber, g]) => ({
      saleNumber,
      ...g,
    }));
  }, [titulosEmAberto]);

  const [selecionados, setSelecionados] = useState<Set<number>>(
    new Set(titulosEmAberto.map((t) => t.collectionId)),
  );
  const [numeroParcelas, setNumeroParcelas] = useState(2);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [aVencerPendentes, setAVencerPendentes] = useState<TituloAberto[]>([]);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  // O botao "Criar Acordo" nasce na mesma posicao em que "Continuar" estava:
  // num toque rapido (ghost click/replay de touch em mobile) o clique que
  // avanca a etapa pode "vazar" pro botao novo que aparece no mesmo lugar,
  // criando o acordo sem o cobrador ter revisado as parcelas. Trava o submit
  // por um instante logo depois de entrar na etapa 2 pra absorver isso.
  const [step2Armado, setStep2Armado] = useState(false);

  // Padrao do gestor (Etapa 3a, config/AcordoConfiguracaoPadrao.tsx) como
  // ponto de partida -- editavel pelo cobrador na negociacao (decisao do
  // usuario em 2026-11-04: "deixar um padrao, mas editavel pelo cobrador
  // quando necessario"). Lido uma vez na abertura do modal: o modal e
  // remontado a cada abertura, entao nao precisa reagir a troca do padrao
  // enquanto o cobrador ja esta editando.
  const [multaPercentual, setMultaPercentual] = useState(() =>
    String(acordoConfiguracaoPadrao?.multaPercentual ?? 0),
  );
  const [jurosPercentualAm, setJurosPercentualAm] = useState(() =>
    String(acordoConfiguracaoPadrao?.jurosPercentualAm ?? 0),
  );
  const [descontoPercentual, setDescontoPercentual] = useState(() =>
    String(acordoConfiguracaoPadrao?.descontoPadraoPercentual ?? 0),
  );
  const descontoMaximoPercentual =
    acordoConfiguracaoPadrao?.descontoMaximoPercentual ?? 0;
  const diasEntreParcelasPadrao = acordoConfiguracaoPadrao?.diasEntreParcelas ?? 30;
  const [formaPagamentoParcelas, setFormaPagamentoParcelas] = useState(
    FORMAS_PAGAMENTO_PARCELAS[0],
  );
  const [testemunha1Nome, setTestemunha1Nome] = useState("");
  const [testemunha1Cpf, setTestemunha1Cpf] = useState("");
  const [testemunha2Nome, setTestemunha2Nome] = useState("");
  const [testemunha2Cpf, setTestemunha2Cpf] = useState("");

  // Entrada via Pix (1a parcela) -- QR Code/copia-e-cola estatico gerado
  // localmente (decisao do usuario em 2026-11-04: sem gateway de
  // pagamento), confirmacao manual do cobrador antes do acordo ser criado
  // de fato.
  const [pixCopiaECola, setPixCopiaECola] = useState("");
  const [pixQrDataUrl, setPixQrDataUrl] = useState("");
  const [pixCopiado, setPixCopiado] = useState(false);
  const [entradaConfirmada, setEntradaConfirmada] = useState(false);

  const saldoSelecionado = useMemo(
    () =>
      titulosEmAberto
        .filter((t) => selecionados.has(t.collectionId))
        .reduce((sum, t) => sum + t.saldo, 0),
    [titulosEmAberto, selecionados],
  );

  /**
   * Multa/juros/desconto POR TITULO, proporcional aos dias de atraso de
   * cada um -- confirmado batendo com o modelo de Termo de Acordo do
   * usuario (multa % flat + juros simples % a.m. * dias/30). Titulo ainda
   * nao vencido (diasAtraso <= 0) nao acumula multa nem juros -- so entra
   * pelo saldo cheio. Estes valores sao o que vai congelado em
   * acordo_titulos (migration 20261104000003), nunca recalculados depois.
   */
  const titulosComEncargo = useMemo(() => {
    const multa = Number(multaPercentual) || 0;
    const juros = Number(jurosPercentualAm) || 0;
    const desconto = Number(descontoPercentual) || 0;
    return titulosEmAberto
      .filter((t) => selecionados.has(t.collectionId))
      .map((t) => {
        const multaValor =
          t.diasAtraso > 0 ? Math.round(t.saldo * (multa / 100) * 100) / 100 : 0;
        const jurosValor =
          t.diasAtraso > 0
            ? Math.round(t.saldo * (juros / 100) * (t.diasAtraso / 30) * 100) / 100
            : 0;
        const totalBruto = t.saldo + multaValor + jurosValor;
        const descontoValor = Math.round(totalBruto * (desconto / 100) * 100) / 100;
        const totalFinal = Math.round((totalBruto - descontoValor) * 100) / 100;
        return { ...t, multaValor, jurosValor, descontoValor, totalFinal };
      });
  }, [titulosEmAberto, selecionados, multaPercentual, jurosPercentualAm, descontoPercentual]);

  const totalNegociado = useMemo(
    () => titulosComEncargo.reduce((sum, t) => sum + t.totalFinal, 0),
    [titulosComEncargo],
  );

  const gerarParcelas = (saldo: number, n: number): ParcelaDraft[] => {
    if (n < 1 || saldo <= 0) return [];
    const valorBase = Math.floor((saldo / n) * 100) / 100;
    const draft: ParcelaDraft[] = [];
    let acumulado = 0;
    for (let i = 1; i <= n; i++) {
      const isLast = i === n;
      const valor = isLast
        ? Math.round((saldo - acumulado) * 100) / 100
        : valorBase;
      acumulado += valor;
      draft.push({
        numero: i,
        valor: valor.toFixed(2),
        data: addDaysLocal(todayLocalStr(), diasEntreParcelasPadrao * i),
      });
    }
    return draft;
  };

  // Parcelas sao geradas automaticamente a partir do total negociado (saldo
  // + multa + juros - desconto) — sem botao manual. parcelasDirty marca que
  // o usuario editou algo a mao; se a selecao de titulos, os encargos ou o
  // numero de parcelas mudarem depois disso, as parcelas sao recalculadas
  // (nunca ficam desatualizadas) mas avisamos em vez de descartar
  // silenciosamente a edicao.
  const [parcelas, setParcelas] = useState<ParcelaDraft[]>(() =>
    gerarParcelas(totalNegociado, numeroParcelas),
  );
  const [parcelasDirty, setParcelasDirty] = useState(false);
  const [recalcNotice, setRecalcNotice] = useState(false);
  const [mostrarTodasParcelas, setMostrarTodasParcelas] = useState(false);
  const [dataPrimeiraParcela, setDataPrimeiraParcela] = useState(
    () => parcelas[0]?.data ?? addDaysLocal(todayLocalStr(), diasEntreParcelasPadrao),
  );
  const isFirstRender = useRef(true);
  const PARCELAS_VISIVEIS = 3;

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    const novasParcelas = gerarParcelas(totalNegociado, numeroParcelas);
    setParcelas(novasParcelas);
    setDataPrimeiraParcela(
      novasParcelas[0]?.data ?? addDaysLocal(todayLocalStr(), diasEntreParcelasPadrao),
    );
    setRecalcNotice(parcelasDirty);
    setParcelasDirty(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totalNegociado, numeroParcelas]);

  /** Recalcula as datas de todas as parcelas a partir da data escolhida pro
   * cobrador, mantendo o espacamento padrao entre elas — evita digitar
   * data por data quando só a data-base muda. */
  const aplicarDataBase = () => {
    if (!dataPrimeiraParcela) return;
    setParcelas((prev) =>
      prev.map((p, i) => ({
        ...p,
        data: addDaysLocal(dataPrimeiraParcela, diasEntreParcelasPadrao * i),
      })),
    );
    setParcelasDirty(true);
    setRecalcNotice(false);
  };

  const toggleTitulo = (collectionId: number) => {
    setSelecionados((prev) => {
      const next = new Set(prev);
      if (next.has(collectionId)) next.delete(collectionId);
      else next.add(collectionId);
      return next;
    });
  };

  const updateParcela = (index: number, field: "valor" | "data", value: string) => {
    setParcelas((prev) =>
      prev.map((p, i) => (i === index ? { ...p, [field]: value } : p)),
    );
    setParcelasDirty(true);
    setRecalcNotice(false);
  };

  const removerParcela = (index: number) => {
    setParcelas((prev) =>
      prev.filter((_, i) => i !== index).map((p, i) => ({ ...p, numero: i + 1 })),
    );
    setParcelasDirty(true);
    setRecalcNotice(false);
  };

  const adicionarParcela = () => {
    setParcelas((prev) => {
      const last = prev[prev.length - 1];
      return [
        ...prev,
        {
          numero: prev.length + 1,
          valor: "0.00",
          data: last
            ? addDaysLocal(last.data, diasEntreParcelasPadrao)
            : addDaysLocal(todayLocalStr(), diasEntreParcelasPadrao),
        },
      ];
    });
    setParcelasDirty(true);
    setRecalcNotice(false);
  };

  const totalParcelas = useMemo(
    () => parcelas.reduce((sum, p) => sum + (parseFloat(p.valor) || 0), 0),
    [parcelas],
  );
  const totalBate = Math.abs(totalParcelas - totalNegociado) <= 0.01;

  // Valor da entrada = 1a parcela (numero 1) -- nao e um campo a parte, so
  // a primeira linha das parcelas negociadas (igual ao modelo de Termo de
  // Acordo do usuario, onde a 1a parcela e so a de maior valor).
  const valorEntrada = parseFloat(parcelas[0]?.valor || "0") || 0;

  const doCreateAcordo = async () => {
    setLoading(true);
    try {
      const acordo = await criarAcordo({
        clientDocument: client.document,
        titulos: titulosComEncargo.map((t) => ({
          collectionId: t.collectionId,
          saldoNoMomento: t.saldo,
          diasAtrasoNoMomento: t.diasAtraso,
          multaValor: t.multaValor,
          jurosValor: t.jurosValor,
          descontoValor: t.descontoValor,
        })),
        parcelas: parcelas.map((p) => ({
          numero: p.numero,
          valorParcela: parseFloat(p.valor),
          dataVencimento: p.data,
        })),
        multaPercentualAplicado: Number(multaPercentual) || 0,
        jurosPercentualAmAplicado: Number(jurosPercentualAm) || 0,
        descontoPercentualAplicado: Number(descontoPercentual) || 0,
        formaPagamentoParcelas,
        testemunha1Nome: testemunha1Nome.trim(),
        testemunha1Cpf: testemunha1Cpf.trim(),
        testemunha2Nome: testemunha2Nome.trim(),
        testemunha2Cpf: testemunha2Cpf.trim(),
      });

      // Entrada (1a parcela) ja foi confirmada via Pix pelo cobrador antes
      // deste submit (gate da etapa 3) -- registra o pagamento pra ela
      // nascer paga, sem exigir um segundo passo manual no detalhe do
      // acordo. Nao interrompe o fluxo se falhar: o acordo em si ja foi
      // criado, o cobrador pode registrar o pagamento da 1a parcela pelo
      // detalhe do acordo depois.
      try {
        const detalhe = await fetchAcordoDetalhe(acordo.id);
        const parcelaEntrada = detalhe.parcelas.find((p) => p.numero === 1);
        if (parcelaEntrada) {
          await registrarPagamentoAcordo({
            acordoParcelaId: parcelaEntrada.id,
            valorPago: valorEntrada,
            dataPagamento: todayLocalStr(),
            notes: "Entrada via Pix confirmada manualmente pelo cobrador na criação do acordo.",
          });
        }

        // Termo de Acordo (PDF) -- gerado a partir dos mesmos dados
        // congelados (Etapa 3c). Nao interrompe o fluxo se falhar: o
        // cobrador ainda pode baixar depois pelo detalhe do acordo.
        const endereco = [
          [client.address, client.number].filter(Boolean).join(", "),
          client.complemento,
          client.neighborhood,
          client.cep ? `CEP: ${client.cep}` : "",
          [client.city, client.state].filter(Boolean).join("/"),
        ]
          .filter(Boolean)
          .join(", ");
        const pdf = await gerarTermoAcordoPdf({
          acordo,
          titulos: detalhe.titulos,
          parcelas: detalhe.parcelas,
          empresa: acordoConfiguracaoPadrao,
          devedor: {
            nome: client.client,
            documento: client.document,
            endereco: endereco || "endereço não informado",
          },
        });
        pdf.save(nomeArquivoTermoAcordo(acordo));
      } catch (posCriacaoErr) {
        console.error(
          "Acordo criado, mas falhou um passo posterior (pagamento da entrada ou Termo de Acordo):",
          posCriacaoErr,
        );
      }

      onSuccess();
    } catch (err) {
      console.error("Erro ao criar acordo:", err);
      setError(
        "Falha ao criar acordo: " +
          (err instanceof Error ? err.message : "erro desconhecido"),
      );
    } finally {
      setLoading(false);
    }
  };

  const handleContinuar = () => {
    setError("");
    if (selecionados.size === 0) {
      setError("Selecione ao menos um título.");
      return;
    }
    setStep(2);
  };

  const handleVoltar = () => {
    setError("");
    setStep((s) => (s === 3 ? 2 : 1));
  };

  // Protecao contra "ghost click"/replay de touch no mobile: o botao final
  // ("Criar Acordo") nasce na mesma posicao em que o botao da etapa
  // anterior estava -- trava o submit por um instante ao entrar na ultima
  // etapa (3, confirmacao da entrada) pra absorver isso.
  useEffect(() => {
    if (step !== 3) {
      setStep2Armado(false);
      return;
    }
    setStep2Armado(false);
    const timer = setTimeout(() => setStep2Armado(true), 400);
    return () => clearTimeout(timer);
  }, [step]);

  /** Valida a etapa 2 (parcelas/encargos/testemunhas) e avanca pra
   * confirmacao da entrada -- ou pede confirmacao de titulos a vencer
   * antes, igual o fluxo anterior fazia no submit final. */
  const handleAvancarParaEntrada = () => {
    setError("");

    if (parcelas.length === 0) {
      setError("Monte ao menos uma parcela.");
      return;
    }
    for (const p of parcelas) {
      if (!p.data || !(parseFloat(p.valor) > 0)) {
        setError("Toda parcela precisa de valor positivo e data.");
        return;
      }
    }
    if (!totalBate) {
      setError(
        `A soma das parcelas (${formatCurrency(totalParcelas)}) não bate com o total negociado (${formatCurrency(totalNegociado)} = saldo + multa + juros − desconto). Ajuste os valores antes de continuar.`,
      );
      return;
    }
    const desconto = Number(descontoPercentual) || 0;
    if (desconto > descontoMaximoPercentual + 0.001) {
      setError(
        `O desconto (${desconto}%) passa do máximo permitido (${descontoMaximoPercentual}%). Ajuste ou peça para o gestor liberar um desconto maior.`,
      );
      return;
    }
    if (!formaPagamentoParcelas) {
      setError("Escolha a forma de pagamento das parcelas.");
      return;
    }

    const aVencer = titulosEmAberto.filter(
      (t) => selecionados.has(t.collectionId) && !t.vencido,
    );
    if (aVencer.length > 0) {
      setAVencerPendentes(aVencer);
      return;
    }

    setStep(3);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (step !== 3 || !step2Armado) return;
    if (!entradaConfirmada) {
      setError("Confirme o recebimento do Pix da entrada antes de criar o acordo.");
      return;
    }

    doCreateAcordo();
  };

  const confirmarComAVencer = () => {
    setAVencerPendentes([]);
    setStep(3);
  };

  // Gera o QR Code/copia-e-cola da entrada ao entrar na etapa 3 (ou se o
  // valor da 1a parcela mudar depois de voltar e ajustar algo). Payload
  // 100% local (ver src/utils/pix.ts) -- sem chamada de rede.
  useEffect(() => {
    if (step !== 3) return;
    setEntradaConfirmada(false);
    if (!acordoConfiguracaoPadrao?.empresaChavePix || valorEntrada <= 0) {
      setPixCopiaECola("");
      setPixQrDataUrl("");
      return;
    }
    const payload = gerarPixCopiaECola({
      chave: acordoConfiguracaoPadrao.empresaChavePix,
      nomeRecebedor: acordoConfiguracaoPadrao.empresaNome || "",
      cidadeRecebedor: acordoConfiguracaoPadrao.empresaEndereco || "",
      valor: valorEntrada,
      txid: client.document,
    });
    setPixCopiaECola(payload);
    QRCode.toDataURL(payload, { margin: 1, width: 220 })
      .then(setPixQrDataUrl)
      .catch((err) => {
        console.error("Erro ao gerar QR Code Pix:", err);
        setPixQrDataUrl("");
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, valorEntrada]);

  const copiarPix = async () => {
    try {
      await navigator.clipboard.writeText(pixCopiaECola);
      setPixCopiado(true);
      setTimeout(() => setPixCopiado(false), 2000);
    } catch (err) {
      console.error("Erro ao copiar código Pix:", err);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-[100] backdrop-blur-sm">
      <div className="bg-white dark:bg-dark-bg rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden border border-gray-200 dark:border-dark-border animate-in fade-in zoom-in duration-200 max-h-[90vh] flex flex-col">
        <div className="px-6 py-4 border-b border-gray-100 dark:border-dark-border flex items-center justify-between bg-gray-50 dark:bg-dark-bg-secondary shrink-0">
          <div>
            <h3 className="font-bold text-gray-900 dark:text-dark-text">
              Novo Acordo
            </h3>
            <p className="text-xs text-gray-500 dark:text-dark-text-secondary">
              {client.client}
              {client.apelido && (
                <span className="text-blue-600 dark:text-blue-400 ml-1">
                  ({client.apelido})
                </span>
              )}
              {" — "}
              {client.document}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-200 dark:hover:bg-dark-bg-tertiary rounded-full transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <form
          onSubmit={handleSubmit}
          className="flex flex-col flex-1 min-h-0"
        >
        <div className="p-6 space-y-5 overflow-y-auto minimal-scrollbar flex-1 min-h-0">
          <div className="flex items-center gap-2">
            <span
              className={`flex items-center gap-1.5 text-xs font-bold ${step === 1 ? "text-indigo-600" : "text-gray-400"}`}
            >
              <span
                className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${step === 1 ? "bg-indigo-600 text-white" : "bg-gray-100 dark:bg-dark-bg-tertiary text-gray-400"}`}
              >
                1
              </span>
              Títulos
            </span>
            <span className="flex-1 h-px bg-gray-200 dark:bg-dark-border" />
            <span
              className={`flex items-center gap-1.5 text-xs font-bold ${step === 2 ? "text-indigo-600" : "text-gray-400"}`}
            >
              <span
                className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${step === 2 ? "bg-indigo-600 text-white" : "bg-gray-100 dark:bg-dark-bg-tertiary text-gray-400"}`}
              >
                2
              </span>
              Parcelas
            </span>
            <span className="flex-1 h-px bg-gray-200 dark:bg-dark-border" />
            <span
              className={`flex items-center gap-1.5 text-xs font-bold ${step === 3 ? "text-indigo-600" : "text-gray-400"}`}
            >
              <span
                className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${step === 3 ? "bg-indigo-600 text-white" : "bg-gray-100 dark:bg-dark-bg-tertiary text-gray-400"}`}
              >
                3
              </span>
              Entrada
            </span>
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-100 text-red-600 text-sm rounded-xl flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}

          {step === 1 && (
            <div className="space-y-2">
              <label className="text-xs font-bold text-gray-400">
                Títulos em aberto ({titulosEmAberto.length})
              </label>
              <div className="border border-gray-200 dark:border-dark-border rounded-xl max-h-[26rem] overflow-y-auto minimal-scrollbar">
                {titulosEmAberto.length === 0 && (
                  <p className="p-3 text-sm text-gray-400">
                    Este cliente não tem título em aberto.
                  </p>
                )}
                {gruposPorVenda.map((grupo) => (
                  <div
                    key={grupo.saleNumber}
                    className="border-b border-gray-100 dark:border-dark-border last:border-b-0"
                  >
                    <p className="px-3 py-1.5 text-[11px] font-bold text-gray-400 bg-gray-50 dark:bg-dark-bg-secondary uppercase tracking-wide">
                      {grupo.saleLabel}
                    </p>
                    <div className="divide-y divide-gray-100 dark:divide-dark-border">
                      {grupo.titulos.map((t) => (
                        <label
                          key={t.collectionId}
                          className="flex items-center justify-between gap-3 px-3 py-2 text-sm cursor-pointer hover:bg-gray-50 dark:hover:bg-dark-bg-secondary"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <input
                              type="checkbox"
                              checked={selecionados.has(t.collectionId)}
                              onChange={() => toggleTitulo(t.collectionId)}
                            />
                            <span className="truncate text-gray-700 dark:text-dark-text-secondary">
                              Título {t.collectionId} — venc.{" "}
                              {formatDate(t.vencimento)}
                            </span>
                            <span
                              className={`shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                                t.vencido
                                  ? "bg-red-50 text-red-600"
                                  : "bg-blue-50 text-blue-600"
                              }`}
                            >
                              {t.vencido ? "Vencido" : "A vencer"}
                            </span>
                          </div>
                          <span className="font-bold text-gray-900 dark:text-dark-text shrink-0">
                            {formatCurrency(t.saldo)}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-sm text-right font-bold text-indigo-600">
                Saldo selecionado: {formatCurrency(saldoSelecionado)}
              </p>
            </div>
          )}

          {step === 2 && (
            <>
              <div className="space-y-2 p-3 bg-gray-50 dark:bg-dark-bg-tertiary rounded-xl border border-gray-100 dark:border-dark-border">
                <label className="text-xs font-bold text-gray-400">
                  Multa, juros e desconto
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="text-[10px] text-gray-400">Multa (%)</label>
                    <input
                      type="number"
                      step="0.01"
                      min={0}
                      value={multaPercentual}
                      onChange={(e) => setMultaPercentual(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm dark:bg-dark-bg-secondary dark:border-dark-border dark:text-dark-text"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-400">Juros (% a.m.)</label>
                    <input
                      type="number"
                      step="0.01"
                      min={0}
                      value={jurosPercentualAm}
                      onChange={(e) => setJurosPercentualAm(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm dark:bg-dark-bg-secondary dark:border-dark-border dark:text-dark-text"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-400">
                      Desconto (%) — máx. {descontoMaximoPercentual}%
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min={0}
                      max={descontoMaximoPercentual}
                      value={descontoPercentual}
                      onChange={(e) => setDescontoPercentual(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm dark:bg-dark-bg-secondary dark:border-dark-border dark:text-dark-text"
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between text-xs pt-1">
                  <span className="text-gray-400">
                    Saldo selecionado: {formatCurrency(saldoSelecionado)}
                  </span>
                  <span className="font-bold text-indigo-600">
                    Total negociado: {formatCurrency(totalNegociado)}
                  </span>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-gray-400">
                  Número de parcelas
                </label>
                <input
                  type="number"
                  min={1}
                  value={numeroParcelas}
                  onChange={(e) => setNumeroParcelas(Number(e.target.value))}
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 bg-gray-50 focus:bg-white focus:ring-2 focus:ring-indigo-200 outline-none transition-all dark:bg-dark-bg-secondary dark:border-dark-border dark:text-dark-text"
                />
              </div>

              {parcelas.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-gray-400">
                      Parcelas do acordo (ajuste livremente)
                    </label>
                    <button
                      type="button"
                      onClick={adicionarParcela}
                      className="text-xs font-bold text-indigo-600 flex items-center gap-1"
                    >
                      <Plus className="w-3 h-3" /> adicionar
                    </button>
                  </div>
                  {recalcNotice && (
                    <p className="text-xs text-amber-600 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                      Seleção mudou — parcelas recalculadas, revise os valores.
                    </p>
                  )}
                  <div className="flex items-end gap-2">
                    <div className="flex-1 space-y-1">
                      <label className="text-[10px] font-bold text-gray-400">
                        Data da 1ª parcela
                      </label>
                      <input
                        type="date"
                        value={dataPrimeiraParcela}
                        onChange={(e) => setDataPrimeiraParcela(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-gray-50 text-sm dark:bg-dark-bg-secondary dark:border-dark-border dark:text-dark-text"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={aplicarDataBase}
                      className="px-3 py-2 border border-transparent bg-gray-100 dark:bg-dark-bg-tertiary text-gray-700 dark:text-dark-text text-sm font-bold rounded-lg hover:bg-gray-200 dark:hover:bg-dark-border shrink-0"
                    >
                      Recalcular datas
                    </button>
                  </div>
                  <div className="space-y-2">
                    {(mostrarTodasParcelas
                      ? parcelas
                      : parcelas.slice(0, PARCELAS_VISIVEIS)
                    ).map((p, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <span className="text-xs text-gray-400 w-6 shrink-0">
                          #{p.numero}
                        </span>
                        <input
                          type="number"
                          step="0.01"
                          min={0}
                          value={p.valor}
                          onChange={(e) =>
                            updateParcela(i, "valor", e.target.value)
                          }
                          className="flex-1 px-3 py-2 rounded-lg border border-gray-200 bg-gray-50 text-sm dark:bg-dark-bg-secondary dark:border-dark-border dark:text-dark-text"
                        />
                        <input
                          type="date"
                          value={p.data}
                          min={todayLocalStr()}
                          onChange={(e) =>
                            updateParcela(i, "data", e.target.value)
                          }
                          className="flex-1 px-3 py-2 rounded-lg border border-gray-200 bg-gray-50 text-sm dark:bg-dark-bg-secondary dark:border-dark-border dark:text-dark-text"
                        />
                        <button
                          type="button"
                          onClick={() => removerParcela(i)}
                          className="p-2 text-red-400 hover:text-red-600"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                  {parcelas.length > PARCELAS_VISIVEIS && (
                    <button
                      type="button"
                      onClick={() => setMostrarTodasParcelas((v) => !v)}
                      className="text-xs font-bold text-indigo-600 hover:text-indigo-700"
                    >
                      {mostrarTodasParcelas
                        ? "Mostrar menos"
                        : `Mostrar mais (${parcelas.length - PARCELAS_VISIVEIS})`}
                    </button>
                  )}
                  <p
                    className={`text-sm text-right font-bold ${totalBate ? "text-gray-900 dark:text-dark-text" : "text-red-600"}`}
                  >
                    Total combinado: {formatCurrency(totalParcelas)}
                    {!totalBate && " — não bate com o total negociado"}
                  </p>
                  <p className="text-xs text-indigo-600 bg-indigo-50 border border-indigo-100 rounded-lg px-3 py-2">
                    A 1ª parcela ({formatCurrency(parseFloat(parcelas[0]?.valor || "0") || 0)}) é a
                    entrada — sempre via Pix, confirmada na próxima etapa.
                  </p>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-gray-400">
                  Forma de pagamento das demais parcelas
                </label>
                <select
                  value={formaPagamentoParcelas}
                  onChange={(e) => setFormaPagamentoParcelas(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-sm dark:bg-dark-bg-secondary dark:border-dark-border dark:text-dark-text"
                >
                  {FORMAS_PAGAMENTO_PARCELAS.map((forma) => (
                    <option key={forma} value={forma}>
                      {forma}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-400">
                  Testemunhas (opcional)
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    placeholder="Testemunha 1 — nome completo"
                    value={testemunha1Nome}
                    onChange={(e) => setTestemunha1Nome(e.target.value)}
                    className="px-3 py-2 rounded-lg border border-gray-200 bg-gray-50 text-sm dark:bg-dark-bg-secondary dark:border-dark-border dark:text-dark-text"
                  />
                  <input
                    type="text"
                    placeholder="CPF"
                    value={testemunha1Cpf}
                    onChange={(e) => setTestemunha1Cpf(e.target.value)}
                    className="px-3 py-2 rounded-lg border border-gray-200 bg-gray-50 text-sm dark:bg-dark-bg-secondary dark:border-dark-border dark:text-dark-text"
                  />
                  <input
                    type="text"
                    placeholder="Testemunha 2 — nome completo"
                    value={testemunha2Nome}
                    onChange={(e) => setTestemunha2Nome(e.target.value)}
                    className="px-3 py-2 rounded-lg border border-gray-200 bg-gray-50 text-sm dark:bg-dark-bg-secondary dark:border-dark-border dark:text-dark-text"
                  />
                  <input
                    type="text"
                    placeholder="CPF"
                    value={testemunha2Cpf}
                    onChange={(e) => setTestemunha2Cpf(e.target.value)}
                    className="px-3 py-2 rounded-lg border border-gray-200 bg-gray-50 text-sm dark:bg-dark-bg-secondary dark:border-dark-border dark:text-dark-text"
                  />
                </div>
              </div>
            </>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600 dark:text-dark-text-secondary">
                A entrada de <strong>{formatCurrency(valorEntrada)}</strong> precisa
                ser paga via Pix antes do acordo ser criado. Mostre o QR Code ou
                envie o código copia-e-cola para o cliente e confirme o
                recebimento abaixo.
              </p>

              {!acordoConfiguracaoPadrao?.empresaChavePix ? (
                <div className="p-3 bg-amber-50 border border-amber-100 text-amber-700 text-sm rounded-xl flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  Nenhuma chave Pix cadastrada. Peça para o gestor configurar em
                  "Config. de Acordos".
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3 p-4 bg-gray-50 dark:bg-dark-bg-tertiary rounded-xl border border-gray-100 dark:border-dark-border">
                  {pixQrDataUrl ? (
                    <img
                      src={pixQrDataUrl}
                      alt="QR Code Pix da entrada"
                      className="w-48 h-48 rounded-lg bg-white p-2"
                    />
                  ) : (
                    <div className="w-48 h-48 flex items-center justify-center text-gray-300">
                      <QrCode className="w-10 h-10" />
                    </div>
                  )}
                  <div className="w-full flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={pixCopiaECola}
                      className="flex-1 px-3 py-2 rounded-lg border border-gray-200 bg-white text-xs text-gray-500 dark:bg-dark-bg-secondary dark:border-dark-border"
                    />
                    <button
                      type="button"
                      onClick={copiarPix}
                      className="shrink-0 px-3 py-2 bg-gray-100 dark:bg-dark-bg-secondary text-gray-700 dark:text-dark-text text-xs font-bold rounded-lg hover:bg-gray-200 flex items-center gap-1"
                    >
                      {pixCopiado ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                      {pixCopiado ? "Copiado" : "Copiar"}
                    </button>
                  </div>
                </div>
              )}

              <label className="flex items-start gap-3 p-3 bg-green-50 dark:bg-dark-bg-tertiary border border-green-100 dark:border-dark-border rounded-xl cursor-pointer">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={entradaConfirmada}
                  onChange={(e) => setEntradaConfirmada(e.target.checked)}
                />
                <span className="text-sm text-gray-700 dark:text-dark-text-secondary">
                  Confirmo que recebi o pagamento da entrada (
                  {formatCurrency(valorEntrada)}) via Pix.
                </span>
              </label>
            </div>
          )}
        </div>

        <div className="p-6 pt-4 border-t border-gray-100 dark:border-dark-border flex gap-3 shrink-0">
          {step === 1 ? (
            <>
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-4 py-3 border border-gray-200 text-gray-600 font-bold rounded-xl hover:bg-gray-50 transition-all dark:border-dark-border dark:text-dark-text-secondary"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleContinuar}
                disabled={selecionados.size === 0}
                className="flex-1 px-4 py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 shadow-lg shadow-indigo-200 dark:shadow-none transition-all disabled:opacity-50"
              >
                Continuar
              </button>
            </>
          ) : step === 2 ? (
            <>
              <button
                type="button"
                onClick={handleVoltar}
                className="flex-1 px-4 py-3 border border-gray-200 text-gray-600 font-bold rounded-xl hover:bg-gray-50 transition-all dark:border-dark-border dark:text-dark-text-secondary"
              >
                Voltar
              </button>
              <button
                type="button"
                onClick={handleAvancarParaEntrada}
                disabled={parcelas.length === 0}
                className="flex-1 px-4 py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 shadow-lg shadow-indigo-200 dark:shadow-none transition-all disabled:opacity-50"
              >
                Continuar
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={handleVoltar}
                className="flex-1 px-4 py-3 border border-gray-200 text-gray-600 font-bold rounded-xl hover:bg-gray-50 transition-all dark:border-dark-border dark:text-dark-text-secondary"
              >
                Voltar
              </button>
              <button
                type="submit"
                disabled={loading || !step2Armado || !entradaConfirmada}
                className="flex-1 px-4 py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 shadow-lg shadow-indigo-200 dark:shadow-none transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loading ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    Criar Acordo
                  </>
                )}
              </button>
            </>
          )}
        </div>
        </form>
      </div>

      {aVencerPendentes.length > 0 && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-[110] backdrop-blur-sm">
          <div className="bg-white dark:bg-dark-bg rounded-2xl w-full max-w-md shadow-2xl p-6 space-y-4 border border-gray-200 dark:border-dark-border">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
              <div>
                <h4 className="font-bold text-gray-900 dark:text-dark-text">
                  Incluir títulos que ainda não venceram?
                </h4>
                <p className="text-sm text-gray-500 dark:text-dark-text-secondary mt-1">
                  Este cliente tem {aVencerPendentes.length} título
                  {aVencerPendentes.length > 1 ? "s" : ""} que ainda não{" "}
                  {aVencerPendentes.length > 1
                    ? "estão vencidos"
                    : "está vencido"}{" "}
                  e {aVencerPendentes.length > 1 ? "serão" : "será"} incluído
                  {aVencerPendentes.length > 1 ? "s" : ""} neste acordo:
                </p>
              </div>
            </div>
            <ul className="text-sm space-y-1 max-h-32 overflow-y-auto minimal-scrollbar pl-8">
              {aVencerPendentes.map((t) => (
                <li
                  key={t.collectionId}
                  className="text-gray-600 dark:text-dark-text-secondary"
                >
                  Título {t.collectionId} — venc. {formatDate(t.vencimento)} —{" "}
                  {formatCurrency(t.saldo)}
                </li>
              ))}
            </ul>
            <div className="flex gap-3 pt-1">
              <button
                type="button"
                onClick={() => setAVencerPendentes([])}
                className="flex-1 px-4 py-2.5 border border-gray-200 text-gray-600 font-bold rounded-xl hover:bg-gray-50 transition-all dark:border-dark-border dark:text-dark-text-secondary"
              >
                Revisar seleção
              </button>
              <button
                type="button"
                onClick={confirmarComAVencer}
                className="flex-1 px-4 py-2.5 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-all"
              >
                Confirmar e continuar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AcordoModal;
