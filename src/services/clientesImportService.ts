import * as XLSX from "xlsx";
import { supabase } from "../lib/supabase";

// Mantem apenas digitos (CPF/CNPJ). Usado para casar o documento da planilha
// (vem formatado, ex.: "037.970.493-58") com o armazenado na tabela clientes,
// independente de pontuacao.
export const onlyDigits = (value: unknown): string =>
  (value ?? "").toString().replace(/\D/g, "");

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

interface ParsedClienteRow {
  documento: string;
  documentoDigits: string;
  dataNascimento: string;
}

// Le o relatorio de clientes (xlsx/csv) e extrai, das linhas com documento E
// data de nascimento validos: o documento original (para exibir), o documento
// so com digitos (para casar) e a data ISO. Usa a primeira aba do arquivo.
const parseClientesFile = async (file: File): Promise<ParsedClienteRow[]> => {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
    defval: "",
  });

  const result: ParsedClienteRow[] = [];
  for (const row of rows) {
    const documentoRaw = (row["Documento"] ?? row["documento"] ?? "")
      .toString()
      .trim();
    const documentoDigits = onlyDigits(documentoRaw);
    const dataNascimento = parseBirthDate(
      row["Data de Nascimento"] ?? row["data_nascimento"],
    );
    if (documentoDigits && dataNascimento) {
      result.push({
        documento: documentoRaw || documentoDigits,
        documentoDigits,
        dataNascimento,
      });
    }
  }
  return result;
};

export interface ClienteImportRowResult {
  documento: string;
  status: "success" | "unchanged" | "error";
  error?: string;
}

export interface ClientesImportResult {
  rows: ClienteImportRowResult[];
  // Quantidade de CPFs distintos com data valida encontrados na planilha.
  totalValidos: number;
}

export type ImportProgress = (percentage: number, message: string) => void;

// Importa a Data de Nascimento do relatorio de clientes para a tabela
// `clientes`, casando por documento (somente digitos). Atualiza apenas clientes
// ja existentes; os demais retornam como "unchanged" (nao encontrados).
export const importClientesBirthDates = async (
  file: File,
  onProgress?: ImportProgress,
): Promise<ClientesImportResult> => {
  onProgress?.(0, "📤 Lendo planilha...");
  const parsed = await parseClientesFile(file);

  // Dedup por documento (ultima ocorrencia vence). Guarda o documento original
  // (formatado) para exibir no resultado.
  const byDoc = new Map<
    string,
    { documento: string; dataNascimento: string }
  >();
  parsed.forEach((p) =>
    byDoc.set(p.documentoDigits, {
      documento: p.documento,
      dataNascimento: p.dataNascimento,
    }),
  );

  if (byDoc.size === 0) {
    return { rows: [], totalValidos: 0 };
  }

  // Carrega todos os clientes (paginado: o Supabase corta em ~1000 linhas por
  // requisicao, entao percorremos com .range em loop).
  onProgress?.(15, "🔄 Carregando clientes do banco...");
  const PAGE_SIZE = 1000;
  const docToClienteId = new Map<string, number>();
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("clientes")
      .select("id, documento")
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw error;
    if (!data || data.length === 0) break;

    data.forEach((c) => {
      const d = onlyDigits(c.documento);
      if (d && !docToClienteId.has(d)) docToClienteId.set(d, c.id);
    });

    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  // Separa em "para atualizar" (existe na base) e os ja conhecidos: clientes da
  // planilha que nao estao na base entram como "unchanged" (nao encontrados).
  const updates: { id: number; documento: string; dataNascimento: string }[] =
    [];
  const rows: ClienteImportRowResult[] = [];
  byDoc.forEach(({ documento, dataNascimento }, doc) => {
    const id = docToClienteId.get(doc);
    if (id !== undefined) {
      updates.push({ id, documento, dataNascimento });
    } else {
      rows.push({ documento, status: "unchanged" });
    }
  });

  // Atualiza em lotes paralelos de 20.
  const PARALLEL_SIZE = 20;
  for (let i = 0; i < updates.length; i += PARALLEL_SIZE) {
    const batch = updates.slice(i, i + PARALLEL_SIZE);
    const settled = await Promise.allSettled(
      batch.map(async (u): Promise<ClienteImportRowResult> => {
        const { error } = await supabase
          .from("clientes")
          .update({ data_nascimento: u.dataNascimento })
          .eq("id", u.id);
        return error
          ? { documento: u.documento, status: "error", error: error.message }
          : { documento: u.documento, status: "success" };
      }),
    );
    settled.forEach((r) => {
      rows.push(
        r.status === "fulfilled"
          ? r.value
          : { documento: "?", status: "error", error: String(r.reason) },
      );
    });

    const processed = Math.min(i + PARALLEL_SIZE, updates.length);
    onProgress?.(
      15 + Math.round((processed / Math.max(updates.length, 1)) * 85),
      `🔄 Atualizando ${processed} de ${updates.length} cliente(s)...`,
    );
  }

  onProgress?.(100, "✅ Importação concluída!");
  return { rows, totalValidos: byDoc.size };
};
