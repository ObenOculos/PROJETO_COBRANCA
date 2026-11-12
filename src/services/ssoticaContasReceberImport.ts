import * as XLSX from "xlsx";
import { supabase } from "../lib/supabase";

// Upload manual do contas a receber da SSÓtica (planilhas
// BD_Contasareceber_*.xlsx, aba "BD"). Mesma conversão de `linhas_para_app`
// em scripts/ssotica/contas_receber_ssotica.py; as regras de negócio (o que
// atualizar, o que não tocar, renegociação, acordo) ficam todas na função do
// banco importar_parcelas_ssotica — aqui só se lê a planilha e se envia.

/** Coluna da planilha -> chave da função (igual a CAMPOS_APP do script). */
const CAMPOS_APP: Record<string, string> = {
  "Nome da Loja": "nome_da_loja",
  "Data Lançamento": "data_lancamento",
  "Data Vencimento": "data_vencimento",
  "Valor Original": "valor_original",
  "Valor Recebido": "valor_recebido",
  "Data de Recebimento": "data_de_recebimento",
  "Tipo de Cobrança": "tipo_de_cobranca",
  "Número Titulo": "numero_titulo",
  Parcela: "parcela",
  "ID Parcela": "id_parcela",
  Status: "status",
  Cliente: "cliente",
  Apelido: "apelido",
  Documento: "documento",
  Endereço: "endereco",
  Número: "numero",
  Bairro: "bairro",
  Complemento: "complemento",
  CEP: "cep",
  Cidade: "cidade",
  Estado: "estado",
  Obs: "obs",
  "Código Externo": "codigo_externo",
  Descrição: "descricao",
  "Venda Nº": "venda_n",
  Convenio: "convenio",
  telefone: "telefone",
  celular: "celular",
  celular1: "celular1",
  celular2: "celular2",
  email: "email",
};
const VALORES = new Set(["valor_original", "valor_recebido"]);
const DATAS = new Set([
  "data_lancamento",
  "data_vencimento",
  "data_de_recebimento",
]);
const INTEIROS = new Set(["numero_titulo", "parcela", "id_parcela", "venda_n"]);

/** Colunas sem as quais a planilha não é o contas a receber da SSÓtica. */
const COLUNAS_OBRIGATORIAS = [
  "ID Parcela",
  "Nome da Loja",
  "Status",
  "Data Vencimento",
  "Valor Original",
];

/** Laboratório: só vai para o Power BI, nunca para o app. */
const LOJAS_FORA_DO_APP = new Set(["exxlab"]);

export const LOTE_APP = 2000;
const LOTE_MINIMO = 125;

export type LinhaSsotica = Record<string, string | number | null>;

export interface ResultadoImportacao {
  recebidas: number;
  inseridas: number;
  atualizadas: number;
  quitadas: number;
  renegociadas: number;
  renegociadas_fora_do_app: number;
  clientes_novos: number;
  enderecos_novos: number;
  parcelas_acordo_ssotica: number;
  pagamentos_acordo: number;
  ignoradas: { id_parcela: number | string; motivo: string }[];
}

const CONTADORES = [
  "recebidas",
  "inseridas",
  "atualizadas",
  "quitadas",
  "renegociadas",
  "renegociadas_fora_do_app",
  "clientes_novos",
  "enderecos_novos",
  "parcelas_acordo_ssotica",
  "pagamentos_acordo",
] as const;

export const resultadoVazio = (): ResultadoImportacao => ({
  recebidas: 0,
  inseridas: 0,
  atualizadas: 0,
  quitadas: 0,
  renegociadas: 0,
  renegociadas_fora_do_app: 0,
  clientes_novos: 0,
  enderecos_novos: 0,
  parcelas_acordo_ssotica: 0,
  pagamentos_acordo: 0,
  ignoradas: [],
});

export const somarResultados = (
  a: ResultadoImportacao,
  b: Partial<ResultadoImportacao>,
): ResultadoImportacao => {
  const r = { ...a, ignoradas: [...a.ignoradas, ...(b.ignoradas ?? [])] };
  for (const k of CONTADORES) r[k] = a[k] + (Number(b[k]) || 0);
  return r;
};

// --- conversões (espelham _vazio/_valor/_data/_inteiro do script) ---------

const vazio = (v: unknown): boolean =>
  v === null ||
  v === undefined ||
  (typeof v === "number" && Number.isNaN(v)) ||
  (typeof v === "string" && v.trim() === "");

const pad = (n: number) => String(n).padStart(2, "0");

/** "1.250,99" / "R$ 10,00" / 10.5 -> 1250.99 / 10 / 10.5 */
const paraValor = (v: unknown): number | null => {
  if (vazio(v)) return null;
  if (typeof v === "number") return Math.round(v * 100) / 100;
  const t = String(v)
    .replace(/[^\d,.-]/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  const n = Number(t);
  return t === "" || Number.isNaN(n) ? null : Math.round(n * 100) / 100;
};

/** dd/mm/aaaa (texto), data serial do Excel ou Date -> "YYYY-MM-DD". */
const paraData = (v: unknown): string | null => {
  if (vazio(v)) return null;
  if (v instanceof Date) {
    // SheetJS monta a Date em horário local a partir da data da célula.
    return `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}`;
  }
  if (typeof v === "number") {
    const o = XLSX.SSF.parse_date_code(v);
    return o ? `${o.y}-${pad(o.m)}-${pad(o.d)}` : null;
  }
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(String(v).trim());
  if (!m) return null;
  const [d, mes, a] = [Number(m[1]), Number(m[2]), Number(m[3])];
  // Mesma validação do strptime: 31/02 não é data.
  const dt = new Date(a, mes - 1, d);
  if (dt.getFullYear() !== a || dt.getMonth() !== mes - 1 || dt.getDate() !== d)
    return null;
  return `${a}-${pad(mes)}-${pad(d)}`;
};

const paraInteiro = (v: unknown): number | null => {
  if (vazio(v)) return null;
  const n = Number(String(v).trim());
  return Number.isFinite(n) ? Math.trunc(n) : null;
};

/** Texto: número inteiro sai sem ".0" (igual a _como_texto). */
const paraTexto = (v: unknown): string | null => {
  if (vazio(v)) return null;
  if (typeof v === "number" && Number.isInteger(v)) return String(v);
  if (v instanceof Date) return paraData(v);
  return String(v).trim();
};

const paraCep = (v: unknown): string | null => {
  if (vazio(v)) return null;
  return String(v).replace(/\D/g, "") || null;
};

const linhaParaApp = (reg: Record<string, unknown>): LinhaSsotica => {
  const l: LinhaSsotica = {};
  for (const [col, chave] of Object.entries(CAMPOS_APP)) {
    const v = reg[col];
    if (VALORES.has(chave)) l[chave] = paraValor(v);
    else if (DATAS.has(chave)) l[chave] = paraData(v);
    else if (INTEIROS.has(chave)) l[chave] = paraInteiro(v);
    else if (chave === "cep") l[chave] = paraCep(v);
    else l[chave] = paraTexto(v);
  }
  return l;
};

// --- leitura da planilha -----------------------------------------------------

export const validarNomeArquivo = (
  file: File,
): { ok: boolean; error?: string } => {
  const nome = file.name.toLowerCase();
  if (!nome.endsWith(".xlsx"))
    return { ok: false, error: "envie o .xlsx BD_Contasareceber_*" };
  if ([...LOJAS_FORA_DO_APP].some((l) => nome.includes(l)))
    return { ok: false, error: "Exxlab não vai para o app" };
  return { ok: true };
};

export interface PlanilhaLida {
  linhas: LinhaSsotica[];
  /** Linhas descartadas na leitura (sem ID Parcela ou de loja fora do app). */
  descartadas: number;
  lojas: string[];
}

export const lerPlanilhaSsotica = async (file: File): Promise<PlanilhaLida> => {
  const wb = XLSX.read(await file.arrayBuffer(), {
    type: "array",
    cellDates: true,
  });
  const nomeAba = wb.SheetNames.includes("BD") ? "BD" : wb.SheetNames[0];
  const ws = nomeAba ? wb.Sheets[nomeAba] : undefined;
  if (!ws) throw new Error("Planilha vazia.");

  // A exportação crua da SSÓtica traz linhas de título antes do cabeçalho;
  // a planilha BD_ já vem com o cabeçalho na 1ª linha. Aceita as duas.
  const matriz = XLSX.utils.sheet_to_json<unknown[]>(ws, {
    header: 1,
    raw: true,
    defval: null,
  });
  const iCab = matriz.findIndex((r) =>
    r.some((c) => typeof c === "string" && c.trim() === "ID Parcela"),
  );
  if (iCab < 0)
    throw new Error(
      "Não é o contas a receber da SSÓtica: falta a coluna 'ID Parcela'.",
    );
  const cab = matriz[iCab].map((c) => (c == null ? "" : String(c).trim()));
  const faltando = COLUNAS_OBRIGATORIAS.filter((c) => !cab.includes(c));
  if (faltando.length)
    throw new Error(`Colunas ausentes: ${faltando.join(", ")}.`);

  const linhas: LinhaSsotica[] = [];
  const lojas = new Set<string>();
  let descartadas = 0;
  for (const r of matriz.slice(iCab + 1)) {
    if (!r.some((c) => !vazio(c))) continue;
    const reg: Record<string, unknown> = {};
    cab.forEach((c, i) => {
      if (c) reg[c] = r[i];
    });
    const l = linhaParaApp(reg);
    const loja = String(l.nome_da_loja ?? "");
    if (l.id_parcela === null || LOJAS_FORA_DO_APP.has(loja.toLowerCase())) {
      descartadas++;
      continue;
    }
    if (loja) lojas.add(loja);
    linhas.push(l);
  }
  return { linhas, descartadas, lojas: [...lojas].sort() };
};

// --- envio -------------------------------------------------------------------

const ehTimeout = (e: { code?: string; message?: string }) =>
  e.code === "57014" ||
  /statement timeout|canceling statement/i.test(e.message ?? "");

const enviarLote = async (
  lote: LinhaSsotica[],
): Promise<Partial<ResultadoImportacao>> => {
  // Função ainda fora de database.types (gerado antes da migration 20261112000001).
  const rpc = supabase.rpc.bind(supabase) as unknown as (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{
    data: unknown;
    error: { code?: string; message: string } | null;
  }>;
  const { data, error } = await rpc("importar_parcelas_ssotica", {
    p_linhas: lote,
  });
  if (error) {
    // Sessão de gestor tem limite de 8s por comando; lote grande demais é
    // dividido ao meio e reenviado (a função é idempotente por id_parcela).
    if (ehTimeout(error) && lote.length > LOTE_MINIMO) {
      const meio = Math.ceil(lote.length / 2);
      const a = await enviarLote(lote.slice(0, meio));
      const b = await enviarLote(lote.slice(meio));
      return somarResultados(somarResultados(resultadoVazio(), a), b);
    }
    throw new Error(`importar_parcelas_ssotica: ${error.message}`);
  }
  return (data ?? {}) as Partial<ResultadoImportacao>;
};

/**
 * Envia em lotes de LOTE_APP e soma os resultados da função. Cada lote é
 * gravado na hora: `onLote` recebe o resultado de cada um para que, se um lote
 * do meio falhar, o que já foi gravado continue contado no resumo.
 */
export const importarContasReceberSsotica = async (
  linhas: LinhaSsotica[],
  onProgress: (feitas: number, total: number) => void,
  onLote?: (res: Partial<ResultadoImportacao>) => void,
): Promise<ResultadoImportacao> => {
  let total = resultadoVazio();
  for (let i = 0; i < linhas.length; i += LOTE_APP) {
    onProgress(i, linhas.length);
    const res = await enviarLote(linhas.slice(i, i + LOTE_APP));
    onLote?.(res);
    total = somarResultados(total, res);
  }
  onProgress(linhas.length, linhas.length);
  return total;
};

export const MOTIVOS_IGNORADA: Record<string, string> = {
  cancelado_no_app: "Cancelada no app",
  acordo_ativo: "Em acordo ativo no app",
  pago_no_app: "Pagamento do app ainda não baixado na loja",
  status_desconhecido: "Status que o app não conhece",
  renegociacao_de_acordo:
    "Renegociação de cliente com acordo ativo (lançada antes do acordo) — conferir",
  estorno_ssotica_acordo: "Estorno na loja de parcela do acordo — conferir",
  parcela_sem_par_no_acordo:
    "Parcela da loja sem par no acordo do app — conferir",
};

export const descreverMotivo = (m: string): string => MOTIVOS_IGNORADA[m] ?? m;
