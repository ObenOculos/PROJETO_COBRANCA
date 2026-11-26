// Base de titulos guardada no navegador do GESTOR (item 94, 26/11).
//
// Egress do Supabase: cada F5 do gestor baixava BANCO_DADOS inteiro (~133 MB
// de JSON). Agora a 1a carga do aparelho baixa tudo e guarda no IndexedDB; as
// seguintes pedem so o que mudou (BANCO_DADOS.alterado_em, migration
// 20261126000002) e o que foi excluido (banco_dados_excluidos).
//
// Seguranca contra dado velho:
//  - margem de MARGEM_MS para tras em toda busca incremental (transacao longa
//    de rotina pode gravar com hora anterior ao commit);
//  - depois de juntar, a quantidade de linhas tem de bater com a contagem do
//    banco (HEAD, sem baixar linha); se nao bater, refaz a carga completa;
//  - carga completa de novo a cada COMPLETA_MAX_MS e se o formato mudar;
//  - qualquer erro de IndexedDB cai na carga normal da rede (quem chama).
//
// So o gestor usa: o cobrador ja baixa so a propria carteira.

import { supabase } from "../lib/supabase";
import { fetchAllPagesByIdRange } from "./supabasePagination";
import { fetchAllRows } from "./fetchAllRows";
import { comRetentativa } from "./supabaseRetry";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type LinhaBase = Record<string, any>;

const NOME_DB = "quitto-base-local";
const VERSAO_DB = 1;
const LOJA_LINHAS = "linhas";
const LOJA_META = "meta";
const CHAVE_META = "banco_dados";
/** Muda quando o formato guardado muda: forca a carga completa. */
const FORMATO = 1;
const MARGEM_MS = 30 * 60 * 1000;
const COMPLETA_MAX_MS = 7 * 24 * 60 * 60 * 1000;
const PAGINA = 1000;
const PARALELO = 8;
/** Acima disto, a carga completa (faixas paralelas) e mais barata. */
const LIMITE_INCREMENTAL = 20000;

interface Meta {
  formato: number;
  /** Projeto do Supabase (nao mistura bases de ambientes diferentes). */
  projeto: string;
  /** Maior alterado_em ja recebido (hora do banco, nao do aparelho). */
  ate: string | null;
  /** Hora do SERVIDOR quando a ultima sincronizacao comecou (agora_servidor,
   * migration 20261126000003). A proxima busca parte dela menos a margem;
   * sem ela (funcao ainda nao aplicada), parte de `ate`. */
  sincronizadoEm?: string | null;
  /** Maior excluido_em ja recebido. */
  excluidosAte: string | null;
  /** Date.now() da ultima carga completa. */
  completaEm: number;
}

const PROJETO = String(import.meta.env.VITE_SUPABASE_URL ?? "");

export const baseLocalDisponivel = (): boolean =>
  typeof indexedDB !== "undefined";

// ---------------------------------------------------------------------------
// IndexedDB (sem biblioteca: so o necessario)
// ---------------------------------------------------------------------------

const abrir = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const req = indexedDB.open(NOME_DB, VERSAO_DB);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(LOJA_LINHAS))
        db.createObjectStore(LOJA_LINHAS, { keyPath: "id_parcela" });
      if (!db.objectStoreNames.contains(LOJA_META))
        db.createObjectStore(LOJA_META);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

const pedido = <T>(req: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

const fim = (tx: IDBTransaction): Promise<void> =>
  new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error("IndexedDB abortado"));
  });

const lerLocal = async (
  db: IDBDatabase,
): Promise<{ meta: Meta | null; linhas: LinhaBase[] }> => {
  const tx = db.transaction([LOJA_LINHAS, LOJA_META], "readonly");
  const [meta, linhas] = await Promise.all([
    pedido(tx.objectStore(LOJA_META).get(CHAVE_META)) as Promise<
      Meta | undefined
    >,
    pedido(tx.objectStore(LOJA_LINHAS).getAll()) as Promise<LinhaBase[]>,
  ]);
  return { meta: meta ?? null, linhas };
};

/** Grava em lotes (uma transacao gigante trava a aba em aparelho fraco). */
const gravarLocal = async (
  db: IDBDatabase,
  {
    limpar,
    gravar,
    apagar,
    meta,
  }: { limpar: boolean; gravar: LinhaBase[]; apagar: number[]; meta: Meta },
): Promise<void> => {
  // Meta "invalida" primeiro: se a gravacao parar no meio, a proxima abertura
  // ve a meta sem `ate` e refaz a carga completa (nunca usa copia pela metade).
  {
    const tx = db.transaction([LOJA_LINHAS, LOJA_META], "readwrite");
    tx.objectStore(LOJA_META).delete(CHAVE_META);
    if (limpar) tx.objectStore(LOJA_LINHAS).clear();
    await fim(tx);
  }
  const LOTE = 5000;
  for (let i = 0; i < gravar.length; i += LOTE) {
    const tx = db.transaction(LOJA_LINHAS, "readwrite");
    const loja = tx.objectStore(LOJA_LINHAS);
    for (const l of gravar.slice(i, i + LOTE)) loja.put(l);
    await fim(tx);
  }
  if (apagar.length > 0) {
    const tx = db.transaction(LOJA_LINHAS, "readwrite");
    const loja = tx.objectStore(LOJA_LINHAS);
    for (const id of apagar) loja.delete(id);
    await fim(tx);
  }
  const tx = db.transaction(LOJA_META, "readwrite");
  tx.objectStore(LOJA_META).put(meta, CHAVE_META);
  await fim(tx);
};

/** Apaga a copia local (logout: a base tem dados de clientes). */
export const limparBaseLocal = async (): Promise<void> => {
  if (!baseLocalDisponivel()) return;
  try {
    const db = await abrir();
    const tx = db.transaction([LOJA_LINHAS, LOJA_META], "readwrite");
    tx.objectStore(LOJA_LINHAS).clear();
    tx.objectStore(LOJA_META).clear();
    await fim(tx);
    db.close();
  } catch (e) {
    console.warn("Não foi possível limpar a base local:", e);
  }
};

// ---------------------------------------------------------------------------
// Rede
// ---------------------------------------------------------------------------

const maiorData = (atual: string | null, nova: unknown): string | null => {
  if (typeof nova !== "string" || !nova) return atual;
  if (!atual) return nova;
  return Date.parse(nova) > Date.parse(atual) ? nova : atual;
};

const contarNoBanco = async (): Promise<number> => {
  const { count, error, status } = await comRetentativa(() =>
    supabase
      .from("BANCO_DADOS")
      .select("id_parcela", { count: "exact", head: true }),
  );
  if (error || status >= 300 || count == null)
    throw error ?? new Error(`Contagem falhou (HTTP ${status})`);
  return count;
};

/** Hora do servidor; null se a funcao ainda nao existe no banco. */
const horaServidor = async (): Promise<string | null> => {
  const { data, error } = await supabase.rpc("agora_servidor");
  if (error || typeof data !== "string") return null;
  return data;
};

/** Quantas linhas mudaram desde `desde` (HEAD: so a contagem, pelo indice). */
const contarAlteradas = async (desde: string): Promise<number> => {
  const { count, error, status } = await comRetentativa(() =>
    supabase
      .from("BANCO_DADOS")
      .select("id_parcela", { count: "exact", head: true })
      .gte("alterado_em", desde),
  );
  if (error || status >= 300 || count == null)
    throw error ?? new Error(`Contagem falhou (HTTP ${status})`);
  return count;
};

/** Linhas alteradas desde `desde`, paginando por id (keyset). 26/11: com
 * OFFSET cada pagina custava mais que a anterior e, com muitas linhas, o
 * banco chegou a dar statement timeout nas outras consultas. */
const baixarAlteradas = async (desde: string): Promise<LinhaBase[]> => {
  const todas: LinhaBase[] = [];
  let depoisDe = -1;
  for (;;) {
    const { data, error } = await comRetentativa(() =>
      supabase
        .from("BANCO_DADOS")
        .select("*")
        .gte("alterado_em", desde)
        .gt("id_parcela", depoisDe)
        .order("id_parcela", { ascending: true })
        .limit(PAGINA),
    );
    if (error) throw error;
    const pagina = (data ?? []) as LinhaBase[];
    todas.push(...pagina);
    if (pagina.length < PAGINA) break;
    depoisDe = Number(pagina[pagina.length - 1].id_parcela);
  }
  return todas;
};

const ultimaExclusao = async (): Promise<string | null> => {
  const { data, error } = await comRetentativa(() =>
    supabase
      .from("banco_dados_excluidos")
      .select("excluido_em")
      .order("excluido_em", { ascending: false })
      .limit(1),
  );
  if (error) throw error;
  return (data?.[0]?.excluido_em as string | undefined) ?? null;
};

const baixarTudo = async (
  onProgresso?: (carregadas: number, total: number | null) => void,
): Promise<LinhaBase[]> => {
  const [total, minRes, maxRes] = await Promise.all([
    contarNoBanco(),
    comRetentativa(() =>
      supabase
        .from("BANCO_DADOS")
        .select("id_parcela")
        .order("id_parcela", { ascending: true })
        .limit(1),
    ),
    comRetentativa(() =>
      supabase
        .from("BANCO_DADOS")
        .select("id_parcela")
        .order("id_parcela", { ascending: false })
        .limit(1),
    ),
  ]);
  if (minRes.error || maxRes.error) throw minRes.error || maxRes.error;
  const min = (minRes.data?.[0]?.id_parcela as number | undefined) ?? null;
  const max = (maxRes.data?.[0]?.id_parcela as number | undefined) ?? null;
  if (min === null || max === null) return [];
  return fetchAllPagesByIdRange<LinhaBase>(
    (gte, lt) => {
      const q = supabase
        .from("BANCO_DADOS")
        .select("*")
        .order("id_parcela", { ascending: true })
        .gte("id_parcela", gte)
        .limit(PAGINA);
      return lt === null ? q : q.lt("id_parcela", lt);
    },
    { min, max },
    (l) => Number(l.id_parcela),
    {
      pageSize: PAGINA,
      concurrency: PARALELO,
      onBatch: (_lote, carregadas) => onProgresso?.(carregadas, total),
    },
  );
};

// ---------------------------------------------------------------------------
// Carga
// ---------------------------------------------------------------------------

export interface ResultadoBase {
  linhas: LinhaBase[];
  origem: "completa" | "incremental";
  /** Linhas que vieram pela rede nesta carga. */
  baixadas: number;
}

const ordenar = (linhas: LinhaBase[]) =>
  linhas.sort((a, b) => Number(a.id_parcela) - Number(b.id_parcela));

const cargaCompleta = async (
  db: IDBDatabase,
  onProgresso?: (carregadas: number, total: number | null) => void,
): Promise<ResultadoBase> => {
  // Hora da ultima exclusao ANTES de baixar: exclusao no meio da carga entra
  // na proxima incremental (a margem cobre).
  const [excluidosAte, sincronizadoEm] = await Promise.all([
    ultimaExclusao(),
    horaServidor(),
  ]);
  const linhas = await baixarTudo(onProgresso);
  let ate: string | null = null;
  for (const l of linhas) ate = maiorData(ate, l.alterado_em);
  await gravarLocal(db, {
    limpar: true,
    gravar: linhas,
    apagar: [],
    meta: {
      formato: FORMATO,
      projeto: PROJETO,
      ate,
      excluidosAte,
      sincronizadoEm,
      completaEm: Date.now(),
    },
  });
  return { linhas: ordenar(linhas), origem: "completa", baixadas: linhas.length };
};

let emAndamento: Promise<ResultadoBase> | null = null;

/**
 * Base inteira de BANCO_DADOS (linhas cruas, por id_parcela crescente).
 * `forcarCompleta` ignora a copia local (botao "recarregar tudo").
 */
export const carregarBaseGestor = (
  opcoes: {
    forcarCompleta?: boolean;
    onProgresso?: (carregadas: number, total: number | null) => void;
  } = {},
): Promise<ResultadoBase> => {
  if (emAndamento) return emAndamento;
  emAndamento = (async () => {
    const db = await abrir();
    try {
      const { meta, linhas } = await lerLocal(db);
      const valida =
        !opcoes.forcarCompleta &&
        meta &&
        meta.formato === FORMATO &&
        meta.projeto === PROJETO &&
        meta.ate &&
        Date.now() - meta.completaEm < COMPLETA_MAX_MS &&
        linhas.length > 0;
      if (!valida || !meta?.ate) return await cargaCompleta(db, opcoes.onProgresso);

      const sincronizadoEm = await horaServidor();
      const base = meta.sincronizadoEm ?? meta.ate;
      const desde = new Date(Date.parse(base) - MARGEM_MS).toISOString();
      const baseExcl = meta.sincronizadoEm ?? meta.excluidosAte;
      const desdeExcl = baseExcl
        ? new Date(Date.parse(baseExcl) - MARGEM_MS).toISOString()
        : null;

      // Muitas linhas mudaram (rotina grande, ou a 1a vez depois da
      // migration): a carga completa em faixas paralelas sai mais barata.
      const qtdMudou = await contarAlteradas(desde);
      if (qtdMudou > LIMITE_INCREMENTAL) {
        console.log(
          `${qtdMudou} linhas mudaram desde a última vez: carga completa.`,
        );
        return await cargaCompleta(db, opcoes.onProgresso);
      }

      const [mudadas, excluidas] = await Promise.all([
        baixarAlteradas(desde),
        fetchAllRows<{ id_parcela: number; excluido_em: string }>((de, ate) => {
          const q = supabase
            .from("banco_dados_excluidos")
            .select("id_parcela, excluido_em")
            .order("excluido_em", { ascending: true })
            .order("id_parcela", { ascending: true });
          return (desdeExcl ? q.gte("excluido_em", desdeExcl) : q).range(
            de,
            ate,
          );
        }),
      ]);

      const porId = new Map<number, LinhaBase>();
      for (const l of linhas) porId.set(Number(l.id_parcela), l);
      // Exclusoes primeiro; linha que voltou (reinserida) vem em `mudadas`.
      const voltaram = new Set(mudadas.map((l) => Number(l.id_parcela)));
      const apagar: number[] = [];
      let excluidosAte = meta.excluidosAte;
      for (const e of excluidas) {
        excluidosAte = maiorData(excluidosAte, e.excluido_em);
        const id = Number(e.id_parcela);
        if (!voltaram.has(id) && porId.delete(id)) apagar.push(id);
      }
      let ate: string | null = meta.ate;
      for (const l of mudadas) {
        porId.set(Number(l.id_parcela), l);
        ate = maiorData(ate, l.alterado_em);
      }

      // Conferencia: a copia tem de ter o mesmo numero de linhas do banco.
      const total = await contarNoBanco();
      if (total !== porId.size) {
        console.warn(
          `Base local com ${porId.size} linhas e o banco com ${total}: refazendo a carga completa.`,
        );
        return await cargaCompleta(db, opcoes.onProgresso);
      }

      await gravarLocal(db, {
        limpar: false,
        gravar: mudadas,
        apagar,
        meta: { ...meta, ate, excluidosAte, sincronizadoEm },
      });
      return {
        linhas: ordenar([...porId.values()]),
        origem: "incremental" as const,
        baixadas: mudadas.length,
      };
    } finally {
      db.close();
    }
  })().finally(() => {
    emAndamento = null;
  });
  return emAndamento;
};

/**
 * Separa as linhas como as views banco_dados_clientes_ativos/quitados:
 * cliente quitado = soma de (original - recebido - desconto) das parcelas nao
 * canceladas <= 0,01 (mesma conta de trg_atualiza_saldo_por_documento;
 * conferido 26/11: 0 divergencias em 16.896 clientes). Sem documento = ativo.
 */
export const separarPorSaldo = (
  linhas: LinhaBase[],
): { ativas: LinhaBase[]; quitadas: LinhaBase[] } => {
  const num = (v: unknown) => {
    const n = parseFloat(String(v ?? "0").replace(",", "."));
    return Number.isFinite(n) ? n : 0;
  };
  const saldo = new Map<string, number>();
  for (const l of linhas) {
    if (l.documento == null) continue;
    const doc = String(l.documento);
    const cancelado =
      String(l.status ?? "").trim().toLowerCase() === "cancelado";
    const parte = cancelado
      ? 0
      : num(l.valor_original) - num(l.valor_recebido) - num(l.desconto);
    saldo.set(doc, (saldo.get(doc) ?? 0) + parte);
  }
  const ativas: LinhaBase[] = [];
  const quitadas: LinhaBase[] = [];
  for (const l of linhas) {
    if (l.documento == null || (saldo.get(String(l.documento)) ?? 0) > 0.01)
      ativas.push(l);
    else quitadas.push(l);
  }
  return { ativas, quitadas };
};
