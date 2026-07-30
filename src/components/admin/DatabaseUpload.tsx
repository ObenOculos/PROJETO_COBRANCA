import React, { useEffect, useMemo, useState } from "react";
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
} from "lucide-react"; // Importar ícones
import AddTituloModal from "./AddTituloModal";
import { Database } from "../../types/database.types";
import { PRIMARY_SITUACAO, ALL_SITUACOES } from "../../config/profiles";
import { importClientesBirthDates } from "../../services/clientesImportService";

type BancoDadosInsert = Database["public"]["Tables"]["BANCO_DADOS"]["Insert"];

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

// Carga de Data de Nascimento (tabela clientes).
const CLIENTES_RESULT_LABELS: ResultLabels = {
  itemLabel: "Documento",
  successLabel: "Clientes Atualizados",
  unchangedLabel: "Não encontrados na base",
  errorLabel: "Falhas",
  successEmpty: "Nenhum cliente atualizado.",
  unchangedEmpty: "Nenhum cliente fora da base.",
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
  const [statusFile, setStatusFile] = useState<File | null>(null);
  const [newParcelaFile, setNewParcelaFile] = useState<File | null>(null);
  const [clientesFile, setClientesFile] = useState<File | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [uploadStatus, setUploadStatus] = useState<string>("");
  const [debugInfo, setDebugInfo] = useState<string>("");

  // Estados para o modal de progresso
  const [showProgressModal, setShowProgressModal] = useState<boolean>(false);
  const [progressPercentage, setProgressPercentage] = useState<number>(0);
  const [progressMessage, setProgressMessage] = useState<string>("");

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

  const handleAddSuccess = () => {
    // Maybe show a success message
    setUploadStatus("✅ Título adicionado com sucesso!");
    // Refresh data
    refreshData();
  };

  const handleStatusFileChange = (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setDebugInfo("");
    const v = quickValidateCsv(file);
    if (!v.ok) {
      setStatusFile(null);
      event.target.value = "";
      setUploadStatus(`❌ ${v.error}`);
      return;
    }
    setStatusFile(file);
    setUploadStatus("");
  };

  const handleNewParcelaFileChange = (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setDebugInfo("");
    const v = quickValidateCsv(file);
    if (!v.ok) {
      setNewParcelaFile(null);
      event.target.value = "";
      setUploadStatus(`❌ ${v.error}`);
      return;
    }
    setNewParcelaFile(file);
    setUploadStatus("");
  };

  const clearStatusFile = () => {
    setStatusFile(null);
    setUploadStatus("");
    setDebugInfo("");
    const input = document.getElementById(
      "statusFileInput",
    ) as HTMLInputElement;
    if (input) input.value = "";
  };

  const clearNewParcelaFile = () => {
    setNewParcelaFile(null);
    setUploadStatus("");
    setDebugInfo("");
    const input = document.getElementById(
      "newParcelaFileInput",
    ) as HTMLInputElement;
    if (input) input.value = "";
  };

  const handleClientesFileChange = (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setDebugInfo("");
    const v = quickValidateClientes(file);
    if (!v.ok) {
      setClientesFile(null);
      event.target.value = "";
      setUploadStatus(`❌ ${v.error}`);
      return;
    }
    setClientesFile(file);
    setUploadStatus("");
  };

  const clearClientesFile = () => {
    setClientesFile(null);
    setUploadStatus("");
    setDebugInfo("");
    const input = document.getElementById(
      "clientesFileInput",
    ) as HTMLInputElement;
    if (input) input.value = "";
  };

  // Importa a Data de Nascimento do relatorio de clientes. A regra de negocio
  // (parsing, normalizacao, casamento por documento e update em lote) vive em
  // clientesImportService; aqui cuidamos apenas da UI (progresso e resultado).
  const handleUploadClientes = async () => {
    if (!clientesFile) {
      setUploadStatus("❌ Selecione o relatório de clientes (xlsx ou csv).");
      return;
    }

    const validation = quickValidateClientes(clientesFile);
    if (!validation.ok) {
      setUploadStatus(`❌ ${validation.error}`);
      return;
    }

    setLoading(true);
    setShowProgressModal(true);
    setProgressPercentage(0);
    setProgressMessage("📤 Lendo planilha...");
    setUploadStatus("");
    setDebugInfo("");

    try {
      const { rows, totalValidos } = await importClientesBirthDates(
        clientesFile,
        (percentage, message) => {
          setProgressPercentage(percentage);
          setProgressMessage(message);
        },
      );

      if (totalValidos === 0) {
        setProgressMessage(
          "ℹ️ Nenhuma linha com Documento e Data de Nascimento válidos.",
        );
        setUploadStatus(
          "ℹ️ Nenhuma linha com Documento e Data de Nascimento válidos na planilha.",
        );
        return;
      }

      const results: UpdateResult[] = rows.map((r) => ({
        id_parcela: r.documento,
        status: r.status,
        error: r.error,
      }));

      const successful = results.filter((r) => r.status === "success").length;
      const naoEncontrados = results.filter(
        (r) => r.status === "unchanged",
      ).length;
      const failed = results.filter((r) => r.status === "error").length;

      setUploadStatus(
        `Data de nascimento: ${successful} atualizada(s), ${naoEncontrados} não encontrado(s) na base, ${failed} falha(s).`,
      );

      // Abre o mesmo modal de resultados dos outros cards, com rotulos de
      // clientes. Nao forca refresh: marca needsRefresh e atualiza ao fechar.
      setResultLabels(CLIENTES_RESULT_LABELS);
      setModalTitle("Resultado da Atualização de Data de Nascimento");
      setUploadResults(results);
      setActiveTab("sintetico");
      if (successful > 0) {
        setNeedsRefresh(true);
      }
      setShowResultsModal(true);
    } catch (error) {
      const errorMsg = (error as Error).message;
      setUploadStatus(`❌ Erro: ${errorMsg}`);
      setProgressMessage(`❌ Erro: ${errorMsg}`);
      setProgressPercentage(0);
      console.error("❌ Erro ao importar datas de nascimento:", error);
    } finally {
      setLoading(false);
      setTimeout(() => setShowProgressModal(false), 2500);
    }
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

      // Define headers in the desired order
      const headers = [
        "nome_da_loja",
        "data_lancamento",
        "data_vencimento",
        "valor_original",
        "valor_reajustado",
        "multa",
        "juros_por_dia",
        "multa_aplicada",
        "juros_aplicado",
        "valor_recebido",
        "data_de_recebimento",
        "dias_em_atraso",
        "dias_carencia",
        "desconto",
        "acrescimo",
        "multa_paga",
        "juros_pago",
        "tipo_de_cobranca",
        "numero_titulo",
        "parcela",
        "id_parcela",
        "status",
        "cliente",
        "documento",
        "endereco",
        "numero",
        "bairro",
        "complemento",
        "cep",
        "cidade",
        "estado",
        "obs",
        "codigo_externo",
        "descricao",
        "venda_n",
        "convenio",
        "telefone",
        "celular",
        "celular1",
        "celular2",
        "email",
        "user_id",
        "situacao",
        "apelido",
      ];

      // Create worksheet data, starting with headers
      const wsData = [headers];

      // Add rows
      allData.forEach((row) => {
        const rowData = headers.map((header) => row[header] ?? "");
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

  const handleDownloadTemplate = async () => {
    setLoading(true);
    setUploadStatus("🔄 Gerando modelo CSV...");
    try {
      const headers = [
        "nome_da_loja",
        "data_lancamento",
        "data_vencimento",
        "valor_original",
        "valor_reajustado",
        "multa",
        "juros_por_dia",
        "multa_aplicada",
        "juros_aplicado",
        "valor_recebido",
        "data_de_recebimento",
        "dias_em_atraso",
        "dias_carencia",
        "desconto",
        "acrescimo",
        "multa_paga",
        "juros_pago",
        "tipo_de_cobranca",
        "numero_titulo",
        "parcela",
        "id_parcela",
        "status",
        "cliente",
        "documento",
        "endereco",
        "numero",
        "bairro",
        "complemento",
        "cep",
        "cidade",
        "estado",
        "obs",
        "codigo_externo",
        "descricao",
        "venda_n",
        "convenio",
        "telefone",
        "celular",
        "celular1",
        "celular2",
        "email",
        "user_id",
        "situacao",
        "apelido",
      ];

      // Create worksheet with only headers
      const ws = XLSX.utils.aoa_to_sheet([headers]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Template");

      // Trigger download as CSV
      XLSX.writeFile(wb, "template_banco_dados.csv");

      setUploadStatus("✅ Modelo CSV gerado com sucesso!");
    } catch (error) {
      const errorMsg = (error as Error).message;
      setUploadStatus(`❌ Erro ao gerar modelo CSV: ${errorMsg}`);
      console.error("❌ Erro ao gerar modelo CSV:", error);
    } finally {
      setLoading(false);
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

  const handleUploadStatus = async () => {
    if (!statusFile) {
      setUploadStatus("❌ Selecione um arquivo para atualizar o status.");
      return;
    }

    // Valida estrutura (tamanho, tipo e cabecalho) antes de qualquer processamento.
    const validation = await validateCsvFile(
      statusFile,
      REQUIRED_COLUMNS_PARCELA,
    );
    if (!validation.ok) {
      setUploadStatus(`❌ ${validation.error}`);
      return;
    }

    setLoading(true);
    setShowProgressModal(true);
    setProgressPercentage(0);
    setProgressMessage("Iniciando atualização...");
    setUploadStatus("");
    setDebugInfo("");

    try {
      setProgressMessage("🔍 Testando conexão com Supabase...");
      const connectionOk = await testSupabaseConnection();
      if (!connectionOk) {
        setProgressMessage("❌ Falha na conexão com Supabase");
        setUploadStatus("❌ Falha na conexão com Supabase");
        return;
      }

      setProgressMessage("📤 Lendo arquivo...");
      const data = await processFile(statusFile, (pct, msg) => {
        setProgressPercentage(Math.round(pct * 0.4)); // parse ocupa 0-40%
        setProgressMessage(msg);
      });
      setProgressMessage(
        `📋 ${data.length} registros encontrados. Atualizando no Supabase...`,
      );
      setProgressPercentage(40);

      const results = await updateStatusInSupabase(
        data,
        (percentage, message) => {
          setProgressPercentage(40 + percentage * 0.6); // 40% para processamento, 60% para upload
          setProgressMessage(message);
        },
      );

      const successful = results.filter((r) => r.status === "success").length;
      const failed = results.filter((r) => r.status === "error").length;
      const unchanged = results.filter((r) => r.status === "unchanged").length;
      const finalProgressMessage = "✅ Atualização concluída!";
      const statusMessage = `Status: ${successful} atualizado(s), ${unchanged} inalterado(s), ${failed} falha(s).`;

      setUploadStatus(statusMessage);
      setProgressMessage(finalProgressMessage);
      setProgressPercentage(100);

      // Armazenar resultados e preparar para abrir o modal
      setResultLabels(DEFAULT_RESULT_LABELS);
      setModalTitle("Resultado da Atualização de Status");
      setUploadResults(results);
      setActiveTab("sintetico");
      if (successful > 0) {
        setNeedsRefresh(true);
      }
      setShowResultsModal(true);

      // Limpar a informação de debug antiga
      setDebugInfo("");
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
      setTimeout(() => setShowProgressModal(false), 3000);
    }
  };

  const handleUploadNewParcela = async () => {
    if (!newParcelaFile) {
      setUploadStatus("❌ Selecione um arquivo para adicionar novas parcelas.");
      return;
    }

    // Valida estrutura (tamanho, tipo e cabecalho) antes de qualquer processamento.
    const validation = await validateCsvFile(
      newParcelaFile,
      REQUIRED_COLUMNS_PARCELA,
    );
    if (!validation.ok) {
      setUploadStatus(`❌ ${validation.error}`);
      return;
    }

    setLoading(true);
    setShowProgressModal(true);
    setProgressPercentage(0);
    setProgressMessage("Iniciando inserção de novas parcelas...");
    setUploadStatus("");
    setDebugInfo("");

    try {
      setProgressMessage("📤 Lendo arquivo...");
      const data = await processFile(newParcelaFile, (pct, msg) => {
        setProgressPercentage(Math.round(pct * 0.2)); // parse ocupa 0-20%
        setProgressMessage(msg);
      });
      setProgressPercentage(20);
      setProgressMessage(`Processando ${data.length} linhas...`);

      const result = await insertNewParcelasInSupabase(data, (p, m) => {
        setProgressPercentage(20 + p * 0.8); // 20% para processar, 80% para inserir
        setProgressMessage(m);
      });

      const resultsForModal: UpdateResult[] = [];
      if (result.success) {
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

        const successful = resultsForModal.filter(
          (r) => r.status === "success",
        ).length;
        const failed = resultsForModal.filter(
          (r) => r.status === "error",
        ).length;

        setUploadStatus(
          `Status: ${successful} inserido(s), ${failed} falha(s)/duplicata(s).`,
        );
        setProgressMessage("✅ Processo concluído!");
        setProgressPercentage(100);

        setResultLabels(DEFAULT_RESULT_LABELS);
        setModalTitle("Resultado da Adição de Novas Parcelas");
        setUploadResults(resultsForModal);
        setActiveTab("sintetico");
        if (successful > 0) {
          setNeedsRefresh(true);
        }
        setShowResultsModal(true);
      } else {
        setUploadStatus(`❌ Erro: ${result.error}`);
        setProgressMessage(`❌ Erro: ${result.error}`);
        setProgressPercentage(0);
      }
    } catch (error) {
      const errorMsg = (error as Error).message;
      setUploadStatus(`❌ Erro: ${errorMsg}`);
      setDebugInfo(`❌ Erro detalhado: ${errorMsg}`);
      setProgressMessage(`❌ Erro: ${errorMsg}`);
      setProgressPercentage(0);
      console.error("❌ Erro detalhado:", error);
    } finally {
      setLoading(false);
      setTimeout(() => setShowProgressModal(false), 2000);
    }
  };

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
            <button
              onClick={handleDownloadTemplate}
              disabled={loading}
              className="inline-flex items-center justify-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md shadow-sm text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
            >
              <FileText className="h-5 w-5 mr-2" />
              <span>Baixar Modelo CSV</span>
            </button>
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
              <div>
                <label
                  htmlFor="statusFileInput"
                  className="cursor-pointer block border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-blue-500 transition-colors"
                >
                  <UploadCloud className="mx-auto h-10 w-10 text-gray-400" />
                  <span className="mt-2 block text-sm font-semibold text-gray-700">
                    {statusFile
                      ? statusFile.name
                      : "Clique para selecionar o arquivo"}
                  </span>
                  <span className="mt-1 block text-xs text-gray-500">
                    Formato CSV, até 50MB
                  </span>
                  <input
                    type="file"
                    accept=".csv"
                    onChange={handleStatusFileChange}
                    disabled={loading}
                    id="statusFileInput"
                    className="sr-only"
                  />
                </label>
                {statusFile && (
                  <button
                    onClick={clearStatusFile}
                    className="mt-3 w-full text-sm text-red-600 hover:text-red-800 transition-colors font-semibold"
                  >
                    Remover arquivo
                  </button>
                )}
              </div>

              <button
                onClick={handleUploadStatus}
                disabled={loading || !statusFile}
                className="w-full inline-flex justify-center items-center px-4 py-3 border border-transparent text-base font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {loading ? (
                  <RefreshCcw className="h-5 w-5 mr-2 animate-spin" />
                ) : (
                  <UploadCloud className="h-5 w-5 mr-2" />
                )}
                {loading ? "Processando..." : "Enviar e Atualizar"}
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
              <div>
                <label
                  htmlFor="newParcelaFileInput"
                  className="cursor-pointer block border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-green-500 transition-colors"
                >
                  <UploadCloud className="mx-auto h-10 w-10 text-gray-400" />
                  <span className="mt-2 block text-sm font-semibold text-gray-700">
                    {newParcelaFile
                      ? newParcelaFile.name
                      : "Clique para selecionar o arquivo"}
                  </span>
                  <span className="mt-1 block text-xs text-gray-500">
                    Formato CSV, até 50MB
                  </span>
                  <input
                    type="file"
                    accept=".csv"
                    onChange={handleNewParcelaFileChange}
                    disabled={loading}
                    id="newParcelaFileInput"
                    className="sr-only"
                  />
                </label>
                {newParcelaFile && (
                  <button
                    onClick={clearNewParcelaFile}
                    className="mt-3 w-full text-sm text-red-600 hover:text-red-800 transition-colors font-semibold"
                  >
                    Remover arquivo
                  </button>
                )}
              </div>

              <button
                onClick={handleUploadNewParcela}
                disabled={loading || !newParcelaFile}
                className="w-full inline-flex justify-center items-center px-4 py-3 border border-transparent text-base font-medium rounded-md shadow-sm text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {loading ? (
                  <RefreshCcw className="h-5 w-5 mr-2 animate-spin" />
                ) : (
                  <UploadCloud className="h-5 w-5 mr-2" />
                )}
                {loading ? "Processando..." : "Enviar e Adicionar"}
              </button>
            </div>
          </div>
        </div>

        {/* Card: Atualizar Cadastro de Clientes (Data de Nascimento) */}
        <div className="flex flex-col bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden transition-all hover:shadow-xl">
          <div className="p-6">
            <div className="flex items-center gap-3">
              <div className="bg-purple-100 p-3 rounded-full">
                <User className="h-6 w-6 text-purple-600" />
              </div>
              <h3 className="text-xl font-bold text-gray-800">
                Atualizar Data de Nascimento dos Clientes
              </h3>
            </div>
            <p className="text-gray-500 mt-3 text-sm">
              Envie o relatório de clientes (xlsx ou csv) com as colunas{" "}
              <code className="text-xs bg-gray-100 px-1 py-0.5 rounded">
                Documento
              </code>{" "}
              e{" "}
              <code className="text-xs bg-gray-100 px-1 py-0.5 rounded">
                Data de Nascimento
              </code>
              . A data é vinculada ao cliente pelo CPF/CNPJ. Apenas clientes já
              existentes na base são atualizados.
            </p>
          </div>

          <div className="px-6 pb-6 mt-auto">
            <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 space-y-4">
              <div>
                <label
                  htmlFor="clientesFileInput"
                  className="cursor-pointer block border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-purple-500 transition-colors"
                >
                  <UploadCloud className="mx-auto h-10 w-10 text-gray-400" />
                  <span className="mt-2 block text-sm font-semibold text-gray-700">
                    {clientesFile
                      ? clientesFile.name
                      : "Clique para selecionar o arquivo"}
                  </span>
                  <span className="mt-1 block text-xs text-gray-500">
                    Formato XLSX ou CSV, até 50MB
                  </span>
                  <input
                    type="file"
                    accept=".xlsx,.csv"
                    onChange={handleClientesFileChange}
                    disabled={loading}
                    id="clientesFileInput"
                    className="sr-only"
                  />
                </label>
                {clientesFile && (
                  <button
                    onClick={clearClientesFile}
                    className="mt-3 w-full text-sm text-red-600 hover:text-red-800 transition-colors font-semibold"
                  >
                    Remover arquivo
                  </button>
                )}
              </div>

              <button
                onClick={handleUploadClientes}
                disabled={loading || !clientesFile}
                className="w-full inline-flex justify-center items-center px-4 py-3 border border-transparent text-base font-medium rounded-md shadow-sm text-white bg-purple-600 hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {loading ? (
                  <RefreshCcw className="h-5 w-5 mr-2 animate-spin" />
                ) : (
                  <UploadCloud className="h-5 w-5 mr-2" />
                )}
                {loading ? "Processando..." : "Enviar e Atualizar"}
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
