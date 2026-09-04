import { supabase } from "../lib/supabase";
import {
  dedupeBy,
  fetchAllPages,
  fetchPagesInParallel,
} from "../utils/supabasePagination";

// ---------------------------------------------------------------------------
// Registro de clientes
//
// `clientes` e o cadastro por documento: uma linha por CPF/CNPJ, contra as
// ~111 mil linhas por parcela de BANCO_DADOS. Depois da migration
// 20260904000001 ela guarda tambem apelido, telefones e e-mail, que antes
// viviam repetidos em cada parcela.
//
// Este modulo e o UNICO carregador da tabela. Antes ela era varrida em tres
// lugares independentes, cada um pedindo um subconjunto diferente de colunas:
// fetchReincidenciaResets e o clientDataCache (CollectionContext) e a carga
// local do ClientAssignment. Uma varredura so, com todas as colunas, alimenta
// os tres.
// ---------------------------------------------------------------------------

export interface ClienteCadastro {
  id: number;
  documento: string;
  nome: string | null;
  data_nascimento: string | null;
  created_at: string | null;
  reincidencia_reset_at: string | null;
  apelido: string | null;
  telefone: string | null;
  celular: string | null;
  celular1: string | null;
  celular2: string | null;
  email: string | null;
}

// Documento (como gravado no banco) -> cadastro.
export type ClientesRegistry = Map<string, ClienteCadastro>;

/**
 * Campos de contato que ATE a migration 20260904000002 existiam tambem em
 * BANCO_DADOS, repetidos por parcela. Hoje so existem aqui.
 *
 * Ainda aparecem em planilhas antigas e no relatorio do sistema de origem, que
 * sao carregados no card de Novas Parcelas -- por isso os pontos de importacao
 * usam esta lista para tirar essas colunas do INSERT em BANCO_DADOS e
 * redireciona-las para o cadastro.
 */
export const CADASTRO_CONTATO_COLUMNS = [
  "apelido",
  "telefone",
  "celular",
  "celular1",
  "celular2",
  "email",
] as const;

export type CadastroContatoColumn = (typeof CADASTRO_CONTATO_COLUMNS)[number];

// Colunas do cadastro completo (pos-migration 20260904000001).
const REGISTRY_COLUMNS =
  "id, documento, nome, data_nascimento, created_at, reincidencia_reset_at, " +
  "apelido, telefone, celular, celular1, celular2, email";

// Colunas que `clientes` sempre teve. Usadas quando as novas ainda nao existem
// (codigo publicado antes da migration): o app continua funcionando lendo
// apelido/contatos de BANCO_DADOS, que e o fallback de `mapRowToCollection`.
const LEGACY_COLUMNS =
  "id, documento, nome, data_nascimento, created_at, reincidencia_reset_at";

/**
 * Carrega o cadastro de todos os clientes, indexado por documento.
 *
 * Pagina em paralelo (o Supabase corta em ~1000 linhas por requisicao) quando
 * consegue a contagem exata; sem ela, cai para a varredura sequencial.
 */
export const fetchClientesRegistry = async (): Promise<ClientesRegistry> => {
  const { count, error: countError } = await supabase
    .from("clientes")
    .select("id", { count: "exact", head: true });

  const loadWith = async (columns: string): Promise<ClienteCadastro[]> => {
    // A lista de colunas e escolhida em runtime (completa ou legada), entao o
    // client tipado nao consegue inferir o retorno.
    const buildPage = (from: number, to: number) =>
      supabase
        .from("clientes")
        .select(columns)
        .order("id", { ascending: true })
        .range(from, to) as unknown as PromiseLike<{
        data: ClienteCadastro[] | null;
        error: unknown;
      }>;

    return !countError && typeof count === "number"
      ? await fetchPagesInParallel<ClienteCadastro>(buildPage, count)
      : await fetchAllPages<ClienteCadastro>(buildPage);
  };

  let rows: ClienteCadastro[];
  try {
    rows = await loadWith(REGISTRY_COLUMNS);
  } catch (err) {
    console.warn(
      "Cadastro completo indisponivel; lendo so as colunas antigas. A migration 20260904000001 foi aplicada?",
      err,
    );
    rows = await loadWith(LEGACY_COLUMNS);
  }

  // A paginacao por OFFSET nao e estavel: se uma importacao insere linhas
  // durante a carga, as paginas seguintes escorregam e a mesma linha pode vir
  // duas vezes.
  const registry: ClientesRegistry = new Map();
  for (const row of dedupeBy(rows, (r) => r.id)) {
    const documento = row.documento?.trim();
    if (documento) registry.set(documento, row);
  }
  return registry;
};
