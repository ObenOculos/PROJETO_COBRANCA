import React, { useEffect, useMemo, useState } from "react";
import {
  Store,
  Pencil,
  Save,
  X,
  Upload,
  RotateCcw,
  ImageOff,
  AlertCircle,
} from "lucide-react";
import { useCollection } from "../../contexts/CollectionContext";
import { supabase } from "../../lib/supabase";
import { nomeCurtoLoja } from "../../config/lojas";
import { credorLojaVigente } from "../../utils/credorAcordo";
import type { CredorLoja } from "../../types";

// Item 91 (24/11): dados do credor por loja -- nome, CNPJ, endereço, chave
// Pix e logo. O acordo usa a loja dos títulos; loja sem cadastro usa o
// padrão da seção acima. Trocar não reescreve Termos já emitidos (cada
// registro novo fecha o anterior, ver migration 20261124000008).

const LOGO_MAX_BYTES = 1024 * 1024;

interface Rascunho {
  empresaNome: string;
  empresaCnpj: string;
  empresaEndereco: string;
  empresaChavePix: string;
  logoPath: string;
  logoPreview: string | null;
  logoArquivo: File | null;
}

const rascunhoDe = (c: CredorLoja | null): Rascunho => ({
  empresaNome: c?.empresaNome ?? "",
  empresaCnpj: c?.empresaCnpj ?? "",
  empresaEndereco: c?.empresaEndereco ?? "",
  empresaChavePix: c?.empresaChavePix ?? "",
  logoPath: c?.logoPath ?? "",
  logoPreview: c?.logoUrl ?? null,
  logoArquivo: null,
});

const inputCls =
  "w-full px-3 py-2 rounded-lg border border-gray-200 bg-gray-50 text-sm dark:bg-dark-bg-tertiary dark:border-dark-border dark:text-dark-text";

const CredorLojaConfig: React.FC = () => {
  const {
    credoresLoja,
    acordoConfiguracaoPadrao,
    definirCredorAcordoLoja,
    enviarLogoLoja,
  } = useCollection();

  const [lojas, setLojas] = useState<string[]>([]);
  const [erroLojas, setErroLojas] = useState("");
  const [editando, setEditando] = useState<string | null>(null);
  const [rascunho, setRascunho] = useState<Rascunho>(rascunhoDe(null));
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  useEffect(() => {
    void (async () => {
      const { data, error } = await supabase.rpc("lojas_carteira");
      if (error) {
        console.error("Erro ao carregar lojas:", error);
        setErroLojas("Não foi possível carregar a lista de lojas.");
        return;
      }
      setLojas(
        ((data ?? []) as { loja: string }[])
          .map((l) => l.loja)
          .filter(Boolean)
          .sort((a, b) => a.localeCompare(b, "pt-BR")),
      );
    })();
  }, []);

  // Loja que já teve cadastro mas não aparece mais na carteira continua
  // listada (o Termo antigo dela ainda usa os dados).
  const todasLojas = useMemo(() => {
    const set = new Set(lojas);
    credoresLoja.forEach((c) => set.add(c.nomeDaLoja));
    return Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [lojas, credoresLoja]);

  const vigentes = useMemo(() => {
    const map = new Map<string, CredorLoja>();
    todasLojas.forEach((l) => {
      const c = credorLojaVigente(credoresLoja, l);
      if (c && c.empresaNome) map.set(l, c);
    });
    return map;
  }, [todasLojas, credoresLoja]);

  const abrir = (loja: string) => {
    setErro("");
    setEditando(loja);
    setRascunho(rascunhoDe(vigentes.get(loja) ?? null));
  };

  const copiarDe = (loja: string) => {
    const origem = vigentes.get(loja);
    if (!origem) return;
    setRascunho(rascunhoDe(origem));
  };

  const escolherLogo = (arquivo: File | undefined) => {
    setErro("");
    if (!arquivo) return;
    if (!["image/png", "image/jpeg"].includes(arquivo.type)) {
      setErro("O logo precisa ser PNG ou JPG.");
      return;
    }
    if (arquivo.size > LOGO_MAX_BYTES) {
      setErro("O logo precisa ter até 1 MB.");
      return;
    }
    setRascunho((r) => ({
      ...r,
      logoArquivo: arquivo,
      logoPreview: URL.createObjectURL(arquivo),
    }));
  };

  const salvar = async (loja: string) => {
    setErro("");
    const r = rascunho;
    if (!r.empresaNome.trim() || !r.empresaCnpj.trim() || !r.empresaChavePix.trim()) {
      setErro("Preencha nome, CNPJ e chave Pix da loja.");
      return;
    }
    setSalvando(true);
    try {
      const logoPath = r.logoArquivo
        ? await enviarLogoLoja(loja, r.logoArquivo)
        : r.logoPath;
      await definirCredorAcordoLoja({
        nomeDaLoja: loja,
        empresaNome: r.empresaNome,
        empresaCnpj: r.empresaCnpj,
        empresaEndereco: r.empresaEndereco,
        empresaChavePix: r.empresaChavePix,
        logoPath,
      });
      setEditando(null);
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro ao salvar a loja.");
    } finally {
      setSalvando(false);
    }
  };

  const voltarAoPadrao = async (loja: string) => {
    setErro("");
    setSalvando(true);
    try {
      await definirCredorAcordoLoja({
        nomeDaLoja: loja,
        empresaNome: "",
        empresaCnpj: "",
        empresaEndereco: "",
        empresaChavePix: "",
        logoPath: "",
      });
      setEditando(null);
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro ao salvar a loja.");
    } finally {
      setSalvando(false);
    }
  };

  const nomePadrao = acordoConfiguracaoPadrao?.empresaNome || "padrão";

  return (
    <section className="bg-white dark:bg-dark-bg-secondary border border-gray-200 dark:border-dark-border rounded-2xl p-5 space-y-4">
      <div>
        <h3 className="flex items-center gap-2 text-sm font-bold text-gray-700 dark:text-dark-text">
          <Store className="w-4 h-4 text-indigo-500" />
          Dados por loja (Pix e logo)
        </h3>
        <p className="mt-1 text-xs text-gray-500 dark:text-dark-text-secondary">
          O acordo sai com o nome, CNPJ, Pix e logo da loja dos títulos. Loja
          sem cadastro usa os dados acima ({nomePadrao}). Trocar aqui não muda
          Termos já emitidos.
        </p>
      </div>

      {erroLojas && (
        <p className="text-sm text-red-600">{erroLojas}</p>
      )}

      <div className="divide-y divide-gray-100 dark:divide-dark-border border border-gray-100 dark:border-dark-border rounded-xl">
        {todasLojas.map((loja) => {
          const c = vigentes.get(loja);
          const aberto = editando === loja;
          return (
            <div key={loja} className="p-3">
              <div className="flex items-center gap-3">
                <div className="w-16 h-8 shrink-0 flex items-center justify-center rounded bg-gray-50 dark:bg-dark-bg-tertiary">
                  {c?.logoUrl ? (
                    <img
                      src={c.logoUrl}
                      alt=""
                      className="max-h-8 max-w-[4rem] object-contain"
                    />
                  ) : c ? (
                    <ImageOff className="w-4 h-4 text-gray-300" />
                  ) : null}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-gray-800 dark:text-dark-text truncate">
                    {nomeCurtoLoja(loja)}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-dark-text-secondary truncate">
                    {c
                      ? `${c.empresaNome} · Pix ${c.empresaChavePix}`
                      : `Usa o padrão (${nomePadrao})`}
                  </p>
                </div>
                {!aberto && (
                  <button
                    type="button"
                    onClick={() => abrir(loja)}
                    className="shrink-0 px-3 py-1.5 text-xs font-bold rounded-lg border border-gray-200 dark:border-dark-border text-gray-600 dark:text-dark-text-secondary hover:border-indigo-300 flex items-center gap-1"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    {c ? "Editar" : "Configurar"}
                  </button>
                )}
              </div>

              {aberto && (
                <div className="mt-3 space-y-3">
                  {erro && (
                    <div className="p-2.5 bg-red-50 border border-red-100 text-red-600 text-sm rounded-lg flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      {erro}
                    </div>
                  )}
                  {vigentes.size > 0 && (
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <span>Copiar de:</span>
                      <select
                        value=""
                        onChange={(e) => copiarDe(e.target.value)}
                        className="px-2 py-1 rounded-lg border border-gray-200 bg-gray-50 text-xs dark:bg-dark-bg-tertiary dark:border-dark-border dark:text-dark-text"
                      >
                        <option value="">outra loja…</option>
                        {Array.from(vigentes.keys())
                          .filter((l) => l !== loja)
                          .map((l) => (
                            <option key={l} value={l}>
                              {nomeCurtoLoja(l)}
                            </option>
                          ))}
                      </select>
                    </div>
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-bold text-gray-400 mb-1">
                        Nome da empresa (credor no Termo)
                      </label>
                      <input
                        type="text"
                        value={rascunho.empresaNome}
                        onChange={(e) =>
                          setRascunho((r) => ({ ...r, empresaNome: e.target.value }))
                        }
                        className={inputCls}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-400 mb-1">
                        CNPJ
                      </label>
                      <input
                        type="text"
                        value={rascunho.empresaCnpj}
                        onChange={(e) =>
                          setRascunho((r) => ({ ...r, empresaCnpj: e.target.value }))
                        }
                        className={inputCls}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-400 mb-1">
                        Chave Pix
                      </label>
                      <input
                        type="text"
                        value={rascunho.empresaChavePix}
                        onChange={(e) =>
                          setRascunho((r) => ({
                            ...r,
                            empresaChavePix: e.target.value,
                          }))
                        }
                        className={inputCls}
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-bold text-gray-400 mb-1">
                        Endereço
                      </label>
                      <input
                        type="text"
                        value={rascunho.empresaEndereco}
                        onChange={(e) =>
                          setRascunho((r) => ({
                            ...r,
                            empresaEndereco: e.target.value,
                          }))
                        }
                        className={inputCls}
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-bold text-gray-400 mb-1">
                        Logo (PNG ou JPG, até 1 MB)
                      </label>
                      <div className="flex items-center gap-3">
                        <div className="w-28 h-12 flex items-center justify-center rounded-lg border border-dashed border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-bg-tertiary">
                          {rascunho.logoPreview ? (
                            <img
                              src={rascunho.logoPreview}
                              alt="Logo da loja"
                              className="max-h-10 max-w-[6.5rem] object-contain"
                            />
                          ) : (
                            <ImageOff className="w-4 h-4 text-gray-300" />
                          )}
                        </div>
                        <label className="px-3 py-1.5 text-xs font-bold rounded-lg border border-gray-200 dark:border-dark-border text-gray-600 dark:text-dark-text-secondary hover:border-indigo-300 cursor-pointer flex items-center gap-1">
                          <Upload className="w-3.5 h-3.5" />
                          Escolher arquivo
                          <input
                            type="file"
                            accept="image/png,image/jpeg"
                            className="hidden"
                            onChange={(e) => escolherLogo(e.target.files?.[0])}
                          />
                        </label>
                        {rascunho.logoPreview && (
                          <button
                            type="button"
                            onClick={() =>
                              setRascunho((r) => ({
                                ...r,
                                logoPath: "",
                                logoPreview: null,
                                logoArquivo: null,
                              }))
                            }
                            className="text-xs text-gray-400 hover:text-red-600"
                          >
                            Tirar logo
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={salvando}
                      onClick={() => salvar(loja)}
                      className="px-4 py-2 bg-indigo-600 text-white text-sm font-bold rounded-xl hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-1.5"
                    >
                      {salvando ? (
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      ) : (
                        <Save className="w-4 h-4" />
                      )}
                      Salvar loja
                    </button>
                    <button
                      type="button"
                      disabled={salvando}
                      onClick={() => setEditando(null)}
                      className="px-4 py-2 text-sm font-bold rounded-xl text-gray-600 dark:text-dark-text-secondary hover:bg-gray-100 dark:hover:bg-dark-bg-tertiary flex items-center gap-1.5"
                    >
                      <X className="w-4 h-4" />
                      Cancelar
                    </button>
                    {c && (
                      <button
                        type="button"
                        disabled={salvando}
                        onClick={() => voltarAoPadrao(loja)}
                        className="ml-auto px-3 py-2 text-xs font-bold rounded-xl text-gray-500 hover:text-red-600 flex items-center gap-1"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        Voltar ao padrão
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
};

export default CredorLojaConfig;
