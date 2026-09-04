import React, { useEffect, useMemo, useRef, useState } from "react";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { supabase } from "../../lib/supabase";
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
import { Database } from "../../types/database.types";
import { PRIMARY_SITUACAO, ALL_SITUACOES } from "../../config/profiles";
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
  CADASTRO_CONTATO_COLUMNS,
  fetchClientesRegistry,
} from "../../services/clientesRegistry";

type BancoDadosInsert = Database["public"]["Tables"]["BANCO_DADOS"]["Insert"];
type ClienteInsert = Database["public"]["Tables"]["clientes"]["Insert"];

interface FileData {
  [key: string]: string;
}

interface UpdateResult {
  id_parcela: string;
  status: "success" | "error" | "unchanged";
  error?: string;
  details?: any;
}

interface InsertResult {
  success: boolean;
  error?: string;
  insertedRows?: FileData[];
  duplicateRows?: FileData[];
  invalidRows?: FileData[];
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
  idLabel?: string;
}> = ({ items, emptyMessage, showError = false, idLabel = "ID Parcela" }) => {
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

// Valores válidos para a coluna situacao. Deriva da fonte única (config/profiles)
// para acompanhar automaticamente novos perfis: valor fora desta lista é
// descartado como null, o que apagaria a fase do cliente na importação.
const VALID_SITUACAO_VALUES = ALL_SITUACOES;

// Função para validar e normalizar o valor de situacao
const validateSituacao = (value: string | undefined | null): string | null => {
  if (!value || value.trim() === "") {
    return null;
  }

  const trimmedValue = value.trim();
  if (VALID_SITUACAO_VALUES.includes(trimmedValue)) {
    return trimmedValue;
  }

  // Se não for um valor válido, retornar null ao invés de enviar valor inválido
  console.warn(
    `⚠️ Valor inválido para situacao: "${value}". Valores aceitos: ${VALID_SITUACAO_VALUES.join(", ")} ou vazio.`,
  );
  return null;
};

const parseNullableNumber = (
  value: string | undefined | null,
): number | null => {
  if (value === undefined || value === null) {
    return null;
  }

  const trimmedValue = value.toString().trim();
  if (trimmedValue === "") {
    return null;
  }

  const normalizedValue = trimmedValue
    .replace(/[^\d,.-]/g, "")
    .replace(/,/g, ".");
  const parsedNumber = Number(normalizedValue);

  return Number.isNaN(parsedNumber) ? null : parsedNumber;
};

/**
 * Converte um valor monetario para numero, tolerante a formatos comuns:
 * - remove "R$", espacos e outros simbolos;
 * - "1.234,56" (BR: ponto de milhar + virgula decimal) -> 1234.56;
 * - "1234,56" (so virgula decimal) -> 1234.56;
 * - "1234.56" (ponto decimal) -> 1234.56.
 * Retorna null para vazio/invalido. Substitui o antigo Number(x.replace(",","."))
 * que so trocava a PRIMEIRA virgula e quebrava com separador de milhar.
 */
const parseMoney = (value: string | undefined | null): number | null => {
  if (value === undefined || value === null) return null;
  let s = value.toString().trim();
  if (s === "") return null;

  // Mantem apenas digitos, virgula, ponto e sinal.
  s = s.replace(/[^\d,.-]/g, "");
  if (s === "" || s === "-") return null;

  if (s.includes(",") && s.includes(".")) {
    // Tem os dois: ponto e milhar, virgula e decimal (padrao BR).
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (s.includes(",")) {
    // So virgula: decimal BR.
    s = s.replace(",", ".");
  }
  // So ponto (ou nenhum): ja esta no formato decimal.

  const n = Number(s);
  return Number.isNaN(n) ? null : n;
};

/**
 * Normaliza uma data para ISO "YYYY-MM-DD", detectando o formato de origem:
 * - "DD/MM/YYYY" (ou "DD/MM/YY") -> assume dia/mes/ano (padrao BR);
 * - "YYYY-MM-DD..." (ISO, com ou sem hora) -> mantem a parte da data.
 * Retorna null para vazio ou formato nao reconhecido (o chamador decide o
 * fallback). Alinhado a logica que o calculateOverdueDays ja usa.
 */
const parseDateToISO = (value: string | undefined | null): string | null => {
  if (value === undefined || value === null) return null;
  const s = value.toString().trim();
  if (s === "") return null;

  // DD/MM/YYYY ou DD/MM/YY
  if (s.includes("/")) {
    const parts = s.split("/");
    if (parts.length !== 3) return null;
    const [d, m, y] = parts;
    const day = d.padStart(2, "0");
    const month = m.padStart(2, "0");
    const year = y.length === 2 ? `20${y}` : y.padStart(4, "0");
    const dayN = Number(day);
    const monthN = Number(month);
    if (dayN < 1 || dayN > 31 || monthN < 1 || monthN > 12) return null;
    return `${year}-${month}-${day}`;
  }

  // ISO iniciando com YYYY-MM-DD (aceita "T..Z" ou " 00:00:00+00")
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  // Formato nao reconhecido: nao adivinhar (evita corromper).
  return null;
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

// Colunas obrigatorias por tipo de carga (cargas de parcela sao casadas pelo
// id_parcela; sem ele o arquivo quase certamente e de outro relatorio).
const REQUIRED_COLUMNS_PARCELA = ["id_parcela"];

type QuickValidation = { ok: boolean; error?: string };

/** Checagens sincronas e baratas, feitas na SELECAO do arquivo. */
const quickValidateCsv = (file: File): QuickValidation => {
  const name = file.name.toLowerCase();
  if (!name.endsWith(".csv")) {
    return {
      ok: false,
      error: `Formato inválido: envie um arquivo .csv (recebido "${file.name}").`,
    };
  }
  if (file.size === 0) {
    return { ok: false, error: "O arquivo está vazio." };
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    const mb = (file.size / (1024 * 1024)).toFixed(1);
    return {
      ok: false,
      error: `Arquivo muito grande (${mb}MB). O limite é ${MAX_FILE_SIZE_MB}MB.`,
    };
  }
  return { ok: true };
};

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

/** Detecta o separador a partir da primeira linha (mesma regra do parser). */
const detectSeparator = (firstLine: string): string => {
  if (firstLine.includes(";") && !firstLine.includes(",")) return ";";
  if (firstLine.includes("\t")) return "\t";
  return ",";
};

/** Le apenas o cabecalho (primeiros 64KB) sem carregar o arquivo inteiro. */
const readCsvHeaders = async (file: File): Promise<string[]> => {
  const slice = file.slice(0, 64 * 1024);
  const text = await slice.text();
  const nlIndex = text.search(/\r\n|\r|\n/);
  const firstLine = nlIndex === -1 ? text : text.slice(0, nlIndex);
  const separator = detectSeparator(firstLine);
  return firstLine
    .split(separator)
    .map((h) => h.trim().replace(/^"|"$/g, "").toLowerCase());
};

/** Validacao completa (assincrona): quick + presenca das colunas obrigatorias. */
const validateCsvFile = async (
  file: File,
  requiredColumns: string[],
): Promise<QuickValidation> => {
  const quick = quickValidateCsv(file);
  if (!quick.ok) return quick;

  let headers: string[];
  try {
    headers = await readCsvHeaders(file);
  } catch {
    return { ok: false, error: "Não foi possível ler o cabeçalho do arquivo." };
  }

  if (headers.length === 0 || (headers.length === 1 && headers[0] === "")) {
    return { ok: false, error: "O arquivo não tem cabeçalho reconhecível." };
  }

  const missing = requiredColumns.filter(
    (col) => !headers.includes(col.toLowerCase()),
  );
  if (missing.length > 0) {
    return {
      ok: false,
      error: `O arquivo não contém a(s) coluna(s) obrigatória(s): ${missing.join(
        ", ",
      )}. Verifique se selecionou o relatório correto para este card.`,
    };
  }

  return { ok: true };
};

const DatabaseUpload: React.FC = () => {
  const { refreshData, users } = useCollection();
  // Cada card mantem uma FILA de arquivos (processados em sequencia), no lugar
  // do arquivo unico que obrigava o usuario a repetir o ciclo a cada envio.
  const [statusFiles, setStatusFiles] = useState<File[]>([]);
  const [newParcelaFiles, setNewParcelaFiles] = useState<File[]>([]);
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
      let allData: any[] = [];
      let from = 0;
      let hasMore = true;

      // Fetch all data in batches
      while (hasMore) {
        const { data, error } = await supabase
          .from("BANCO_DADOS")
          .select("*")
          .range(from, from + BATCH_SIZE - 1);

        if (error) {
          throw error;
        }

        if (data && data.length > 0) {
          allData = allData.concat(data);
          from += data.length;
        } else {
          hasMore = false;
        }
      }

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

  // Processa CSV com PapaParse em STREAMING por chunks: o arquivo e lido e
  // parseado em pedacos (nao vira uma unica string gigante em memoria) e o
  // processamento cede a thread entre chunks, mantendo a UI responsiva mesmo
  // com arquivos grandes. Parser robusto (aspas, \r\n, separador embutido) e
  // progresso real por bytes lidos. As linhas sao acumuladas como objetos
  // { header: valor } para o restante do fluxo.
  // Obs.: worker:false de proposito -- o Web Worker do PapaParse e instavel sob
  // bundlers (Vite/webpack). O streaming por chunks ja evita o congelamento.
  const processFile = async (
    file: File,
    onProgress?: (percentage: number, message: string) => void,
  ): Promise<FileData[]> => {
    return new Promise((resolve, reject) => {
      const rows: FileData[] = [];

      Papa.parse<FileData>(file, {
        worker: false,
        header: true,
        skipEmptyLines: "greedy",
        transformHeader: (h) => h.trim(),
        chunk: (results) => {
          for (const row of results.data) rows.push(row);

          if (onProgress && file.size > 0) {
            const cursor = results.meta.cursor || 0;
            const pct = Math.min(100, Math.round((cursor / file.size) * 100));
            onProgress(pct, `Lendo arquivo... ${rows.length} linha(s)`);
          }
        },
        complete: () => {
          if (rows.length === 0) {
            reject(
              new Error(
                "CSV não contém dados (cabeçalho + pelo menos uma linha).",
              ),
            );
            return;
          }
          resolve(rows);
        },
        error: (err: Error) => {
          reject(new Error(`Erro ao ler o arquivo: ${err.message}`));
        },
      });
    });
  };

  // Função para atualizar status no Supabase
  const updateStatusInSupabase = async (
    data: FileData[],
    onProgress?: (percentage: number, message: string) => void,
  ): Promise<UpdateResult[]> => {
    const updates: UpdateResult[] = [];
    console.log(`🔄 Iniciando atualização de ${data.length} registros...`);

    // 1. Extrair todos os IDs de parcela do arquivo
    const allIds = data
      .map((row) => row.id_parcela || row["id_parcela"])
      .filter((id) => id);

    if (allIds.length === 0) {
      console.log("Nenhum id_parcela encontrado no arquivo.");
      return [];
    }

    console.log(`🔍 Verificando a existência de ${allIds.length} títulos...`);
    if (onProgress) onProgress(10, `Verificando ${allIds.length} títulos...`);

    // 2. Verificar quais IDs existem no banco de dados em batches.
    // Trazemos tambem os valores ATUAIS dos campos comparaveis para, mais
    // adiante, evitar UPDATEs desnecessarios (registro cujo valor ja e igual
    // ao do arquivo nao deve ser reescrito nem contado como atualizado).
    const CHUNK_SIZE = 500; // Reduzir o tamanho do batch para evitar URLs muito longas
    const existingRecords = new Map<string, any>();
    let fetchError: any = null;

    for (let i = 0; i < allIds.length; i += CHUNK_SIZE) {
      const chunk = allIds.slice(i, i + CHUNK_SIZE);
      const { data: chunkRecords, error: chunkError } = await supabase
        .from("BANCO_DADOS")
        .select(
          "id_parcela, status, situacao, data_de_recebimento, data_vencimento, valor_original, valor_reajustado, multa, juros_por_dia, multa_aplicada, juros_aplicado, valor_recebido, desconto",
        )
        .in("id_parcela", chunk.map(Number));

      if (chunkError) {
        console.error("❌ Erro ao verificar um chunk de títulos:", chunkError);
        fetchError = chunkError;
        // Decide se quer parar no primeiro erro ou tentar continuar
        // Aqui, vamos parar para evitar mais erros de rede.
        break;
      }

      if (chunkRecords) {
        chunkRecords.forEach((rec) =>
          existingRecords.set(rec.id_parcela.toString(), rec),
        );
      }
    }

    if (fetchError) {
      console.error(
        "❌ Erro final ao verificar títulos existentes:",
        fetchError,
      );
      return data.map((row) => ({
        id_parcela: row.id_parcela || row["id_parcela"],
        status: "error",
        error: `Falha ao verificar títulos: ${fetchError.message}`,
      }));
    }
    console.log(`✅ Encontrados ${existingRecords.size} títulos existentes.`);

    // 3. Filtrar os dados do arquivo para manter apenas os registros que existem
    const dataToUpdate = data.filter((row) =>
      existingRecords.has(row.id_parcela || row["id_parcela"]),
    );
    const ignoredData = data.filter(
      (row) => !existingRecords.has(row.id_parcela || row["id_parcela"]),
    );

    if (ignoredData.length > 0) {
      console.warn(
        `⚠️ Ignorando ${
          ignoredData.length
        } registros pois os títulos não foram encontrados no banco:`,
        ignoredData.map((r) => r.id_parcela || r["id_parcela"]),
      );
      ignoredData.forEach((row) => {
        updates.push({
          id_parcela: row.id_parcela || row["id_parcela"],
          status: "error",
          error: "Título não encontrado no banco de dados.",
        });
      });
    }

    console.log(`🔄 Atualizando ${dataToUpdate.length} registros...`);
    if (onProgress)
      onProgress(30, `Atualizando ${dataToUpdate.length} registros...`);

    // 4. Construir o objeto de update para uma linha comparando com o valor
    // ATUAL no banco. Apenas campos que realmente mudaram entram no updateObj;
    // se nada mudou, updateObj fica vazio e o registro e tratado como
    // "inalterado" (nao gera UPDATE nem conta como atualizado).
    const numericFields = [
      "valor_reajustado",
      "multa",
      "juros_por_dia",
      "multa_aplicada",
      "juros_aplicado",
      "valor_recebido",
      "desconto",
    ];

    const buildUpdateObj = (
      row: FileData,
      current: any,
    ): { updateObj: any; error?: string } => {
      const situacao = row.situacao || row["situacao"];
      const updateObj: any = {};

      // status e data_de_recebimento sao texto: comparacao direta (trim).
      if (row.status && row.status.trim() !== (current?.status ?? "").trim()) {
        updateObj.status = row.status;
      }
      if (
        row.data_de_recebimento &&
        row.data_de_recebimento.trim() !==
          (current?.data_de_recebimento ?? "").trim()
      ) {
        updateObj.data_de_recebimento = row.data_de_recebimento;
      }

      // Campos numericos (armazenados como texto no banco): comparacao
      // NUMERICA para nao reagir a diferencas de formato (ex.: "10,50" do
      // arquivo vs "10.5" no banco representam o mesmo valor).
      for (const field of numericFields) {
        const raw = row[field];
        if (raw === undefined || raw === null) continue;

        const isEmpty = raw.toString().trim() === "";
        const newVal = isEmpty ? null : parseNullableNumber(raw);
        // Valor nao vazio porem invalido (NaN): nao altera o registro.
        if (!isEmpty && newVal === null) continue;

        const curVal = parseNullableNumber(current?.[field]);
        if (newVal !== curVal) {
          updateObj[field] = newVal;
        }
      }

      // valor_original: permite CORRIGIR titulos ja gravados. Comparacao
      // numerica robusta (parseMoney trata "R$"/milhar/decimal BR). So altera
      // se o arquivo trouxer um valor valido diferente do atual.
      {
        const raw = row.valor_original ?? row["valor_original"];
        if (raw !== undefined && raw !== null && raw.toString().trim() !== "") {
          const newVal = parseMoney(raw);
          if (newVal !== null) {
            const curVal = parseMoney(current?.valor_original);
            if (newVal !== curVal) updateObj.valor_original = newVal;
          }
        }
      }

      // data_vencimento: normaliza para ISO e compara so a parte da data. So
      // altera se o arquivo trouxer uma data reconhecida diferente da atual.
      {
        const raw = row.data_vencimento ?? row["data_vencimento"];
        if (raw !== undefined && raw !== null && raw.toString().trim() !== "") {
          const newIso = parseDateToISO(raw);
          if (newIso) {
            const curIso = parseDateToISO(current?.data_vencimento);
            if (newIso !== curIso) updateObj.data_vencimento = newIso;
          }
        }
      }

      const validatedSituacao = validateSituacao(situacao);
      if (situacao && validatedSituacao !== null) {
        if (validatedSituacao !== (current?.situacao ?? null)) {
          updateObj.situacao = validatedSituacao;
        }
      } else if (situacao) {
        return {
          updateObj: {},
          error: `Valor de situacao inválido: "${situacao}".`,
        };
      }

      return { updateObj };
    };

    // 5. Pre-classificar cada registro em: erro de validacao, inalterado ou
    // pendente de update. Assim, registros sem mudanca nao geram chamada ao
    // banco -- reenviar o mesmo arquivo resulta em zero UPDATEs.
    const rowsNeedingUpdate: { idParcela: string; updateObj: any }[] = [];
    for (const row of dataToUpdate) {
      const idParcela = row.id_parcela || row["id_parcela"];
      const current = existingRecords.get(idParcela);
      const { updateObj, error: buildError } = buildUpdateObj(row, current);

      if (buildError) {
        updates.push({
          id_parcela: idParcela,
          status: "error",
          error: buildError,
        });
      } else if (Object.keys(updateObj).length === 0) {
        updates.push({ id_parcela: idParcela, status: "unchanged" });
      } else {
        rowsNeedingUpdate.push({ idParcela, updateObj });
      }
    }

    const unchangedCount = dataToUpdate.length - rowsNeedingUpdate.length;
    console.log(
      `🔄 ${rowsNeedingUpdate.length} registro(s) com alteracao real; ${unchangedCount} inalterado(s) (ignorados).`,
    );

    // 6. Atualizar em LOTE via upsert (ON CONFLICT DO UPDATE), no lugar de 1
    // request por linha. Para nao sobrescrever colunas nao-alteradas, agrupamos
    // as linhas por ASSINATURA (mesmo conjunto de colunas mudadas): dentro de
    // cada grupo todas as linhas fornecem exatamente as mesmas colunas, entao o
    // upsert em lote e seguro. Reduz de N requests para ~poucos por grupo.
    const UPSERT_CHUNK = 500;

    const groups = new Map<string, { idParcela: string; updateObj: any }[]>();
    for (const item of rowsNeedingUpdate) {
      const signature = Object.keys(item.updateObj).sort().join(",");
      const g = groups.get(signature);
      if (g) g.push(item);
      else groups.set(signature, [item]);
    }

    const total = rowsNeedingUpdate.length;
    let processed = 0;

    // Fallback: se um lote falhar (ex.: uma unica linha com valor recusado pelo
    // banco), reprocessa o lote linha a linha para isolar a(s) linha(s) ruim(s)
    // sem descartar as demais.
    const updateRowByRow = async (
      chunk: { idParcela: string; updateObj: any }[],
    ) => {
      const settled = await Promise.allSettled(
        chunk.map(async ({ idParcela, updateObj }) => {
          const { error: rowErr } = await supabase
            .from("BANCO_DADOS")
            .update(updateObj)
            .eq("id_parcela", Number(idParcela));
          if (rowErr) throw new Error(rowErr.message);
          return idParcela;
        }),
      );
      settled.forEach((r, idx) => {
        const { idParcela } = chunk[idx];
        if (r.status === "fulfilled") {
          updates.push({ id_parcela: idParcela, status: "success" });
        } else {
          updates.push({
            id_parcela: idParcela,
            status: "error",
            error: String(
              (r.reason as Error)?.message ?? r.reason ?? "Erro desconhecido",
            ),
          });
        }
      });
    };

    for (const group of groups.values()) {
      for (let i = 0; i < group.length; i += UPSERT_CHUNK) {
        const chunk = group.slice(i, i + UPSERT_CHUNK);
        // Payload homogeneo: mesmas colunas alteradas + a PK para casar o
        // ON CONFLICT (id_parcela). Todas as linhas ja existem (dataToUpdate
        // so contem ids presentes no banco), entao nunca ha INSERT real.
        const payload = chunk.map(({ idParcela, updateObj }) => ({
          ...updateObj,
          id_parcela: Number(idParcela),
        }));

        const { error } = await supabase
          .from("BANCO_DADOS")
          .upsert(payload as BancoDadosInsert[], { onConflict: "id_parcela" });

        if (error) {
          console.warn(
            `⚠️ Lote de ${chunk.length} falhou (${error.message}); tentando linha a linha...`,
          );
          await updateRowByRow(chunk);
        } else {
          chunk.forEach(({ idParcela }) =>
            updates.push({ id_parcela: idParcela, status: "success" }),
          );
        }

        processed += chunk.length;
        if (onProgress && total > 0) {
          const percentage = 30 + Math.round((processed / total) * 70);
          onProgress(
            percentage,
            `Atualizando ${processed} de ${total} registros...`,
          );
        }
      }
    }

    if (total === 0 && onProgress) {
      onProgress(100, "Nenhum registro precisou ser atualizado.");
    }

    return updates;
  };

  // Função para inserir novas parcelas no Supabase
  const insertNewParcelasInSupabase = async (
    data: FileData[],
    onProgress?: (percentage: number, message: string) => void,
  ): Promise<InsertResult> => {
    try {
      // 1. Separar linhas inválidas (sem id_parcela)
      const validData = data.filter(
        (row) => row.id_parcela && row.id_parcela.trim() !== "",
      );
      const invalidRows = data.filter(
        (row) => !row.id_parcela || row.id_parcela.trim() === "",
      );

      if (validData.length === 0) {
        return {
          success: true,
          insertedRows: [],
          duplicateRows: [],
          invalidRows,
        };
      }

      // 2. Verificar duplicatas em lote
      if (onProgress) onProgress(10, "Verificando duplicatas...");
      const allIds = validData.map((row) => row.id_parcela);
      const existingIds = new Set<number>();
      const CHUNK_SIZE = 500;

      for (let i = 0; i < allIds.length; i += CHUNK_SIZE) {
        const chunk = allIds.slice(i, i + CHUNK_SIZE);
        const { data: chunkRecords, error: chunkError } = await supabase
          .from("BANCO_DADOS")
          .select("id_parcela")
          .in("id_parcela", chunk.map(Number));

        if (chunkError) {
          console.error("❌ Erro ao verificar duplicatas:", chunkError);
          return { success: false, error: chunkError.message };
        }
        chunkRecords?.forEach((rec) => existingIds.add(Number(rec.id_parcela)));
      }

      // 3. Separar dados em "para inserir" e "duplicatas".
      // Considera duplicata tanto o id_parcela ja existente no banco quanto o
      // repetido DENTRO do proprio arquivo (este ultimo antes passava batido e
      // estourava a PK no insert). Comparacao numerica para evitar mismatch de
      // formato (ex.: "123" do Excel vs 123 no banco).
      const seenInFile = new Set<number>();
      const rowsToInsert: typeof validData = [];
      const duplicateRows: typeof validData = [];
      for (const row of validData) {
        const idNum = Number(row.id_parcela);
        if (existingIds.has(idNum) || seenInFile.has(idNum)) {
          duplicateRows.push(row);
        } else {
          seenInFile.add(idNum);
          rowsToInsert.push(row);
        }
      }

      if (rowsToInsert.length === 0) {
        if (onProgress) onProgress(100, "Nenhuma nova parcela para inserir.");
        return { success: true, insertedRows: [], duplicateRows, invalidRows };
      }

      // 3.1 Continuidade da carteira: descobrir, por CPF/CNPJ (documento), o
      // cobrador que o cliente JA possui. Se possuir, os novos titulos herdam
      // esse mesmo cobrador (prioridade sobre a regra dos 60 dias). Cliente novo
      // (sem cobrador) nao recebe atribuicao automatica.
      const documentos = Array.from(
        new Set(
          rowsToInsert
            .map((row) => row.documento)
            .filter((doc): doc is string => !!doc),
        ),
      );

      const documentoToCollector = new Map<string, string>();
      const DOC_CHUNK = 300;
      for (let i = 0; i < documentos.length; i += DOC_CHUNK) {
        const docChunk = documentos.slice(i, i + DOC_CHUNK);
        const { data: existing, error: existingErr } = await supabase
          .from("BANCO_DADOS")
          .select("documento, user_id")
          .in("documento", docChunk)
          .not("user_id", "is", null);

        if (existingErr) {
          console.error(
            "Erro ao buscar cobradores existentes por documento:",
            existingErr,
          );
          continue; // segue sem heranca para este chunk
        }

        existing?.forEach((rec) => {
          if (
            rec.documento &&
            rec.user_id &&
            !documentoToCollector.has(rec.documento)
          ) {
            documentoToCollector.set(rec.documento, rec.user_id);
          }
        });
      }

      const userTypeById = new Map(users.map((u) => [u.id, u.type]));

      // 4. Inserir apenas as novas linhas
      if (onProgress)
        onProgress(50, `Inserindo ${rowsToInsert.length} novas parcelas...`);

      // Mapear e converter tipos
      const processedChunk = rowsToInsert.map((row) => {
        const newRow: { [key: string]: any } = { ...row };
        newRow.dias_em_atraso = newRow.dias_em_atraso
          ? Number(newRow.dias_em_atraso)
          : null;
        newRow.numero_titulo = newRow.numero_titulo
          ? Number(newRow.numero_titulo)
          : null;
        newRow.parcela = newRow.parcela ? Number(newRow.parcela) : null;
        newRow.id_parcela = Number(row.id_parcela);
        newRow.venda_n = newRow.venda_n ? Number(newRow.venda_n) : null;
        // Valores: parser robusto (trata "R$", milhar e decimal BR).
        newRow.valor_original = parseMoney(newRow.valor_original);
        newRow.valor_reajustado = parseMoney(newRow.valor_reajustado);
        newRow.multa = parseMoney(newRow.multa);
        newRow.juros_por_dia = parseMoney(newRow.juros_por_dia);
        newRow.multa_aplicada = parseMoney(newRow.multa_aplicada);
        newRow.juros_aplicado = parseMoney(newRow.juros_aplicado);
        newRow.valor_recebido = parseMoney(newRow.valor_recebido);
        newRow.desconto = parseMoney(newRow.desconto);
        newRow.acrescimo = parseMoney(newRow.acrescimo);
        newRow.multa_paga = parseMoney(newRow.multa_paga);
        newRow.juros_pago = parseMoney(newRow.juros_pago);
        // Datas: normaliza para ISO "YYYY-MM-DD". Vazio -> null; formato nao
        // reconhecido -> mantem o original (nao piora o comportamento atual).
        const normDate = (v: string | undefined | null): string | null => {
          const iso = parseDateToISO(v);
          if (iso) return iso;
          const t = (v ?? "").toString().trim();
          return t === "" ? null : t;
        };
        newRow.data_vencimento = normDate(newRow.data_vencimento);
        newRow.data_lancamento = normDate(newRow.data_lancamento);
        newRow.data_de_recebimento = normDate(newRow.data_de_recebimento);
        if (newRow.user_id === "") newRow.user_id = null;
        if (newRow.situacao !== undefined) {
          newRow.situacao = validateSituacao(newRow.situacao);
        }

        // Apelido, telefones e e-mail nao sao mais colunas de BANCO_DADOS
        // (migration 20260904000002). Mante-los aqui faria o INSERT inteiro
        // falhar; eles seguem para o cadastro do cliente logo apos a carga.
        for (const column of CADASTRO_CONTATO_COLUMNS) delete newRow[column];

        // Continuidade da carteira: se o cliente (documento) ja possui cobrador,
        // o novo titulo herda esse mesmo cobrador, independente dos dias em
        // atraso. Alinha a situacao ao perfil do cobrador para o titulo aparecer
        // na carteira dele (o filtro por situacao poderia esconde-lo).
        const inheritedCollectorId = newRow.documento
          ? documentoToCollector.get(newRow.documento)
          : undefined;
        if (inheritedCollectorId) {
          newRow.user_id = inheritedCollectorId;
          const collectorType = userTypeById.get(inheritedCollectorId);
          if (collectorType && collectorType !== "manager") {
            newRow.situacao = PRIMARY_SITUACAO[collectorType];
          }
        }

        return newRow;
      });

      // Insert em LOTES de 500 (em vez de um unico request gigante que poderia
      // estourar limite de payload/timeout em arquivos grandes). ignoreDuplicates:
      // rede de seguranca -- se algum id_parcela duplicado escapar da verificacao
      // acima, o banco ignora a linha (ON CONFLICT DO NOTHING) em vez de abortar.
      const INSERT_CHUNK = 500;
      for (let i = 0; i < processedChunk.length; i += INSERT_CHUNK) {
        const slice = processedChunk.slice(i, i + INSERT_CHUNK);
        const { error } = await supabase
          .from("BANCO_DADOS")
          .upsert(slice as BancoDadosInsert[], {
            onConflict: "id_parcela",
            ignoreDuplicates: true,
          });

        if (error) {
          console.error("❌ Erro ao inserir dados:", error);
          // Lotes anteriores ja gravados permanecem; reenviar e seguro (a
          // verificacao de duplicatas ignora os ja inseridos).
          return { success: false, error: error.message };
        }

        if (onProgress) {
          const done = Math.min(i + INSERT_CHUNK, processedChunk.length);
          const pct = 50 + Math.round((done / processedChunk.length) * 50);
          onProgress(
            pct,
            `Inserindo ${done} de ${processedChunk.length} parcelas...`,
          );
        }
      }

      if (onProgress) onProgress(100, "Inserção concluída.");

      // ✅ Registrar endereços no histórico após sucesso
      if (rowsToInsert.length > 0) {
        await insertAddressHistoryForNewClients(rowsToInsert);
        await insertCadastroForNewClients(rowsToInsert);
      }

      return {
        success: true,
        insertedRows: rowsToInsert,
        duplicateRows,
        invalidRows,
      };
    } catch (error) {
      console.error("❌ Exceção ao inserir dados:", error);
      return { success: false, error: (error as Error).message };
    }
  };

  // Cria o cadastro dos clientes que ainda nao existem em `clientes`.
  //
  // O arquivo de Novas Parcelas costuma trazer apelido/telefones/e-mail, que
  // desde a migration 20260904000002 nao cabem mais na parcela. Sem este passo
  // um cliente novo entraria sem contato nenhum. Cliente ja cadastrado NAO e
  // tocado: corrigir cadastro existente e papel do card "Atualizar Cadastro de
  // Clientes", que compara campo a campo.
  const insertCadastroForNewClients = async (
    data: FileData[],
  ): Promise<void> => {
    try {
      // Primeira ocorrencia de cada documento vence.
      const byDocumento = new Map<string, FileData>();
      data.forEach((row) => {
        const documento = (row.documento || "").trim();
        if (documento && !byDocumento.has(documento)) {
          byDocumento.set(documento, row);
        }
      });
      if (byDocumento.size === 0) return;

      const documentos = Array.from(byDocumento.keys());
      const existentes = new Set<string>();
      const DOC_CHUNK = 300;

      for (let i = 0; i < documentos.length; i += DOC_CHUNK) {
        const chunk = documentos.slice(i, i + DOC_CHUNK);
        const { data: found, error } = await supabase
          .from("clientes")
          .select("documento")
          .in("documento", chunk);

        if (error) {
          console.warn(
            "⚠️ Erro ao verificar cadastros existentes:",
            error.message,
          );
          return; // sem a lista de existentes, nao arriscamos duplicar
        }
        found?.forEach((c) => existentes.add(c.documento));
      }

      const novos = documentos
        .filter((documento) => !existentes.has(documento))
        .map((documento) => {
          const row = byDocumento.get(documento)!;
          const cadastro: ClienteInsert = {
            documento,
            nome: (row.cliente || "").trim() || "Cliente sem nome",
          };
          for (const column of CADASTRO_CONTATO_COLUMNS) {
            const value = (row[column] || "").trim();
            (cadastro as Record<string, unknown>)[column] =
              value === "" ? null : value;
          }
          return cadastro;
        });

      if (novos.length === 0) {
        console.log("ℹ️ Nenhum cliente novo para cadastrar.");
        return;
      }

      const INSERT_CHUNK = 500;
      for (let i = 0; i < novos.length; i += INSERT_CHUNK) {
        const chunk = novos.slice(i, i + INSERT_CHUNK);
        const { error } = await supabase.from("clientes").insert(chunk);
        if (error) {
          // Parcelas ja gravadas continuam validas; o cadastro pode ser
          // completado depois pela importacao de cadastro.
          console.error("❌ Erro ao cadastrar clientes novos:", error);
        }
      }

      console.log(`👤 ${novos.length} cliente(s) novo(s) cadastrado(s).`);
    } catch (error) {
      console.error("❌ Exceção ao cadastrar clientes novos:", error);
    }
  };

  // Função para inserir endereço inicial no histórico
  const insertAddressHistoryForNewClients = async (
    data: FileData[],
  ): Promise<void> => {
    try {
      // Extrair clientes únicos com endereço
      const uniqueClients = new Map<
        string,
        {
          documento: string;
          logradouro: string;
          numero: string;
          bairro: string;
          cep: string;
          cidade: string;
          estado: string;
          complemento: string;
        }
      >();

      data.forEach((row) => {
        const documento = row.documento || row["documento"];
        if (documento && !uniqueClients.has(documento)) {
          uniqueClients.set(documento, {
            documento,
            logradouro: row.endereco || row["endereco"] || "",
            numero: row.numero || row["numero"] || "",
            bairro: row.bairro || row["bairro"] || "",
            cep: row.cep || row["cep"] || "",
            cidade: row.cidade || row["cidade"] || "",
            estado: row.estado || row["estado"] || "",
            complemento: row.complemento || row["complemento"] || "",
          });
        }
      });

      if (uniqueClients.size === 0) {
        console.log("ℹ️ Nenhum cliente com documento para registrar endereço.");
        return;
      }

      console.log(
        `📍 Registrando endereços iniciais para ${uniqueClients.size} cliente(s)...`,
      );

      // Verificar quais documentos já têm registros no histórico
      const documents = Array.from(uniqueClients.keys());
      const CHUNK_SIZE = 500;
      const existingDocuments = new Set<string>();

      for (let i = 0; i < documents.length; i += CHUNK_SIZE) {
        const chunk = documents.slice(i, i + CHUNK_SIZE);
        const { data: existingRecords, error } = await supabase
          .from("enderecos_historico")
          .select("cliente_documento")
          .in("cliente_documento", chunk);

        if (error) {
          console.warn(
            "⚠️ Erro ao verificar endereços existentes:",
            error.message,
          );
          continue;
        }

        existingRecords?.forEach((rec) =>
          existingDocuments.add(rec.cliente_documento),
        );
      }

      // Filtrar apenas clientes que não têm histórico
      const clientsToInsert = Array.from(uniqueClients.values()).filter(
        (client) => !existingDocuments.has(client.documento),
      );

      if (clientsToInsert.length === 0) {
        console.log(
          "ℹ️ Todos os clientes já possuem registros no histórico de endereços.",
        );
        return;
      }

      // Preparar dados para inserção
      const addressRecords = clientsToInsert.map((client) => ({
        cliente_documento: client.documento,
        logradouro: client.logradouro,
        numero: client.numero,
        bairro: client.bairro,
        cep: client.cep,
        cidade: client.cidade,
        estado: client.estado,
        complemento: client.complemento,
        created_at: new Date().toISOString(),
      }));

      // Inserir em chunks para evitar erros
      for (let i = 0; i < addressRecords.length; i += CHUNK_SIZE) {
        const chunk = addressRecords.slice(i, i + CHUNK_SIZE);
        const { error } = await supabase
          .from("enderecos_historico")
          .insert(chunk);

        if (error) {
          console.error(
            `❌ Erro ao inserir endereços (chunk ${i / CHUNK_SIZE + 1}):`,
            error,
          );
        } else {
          console.log(
            `✅ ${chunk.length} endereço(s) registrado(s) no histórico.`,
          );
        }
      }
    } catch (error) {
      console.error("❌ Erro ao processar histórico de endereços:", error);
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

  const handleUploadStatus = () =>
    runQueue(statusFiles, {
      // Valida estrutura (tamanho, tipo e cabecalho) antes de qualquer processamento.
      validate: (file) => validateCsvFile(file, REQUIRED_COLUMNS_PARCELA),
      beforeAll: async () => {
        setProgressMessage("🔍 Testando conexão com Supabase...");
        const connectionOk = await testSupabaseConnection();
        if (!connectionOk) {
          setProgressMessage("❌ Falha na conexão com Supabase");
          setUploadStatus("❌ Falha na conexão com Supabase");
        }
        return connectionOk;
      },
      run: async (file, onProgress) => {
        const data = await processFile(file, (pct, msg) => {
          onProgress(Math.round(pct * 0.4), msg); // parse ocupa 0-40%
        });
        onProgress(
          40,
          `📋 ${data.length} registros encontrados. Atualizando no Supabase...`,
        );
        // 40% para processamento, 60% para upload
        return updateStatusInSupabase(data, (percentage, message) =>
          onProgress(40 + percentage * 0.6, message),
        );
      },
      summarize: (results) => {
        const { success, unchanged, error } = countByStatus(results);
        return `Status: ${success} atualizado(s), ${unchanged} inalterado(s), ${error} falha(s).`;
      },
      labels: DEFAULT_RESULT_LABELS,
      title: "Resultado da Atualização de Status",
      onFinish: () => setStatusFiles([]),
    });

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

  const handleUploadNewParcela = () =>
    runQueue(newParcelaFiles, {
      // Valida estrutura (tamanho, tipo e cabecalho) antes de qualquer processamento.
      validate: (file) => validateCsvFile(file, REQUIRED_COLUMNS_PARCELA),
      run: async (file, onProgress) => {
        const data = await processFile(file, (pct, msg) => {
          onProgress(Math.round(pct * 0.2), msg); // parse ocupa 0-20%
        });
        onProgress(20, `Processando ${data.length} linhas...`);

        // 20% para processar, 80% para inserir
        const result = await insertNewParcelasInSupabase(data, (p, m) =>
          onProgress(20 + p * 0.8, m),
        );
        // Falha do arquivo: registrada no relatorio da fila, que segue para o
        // proximo arquivo em vez de encerrar o lote inteiro.
        if (!result.success) {
          throw new Error(result.error ?? "Falha ao inserir as parcelas.");
        }

        const resultsForModal: UpdateResult[] = [];
        result.insertedRows?.forEach((row) => {
          resultsForModal.push({
            id_parcela: row.id_parcela || "N/A",
            status: "success",
          });
        });
        result.duplicateRows?.forEach((row) => {
          resultsForModal.push({
            id_parcela: row.id_parcela || "N/A",
            status: "error",
            error: "Título já consta no Banco de Dados.",
          });
        });
        result.invalidRows?.forEach((row) => {
          resultsForModal.push({
            id_parcela: row.id_parcela || "N/A",
            status: "error",
            error: "Linha inválida ou id_parcela ausente.",
          });
        });
        return resultsForModal;
      },
      summarize: (results) => {
        const { success, error } = countByStatus(results);
        return `Status: ${success} inserido(s), ${error} falha(s)/duplicata(s).`;
      },
      labels: DEFAULT_RESULT_LABELS,
      title: "Resultado da Adição de Novas Parcelas",
      onFinish: () => setNewParcelaFiles([]),
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
        {/* Card: Atualizar Status de Parcelas */}
        <div className="flex flex-col bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden transition-all hover:shadow-xl">
          <div className="p-6">
            <div className="flex items-center gap-3">
              <div className="bg-blue-100 p-3 rounded-full">
                <UploadCloud className="h-6 w-6 text-blue-600" />
              </div>
              <h3 className="text-xl font-bold text-gray-800">
                Atualizar Status de Parcelas
              </h3>
            </div>
            <p className="text-gray-500 mt-3 text-sm">
              Envie um arquivo CSV para atualizar o status, situação, data de
              recebimento, valor recebido ou desconto de múltiplas parcelas de
              uma só vez.
            </p>
          </div>

          <div className="px-6 pb-6 mt-auto">
            <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 space-y-4">
              <FileDropzone
                id="statusFileInput"
                accept=".csv"
                hint="Formato CSV, até 50MB por arquivo"
                color="blue"
                files={statusFiles}
                disabled={loading}
                onAdd={(files) =>
                  addFilesToQueue(
                    files,
                    statusFiles,
                    setStatusFiles,
                    quickValidateCsv,
                  )
                }
                onRemove={(key) => removeFromQueue(key, setStatusFiles)}
                onClear={() => clearQueue(setStatusFiles)}
              />

              <button
                onClick={handleUploadStatus}
                disabled={loading || statusFiles.length === 0}
                className="w-full inline-flex justify-center items-center px-4 py-3 border border-transparent text-base font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {loading ? (
                  <RefreshCcw className="h-5 w-5 mr-2 animate-spin" />
                ) : (
                  <UploadCloud className="h-5 w-5 mr-2" />
                )}
                {loading
                  ? "Processando..."
                  : statusFiles.length > 1
                    ? `Enviar e Atualizar (${statusFiles.length} arquivos)`
                    : "Enviar e Atualizar"}
              </button>
            </div>
          </div>
        </div>

        {/* Card: Adicionar Novas Parcelas */}
        <div className="flex flex-col bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden transition-all hover:shadow-xl">
          <div className="p-6">
            <div className="flex items-center gap-3">
              <div className="bg-green-100 p-3 rounded-full">
                <FileText className="h-6 w-6 text-green-600" />
              </div>
              <h3 className="text-xl font-bold text-gray-800">
                Adicionar Novas Parcelas
              </h3>
            </div>
            <p className="text-gray-500 mt-3 text-sm">
              Envie um arquivo CSV com novas parcelas para serem adicionadas ao
              banco de dados. Certifique-se que o `id_parcela` seja único.
            </p>
          </div>

          <div className="px-6 pb-6 mt-auto">
            <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 space-y-4">
              <FileDropzone
                id="newParcelaFileInput"
                accept=".csv"
                hint="Formato CSV, até 50MB por arquivo"
                color="green"
                files={newParcelaFiles}
                disabled={loading}
                onAdd={(files) =>
                  addFilesToQueue(
                    files,
                    newParcelaFiles,
                    setNewParcelaFiles,
                    quickValidateCsv,
                  )
                }
                onRemove={(key) => removeFromQueue(key, setNewParcelaFiles)}
                onClear={() => clearQueue(setNewParcelaFiles)}
              />

              <button
                onClick={handleUploadNewParcela}
                disabled={loading || newParcelaFiles.length === 0}
                className="w-full inline-flex justify-center items-center px-4 py-3 border border-transparent text-base font-medium rounded-md shadow-sm text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {loading ? (
                  <RefreshCcw className="h-5 w-5 mr-2 animate-spin" />
                ) : (
                  <UploadCloud className="h-5 w-5 mr-2" />
                )}
                {loading
                  ? "Processando..."
                  : newParcelaFiles.length > 1
                    ? `Enviar e Adicionar (${newParcelaFiles.length} arquivos)`
                    : "Enviar e Adicionar"}
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
                <p className="text-xs text-gray-500 mt-4 text-center">
                  Total processado: {uploadResults.length} registro(s)
                </p>

                {/* Quebra por arquivo -- so faz sentido quando a fila teve mais
                    de um arquivo (ou algum foi ignorado na validacao). */}
                {fileSummaries.length > 1 && (
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
                      idLabel={resultLabels.itemLabel}
                    />
                  </div>

                  {/* Sucessos */}
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
