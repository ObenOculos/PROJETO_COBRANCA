import * as XLSX from "xlsx";
import { supabase } from "../lib/supabase";
import {
  ClienteCadastro,
  fetchClientesRegistry,
} from "./clientesRegistry";

// Mantem apenas digitos (CPF/CNPJ). Usado para casar o documento da planilha
// (vem formatado, ex.: "037.970.493-58") com o armazenado no banco,
// independente de pontuacao.
export const onlyDigits = (value: unknown): string =>
  (value ?? "").toString().replace(/\D/g, "");

/**
 * Monta um instante a partir dos componentes da data, no fuso LOCAL.
 *
 * Nao usamos `new Date("14/01/2024")`: alem de nao reconhecer o formato BR, a
 * interpretacao de string varia entre navegadores. Com os componentes
 * explicitos o Date e construido no fuso da maquina — que e o mesmo fuso em que
 * o app depois le o valor de volta (`new Date(created_at)`), entao a data
 * exibida e exatamente a que veio na planilha.
 */
const buildLocalIso = (
  y: number,
  mo: number,
  d: number,
  h = 0,
  mi = 0,
  s = 0,
): string | null => {
  if (!y || !mo || !d) return null;

  const date = new Date(y, mo - 1, d, h, mi, s);
  if (Number.isNaN(date.getTime())) return null;

  // Guarda contra data inexistente ("31/02"): o Date rola para o mes seguinte
  // em silencio, e a data importada sairia diferente da planilha.
  if (
    date.getFullYear() !== y ||
    date.getMonth() !== mo - 1 ||
    date.getDate() !== d
  ) {
    return null;
  }

  return date.toISOString();
};

// Converte a "Data de Nascimento" do relatorio para ISO (YYYY-MM-DD).
// Aceita serial do Excel (numero, ex.: 31364 => 1985-11-13), DD/MM/YYYY ou ISO.
// Retorna null quando vazio ou invalido.
export const parseBirthDate = (value: unknown): string | null => {
  if (value === null || value === undefined || value === "") return null;

  // Serial numerico do Excel
  if (typeof value === "number" && !Number.isNaN(value)) {
    const o = XLSX.SSF.parse_date_code(value);
    if (!o || !o.y) return null;
    return `${o.y}-${String(o.m).padStart(2, "0")}-${String(o.d).padStart(2, "0")}`;
  }

  const s = value.toString().trim();
  if (s === "") return null;

  // DD/MM/YYYY
  if (s.includes("/")) {
    const [d, m, y] = s.split("/");
    if (d && m && y) {
      return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
    }
  }

  // ISO YYYY-MM-DD (com ou sem hora)
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    return s.split("T")[0];
  }

  return null;
};

/**
 * Converte a "Data do Cadastro" em um instante ISO completo.
 *
 * O sistema de origem exporta no formato `14/01/2024  11:57:49` (data e hora,
 * as vezes com espaco duplo). Dependendo de como o Excel foi salvo, a mesma
 * celula pode chegar como serial numerico com parte fracionaria de hora.
 * Aceita tambem so a data e o formato ISO.
 */
export const parseCadastroTimestamp = (value: unknown): string | null => {
  if (value === null || value === undefined || value === "") return null;

  // Serial do Excel (a parte fracionaria e a hora).
  if (typeof value === "number" && !Number.isNaN(value)) {
    const o = XLSX.SSF.parse_date_code(value);
    if (!o || !o.y) return null;
    return buildLocalIso(o.y, o.m, o.d, o.H ?? 0, o.M ?? 0, Math.floor(o.S ?? 0));
  }

  const s = value.toString().trim();
  if (s === "") return null;

  // "14/01/2024  11:57:49", "14/01/2024 11:57" ou so "14/01/2024".
  const br = s.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/,
  );
  if (br) {
    return buildLocalIso(
      Number(br[3]),
      Number(br[2]),
      Number(br[1]),
      Number(br[4] ?? 0),
      Number(br[5] ?? 0),
      Number(br[6] ?? 0),
    );
  }

  // ISO, com ou sem hora.
  const iso = s.match(
    /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2}))?)?/,
  );
  if (iso) {
    return buildLocalIso(
      Number(iso[1]),
      Number(iso[2]),
      Number(iso[3]),
      Number(iso[4] ?? 0),
      Number(iso[5] ?? 0),
      Number(iso[6] ?? 0),
    );
  }

  return null;
};

/** Dia civil (no fuso local) de um timestamp, para comparar sem a hora. */
const localDayKey = (value: unknown): string | null => {
  if (value === null || value === undefined || value === "") return null;
  const date = new Date(value.toString());
  if (Number.isNaN(date.getTime())) return null;
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
};

// ---------------------------------------------------------------------------
// Catalogo dos campos importaveis
//
// Uma unica fonte de verdade para: quais colunas o arquivo pode trazer, como
// cada valor e normalizado e como saber se ele mudou. O modelo CSV para
// download (uploadTemplates) e os chips do card de upload sao derivados daqui,
// entao cabecalho aceito e cabecalho oferecido nunca divergem.
//
// Todos gravam em `clientes`: desde a migration 20260904000001 o cadastro do
// cliente mora inteiro la, numa linha por documento, em vez de repetido em cada
// parcela de BANCO_DADOS.
// ---------------------------------------------------------------------------

export interface ClienteFieldDef {
  // Identificador do campo e cabecalho oferecido no modelo CSV.
  key: string;
  // Coluna em `clientes`, quando o nome tecnico difere do cabecalho amigavel.
  column?: string;
  label: string;
  // Cabecalhos aceitos, ja normalizados (minusculas, sem acento, "_" no lugar
  // de espaco/pontuacao). `key` tambem e sempre aceito.
  aliases: string[];
  // Normaliza o valor da celula. Retornar null descarta a celula (vazia ou
  // invalida) -- campo ausente nao apaga o que ja esta no banco.
  parse: (raw: unknown) => string | null;
  // Comparacao com o valor atual do banco. Por padrao e texto puro; datas com
  // hora precisam de uma regra propria para nao regravar a cada importacao.
  equals?: (current: unknown, next: string) => boolean;
}

const trimText = (raw: unknown): string | null => {
  if (raw === null || raw === undefined) return null;
  const s = raw.toString().trim();
  return s === "" ? null : s;
};

export const CLIENTE_IMPORT_FIELDS: ClienteFieldDef[] = [
  {
    key: "nome",
    label: "Nome",
    aliases: ["cliente", "nome_cliente", "nome_do_cliente", "razao_social"],
    parse: trimText,
  },
  {
    key: "apelido",
    label: "Apelido",
    aliases: ["nome_fantasia", "apelido_cliente"],
    parse: trimText,
  },
  {
    key: "data_nascimento",
    label: "Data de Nascimento",
    aliases: [
      "data_de_nascimento",
      "nascimento",
      "dt_nascimento",
      "aniversario",
    ],
    parse: parseBirthDate,
  },
  {
    key: "data_cadastro",
    // `created_at` e o que define "cliente novo" no card Novos Clientes; o
    // cabecalho amigavel evita expor o nome tecnico no modelo CSV.
    column: "created_at",
    label: "Data do Cadastro",
    aliases: [
      "data_do_cadastro",
      "data_de_cadastro",
      "cadastro",
      "dt_cadastro",
      "created_at",
    ],
    parse: parseCadastroTimestamp,
    // Compara so o dia: a hora vinda da planilha nao deve provocar UPDATE
    // quando a data e a mesma que ja esta gravada.
    equals: (current, next) => localDayKey(current) === localDayKey(next),
  },
  {
    key: "telefone",
    label: "Telefone",
    aliases: ["fone", "tel", "telefone_fixo"],
    parse: trimText,
  },
  {
    key: "celular",
    label: "Celular",
    aliases: ["cel"],
    parse: trimText,
  },
  {
    key: "celular1",
    label: "Celular 1",
    aliases: ["celular_1", "cel1"],
    parse: trimText,
  },
  {
    key: "celular2",
    label: "Celular 2",
    aliases: ["celular_2", "cel2"],
    parse: trimText,
  },
  {
    key: "email",
    label: "E-mail",
    aliases: ["e_mail", "email_cliente"],
    parse: trimText,
  },
];

/** Coluna de `clientes` correspondente ao campo. */
const fieldColumn = (field: ClienteFieldDef): string =>
  field.column ?? field.key;

/** O valor do arquivo e diferente do que ja esta no banco? */
const fieldChanged = (
  field: ClienteFieldDef,
  current: unknown,
  next: string,
): boolean =>
  field.equals
    ? !field.equals(current, next)
    : (current ?? "").toString().trim() !== next;

// Cabecalhos aceitos para a coluna-chave (CPF/CNPJ).
export const DOCUMENTO_ALIASES = [
  "documento",
  "cpf",
  "cnpj",
  "cpf_cnpj",
  "documento_cliente",
  "doc",
];

/** Normaliza um cabecalho: minusculas, sem acento, "_" no lugar do resto. */
const normalizeHeader = (value: unknown): string =>
  (value ?? "")
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

const acceptedHeaders = (field: ClienteFieldDef): string[] => [
  field.key,
  ...field.aliases,
];

/** Lista legivel das colunas aceitas -- usada nas mensagens de erro. */
const describeAcceptedColumns = (): string =>
  CLIENTE_IMPORT_FIELDS.map((f) => `${f.label} (${f.key})`).join(", ");

// ---------------------------------------------------------------------------
// Leitura do arquivo
// ---------------------------------------------------------------------------

interface ParsedRow {
  documento: string;
  documentoDigits: string;
  values: Record<string, string>;
}

interface ParsedFile {
  rows: ParsedRow[];
  // Campos efetivamente presentes no cabecalho do arquivo.
  fields: ClienteFieldDef[];
}

// Le a planilha (xlsx/csv, primeira aba) e extrai, das linhas com documento
// valido, os campos reconhecidos no cabecalho. Colunas desconhecidas sao
// ignoradas, entao o relatorio bruto do sistema de origem pode ser enviado
// sem edicao.
const parseClientesFile = async (file: File): Promise<ParsedFile> => {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];

  const headerRow =
    (XLSX.utils.sheet_to_json<unknown[]>(ws, {
      header: 1,
      blankrows: false,
    })[0] as unknown[]) ?? [];

  // Cabecalho normalizado -> cabecalho original (primeira ocorrencia vence).
  const headerByNormalized = new Map<string, string>();
  headerRow.forEach((h) => {
    const normalized = normalizeHeader(h);
    if (normalized && !headerByNormalized.has(normalized)) {
      headerByNormalized.set(normalized, h?.toString() ?? "");
    }
  });

  const documentoHeader = DOCUMENTO_ALIASES.map((a) =>
    headerByNormalized.get(a),
  ).find((h) => h !== undefined);

  if (documentoHeader === undefined) {
    throw new Error(
      `A planilha não tem coluna de documento. Use uma destas: ${DOCUMENTO_ALIASES.join(", ")}.`,
    );
  }

  // Campo -> cabecalho original correspondente.
  const headerByField = new Map<string, string>();
  const fields: ClienteFieldDef[] = [];
  for (const field of CLIENTE_IMPORT_FIELDS) {
    const header = acceptedHeaders(field)
      .map((a) => headerByNormalized.get(a))
      .find((h) => h !== undefined);
    if (header !== undefined) {
      headerByField.set(field.key, header);
      fields.push(field);
    }
  }

  if (fields.length === 0) {
    throw new Error(
      `A planilha não tem nenhuma coluna atualizável além do documento. Colunas aceitas: ${describeAcceptedColumns()}.`,
    );
  }

  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
    defval: "",
  });

  const rows: ParsedRow[] = [];
  for (const row of raw) {
    const documentoRaw = (row[documentoHeader] ?? "").toString().trim();
    const documentoDigits = onlyDigits(documentoRaw);
    if (!documentoDigits) continue;

    const values: Record<string, string> = {};
    for (const field of fields) {
      const parsed = field.parse(row[headerByField.get(field.key)!]);
      if (parsed !== null) values[field.key] = parsed;
    }

    // Linha sem nenhum valor util nao entra na conta nem no relatorio.
    if (Object.keys(values).length === 0) continue;

    rows.push({
      documento: documentoRaw || documentoDigits,
      documentoDigits,
      values,
    });
  }

  return { rows, fields };
};

// ---------------------------------------------------------------------------
// Resultado
// ---------------------------------------------------------------------------

export interface ClienteImportRowResult {
  documento: string;
  status: "success" | "unchanged" | "error";
  // Por que ficou "unchanged": nao existe na base ou ja estava igual.
  reason?: "not_found" | "no_change";
  // Rotulos dos campos efetivamente gravados (status "success").
  updatedFields?: string[];
  error?: string;
}

export interface ClientesImportResult {
  rows: ClienteImportRowResult[];
  // Documentos distintos com pelo menos um valor valido na planilha.
  totalValidos: number;
  // Rotulos das colunas reconhecidas no cabecalho.
  detectedFields: string[];
  updated: number;
  notFound: number;
  noChange: number;
  failed: number;
}

export type ImportProgress = (percentage: number, message: string) => void;

// ---------------------------------------------------------------------------
// Gravacao
// ---------------------------------------------------------------------------

interface PendingUpdate {
  documentoDigits: string;
  cliente: ClienteCadastro;
  // Apenas o que realmente mudou.
  changed: Record<string, unknown>;
  changedLabels: string[];
}

/**
 * Grava as alteracoes em lote via upsert (ON CONFLICT DO UPDATE) na chave `id`.
 *
 * As linhas sao agrupadas por ASSINATURA (mesmo conjunto de colunas alteradas)
 * para que o payload de cada lote seja homogeneo -- assim nenhuma coluna
 * nao-alterada e sobrescrita. Se um lote falhar, reprocessa linha a linha para
 * isolar a linha ruim em vez de perder o lote inteiro.
 */
const applyUpdates = async (
  items: PendingUpdate[],
  onRowDone: (item: PendingUpdate, error?: string) => void,
  onProgress?: (processed: number) => void,
): Promise<void> => {
  if (items.length === 0) return;

  const CHUNK = 500;
  const groups = new Map<string, PendingUpdate[]>();
  for (const item of items) {
    const signature = Object.keys(item.changed).sort().join(",");
    const group = groups.get(signature);
    if (group) group.push(item);
    else groups.set(signature, [item]);
  }

  let processed = 0;

  const applyRowByRow = async (chunk: PendingUpdate[]) => {
    const settled = await Promise.allSettled(
      chunk.map(async (item) => {
        const { error } = await supabase
          .from("clientes")
          .update(item.changed)
          .eq("id", item.cliente.id);
        if (error) throw new Error(error.message);
      }),
    );
    settled.forEach((r, idx) => {
      onRowDone(
        chunk[idx],
        r.status === "rejected"
          ? String((r.reason as Error)?.message ?? r.reason)
          : undefined,
      );
    });
  };

  for (const group of groups.values()) {
    for (let i = 0; i < group.length; i += CHUNK) {
      const chunk = group.slice(i, i + CHUNK);
      // `documento` e `nome` sao obrigatorios no Insert; reenviamos os valores
      // atuais para que o ON CONFLICT tenha um payload valido.
      const payload = chunk.map((item) => ({
        id: item.cliente.id,
        documento: item.cliente.documento,
        nome: item.cliente.nome ?? "Cliente sem nome",
        ...item.changed,
      }));

      const { error } = await supabase
        .from("clientes")
        .upsert(payload, { onConflict: "id" });

      if (error) {
        console.warn(
          `⚠️ Lote de ${chunk.length} clientes falhou (${error.message}); tentando linha a linha...`,
        );
        await applyRowByRow(chunk);
      } else {
        chunk.forEach((item) => onRowDone(item));
      }

      processed += chunk.length;
      onProgress?.(processed);
    }
  }
};

/**
 * Importa o cadastro de clientes a partir do relatorio (xlsx/csv), casando as
 * linhas pelo documento (somente digitos).
 *
 * So grava o que mudou: reenviar o mesmo arquivo resulta em zero UPDATEs.
 * Clientes que nao existem na base sao reportados, nunca criados -- criar aqui
 * marcaria como "cliente novo" quem ja e antigo (ver a migration
 * 20260904000001, que cria os faltantes com created_at nulo).
 */
export const importClientesCadastro = async (
  file: File,
  onProgress?: ImportProgress,
): Promise<ClientesImportResult> => {
  onProgress?.(0, "📤 Lendo planilha...");
  const { rows: parsed, fields } = await parseClientesFile(file);

  const detectedFields = fields.map((f) => f.label);
  const emptyResult: ClientesImportResult = {
    rows: [],
    totalValidos: 0,
    detectedFields,
    updated: 0,
    notFound: 0,
    noChange: 0,
    failed: 0,
  };

  // Dedup por documento. Valores mais recentes vencem, campo a campo, para que
  // uma linha posterior sem apelido nao apague o apelido de uma anterior.
  const byDoc = new Map<
    string,
    { documento: string; values: Record<string, string> }
  >();
  for (const row of parsed) {
    const current = byDoc.get(row.documentoDigits);
    if (current) {
      Object.assign(current.values, row.values);
      current.documento = row.documento;
    } else {
      byDoc.set(row.documentoDigits, {
        documento: row.documento,
        values: { ...row.values },
      });
    }
  }

  if (byDoc.size === 0) return emptyResult;

  onProgress?.(15, "🔄 Carregando cadastro de clientes...");
  const registry = await fetchClientesRegistry();

  // O documento da planilha vem formatado e o do banco nem sempre: indexamos
  // por digitos para casar independente de pontuacao.
  const clienteByDigits = new Map<string, ClienteCadastro>();
  registry.forEach((cliente) => {
    const digits = onlyDigits(cliente.documento);
    if (digits && !clienteByDigits.has(digits)) {
      clienteByDigits.set(digits, cliente);
    }
  });

  onProgress?.(35, "🔄 Comparando com o cadastro atual...");

  const updates: PendingUpdate[] = [];
  const rows: ClienteImportRowResult[] = [];
  let notFound = 0;
  let noChange = 0;

  byDoc.forEach(({ documento, values }, digits) => {
    const cliente = clienteByDigits.get(digits);
    if (!cliente) {
      notFound++;
      rows.push({ documento, status: "unchanged", reason: "not_found" });
      return;
    }

    const changed: Record<string, unknown> = {};
    const changedLabels: string[] = [];
    for (const field of fields) {
      const next = values[field.key];
      if (next === undefined) continue;

      const column = fieldColumn(field);
      const current = (cliente as unknown as Record<string, unknown>)[column];
      if (fieldChanged(field, current, next)) {
        changed[column] = next;
        changedLabels.push(field.label);
      }
    }

    if (Object.keys(changed).length === 0) {
      noChange++;
      rows.push({ documento, status: "unchanged", reason: "no_change" });
      return;
    }

    updates.push({
      documentoDigits: digits,
      cliente: { ...cliente, documento },
      changed,
      changedLabels,
    });
  });

  let updated = 0;
  let failed = 0;

  await applyUpdates(
    updates,
    (item, error) => {
      if (error) {
        failed++;
        rows.push({ documento: item.cliente.documento, status: "error", error });
      } else {
        updated++;
        rows.push({
          documento: item.cliente.documento,
          status: "success",
          updatedFields: item.changedLabels,
        });
      }
    },
    (processed) => {
      onProgress?.(
        40 + Math.round((processed / Math.max(updates.length, 1)) * 60),
        `🔄 Gravando ${processed} de ${updates.length} cliente(s)...`,
      );
    },
  );

  onProgress?.(100, "✅ Importação concluída!");
  return {
    rows,
    totalValidos: byDoc.size,
    detectedFields,
    updated,
    notFound,
    noChange,
    failed,
  };
};
