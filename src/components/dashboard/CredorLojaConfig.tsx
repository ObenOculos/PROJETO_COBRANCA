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
  QrCode,
} from "lucide-react";
import { useCollection } from "../../contexts/CollectionContext";
import { supabase } from "../../lib/supabase";
import { nomeCurtoLoja, redeDaLoja } from "../../config/lojas";
import { credorLojaVigente } from "../../utils/credorAcordo";
import type { CredorLoja } from "../../types";

// Item 91 (24/11): dados do credor por loja -- nome, CNPJ, endereço, chave
// Pix e logo. O acordo usa a loja dos títulos; loja sem cadastro usa o
// padrão (empresa padrão, acima). Trocar não reescreve Termos já emitidos
// (cada registro novo fecha o anterior, ver migration 20261124000008).

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

const formatCnpj = (v: string) => {
  const d = v.replace(/\D/g, "");
  return d.length === 14
    ? d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5")
    : v;
};

const inputCls =
  "w-full px-3 py-2 rounded-lg border border-gray-200 bg-gray-50 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 dark:bg-dark-bg-tertiary dark:border-dark-border dark:text-dark-text";

const LogoBox: React.FC<{ src: string | null; className?: string }> = ({
  src,
  className = "w-14 h-10",
}) => (
  <div
    className={`${className} shrink-0 flex items-center justify-center rounded-lg bg-gray-50 dark:bg-dark-bg-tertiary border border-gray-100 dark:border-dark-border overflow-hidden`}
  >
    {src ? (
      <img src={src} alt="" className="max-h-full max-w-full object-contain p-1" />
    ) : (
      <ImageOff className="w-4 h-4 text-gray-300" />
    )}
  </div>
);

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
      setLojas(((data ?? []) as { loja: string }[]).map((l) => l.loja));
    })();
  }, []);

  // Loja que já teve cadastro mas saiu da carteira continua listada (o
  // Termo antigo dela ainda usa os dados).
  const todasLojas = useMemo(() => {
    const set = new Set(lojas.filter(Boolean));
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

  const redes = useMemo(() => {
    const map = new Map<string, string[]>();
    todasLojas.forEach((l) => {
      const r = redeDaLoja(l);
      map.set(r, [...(map.get(r) ?? []), l]);
    });
    return Array.from(map.entries());
  }, [todasLojas]);

  // Libera a URL temporária do logo escolhido e não salvo.
  useEffect(() => {
    const url = rascunho.logoArquivo ? rascunho.logoPreview : null;
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [rascunho.logoArquivo, rascunho.logoPreview]);

  const fechar = () => {
    if (salvando) return;
    setEditando(null);
  };

  useEffect(() => {
    if (!editando) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") fechar();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editando, salvando]);

  const abrir = (loja: string) => {
    setErro("");
    setEditando(loja);
    setRascunho(rascunhoDe(vigentes.get(loja) ?? null));
  };

  const copiarDe = (loja: string) => {
    const origem = vigentes.get(loja);
    if (origem) setRascunho(rascunhoDe(origem));
  };

  const set = (campo: keyof Rascunho) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setRascunho((r) => ({ ...r, [campo]: e.target.value }));

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

  const nomePadrao = acordoConfiguracaoPadrao?.empresaNome || "empresa padrão";
  const lojaAberta = editando;
  const cadastroAberto = lojaAberta ? vigentes.get(lojaAberta) : undefined;

  return (
    <section className="bg-white dark:bg-dark-bg-secondary border border-gray-200 dark:border-dark-border rounded-2xl p-5 space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-bold text-gray-700 dark:text-dark-text">
            <Store className="w-4 h-4 text-indigo-500" />
            Dados por loja
          </h3>
          <p className="mt-1 text-xs text-gray-500 dark:text-dark-text-secondary max-w-2xl">
            O acordo sai com o nome, CNPJ, Pix e logo da loja dos títulos.
            Loja sem cadastro usa a empresa padrão. Trocar aqui não muda
            Termos já emitidos.
          </p>
        </div>
        <span className="text-xs font-bold text-gray-500 dark:text-dark-text-secondary bg-gray-100 dark:bg-dark-bg-tertiary px-2.5 py-1 rounded-full">
          {vigentes.size} de {todasLojas.length} com dados próprios
        </span>
      </div>

      {erroLojas && <p className="text-sm text-red-600">{erroLojas}</p>}

      {redes.map(([rede, lojasRede]) => {
        const configuradas = lojasRede.filter((l) => vigentes.has(l)).length;
        return (
          <div key={rede} className="space-y-2">
            <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400">
              {rede}
              {lojasRede.length > 1 && (
                <span className="normal-case font-medium tracking-normal">
                  {" "}
                  · {configuradas}/{lojasRede.length} configuradas
                </span>
              )}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
              {lojasRede.map((loja) => {
                const c = vigentes.get(loja);
                return (
                  <button
                    key={loja}
                    type="button"
                    onClick={() => abrir(loja)}
                    className="group text-left flex items-center gap-3 p-3 rounded-xl border border-gray-200 dark:border-dark-border hover:border-indigo-300 hover:bg-indigo-50/40 dark:hover:bg-dark-bg-tertiary transition-colors"
                  >
                    <LogoBox src={c?.logoUrl ?? null} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <p className="text-sm font-bold text-gray-800 dark:text-dark-text truncate">
                          {nomeCurtoLoja(loja)}
                        </p>
                        <span
                          className={`shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                            c
                              ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
                              : "bg-gray-100 text-gray-500 dark:bg-dark-bg-tertiary"
                          }`}
                        >
                          {c ? "Próprio" : "Padrão"}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 dark:text-dark-text-secondary truncate">
                        {c ? c.empresaNome : `Usa ${nomePadrao}`}
                      </p>
                      {c && (
                        <p className="text-[11px] text-gray-400 truncate">
                          Pix {c.empresaChavePix}
                        </p>
                      )}
                    </div>
                    <Pencil className="w-3.5 h-3.5 shrink-0 text-gray-300 group-hover:text-indigo-500" />
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}

      {lojaAberta && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[100]"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) fechar();
          }}
        >
          <div className="bg-white dark:bg-dark-bg rounded-2xl w-full max-w-4xl shadow-2xl overflow-hidden border border-gray-200 dark:border-dark-border max-h-[90vh] flex flex-col">
            <div className="px-6 py-4 border-b border-gray-100 dark:border-dark-border flex items-center justify-between gap-3 bg-gray-50 dark:bg-dark-bg-secondary shrink-0">
              <div className="min-w-0">
                <h3 className="font-bold text-gray-900 dark:text-dark-text truncate">
                  {nomeCurtoLoja(lojaAberta)}
                </h3>
                <p className="text-xs text-gray-500 truncate">{lojaAberta}</p>
              </div>
              <button
                type="button"
                onClick={fechar}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-dark-bg-tertiary"
                aria-label="Fechar"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto grid grid-cols-1 md:grid-cols-[1fr_18rem] gap-6">
              <div className="space-y-4">
                {erro && (
                  <div className="p-2.5 bg-red-50 border border-red-100 text-red-600 text-sm rounded-lg flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    {erro}
                  </div>
                )}
                {Array.from(vigentes.keys()).some((l) => l !== lojaAberta) && (
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <span>Copiar dados de</span>
                    <select
                      value=""
                      onChange={(e) => copiarDe(e.target.value)}
                      className="px-2 py-1 rounded-lg border border-gray-200 bg-gray-50 text-xs dark:bg-dark-bg-tertiary dark:border-dark-border dark:text-dark-text"
                    >
                      <option value="">outra loja…</option>
                      {Array.from(vigentes.keys())
                        .filter((l) => l !== lojaAberta)
                        .map((l) => (
                          <option key={l} value={l}>
                            {nomeCurtoLoja(l)}
                          </option>
                        ))}
                    </select>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                  <div className="col-span-2">
                    <label className="block text-xs font-bold text-gray-500 mb-1">
                      Nome da empresa (credor no Termo) *
                    </label>
                    <input
                      type="text"
                      value={rascunho.empresaNome}
                      onChange={set("empresaNome")}
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1">
                      CNPJ *
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={rascunho.empresaCnpj}
                      onChange={set("empresaCnpj")}
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1">
                      Chave Pix *
                    </label>
                    <input
                      type="text"
                      value={rascunho.empresaChavePix}
                      onChange={set("empresaChavePix")}
                      className={inputCls}
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-bold text-gray-500 mb-1">
                      Endereço
                    </label>
                    <input
                      type="text"
                      value={rascunho.empresaEndereco}
                      onChange={set("empresaEndereco")}
                      className={inputCls}
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-bold text-gray-500 mb-1">
                      Logo
                    </label>
                    <div className="flex flex-wrap items-center gap-3">
                      <LogoBox src={rascunho.logoPreview} className="w-28 h-14" />
                      <label className="px-3 py-1.5 text-xs font-bold rounded-lg border border-gray-200 dark:border-dark-border text-gray-600 dark:text-dark-text-secondary hover:border-indigo-300 cursor-pointer flex items-center gap-1">
                        <Upload className="w-3.5 h-3.5" />
                        {rascunho.logoPreview ? "Trocar" : "Escolher arquivo"}
                        <input
                          type="file"
                          accept="image/png,image/jpeg"
                          className="hidden"
                          onChange={(e) => {
                            escolherLogo(e.target.files?.[0]);
                            e.target.value = "";
                          }}
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
                      <span className="text-[11px] text-gray-400 w-full">
                        PNG ou JPG, até 1 MB. Fundo transparente ou branco
                        fica melhor no PDF.
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Prévia: como sai no Termo/Resumo e na etapa do Pix. */}
              <div className="space-y-2">
                <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400">
                  Como sai no acordo
                </p>
                <div className="rounded-xl border border-gray-200 dark:border-dark-border overflow-hidden bg-white">
                  <div className="h-1 bg-indigo-600" />
                  <div className="p-3 space-y-3">
                    <div className="h-8 flex items-center">
                      {rascunho.logoPreview ? (
                        <img
                          src={rascunho.logoPreview}
                          alt=""
                          className="max-h-8 max-w-[10rem] object-contain"
                        />
                      ) : (
                        <span className="text-[11px] text-gray-300">sem logo</span>
                      )}
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase text-indigo-700">
                        Credor(a)
                      </p>
                      <p className="text-xs font-bold text-gray-800 break-words">
                        {rascunho.empresaNome || "—"}
                      </p>
                      <p className="text-[11px] text-gray-500">
                        CNPJ: {formatCnpj(rascunho.empresaCnpj) || "—"}
                      </p>
                      {rascunho.empresaEndereco && (
                        <p className="text-[11px] text-gray-500 break-words">
                          {rascunho.empresaEndereco}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 p-2 rounded-lg bg-gray-50">
                      <QrCode className="w-8 h-8 text-gray-300 shrink-0" />
                      <p className="text-[11px] text-gray-500 min-w-0">
                        Pix para{" "}
                        <strong className="text-gray-700">
                          {rascunho.empresaNome || "—"}
                        </strong>
                        <br />
                        <span className="break-all">
                          {rascunho.empresaChavePix || "sem chave"}
                        </span>
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-gray-100 dark:border-dark-border flex flex-wrap items-center gap-2 shrink-0">
              {cadastroAberto && (
                <button
                  type="button"
                  disabled={salvando}
                  onClick={() => voltarAoPadrao(lojaAberta)}
                  className="px-3 py-2 text-xs font-bold rounded-xl text-gray-500 hover:text-red-600 flex items-center gap-1 disabled:opacity-50"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Voltar ao padrão
                </button>
              )}
              <div className="ml-auto flex items-center gap-2">
                <button
                  type="button"
                  disabled={salvando}
                  onClick={fechar}
                  className="px-4 py-2 text-sm font-bold rounded-xl text-gray-600 dark:text-dark-text-secondary hover:bg-gray-100 dark:hover:bg-dark-bg-tertiary"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={salvando}
                  onClick={() => salvar(lojaAberta)}
                  className="px-5 py-2 bg-indigo-600 text-white text-sm font-bold rounded-xl hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-1.5"
                >
                  {salvando ? (
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <Save className="w-4 h-4" />
                  )}
                  Salvar loja
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};

export default CredorLojaConfig;
