import React, { useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { supabase } from "../../lib/supabase";
import { fetchAllPagesByIdRange } from "../../utils/supabasePagination";
import { Modal } from "../Modal"; // Importar o componente Modal
import { useCollection } from "../../contexts/CollectionContext";
import {
  UploadCloud,
  CheckCircle,
  AlertCircle,
  Info,
  FileText,
  RefreshCcw,
  PlusCircle,
  Download,
  User,
  X,
  ChevronDown,
} from "lucide-react"; // Importar ícones
import AddTituloModal from "./AddTituloModal";
import {
  CLIENTE_IMPORT_FIELDS,
  importClientesCadastro,
} from "../../services/clientesImportService";
import {
  BANCO_DADOS_HEADERS,
  CADASTRO_EXPORT_HEADERS,
  UPLOAD_TEMPLATES,
  UploadTemplate,
  downloadUploadTemplate,
} from "../../services/uploadTemplates";
import {
  ResultadoImportacao,
  descreverMotivo,
  importarContasReceberSsotica,
  lerPlanilhaSsotica,
  resultadoVazio,
  somarResultados,
  validarNomeArquivo,
} from "../../services/ssoticaContasReceberImport";
import { fetchClientesRegistry } from "../../services/clientesRegistry";

interface UpdateResult {
  id_parcela: string;
  status: "success" | "error" | "unchanged";
  error?: string;
  details?: any;
}

// Rotulos do modal de resultados. O mesmo modal e reusado por diferentes
// cargas (parcelas x clientes), entao as palavras variam por contexto.
interface ResultLabels {
  itemLabel: string; // identificador de cada item (ex.: "ID Parcela", "Documento")
  successLabel: string; // card/secao de sucesso
  unchangedLabel: string; // card/secao de inalterados/ignorados
  errorLabel: string; // card/secao de falhas
  successEmpty: string; // mensagem quando nao ha sucessos
  unchangedEmpty: string; // mensagem quando nao ha inalterados
}

// Padrao: cargas de parcelas (Atualizar Status / Adicionar Novas Parcelas).
const DEFAULT_RESULT_LABELS: ResultLabels = {
  itemLabel: "ID Parcela",
  successLabel: "Títulos Atualizados",
  unchangedLabel: "Inalterados (ignorados)",
  errorLabel: "Títulos com Falha",
  successEmpty: "Nenhum título atualizado com sucesso.",
  unchangedEmpty: "Nenhum registro inalterado.",
};

// Contas a receber da SSOtica: a funcao do banco devolve totais, e por parcela
// so as que ela NAO mexeu (com o motivo).
const SSOTICA_RESULT_LABELS: ResultLabels = {
  itemLabel: "ID Parcela",
  successLabel: "Atualizadas",
  unchangedLabel: "Não mexidas (protegidas ou para conferir)",
  errorLabel: "Falhas",
  successEmpty: "",
  unchangedEmpty: "Nenhuma parcela deixada de lado.",
};

// Carga do cadastro de clientes (nome, apelido, nascimento e contatos).
const CLIENTES_RESULT_LABELS: ResultLabels = {
  itemLabel: "Documento",
  successLabel: "Clientes Atualizados",
  unchangedLabel: "Sem alteração / não encontrados",
  errorLabel: "Falhas",
  successEmpty: "Nenhum cliente atualizado.",
  unchangedEmpty: "Nenhum cliente sem alteração.",
};

// Quantidade de itens renderizados por vez na Visão Analítica. Renderizar
// milhares de <li> de uma vez trava a UI; mostramos em paginas incrementais.
const RESULTS_PAGE_SIZE = 50;

// Normaliza a mensagem de erro em uma CATEGORIA estavel, agrupando variacoes
// (ex.: "Valor de situacao invalido: 'X'" com valores diferentes vira uma so
// categoria). Permite contar e filtrar as falhas por tipo.
const getErrorCategory = (error?: string): string => {
  if (!error) return "Erro desconhecido";
  const e = error.toLowerCase();
  if (e.includes("não encontrado") || e.includes("nao encontrado"))
    return "Título não encontrado no banco";
  if (e.includes("situacao") || e.includes("situação"))
    return "Situação inválida";
  if (e.includes("já consta") || e.includes("ja consta"))
    return "Título já existente (duplicado)";
  if (e.includes("id_parcela") || e.includes("linha inválida"))
    return "Linha inválida / id_parcela ausente";
  if (e.includes("verificar títulos") || e.includes("verificar titulos"))
    return "Falha ao verificar títulos";
  return "Erro no banco de dados";
};

// Lista de resultados com renderizacao incremental ("mostrar mais") e botao
// para copiar todos os IDs de uma vez -- evita o travamento com alto volume e
// torna a lista util mesmo com milhares de registros.
const ResultList: React.FC<{
  items: UpdateResult[];
  emptyMessage: string;
  showError?: boolean;
  showNote?: boolean;
  idLabel?: string;
}> = ({
  items,
  emptyMessage,
  showError = false,
  showNote = false,
  idLabel = "ID Parcela",
}) => {
  const [visibleCount, setVisibleCount] = useState(RESULTS_PAGE_SIZE);

  // Reinicia a paginacao quando o conjunto de itens muda (novo upload).
  useEffect(() => {
    setVisibleCount(RESULTS_PAGE_SIZE);
  }, [items.length]);

  const copyIds = async () => {
    try {
      await navigator.clipboard.writeText(
        items.map((i) => i.id_parcela).join("\n"),
      );
    } catch (e) {
      console.error("Falha ao copiar IDs:", e);
    }
  };

  if (items.length === 0) {
    return (
      <p className="text-sm text-gray-500 p-4 text-center">{emptyMessage}</p>
    );
  }

  return (
    <div>
      <div className="flex justify-end mb-2">
        <button
          onClick={copyIds}
          className="text-xs font-medium text-blue-600 hover:text-blue-800"
        >
          Copiar IDs
        </button>
      </div>
      <div className="max-h-60 overflow-y-auto border border-gray-200 rounded-md p-2 bg-gray-50">
        <ul className="divide-y divide-gray-200">
          {items.slice(0, visibleCount).map((result, index) => (
            <li key={index} className="py-2 px-2">
              <p className="text-sm font-medium text-gray-800">
                {idLabel}: {result.id_parcela}
              </p>
              {showError && result.error && (
                <p className="text-sm text-red-600">Erro: {result.error}</p>
              )}
              {showNote && !showError && result.error && (
                <p className="text-sm text-gray-600">{result.error}</p>
              )}
            </li>
          ))}
        </ul>
      </div>
      {visibleCount < items.length && (
        <button
          onClick={() =>
            setVisibleCount((v) =>
              Math.min(v + RESULTS_PAGE_SIZE, items.length),
            )
          }
          className="mt-2 w-full text-sm font-medium text-blue-600 hover:text-blue-800 py-2 border border-gray-200 rounded-md bg-white hover:bg-gray-50"
        >
          Mostrar mais ({items.length - visibleCount} restantes)
        </button>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Fila de arquivos. Cada card aceita VARIOS arquivos de uma vez e os processa em
// sequencia, sem exigir que o usuario volte para escolher o proximo a cada
// rodada. A logica de processamento de um arquivo continua exatamente a mesma --
// aqui so muda a orquestracao (selecao, ordem e agregacao dos resultados).
// ---------------------------------------------------------------------------

/** Desfecho de um arquivo da fila (alimenta o progresso e o modal de resultados). */
interface FileSummary {
  name: string;
  status: "success" | "error" | "skipped";
  message: string;
}

/** Identidade de um arquivo na fila -- evita adicionar o mesmo duas vezes. */
const fileKey = (file: File): string =>
  `${file.name}-${file.size}-${file.lastModified}`;

const formatFileSize = (bytes: number): string =>
  bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

const countByStatus = (results: UpdateResult[]) => ({
  success: results.filter((r) => r.status === "success").length,
  unchanged: results.filter((r) => r.status === "unchanged").length,
  error: results.filter((r) => r.status === "error").length,
});

// Classes por cor do card (o Tailwind precisa de strings estaticas).
const DROPZONE_STYLES = {
  blue: {
    hover: "hover:border-blue-500",
    active: "border-blue-500 bg-blue-50",
  },
  green: {
    hover: "hover:border-green-500",
    active: "border-green-500 bg-green-50",
  },
  purple: {
    hover: "hover:border-purple-500",
    active: "border-purple-500 bg-purple-50",
  },
} as const;

// Area de selecao compartilhada pelos tres cards: aceita multiplos arquivos por
// clique ou arrastar-e-soltar, acumula (nao substitui) a cada nova selecao e
// deixa remover item a item antes de enviar.
const FileDropzone: React.FC<{
  id: string;
  accept: string;
  hint: string;
  color: keyof typeof DROPZONE_STYLES;
  files: File[];
  disabled?: boolean;
  onAdd: (files: File[]) => void;
  onRemove: (key: string) => void;
  onClear: () => void;
}> = ({
  id,
  accept,
  hint,
  color,
  files,
  disabled = false,
  onAdd,
  onRemove,
  onClear,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const styles = DROPZONE_STYLES[color];

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(event.target.files ?? []);
    if (selected.length > 0) onAdd(selected);
    // Zera o input para permitir reselecionar o mesmo arquivo depois.
    event.target.value = "";
  };

  const handleDrop = (event: React.DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setIsDragging(false);
    if (disabled) return;
    const dropped = Array.from(event.dataTransfer.files ?? []);
    if (dropped.length > 0) onAdd(dropped);
  };

  return (
    <div>
      <label
        htmlFor={id}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={`cursor-pointer block border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
          isDragging ? styles.active : `border-gray-300 ${styles.hover}`
        } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
      >
        <UploadCloud className="mx-auto h-10 w-10 text-gray-400" />
        <span className="mt-2 block text-sm font-semibold text-gray-700">
          {files.length === 0
            ? "Clique ou arraste os arquivos"
            : `Adicionar mais (${files.length} na fila)`}
        </span>
        <span className="mt-1 block text-xs text-gray-500">{hint}</span>
        <span className="mt-1 block text-xs text-gray-400">
          Pode selecionar vários — são processados em sequência
        </span>
        <input
          type="file"
          accept={accept}
          multiple
          onChange={handleChange}
          disabled={disabled}
          id={id}
          className="sr-only"
        />
      </label>

      {files.length > 0 && (
        <div className="mt-3 space-y-2">
          <ul className="max-h-40 overflow-y-auto divide-y divide-gray-200 border border-gray-200 rounded-md bg-white">
            {files.map((file, index) => (
              <li
                key={fileKey(file)}
                className="flex items-center gap-2 px-3 py-2"
              >
                <span className="w-5 shrink-0 text-xs font-medium text-gray-400">
                  {index + 1}.
                </span>
                <FileText className="h-4 w-4 shrink-0 text-gray-400" />
                <span
                  className="flex-1 truncate text-sm text-gray-700"
                  title={file.name}
                >
                  {file.name}
                </span>
                <span className="shrink-0 text-xs text-gray-400">
                  {formatFileSize(file.size)}
                </span>
                <button
                  type="button"
                  onClick={() => onRemove(fileKey(file))}
                  disabled={disabled}
                  aria-label={`Remover ${file.name}`}
                  className="shrink-0 text-gray-400 hover:text-red-600 disabled:opacity-50"
                >
                  <X className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
          <button
            onClick={onClear}
            disabled={disabled}
            className="w-full text-sm font-semibold text-red-600 transition-colors hover:text-red-800 disabled:opacity-50"
          >
            Limpar fila
          </button>
        </div>
      )}
    </div>
  );
};

// Linha de desfecho por arquivo, usada no modal de progresso (ao vivo) e no de
// resultados (consolidado).
const FileSummaryRow: React.FC<{ summary: FileSummary }> = ({ summary }) => (
  <li className="flex items-start gap-2 px-3 py-2 text-left">
    {summary.status === "success" ? (
      <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-green-500" />
    ) : summary.status === "skipped" ? (
      <Info className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
    ) : (
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
    )}
    <div className="min-w-0 flex-1">
      <p
        className="truncate text-sm font-medium text-gray-800"
        title={summary.name}
      >
        {summary.name}
      </p>
      <p
        className={`text-xs ${
          summary.status === "success" ? "text-gray-600" : "text-red-600"
        }`}
      >
        {summary.message}
      </p>
    </div>
  </li>
);

// Totais devolvidos por importar_parcelas_ssotica (somados entre lotes e
// arquivos).
const SsoticaResumo: React.FC<{ totais: ResultadoImportacao }> = ({
  totais,
}) => {
  const itens: [string, number][] = [
    ["Parcelas lidas", totais.recebidas],
    ["Novas no app", totais.inseridas],
    ["Atualizadas", totais.atualizadas],
    ["Quitadas", totais.quitadas],
    ["Renegociadas (saíram da cobrança)", totais.renegociadas],
    [
      "Renegociadas que já estavam fora do app",
      totais.renegociadas_fora_do_app,
    ],
    ["Clientes novos", totais.clientes_novos],
    ["Endereços novos", totais.enderecos_novos],
    ["Parcelas de acordo lançadas na loja", totais.parcelas_acordo_ssotica],
    ["Pagamentos na loja baixados no acordo", totais.pagamentos_acordo],
    ["Não mexidas (ver Visão Analítica)", totais.ignoradas.length],
  ];
  return (
    <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-sm">
      {itens.map(([rotulo, n]) => (
        <div
          key={rotulo}
          className="flex justify-between border-b border-gray-100 py-1.5"
        >
          <dt className="text-gray-600">{rotulo}</dt>
          <dd className="font-semibold text-gray-900 tabular-nums">{n}</dd>
        </div>
      ))}
    </dl>
  );
};

// ---------------------------------------------------------------------------
// Validacao pre-upload: barra arquivos incorretos ANTES de processar (falha
// cedo e barato). Cobre: tamanho maximo, extensao/tipo e presenca das colunas
// obrigatorias no cabecalho (detecta "arquivo errado no card errado").
// ---------------------------------------------------------------------------

// Limite de tamanho — guarda contra arquivos absurdos que travariam o browser
// (o parse atual e em memoria/thread principal). Ajustavel; o streaming (item
// #2 do roadmap) relaxa a pressao de memoria depois.
const MAX_FILE_SIZE_MB = 50;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

type QuickValidation = { ok: boolean; error?: string };

/** Validacao do relatorio de clientes (aceita .csv, .xlsx, .xls). */
const quickValidateClientes = (file: File): QuickValidation => {
  const name = file.name.toLowerCase();
  const allowed = [".csv", ".xlsx", ".xls"];
  if (!allowed.some((ext) => name.endsWith(ext))) {
    return {
      ok: false,
      error: `Formato inválido: envie .xlsx, .xls ou .csv (recebido "${file.name}").`,
    };
  }
  if (file.size === 0) return { ok: false, error: "O arquivo está vazio." };
  if (file.size > MAX_FILE_SIZE_BYTES) {
    const mb = (file.size / (1024 * 1024)).toFixed(1);
    return {
      ok: false,
      error: `Arquivo muito grande (${mb}MB). O limite é ${MAX_FILE_SIZE_MB}MB.`,
    };
  }
  return { ok: true };
};

const DatabaseUpload: React.FC = () => {
  const { refreshData } = useCollection();
  // Cada card mantem uma FILA de arquivos (processados em sequencia), no lugar
  // do arquivo unico que obrigava o usuario a repetir o ciclo a cada envio.
  const [ssoticaFiles, setSsoticaFiles] = useState<File[]>([]);
  // Totais da ultima importacao do contas a receber da SSOtica (o modal mostra
  // o retorno da funcao importar_parcelas_ssotica em vez dos 3 cards genericos).
  const [ssoticaTotais, setSsoticaTotais] =
    useState<ResultadoImportacao | null>(null);
  const [clientesFiles, setClientesFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [uploadStatus, setUploadStatus] = useState<string>("");
  const [debugInfo, setDebugInfo] = useState<string>("");

  // Estados para o modal de progresso
  const [showProgressModal, setShowProgressModal] = useState<boolean>(false);
  const [progressPercentage, setProgressPercentage] = useState<number>(0);
  const [progressMessage, setProgressMessage] = useState<string>("");

  // Progresso da fila: qual arquivo esta sendo processado e o desfecho dos que
  // ja terminaram (o usuario acompanha tudo sem precisar interagir).
  const [queueIndex, setQueueIndex] = useState<number>(0);
  const [queueTotal, setQueueTotal] = useState<number>(0);
  const [queueFileName, setQueueFileName] = useState<string>("");
  const [fileSummaries, setFileSummaries] = useState<FileSummary[]>([]);

  // Estados para o modal de resultados
  const [showResultsModal, setShowResultsModal] = useState<boolean>(false);
  const [uploadResults, setUploadResults] = useState<UpdateResult[]>([]);
  const [activeTab, setActiveTab] = useState<"sintetico" | "analitico">(
    "sintetico",
  );
  const [needsRefresh, setNeedsRefresh] = useState<boolean>(false);
  const [modalTitle, setModalTitle] = useState<string>("");
  const [resultLabels, setResultLabels] = useState<ResultLabels>(
    DEFAULT_RESULT_LABELS,
  );
  const [showAddTituloModal, setShowAddTituloModal] = useState<boolean>(false);

  // Menu de modelos: cada card tem um modelo proprio, entao o botao abre a
  // lista em vez de baixar direto um unico arquivo.
  const [templateMenuOpen, setTemplateMenuOpen] = useState<boolean>(false);
  const templateMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!templateMenuOpen) return;

    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      if (!templateMenuRef.current?.contains(event.target as Node)) {
        setTemplateMenuOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setTemplateMenuOpen(false);
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [templateMenuOpen]);

  // Particiona os resultados uma unica vez por mudanca (em vez de filtrar a
  // lista varias vezes a cada render do modal).
  const successResults = useMemo(
    () => uploadResults.filter((r) => r.status === "success"),
    [uploadResults],
  );
  const errorResults = useMemo(
    () => uploadResults.filter((r) => r.status === "error"),
    [uploadResults],
  );
  const unchangedResults = useMemo(
    () => uploadResults.filter((r) => r.status === "unchanged"),
    [uploadResults],
  );

  // Agrupa as falhas por categoria de erro (mais frequente primeiro) para
  // exibir um card por tipo e permitir filtrar a lista de falhas.
  const errorGroups = useMemo(() => {
    const map = new Map<string, UpdateResult[]>();
    for (const r of errorResults) {
      const cat = getErrorCategory(r.error);
      const list = map.get(cat);
      if (list) list.push(r);
      else map.set(cat, [r]);
    }
    return Array.from(map.entries()).sort((a, b) => b[1].length - a[1].length);
  }, [errorResults]);

  // Categoria de erro selecionada para filtrar a lista de falhas (null = todas).
  const [selectedErrorCategory, setSelectedErrorCategory] = useState<
    string | null
  >(null);

  // Reseta o filtro de categoria sempre que um novo resultado e carregado.
  useEffect(() => {
    setSelectedErrorCategory(null);
  }, [uploadResults]);

  const filteredErrors = useMemo(() => {
    if (!selectedErrorCategory) return errorResults;
    return (
      errorGroups.find(([cat]) => cat === selectedErrorCategory)?.[1] ?? []
    );
  }, [errorResults, errorGroups, selectedErrorCategory]);

  // Progresso da fila inteira: arquivos concluidos + fracao do atual.
  const overallProgress = useMemo(() => {
    if (queueTotal === 0) return 0;
    const done = queueIndex + progressPercentage / 100;
    return Math.min(100, Math.round((done / queueTotal) * 100));
  }, [queueIndex, queueTotal, progressPercentage]);

  const handleAddSuccess = () => {
    // Maybe show a success message
    setUploadStatus("✅ Título adicionado com sucesso!");
    // Refresh data
    refreshData();
  };

  // Acrescenta arquivos a uma fila: valida cada um ainda na selecao, descarta
  // repetidos e reporta os rejeitados de uma vez -- sem bloquear os validos.
  const addFilesToQueue = (
    incoming: File[],
    current: File[],
    setFiles: React.Dispatch<React.SetStateAction<File[]>>,
    validate: (file: File) => QuickValidation,
  ) => {
    setDebugInfo("");
    const known = new Set(current.map(fileKey));
    const accepted: File[] = [];
    const rejected: string[] = [];
    let duplicates = 0;

    for (const file of incoming) {
      if (known.has(fileKey(file))) {
        duplicates++;
        continue;
      }
      const v = validate(file);
      if (v.ok) {
        known.add(fileKey(file));
        accepted.push(file);
      } else {
        rejected.push(`${file.name} (${v.error})`);
      }
    }

    if (accepted.length > 0) setFiles([...current, ...accepted]);

    if (rejected.length > 0) {
      setUploadStatus(
        `❌ ${rejected.length} arquivo(s) não adicionado(s): ${rejected.join(" | ")}`,
      );
    } else if (duplicates > 0 && accepted.length === 0) {
      // Sem este aviso, reselecionar o mesmo arquivo pareceria nao ter efeito.
      setUploadStatus(
        `ℹ️ ${duplicates} arquivo(s) já estava(m) na fila e foi(ram) ignorado(s).`,
      );
    } else {
      setUploadStatus("");
    }
  };

  const removeFromQueue = (
    key: string,
    setFiles: React.Dispatch<React.SetStateAction<File[]>>,
  ) => {
    setFiles((prev) => prev.filter((file) => fileKey(file) !== key));
    setUploadStatus("");
  };

  const clearQueue = (
    setFiles: React.Dispatch<React.SetStateAction<File[]>>,
  ) => {
    setFiles([]);
    setUploadStatus("");
    setDebugInfo("");
  };

  const handleCloseResultsModal = async () => {
    setShowResultsModal(false);
    if (needsRefresh) {
      // Idealmente, mostrar um indicador de loading global aqui
      await refreshData();
      setNeedsRefresh(false); // Reset
    }
  };

  // Função para testar conexão com Supabase
  const testSupabaseConnection = async () => {
    try {
      // Testando conexão com o banco de dados...

      // Verificar se a tabela existe e conseguimos fazer uma query simples
      const { error, count } = await supabase
        .from("BANCO_DADOS")
        .select("*", { count: "exact", head: true });

      if (error) {
        console.error("Erro de conectividade com o banco de dados");
        setDebugInfo(`❌ Erro de conexão: ${error.message}`);
        return false;
      }
      setDebugInfo(`✅ Conexão OK. ${count} registros na tabela BANCO_DADOS`);
      return true;
    } catch (error) {
      console.error("❌ Erro de conexão:", error);
      setDebugInfo(`❌ Erro: ${(error as Error).message}`);
      return false;
    }
  };

  const handleDownloadExcel = async () => {
    setLoading(true);
    setUploadStatus("🔄 Gerando arquivo Excel...");
    try {
      const BATCH_SIZE = 1000;

      // Faixa por id_parcela em vez de OFFSET: um index range scan
      // (BANCO_DADOS_pkey) tem custo independente da profundidade, ao
      // contrario de OFFSET sobre a tabela inteira (mesmo utilitario usado
      // em CollectionContext.tsx para o mesmo motivo).
      const [minRes, maxRes] = await Promise.all([
        supabase
          .from("BANCO_DADOS")
          .select("id_parcela")
          .order("id_parcela", { ascending: true })
          .limit(1),
        supabase
          .from("BANCO_DADOS")
          .select("id_parcela")
          .order("id_parcela", { ascending: false })
          .limit(1),
      ]);
      const min = (minRes.data?.[0]?.id_parcela as number | undefined) ?? null;
      const max = (maxRes.data?.[0]?.id_parcela as number | undefined) ?? null;

      const allData: any[] =
        min === null || max === null
          ? []
          : await fetchAllPagesByIdRange<Record<string, unknown>>(
              (gte, lt) => {
                const base = supabase
                  .from("BANCO_DADOS")
                  .select("*")
                  .order("id_parcela", { ascending: true })
                  .gte("id_parcela", gte)
                  .limit(BATCH_SIZE);
                return lt === null ? base : base.lt("id_parcela", lt);
              },
              { min, max },
              (row) => Number(row.id_parcela),
              { pageSize: BATCH_SIZE },
            );

      if (allData.length === 0) {
        setUploadStatus("ℹ️ Nenhum dado para exportar.");
        setLoading(false);
        return;
      }

      // Apelido, telefones e e-mail sairam de BANCO_DADOS (migration
      // 20260904000002) e vivem em `clientes`. Reanexamos na exportacao para
      // a planilha continuar completa -- sem isso o arquivo baixado perderia
      // os contatos do cliente.
      setUploadStatus("🔄 Carregando cadastro dos clientes...");
      const registry = await fetchClientesRegistry();

      // Define headers in the desired order
      const headers = [...BANCO_DADOS_HEADERS, ...CADASTRO_EXPORT_HEADERS];

      // Create worksheet data, starting with headers
      const wsData = [headers];

      // Add rows
      allData.forEach((row) => {
        const cadastro = registry.get((row.documento ?? "").toString().trim());
        const rowData = headers.map((header) =>
          CADASTRO_EXPORT_HEADERS.includes(header)
            ? ((cadastro as Record<string, unknown> | undefined)?.[header] ??
              "")
            : (row[header] ?? ""),
        );
        wsData.push(rowData);
      });

      // Create worksheet and workbook
      const ws = XLSX.utils.aoa_to_sheet(wsData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "BANCO_DADOS");

      // Trigger download
      XLSX.writeFile(wb, "export_banco_dados.xlsx");

      setUploadStatus("✅ Arquivo Excel gerado com sucesso!");
    } catch (error) {
      const errorMsg = (error as Error).message;
      setUploadStatus(`❌ Erro ao gerar Excel: ${errorMsg}`);
      console.error("❌ Erro ao gerar Excel:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadTemplate = (template: UploadTemplate) => {
    setTemplateMenuOpen(false);
    try {
      downloadUploadTemplate(template);
      setUploadStatus(`✅ Modelo "${template.label}" gerado com sucesso!`);
    } catch (error) {
      const errorMsg = (error as Error).message;
      setUploadStatus(`❌ Erro ao gerar o modelo CSV: ${errorMsg}`);
      console.error("❌ Erro ao gerar modelo CSV:", error);
    }
  };

  // Executor da fila, comum aos tres cards: valida todos os arquivos primeiro,
  // processa um a um SEM pedir interacao entre eles e abre um unico modal de
  // resultados no fim, com os numeros somados e o desfecho por arquivo. O que
  // roda dentro de `run` e exatamente a mesma logica de antes.
  const runQueue = async (
    files: File[],
    options: {
      validate: (file: File) => Promise<QuickValidation>;
      run: (
        file: File,
        onProgress: (percentage: number, message: string) => void,
      ) => Promise<UpdateResult[]>;
      summarize: (results: UpdateResult[]) => string;
      labels: ResultLabels;
      title: string;
      onFinish: () => void;
      // Passo unico executado antes da fila (ex.: testar a conexao uma vez, e
      // nao a cada arquivo). Retornar false aborta a fila.
      beforeAll?: () => Promise<boolean>;
    },
  ) => {
    if (files.length === 0) {
      setUploadStatus("❌ Selecione ao menos um arquivo.");
      return;
    }

    setLoading(true);
    setShowProgressModal(true);
    setProgressPercentage(0);
    setProgressMessage(
      files.length > 1
        ? `Validando ${files.length} arquivos...`
        : "Validando arquivo...",
    );
    setUploadStatus("");
    setDebugInfo("");
    setFileSummaries([]);
    setSsoticaTotais(null);
    setQueueIndex(0);
    setQueueTotal(files.length);
    setQueueFileName(files[0].name);

    const summaries: FileSummary[] = [];
    const allResults: UpdateResult[] = [];

    try {
      // 1. Valida a fila inteira antes de gravar qualquer coisa. Arquivo
      // invalido nao interrompe os demais: entra como "ignorado" no relatorio.
      const validFiles: File[] = [];
      for (const file of files) {
        const validation = await options.validate(file);
        if (validation.ok) {
          validFiles.push(file);
        } else {
          summaries.push({
            name: file.name,
            status: "skipped",
            message: validation.error ?? "Arquivo inválido.",
          });
        }
      }
      setFileSummaries([...summaries]);
      setQueueTotal(validFiles.length);

      if (validFiles.length === 0) {
        setProgressMessage("❌ Nenhum arquivo válido na fila.");
        setUploadStatus(
          `❌ Nenhum arquivo válido: ${summaries
            .map((s) => `${s.name} (${s.message})`)
            .join(" | ")}`,
        );
        return;
      }

      if (options.beforeAll && !(await options.beforeAll())) return;

      // 2. Processa em sequencia. Falha em um arquivo nao derruba a fila: fica
      // registrada e o proximo comeca automaticamente.
      for (let index = 0; index < validFiles.length; index++) {
        const file = validFiles[index];
        setQueueIndex(index);
        setQueueFileName(file.name);
        setProgressPercentage(0);
        setProgressMessage(`📤 Lendo ${file.name}...`);

        try {
          const results = await options.run(file, (percentage, message) => {
            setProgressPercentage(percentage);
            setProgressMessage(message);
          });
          allResults.push(...results);
          summaries.push({
            name: file.name,
            status: "success",
            message: options.summarize(results),
          });
        } catch (error) {
          const errorMsg = (error as Error).message;
          summaries.push({
            name: file.name,
            status: "error",
            message: errorMsg,
          });
          console.error(`❌ Erro ao processar "${file.name}":`, error);
        }
        setFileSummaries([...summaries]);
      }

      setQueueIndex(validFiles.length);
      setProgressPercentage(100);
      setProgressMessage(
        validFiles.length > 1
          ? `✅ ${validFiles.length} arquivos processados!`
          : "✅ Processo concluído!",
      );

      const processedFiles = summaries.filter(
        (s) => s.status === "success",
      ).length;
      const problemFiles = summaries.length - processedFiles;
      setUploadStatus(
        `${files.length > 1 ? `${processedFiles}/${files.length} arquivo(s): ` : ""}` +
          options.summarize(allResults) +
          `${problemFiles > 0 ? ` — ${problemFiles} arquivo(s) com problema.` : ""}`,
      );

      setResultLabels(options.labels);
      setModalTitle(
        files.length > 1
          ? `${options.title} (${processedFiles} arquivo(s))`
          : options.title,
      );
      setUploadResults(allResults);
      setActiveTab("sintetico");
      if (allResults.some((r) => r.status === "success")) {
        setNeedsRefresh(true);
      }
      setShowResultsModal(true);
      // Fila consumida: limpa a selecao para o proximo lote.
      options.onFinish();
    } catch (error) {
      const errorMsg = (error as Error).message;
      setUploadStatus(`❌ Erro: ${errorMsg}`);
      setDebugInfo(`❌ Erro detalhado: ${errorMsg}`);
      setProgressMessage(`❌ Erro: ${errorMsg}`);
      setProgressPercentage(0);
      console.error("❌ Erro detalhado:", error);
    } finally {
      setLoading(false);
      // Manter o modal aberto por um breve período para o usuário ver o status final
      setTimeout(() => setShowProgressModal(false), 2000);
    }
  };

  // Contas a receber da SSOtica (planilhas BD_Contasareceber_*.xlsx, aba BD).
  // Mesma conversao do script diario (linhas_para_app) e mesma funcao do banco
  // (importar_parcelas_ssotica): as regras -- o que atualizar, o que nao tocar
  // (cancelada, acordo ativo, pagamento do app ainda nao baixado), renegociacao
  // -- ficam la. Esta tela nao escreve em BANCO_DADOS diretamente.
  const handleUploadSsotica = () => {
    let totais = resultadoVazio();
    return runQueue(ssoticaFiles, {
      validate: async (file) => {
        const v = validarNomeArquivo(file);
        if (!v.ok) return v;
        if (file.size === 0)
          return { ok: false, error: "O arquivo está vazio." };
        if (file.size > MAX_FILE_SIZE_BYTES)
          return {
            ok: false,
            error: `Arquivo muito grande. O limite é ${MAX_FILE_SIZE_MB}MB.`,
          };
        return { ok: true };
      },
      run: async (file, onProgress) => {
        onProgress(5, `📖 Lendo ${file.name}...`);
        const { linhas, descartadas, lojas } = await lerPlanilhaSsotica(file);
        if (linhas.length === 0)
          throw new Error("Nenhuma parcela com ID Parcela na planilha.");
        onProgress(
          20,
          `📋 ${linhas.length} parcela(s) de ${lojas.join(", ") || "loja sem nome"}. Enviando...`,
        );
        const res = await importarContasReceberSsotica(
          linhas,
          (feitas, total) =>
            onProgress(
              20 + Math.round((feitas / total) * 80),
              `📤 ${feitas}/${total} parcela(s) enviadas...`,
            ),
          (lote) => {
            totais = somarResultados(totais, lote);
          },
        );
        if (descartadas > 0) {
          setDebugInfo(
            (prev) =>
              `${prev}${prev ? "\n" : ""}📄 ${file.name}: ${descartadas} linha(s) sem ID Parcela ou da Exxlab descartada(s).`,
          );
        }
        return res.ignoradas.map((ig) => ({
          id_parcela: String(ig.id_parcela),
          status: "unchanged" as const,
          error: descreverMotivo(ig.motivo),
        }));
      },
      summarize: () =>
        `SSÓtica: ${totais.recebidas} recebida(s), ${totais.inseridas} nova(s), ` +
        `${totais.atualizadas} atualizada(s), ${totais.ignoradas.length} não mexida(s).`,
      labels: SSOTICA_RESULT_LABELS,
      title: "Resultado do Contas a Receber SSÓtica",
      onFinish: () => {
        setSsoticaTotais(totais);
        if (totais.inseridas > 0 || totais.atualizadas > 0)
          setNeedsRefresh(true);
        setSsoticaFiles([]);
      },
    });
  };

  // Importa o cadastro de clientes (nome, apelido, nascimento e contatos). A
  // regra de negocio (colunas aceitas, normalizacao, casamento por documento e
  // update em lote) vive em clientesImportService; aqui cuidamos apenas da UI
  // (progresso e resultado).
  const handleUploadClientes = () =>
    runQueue(clientesFiles, {
      validate: async (file) => quickValidateClientes(file),
      run: async (file, onProgress) => {
        const { rows, detectedFields, notFound, noChange } =
          await importClientesCadastro(file, onProgress);

        // Quais colunas o importador reconheceu e o que aconteceu com quem nao
        // foi atualizado: sem isso o usuario nao tem como saber se a coluna que
        // ele preencheu foi ignorada por causa do cabecalho.
        setDebugInfo(
          (prev) =>
            `${prev}${prev ? "\n" : ""}📄 ${file.name}: colunas reconhecidas — ` +
            `${detectedFields.join(", ")} | ${notFound} não encontrado(s), ` +
            `${noChange} já estava(m) igual(is).`,
        );

        return rows.map((r) => ({
          id_parcela: r.documento,
          status: r.status,
          error: r.error,
          details: r.updatedFields,
        }));
      },
      summarize: (results) => {
        const { success, unchanged, error } = countByStatus(results);
        return `Cadastro: ${success} cliente(s) atualizado(s), ${unchanged} sem alteração/não encontrado(s), ${error} falha(s).`;
      },
      labels: CLIENTES_RESULT_LABELS,
      title: "Resultado da Atualização do Cadastro de Clientes",
      onFinish: () => setClientesFiles([]),
    });

  return (
    <div className="bg-white rounded-2xl sm:rounded-2xl shadow-sm p-4 sm:p-6 border border-gray-200 space-y-6">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
        <h2 className="text-xl lg:text-2xl font-bold text-gray-900 flex items-center-title">
          Upload de Dados do Banco
        </h2>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <div className="grid grid-cols-2 gap-2 order-last sm:order-first">
            <button
              onClick={handleDownloadExcel}
              disabled={loading}
              className="inline-flex items-center justify-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md shadow-sm text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
            >
              <Download className="h-5 w-5 mr-2" />
              <span>Baixar Banco de Dados</span>
            </button>
            <div className="relative" ref={templateMenuRef}>
              <button
                type="button"
                onClick={() => setTemplateMenuOpen((open) => !open)}
                disabled={loading}
                aria-haspopup="menu"
                aria-expanded={templateMenuOpen}
                className="w-full inline-flex items-center justify-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md shadow-sm text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
              >
                <FileText className="h-5 w-5 mr-2" />
                <span>Baixar Modelo CSV</span>
                <ChevronDown
                  className={`h-4 w-4 ml-2 transition-transform ${
                    templateMenuOpen ? "rotate-180" : ""
                  }`}
                />
              </button>

              {templateMenuOpen && (
                <div
                  role="menu"
                  className="absolute right-0 z-30 mt-2 w-80 max-w-[calc(100vw-2rem)] bg-white border border-gray-200 rounded-lg shadow-xl overflow-hidden"
                >
                  <p className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500 bg-gray-50 border-b border-gray-200">
                    Escolha o modelo
                  </p>
                  {UPLOAD_TEMPLATES.map((template) => (
                    <button
                      key={template.id}
                      type="button"
                      role="menuitem"
                      onClick={() => handleDownloadTemplate(template)}
                      className="w-full text-left px-4 py-3 hover:bg-indigo-50 focus:bg-indigo-50 focus:outline-none border-b border-gray-100 last:border-b-0"
                    >
                      <span className="flex items-center text-sm font-medium text-gray-800">
                        <Download className="h-4 w-4 mr-2 text-indigo-600 shrink-0" />
                        {template.label}
                      </span>
                      <span className="block mt-1 text-xs text-gray-500">
                        {template.description}
                      </span>
                      <span className="block mt-1 text-[11px] text-gray-400">
                        {template.headers.length} coluna(s) ·{" "}
                        {template.fileName}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <button
            onClick={() => setShowAddTituloModal(true)}
            className="inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-500 hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 order-first sm:order-last"
          >
            <PlusCircle className="h-5 w-5 mr-2" />
            <span>Adicionar Título</span>
          </button>
        </div>
      </div>
      <p className="text-sm text-gray-600 mt-1 hidden sm:block">
        Utilize esta seção para atualizar informações existentes ou adicionar
        novos registros à tabela BANCO_DADOS.
      </p>

      {/* Botão de teste de conexão */}
      <div className="bg-yellow-50 border border-yellow-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h3 className="text-sm font-medium text-yellow-800 flex items-center">
          <Info className="h-4 w-4 mr-2" />
          🔧 Debug e Teste
        </h3>
        <button
          onClick={testSupabaseConnection}
          disabled={loading}
          className="inline-flex items-center justify-center px-3 py-2 border border-yellow-300 text-sm font-medium rounded-md text-yellow-700 bg-yellow-50 hover:bg-yellow-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-yellow-500 disabled:opacity-50 w-full sm:w-auto"
        >
          <RefreshCcw className="h-4 w-4 mr-2" /> Testar Conexão com Supabase
        </button>
      </div>

      {/* Status do upload */}
      {uploadStatus && (
        <div
          className={`p-4 rounded-2xl flex items-center ${
            uploadStatus.includes("❌")
              ? "bg-red-50 text-red-700"
              : uploadStatus.includes("✅")
                ? "bg-green-50 text-green-700"
                : "bg-blue-50 text-blue-700"
          }`}
        >
          {uploadStatus.includes("❌") && (
            <AlertCircle className="h-5 w-5 mr-3" />
          )}
          {uploadStatus.includes("✅") && (
            <CheckCircle className="h-5 w-5 mr-3" />
          )}
          {uploadStatus.includes("🔄") && (
            <RefreshCcw className="h-5 w-5 mr-3 animate-spin" />
          )}
          {!uploadStatus.includes("❌") &&
            !uploadStatus.includes("✅") &&
            !uploadStatus.includes("🔄") && <Info className="h-5 w-5 mr-3" />}
          <span>{uploadStatus}</span>
        </div>
      )}

      {/* Debug info */}
      {debugInfo && (
        <div className="bg-gray-50 border border-gray-200 rounded-2xl p-4">
          <h4 className="text-sm font-medium text-gray-800 mb-2 flex items-center">
            <FileText className="h-4 w-4 mr-2" />
            🐛 Informações de Debug:
          </h4>
          <pre className="text-xs text-gray-600 whitespace-pre-wrap bg-gray-100 p-3 rounded-md overflow-auto max-h-40">
            {debugInfo}
          </pre>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {/* Card: Contas a receber SSOtica */}
        <div className="flex flex-col bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden transition-all hover:shadow-xl">
          <div className="p-6">
            <div className="flex items-center gap-3">
              <div className="bg-blue-100 p-3 rounded-full">
                <UploadCloud className="h-6 w-6 text-blue-600" />
              </div>
              <h3 className="text-xl font-bold text-gray-800">
                Contas a Receber SSÓtica
              </h3>
            </div>
            <p className="text-gray-500 mt-3 text-sm">
              Envie as planilhas{" "}
              <code className="text-xs bg-gray-100 px-1 py-0.5 rounded">
                BD_Contasareceber_*.xlsx
              </code>{" "}
              (as mesmas do Power BI). Parcelas novas entram, as existentes são
              atualizadas, e as que estão canceladas, em acordo ou com pagamento
              do app ainda não baixado na loja não são tocadas.
            </p>
            <p className="text-gray-400 mt-2 text-xs">
              A atualização já roda sozinha todo dia às 6h; use aqui só para
              repetir fora do horário. A Focco Brasil vem do Ciclone e a Exxlab
              não entra no app.
            </p>
          </div>

          <div className="px-6 pb-6 mt-auto">
            <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 space-y-4">
              <FileDropzone
                id="ssoticaFileInput"
                accept=".xlsx"
                hint="Formato XLSX, até 50MB por arquivo"
                color="blue"
                files={ssoticaFiles}
                disabled={loading}
                onAdd={(files) =>
                  addFilesToQueue(files, ssoticaFiles, setSsoticaFiles, (f) =>
                    f.size === 0
                      ? { ok: false, error: "O arquivo está vazio." }
                      : validarNomeArquivo(f),
                  )
                }
                onRemove={(key) => removeFromQueue(key, setSsoticaFiles)}
                onClear={() => clearQueue(setSsoticaFiles)}
              />

              <button
                onClick={handleUploadSsotica}
                disabled={loading || ssoticaFiles.length === 0}
                className="w-full inline-flex justify-center items-center px-4 py-3 border border-transparent text-base font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {loading ? (
                  <RefreshCcw className="h-5 w-5 mr-2 animate-spin" />
                ) : (
                  <UploadCloud className="h-5 w-5 mr-2" />
                )}
                {loading
                  ? "Processando..."
                  : ssoticaFiles.length > 1
                    ? `Enviar e Atualizar (${ssoticaFiles.length} arquivos)`
                    : "Enviar e Atualizar"}
              </button>
            </div>
          </div>
        </div>

        {/* Card: Atualizar Cadastro de Clientes */}
        <div className="flex flex-col bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden transition-all hover:shadow-xl">
          <div className="p-6">
            <div className="flex items-center gap-3">
              <div className="bg-purple-100 p-3 rounded-full">
                <User className="h-6 w-6 text-purple-600" />
              </div>
              <h3 className="text-xl font-bold text-gray-800">
                Atualizar Cadastro de Clientes
              </h3>
            </div>
            <p className="text-gray-500 mt-3 text-sm">
              Envie o relatório de clientes (xlsx ou csv) com a coluna{" "}
              <code className="text-xs bg-gray-100 px-1 py-0.5 rounded">
                documento
              </code>{" "}
              e as que quiser atualizar. Colunas desconhecidas ou vazias são
              ignoradas, e apenas clientes já existentes na base são
              atualizados.
            </p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {CLIENTE_IMPORT_FIELDS.map((field) => (
                <code
                  key={field.key}
                  title={`Aceita também: ${field.label}`}
                  className="text-[11px] bg-purple-50 text-purple-700 border border-purple-100 px-1.5 py-0.5 rounded"
                >
                  {field.key}
                </code>
              ))}
            </div>
          </div>

          <div className="px-6 pb-6 mt-auto">
            <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 space-y-4">
              <FileDropzone
                id="clientesFileInput"
                accept=".xlsx,.csv"
                hint="Formato XLSX ou CSV, até 50MB por arquivo"
                color="purple"
                files={clientesFiles}
                disabled={loading}
                onAdd={(files) =>
                  addFilesToQueue(
                    files,
                    clientesFiles,
                    setClientesFiles,
                    quickValidateClientes,
                  )
                }
                onRemove={(key) => removeFromQueue(key, setClientesFiles)}
                onClear={() => clearQueue(setClientesFiles)}
              />

              <button
                onClick={handleUploadClientes}
                disabled={loading || clientesFiles.length === 0}
                className="w-full inline-flex justify-center items-center px-4 py-3 border border-transparent text-base font-medium rounded-md shadow-sm text-white bg-purple-600 hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {loading ? (
                  <RefreshCcw className="h-5 w-5 mr-2 animate-spin" />
                ) : (
                  <UploadCloud className="h-5 w-5 mr-2" />
                )}
                {loading
                  ? "Processando..."
                  : clientesFiles.length > 1
                    ? `Enviar e Atualizar (${clientesFiles.length} arquivos)`
                    : "Enviar e Atualizar"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Modal de Resultados */}
      <Modal
        isOpen={showResultsModal}
        onClose={handleCloseResultsModal}
        title={modalTitle}
        size="3xl"
      >
        <div className="p-4">
          <div className="border-b border-gray-200">
            <nav className="-mb-px flex space-x-6" aria-label="Tabs">
              <button
                onClick={() => setActiveTab("sintetico")}
                className={`${
                  activeTab === "sintetico"
                    ? "border-blue-500 text-blue-600"
                    : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                } whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm`}
              >
                Visão Sintética
              </button>
              <button
                onClick={() => setActiveTab("analitico")}
                className={`${
                  activeTab === "analitico"
                    ? "border-blue-500 text-blue-600"
                    : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                } whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm`}
              >
                Visão Analítica
              </button>
            </nav>
          </div>

          <div className="py-4 min-h-[300px]">
            {activeTab === "sintetico" && (
              <div>
                <h3 className="text-lg font-bold text-gray-900 mb-4">
                  Resumo da Operação
                </h3>
                {ssoticaTotais ? (
                  <SsoticaResumo totais={ssoticaTotais} />
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-green-50 p-4 rounded-lg flex items-center space-x-3">
                      <CheckCircle className="h-8 w-8 text-green-500" />
                      <div>
                        <p className="text-sm text-gray-600">
                          {resultLabels.successLabel}
                        </p>
                        <p className="text-2xl font-bold text-gray-900">
                          {successResults.length}
                        </p>
                      </div>
                    </div>
                    <div className="bg-gray-100 p-4 rounded-lg flex items-center space-x-3">
                      <Info className="h-8 w-8 text-gray-500" />
                      <div>
                        <p className="text-sm text-gray-600">
                          {resultLabels.unchangedLabel}
                        </p>
                        <p className="text-2xl font-bold text-gray-900">
                          {unchangedResults.length}
                        </p>
                      </div>
                    </div>
                    <div className="bg-red-50 p-4 rounded-lg flex items-center space-x-3">
                      <AlertCircle className="h-8 w-8 text-red-500" />
                      <div>
                        <p className="text-sm text-gray-600">
                          {resultLabels.errorLabel}
                        </p>
                        <p className="text-2xl font-bold text-gray-900">
                          {errorResults.length}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
                {!ssoticaTotais && (
                  <p className="text-xs text-gray-500 mt-4 text-center">
                    Total processado: {uploadResults.length} registro(s)
                  </p>
                )}

                {/* Quebra por arquivo -- so faz sentido quando a fila teve mais
                    de um arquivo (ou algum foi ignorado na validacao). Na
                    SSOtica sempre aparece: e onde fica a falha de um arquivo. */}
                {(fileSummaries.length > 1 ||
                  (ssoticaTotais && fileSummaries.length > 0)) && (
                  <div className="mt-6">
                    <h4 className="text-sm font-semibold text-gray-700 mb-2">
                      Por arquivo ({fileSummaries.length})
                    </h4>
                    <ul className="max-h-60 overflow-y-auto divide-y divide-gray-200 border border-gray-200 rounded-md bg-gray-50">
                      {fileSummaries.map((summary, index) => (
                        <FileSummaryRow
                          key={`${summary.name}-${index}`}
                          summary={summary}
                        />
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {activeTab === "analitico" && (
              <div>
                <h3 className="text-lg font-bold text-gray-900 mb-4">
                  Detalhes da Operação
                </h3>
                <div className="space-y-6">
                  {/* Falhas */}
                  <div>
                    <h4 className="text-md font-semibold text-red-700 mb-2">
                      {resultLabels.errorLabel} ({errorResults.length})
                    </h4>

                    {/* Cards por tipo de erro (clicaveis para filtrar a lista) */}
                    {errorGroups.length > 0 && (
                      <div className="flex flex-wrap gap-2 mb-3">
                        <button
                          onClick={() => setSelectedErrorCategory(null)}
                          className={`px-3 py-2 rounded-lg border text-left transition-colors ${
                            selectedErrorCategory === null
                              ? "border-red-400 bg-red-100"
                              : "border-gray-200 bg-gray-50 hover:bg-gray-100"
                          }`}
                        >
                          <span className="block text-lg font-bold text-gray-900">
                            {errorResults.length}
                          </span>
                          <span className="block text-xs text-gray-600">
                            Todas
                          </span>
                        </button>
                        {errorGroups.map(([category, items]) => (
                          <button
                            key={category}
                            onClick={() => setSelectedErrorCategory(category)}
                            className={`px-3 py-2 rounded-lg border text-left transition-colors ${
                              selectedErrorCategory === category
                                ? "border-red-400 bg-red-100"
                                : "border-gray-200 bg-gray-50 hover:bg-gray-100"
                            }`}
                          >
                            <span className="block text-lg font-bold text-red-700">
                              {items.length}
                            </span>
                            <span className="block text-xs text-gray-600 max-w-[12rem]">
                              {category}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}

                    <ResultList
                      items={filteredErrors}
                      emptyMessage="Nenhuma falha registrada."
                      showError
                      idLabel={resultLabels.itemLabel}
                    />
                  </div>

                  {/* Inalterados */}
                  <div>
                    <h4 className="text-md font-semibold text-gray-700 mb-2">
                      {resultLabels.unchangedLabel} ({unchangedResults.length})
                    </h4>
                    <ResultList
                      items={unchangedResults}
                      emptyMessage={resultLabels.unchangedEmpty}
                      showNote
                      idLabel={resultLabels.itemLabel}
                    />
                  </div>

                  {/* Sucessos (a SSOtica so devolve totais: ver Visao Sintetica) */}
                  {!ssoticaTotais && (
                    <div>
                      <h4 className="text-md font-semibold text-green-700 mb-2">
                        {resultLabels.successLabel} ({successResults.length})
                      </h4>
                      <ResultList
                        items={successResults}
                        emptyMessage={resultLabels.successEmpty}
                        idLabel={resultLabels.itemLabel}
                      />
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </Modal>

      {/* Modal de Progresso */}
      <Modal
        isOpen={showProgressModal}
        onClose={() => setShowProgressModal(false)}
        title="Processando Solicitação"
      >
        <div className="text-center p-4">
          {/* Progresso da FILA: so aparece quando ha mais de um arquivo. */}
          {queueTotal > 1 && (
            <div className="mb-5 text-left">
              <div className="flex justify-between items-baseline mb-1 gap-2">
                <span className="text-sm font-semibold text-gray-700">
                  Arquivo {Math.min(queueIndex + 1, queueTotal)} de {queueTotal}
                </span>
                <span
                  className="text-xs text-gray-500 truncate max-w-[60%]"
                  title={queueFileName}
                >
                  {queueFileName}
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-green-500 h-2 rounded-full transition-all duration-500 ease-out"
                  style={{ width: `${overallProgress}%` }}
                ></div>
              </div>
            </div>
          )}

          <p className="text-lg font-medium mb-4 text-gray-800">
            {progressMessage}
          </p>
          <div className="w-full bg-gray-200 rounded-full h-4 dark:bg-gray-700">
            <div
              className="bg-blue-600 h-4 rounded-full transition-all duration-500 ease-out"
              style={{ width: `${progressPercentage}%` }}
            ></div>
          </div>
          <p className="text-sm text-gray-600 mt-2">
            {progressPercentage < 100 ? "Por favor, aguarde..." : "Concluído!"}
          </p>

          {/* Desfecho dos arquivos ja concluidos, ao vivo. */}
          {fileSummaries.length > 0 && queueTotal > 1 && (
            <ul className="mt-4 max-h-40 overflow-y-auto divide-y divide-gray-200 border border-gray-200 rounded-md bg-gray-50">
              {fileSummaries.map((summary, index) => (
                <FileSummaryRow
                  key={`${summary.name}-${index}`}
                  summary={summary}
                />
              ))}
            </ul>
          )}
        </div>
      </Modal>
      <AddTituloModal
        isOpen={showAddTituloModal}
        onClose={() => setShowAddTituloModal(false)}
        onSuccess={handleAddSuccess}
      />
    </div>
  );
};

export default DatabaseUpload;
