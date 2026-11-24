import React, { useEffect, useMemo, useState } from "react";
import {
  Store,
  Tags,
  Pencil,
  Plus,
  Save,
  X,
  Upload,
  ImageOff,
  AlertCircle,
  QrCode,
} from "lucide-react";
import { useCollection } from "../../contexts/CollectionContext";
import { supabase } from "../../lib/supabase";
import { nomeCurtoLoja, redeDaLoja } from "../../config/lojas";
import {
  credorLojaVigente,
  credorMarcaVigente,
  resolverCredorAcordo,
} from "../../utils/credorAcordo";
import type { CredorAcordo, Marca } from "../../types";
import logoApp from "../../assets/focco-brasil-logo.png";

// Item 91 (24/11): o credor do acordo (nome, CNPJ, endereço, Pix, logo) é
// cadastrado por MARCA e toda loja da marca herda. A loja só abre exceção
// (dados próprios e/ou logo própria). Regra de resolução em
// utils/credorAcordo; migrations 20261124000008/9.

const LOGO_MAX_BYTES = 1024 * 1024;

interface Dados {
  empresaNome: string;
  empresaCnpj: string;
  empresaEndereco: string;
  empresaChavePix: string;
}

interface Logo {
  path: string;
  preview: string | null;
  arquivo: File | null;
}

const DADOS_VAZIOS: Dados = {
  empresaNome: "",
  empresaCnpj: "",
  empresaEndereco: "",
  empresaChavePix: "",
};
const LOGO_VAZIO: Logo = { path: "", preview: null, arquivo: null };

const dadosDe = (c: Partial<Record<keyof Dados, string | null>> | null): Dados => ({
  empresaNome: c?.empresaNome ?? "",
  empresaCnpj: c?.empresaCnpj ?? "",
  empresaEndereco: c?.empresaEndereco ?? "",
  empresaChavePix: c?.empresaChavePix ?? "",
});

const temAlgumDado = (d: Dados) =>
  Object.values(d).some((v) => v.trim() !== "");
const dadosCompletos = (d: Dados) =>
  !!(d.empresaNome.trim() && d.empresaCnpj.trim() && d.empresaChavePix.trim());

const formatCnpj = (v: string | null) => {
  const d = (v ?? "").replace(/\D/g, "");
  return d.length === 14
    ? d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5")
    : v ?? "";
};

const validarArquivo = (arquivo: File): string | null => {
  if (!["image/png", "image/jpeg"].includes(arquivo.type))
    return "O logo precisa ser PNG ou JPG.";
  if (arquivo.size > LOGO_MAX_BYTES) return "O logo precisa ter até 1 MB.";
  return null;
};

const inputCls =
  "w-full px-3 py-2 rounded-lg border border-gray-200 bg-gray-50 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 dark:bg-dark-bg-tertiary dark:border-dark-border dark:text-dark-text";
const labelCls = "block text-xs font-bold text-gray-500 mb-1";

/** Logo do credor resolvido: undefined = logo do app. */
const srcLogo = (logoUrl: string | null | undefined) =>
  logoUrl === undefined ? logoApp : logoUrl;

const LogoBox: React.FC<{ src: string | null; className?: string; apagado?: boolean }> = ({
  src,
  className = "w-14 h-10",
  apagado,
}) => (
  <div
    className={`${className} shrink-0 flex items-center justify-center rounded-lg bg-white dark:bg-dark-bg-tertiary border border-gray-100 dark:border-dark-border overflow-hidden`}
  >
    {src ? (
      <img
        src={src}
        alt=""
        className={`max-h-full max-w-full object-contain p-1 ${apagado ? "opacity-70" : ""}`}
      />
    ) : (
      <ImageOff className="w-4 h-4 text-gray-300" />
    )}
  </div>
);

/** Libera a URL temporária de um logo escolhido e não salvo. */
const useLiberarPreview = (logo: Logo) => {
  useEffect(() => {
    const url = logo.arquivo ? logo.preview : null;
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [logo.arquivo, logo.preview]);
};

const CamposDados: React.FC<{ dados: Dados; onChange: (d: Dados) => void }> = ({
  dados,
  onChange,
}) => {
  const set = (k: keyof Dados) => (e: React.ChangeEvent<HTMLInputElement>) =>
    onChange({ ...dados, [k]: e.target.value });
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-3">
      <div className="col-span-2">
        <label className={labelCls}>Nome da empresa (credor no Termo)</label>
        <input type="text" value={dados.empresaNome} onChange={set("empresaNome")} className={inputCls} />
      </div>
      <div>
        <label className={labelCls}>CNPJ</label>
        <input
          type="text"
          inputMode="numeric"
          value={dados.empresaCnpj}
          onChange={set("empresaCnpj")}
          className={inputCls}
        />
      </div>
      <div>
        <label className={labelCls}>Chave Pix</label>
        <input type="text" value={dados.empresaChavePix} onChange={set("empresaChavePix")} className={inputCls} />
      </div>
      <div className="col-span-2">
        <label className={labelCls}>Endereço</label>
        <input type="text" value={dados.empresaEndereco} onChange={set("empresaEndereco")} className={inputCls} />
      </div>
    </div>
  );
};

const CampoLogo: React.FC<{
  logo: Logo;
  onChange: (l: Logo) => void;
  onErro: (msg: string) => void;
}> = ({ logo, onChange, onErro }) => (
  <div className="flex flex-wrap items-center gap-3">
    <LogoBox src={logo.preview} className="w-28 h-14" />
    <label className="px-3 py-1.5 text-xs font-bold rounded-lg border border-gray-200 dark:border-dark-border text-gray-600 dark:text-dark-text-secondary hover:border-indigo-300 cursor-pointer flex items-center gap-1">
      <Upload className="w-3.5 h-3.5" />
      {logo.preview ? "Trocar" : "Escolher arquivo"}
      <input
        type="file"
        accept="image/png,image/jpeg"
        className="hidden"
        onChange={(e) => {
          const arquivo = e.target.files?.[0];
          e.target.value = "";
          if (!arquivo) return;
          const erro = validarArquivo(arquivo);
          if (erro) return onErro(erro);
          onErro("");
          onChange({ path: logo.path, arquivo, preview: URL.createObjectURL(arquivo) });
        }}
      />
    </label>
    {logo.preview && (
      <button
        type="button"
        onClick={() => onChange(LOGO_VAZIO)}
        className="text-xs text-gray-400 hover:text-red-600"
      >
        Tirar logo
      </button>
    )}
    <span className="text-[11px] text-gray-400 w-full">
      PNG ou JPG, até 1 MB. Fundo transparente ou branco fica melhor no PDF.
    </span>
  </div>
);

/** Prévia de como o credor sai no Termo/Resumo e na etapa do Pix. */
const Previa: React.FC<{ credor: Pick<CredorAcordo, "empresaNome" | "empresaCnpj" | "empresaEndereco" | "empresaChavePix">; logo: string | null }> = ({
  credor,
  logo,
}) => (
  <div className="space-y-2">
    <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400">
      Como sai no acordo
    </p>
    <div className="rounded-xl border border-gray-200 dark:border-dark-border overflow-hidden bg-white">
      <div className="h-1 bg-indigo-600" />
      <div className="p-3 space-y-3">
        <div className="h-8 flex items-center">
          {logo ? (
            <img src={logo} alt="" className="max-h-8 max-w-[10rem] object-contain" />
          ) : (
            <span className="text-[11px] text-gray-300">sem logo</span>
          )}
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase text-indigo-700">Credor(a)</p>
          <p className="text-xs font-bold text-gray-800 break-words">
            {credor.empresaNome || "—"}
          </p>
          <p className="text-[11px] text-gray-500">
            CNPJ: {formatCnpj(credor.empresaCnpj) || "—"}
          </p>
          {credor.empresaEndereco && (
            <p className="text-[11px] text-gray-500 break-words">{credor.empresaEndereco}</p>
          )}
        </div>
        <div className="flex items-center gap-2 p-2 rounded-lg bg-gray-50">
          <QrCode className="w-8 h-8 text-gray-300 shrink-0" />
          <p className="text-[11px] text-gray-500 min-w-0">
            Pix para <strong className="text-gray-700">{credor.empresaNome || "—"}</strong>
            <br />
            <span className="break-all">{credor.empresaChavePix || "sem chave"}</span>
          </p>
        </div>
      </div>
    </div>
  </div>
);

/** Escolha "Seguir a marca" × "Próprio desta loja". */
const Alternar: React.FC<{
  proprio: boolean;
  onChange: (v: boolean) => void;
  rotuloProprio: string;
}> = ({ proprio, onChange, rotuloProprio }) => (
  <div className="inline-flex rounded-lg bg-gray-100 dark:bg-dark-bg-tertiary p-0.5 text-xs font-bold">
    {[
      { v: false, l: "Seguir a marca" },
      { v: true, l: rotuloProprio },
    ].map((o) => (
      <button
        key={String(o.v)}
        type="button"
        onClick={() => onChange(o.v)}
        className={`px-3 py-1.5 rounded-md transition-colors ${
          proprio === o.v
            ? "bg-white dark:bg-dark-bg-secondary text-indigo-700 dark:text-indigo-300 shadow-sm"
            : "text-gray-500"
        }`}
      >
        {o.l}
      </button>
    ))}
  </div>
);

const ModalBase: React.FC<{
  titulo: string;
  subtitulo?: string;
  onFechar: () => void;
  rodape: React.ReactNode;
  children: React.ReactNode;
}> = ({ titulo, subtitulo, onFechar, rodape, children }) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onFechar();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onFechar]);
  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[100]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onFechar();
      }}
    >
      <div className="bg-white dark:bg-dark-bg rounded-2xl w-full max-w-4xl shadow-2xl overflow-hidden border border-gray-200 dark:border-dark-border max-h-[90vh] flex flex-col">
        <div className="px-6 py-4 border-b border-gray-100 dark:border-dark-border flex items-center justify-between gap-3 bg-gray-50 dark:bg-dark-bg-secondary shrink-0">
          <div className="min-w-0">
            <h3 className="font-bold text-gray-900 dark:text-dark-text truncate">{titulo}</h3>
            {subtitulo && <p className="text-xs text-gray-500 truncate">{subtitulo}</p>}
          </div>
          <button
            type="button"
            onClick={onFechar}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-dark-bg-tertiary"
            aria-label="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6 overflow-y-auto grid grid-cols-1 md:grid-cols-[1fr_18rem] gap-6">
          {children}
        </div>
        <div className="px-6 py-4 border-t border-gray-100 dark:border-dark-border flex flex-wrap items-center gap-2 shrink-0">
          {rodape}
        </div>
      </div>
    </div>
  );
};

const BotoesRodape: React.FC<{
  salvando: boolean;
  onCancelar: () => void;
  onSalvar: () => void;
  rotulo: string;
}> = ({ salvando, onCancelar, onSalvar, rotulo }) => (
  <div className="ml-auto flex items-center gap-2">
    <button
      type="button"
      disabled={salvando}
      onClick={onCancelar}
      className="px-4 py-2 text-sm font-bold rounded-xl text-gray-600 dark:text-dark-text-secondary hover:bg-gray-100 dark:hover:bg-dark-bg-tertiary"
    >
      Cancelar
    </button>
    <button
      type="button"
      disabled={salvando}
      onClick={onSalvar}
      className="px-5 py-2 bg-indigo-600 text-white text-sm font-bold rounded-xl hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-1.5"
    >
      {salvando ? (
        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
      ) : (
        <Save className="w-4 h-4" />
      )}
      {rotulo}
    </button>
  </div>
);

const Erro: React.FC<{ msg: string }> = ({ msg }) =>
  msg ? (
    <div className="p-2.5 bg-red-50 border border-red-100 text-red-600 text-sm rounded-lg flex items-center gap-2">
      <AlertCircle className="w-4 h-4 shrink-0" />
      {msg}
    </div>
  ) : null;

// ---------------------------------------------------------------------------

const MarcasLojasConfig: React.FC = () => {
  const {
    cadastroCredor,
    criarMarca,
    definirCredorMarca,
    definirMarcaDaLoja,
    definirCredorAcordoLoja,
    enviarLogo,
  } = useCollection();
  const { marcas, credoresMarca, credoresLoja, lojaMarca, padrao } = cadastroCredor;

  const [lojasCarteira, setLojasCarteira] = useState<string[]>([]);
  const [erroLojas, setErroLojas] = useState("");

  useEffect(() => {
    void (async () => {
      const { data, error } = await supabase.rpc("lojas_carteira");
      if (error) {
        console.error("Erro ao carregar lojas:", error);
        setErroLojas("Não foi possível carregar a lista de lojas.");
        return;
      }
      setLojasCarteira(((data ?? []) as { loja: string }[]).map((l) => l.loja));
    })();
  }, []);

  // Loja que já teve marca/exceção mas saiu da carteira continua listada.
  const todasLojas = useMemo(() => {
    const set = new Set(lojasCarteira.filter(Boolean));
    lojaMarca.forEach((_, l) => set.add(l));
    credoresLoja.forEach((c) => set.add(c.nomeDaLoja));
    return Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [lojasCarteira, lojaMarca, credoresLoja]);

  const lojasPorMarca = useMemo(() => {
    const map = new Map<string | null, string[]>();
    todasLojas.forEach((l) => {
      const m = lojaMarca.get(l) ?? null;
      map.set(m, [...(map.get(m) ?? []), l]);
    });
    return map;
  }, [todasLojas, lojaMarca]);

  const nomePadrao = padrao?.empresaNome || "empresa padrão";

  // ---------- Marca ----------
  const [marcaAberta, setMarcaAberta] = useState<Marca | null>(null);
  const [marcaDados, setMarcaDados] = useState<Dados>(DADOS_VAZIOS);
  const [marcaLogo, setMarcaLogo] = useState<Logo>(LOGO_VAZIO);
  useLiberarPreview(marcaLogo);

  const [novaMarca, setNovaMarca] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  const abrirMarca = (m: Marca) => {
    const c = credorMarcaVigente(credoresMarca, m.id);
    setErro("");
    setMarcaAberta(m);
    setMarcaDados(dadosDe(c));
    setMarcaLogo({ path: c?.logoPath ?? "", preview: c?.logoUrl ?? null, arquivo: null });
  };

  const salvarMarca = async () => {
    if (!marcaAberta) return;
    setErro("");
    if (temAlgumDado(marcaDados) && !dadosCompletos(marcaDados)) {
      setErro("Preencha nome, CNPJ e chave Pix — ou deixe os dados em branco para as lojas usarem a empresa padrão.");
      return;
    }
    setSalvando(true);
    try {
      const logoPath = marcaLogo.arquivo
        ? await enviarLogo(`marca-${marcaAberta.nome}`, marcaLogo.arquivo)
        : marcaLogo.path;
      await definirCredorMarca({ marcaId: marcaAberta.id, ...marcaDados, logoPath });
      setMarcaAberta(null);
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro ao salvar a marca.");
    } finally {
      setSalvando(false);
    }
  };

  const salvarNovaMarca = async () => {
    const nome = (novaMarca ?? "").trim();
    if (!nome) return;
    setErro("");
    setSalvando(true);
    try {
      const m = await criarMarca(nome);
      setNovaMarca(null);
      abrirMarca(m);
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro ao criar a marca.");
    } finally {
      setSalvando(false);
    }
  };

  // ---------- Loja ----------
  const [lojaAberta, setLojaAberta] = useState<string | null>(null);
  const [lojaMarcaId, setLojaMarcaId] = useState<string>("");
  const [dadosProprios, setDadosProprios] = useState(false);
  const [logoPropria, setLogoPropria] = useState(false);
  const [lojaDados, setLojaDados] = useState<Dados>(DADOS_VAZIOS);
  const [lojaLogo, setLojaLogo] = useState<Logo>(LOGO_VAZIO);
  useLiberarPreview(lojaLogo);

  const sugestaoMarca = (loja: string) =>
    marcas.find((m) => m.nome.localeCompare(redeDaLoja(loja), "pt-BR", { sensitivity: "base" }) === 0);

  const abrirLoja = (loja: string) => {
    const exc = credorLojaVigente(credoresLoja, loja);
    setErro("");
    setLojaAberta(loja);
    setLojaMarcaId(lojaMarca.get(loja) ?? sugestaoMarca(loja)?.id ?? "");
    setDadosProprios(!!exc?.empresaNome);
    setLogoPropria(!!exc?.logoPath);
    setLojaDados(dadosDe(exc));
    setLojaLogo({ path: exc?.logoPath ?? "", preview: exc?.logoUrl ?? null, arquivo: null });
  };

  // Prévia da loja com o que está no formulário (marca escolhida + exceções).
  const previaLoja = useMemo(() => {
    if (!lojaAberta) return null;
    const marcaCredor = credorMarcaVigente(credoresMarca, lojaMarcaId || null);
    const base = resolverCredorAcordo(
      { ...cadastroCredor, credoresLoja: [], lojaMarca: new Map(lojaMarcaId ? [[lojaAberta, lojaMarcaId]] : []) },
      lojaAberta,
    );
    const credor = dadosProprios ? { ...lojaDados } : base;
    let logo: string | null;
    if (logoPropria) logo = lojaLogo.preview;
    else if (marcaCredor?.logoUrl) logo = marcaCredor.logoUrl;
    else logo = !dadosProprios && base.origemDados === "padrao" ? logoApp : null;
    return { credor, logo, origemBase: base.origemDados };
  }, [lojaAberta, lojaMarcaId, dadosProprios, logoPropria, lojaDados, lojaLogo.preview, credoresMarca, cadastroCredor]);

  const salvarLoja = async () => {
    if (!lojaAberta) return;
    setErro("");
    if (dadosProprios && !dadosCompletos(lojaDados)) {
      setErro("Preencha nome, CNPJ e chave Pix da loja.");
      return;
    }
    if (logoPropria && !lojaLogo.preview) {
      setErro("Escolha a logo da loja ou volte para \"Seguir a marca\".");
      return;
    }
    setSalvando(true);
    try {
      const marcaAtual = lojaMarca.get(lojaAberta) ?? "";
      if (lojaMarcaId !== marcaAtual) {
        await definirMarcaDaLoja(lojaAberta, lojaMarcaId || null);
      }

      const exc = credorLojaVigente(credoresLoja, lojaAberta);
      const dados = dadosProprios ? lojaDados : DADOS_VAZIOS;
      const logoPath = !logoPropria
        ? ""
        : lojaLogo.arquivo
          ? await enviarLogo(`loja-${lojaAberta}`, lojaLogo.arquivo)
          : lojaLogo.path;
      const atual = { ...dadosDe(exc), logoPath: exc?.logoPath ?? "" };
      const novo = {
        empresaNome: dados.empresaNome.trim(),
        empresaCnpj: dados.empresaCnpj.trim(),
        empresaEndereco: dados.empresaEndereco.trim(),
        empresaChavePix: dados.empresaChavePix.trim(),
        logoPath,
      };
      const mudou = (Object.keys(novo) as (keyof typeof novo)[]).some(
        (k) => novo[k] !== (atual[k] ?? "").trim(),
      );
      if (mudou) {
        await definirCredorAcordoLoja({ nomeDaLoja: lojaAberta, ...novo });
      }
      setLojaAberta(null);
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro ao salvar a loja.");
    } finally {
      setSalvando(false);
    }
  };

  const fecharModal = () => {
    if (salvando) return;
    setMarcaAberta(null);
    setLojaAberta(null);
  };

  const cardCls =
    "bg-white dark:bg-dark-bg-secondary border border-gray-200 dark:border-dark-border rounded-2xl p-5 space-y-4";

  const grupos: { marca: Marca | null; lojas: string[] }[] = [
    ...marcas.map((m) => ({ marca: m, lojas: lojasPorMarca.get(m.id) ?? [] })),
    ...(lojasPorMarca.get(null)?.length
      ? [{ marca: null, lojas: lojasPorMarca.get(null) ?? [] }]
      : []),
  ];

  return (
    <>
      {/* ---------- Marcas ---------- */}
      <section className={cardCls}>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 className="flex items-center gap-2 text-sm font-bold text-gray-700 dark:text-dark-text">
              <Tags className="w-4 h-4 text-indigo-500" />
              Marcas
            </h3>
            <p className="mt-1 text-xs text-gray-500 dark:text-dark-text-secondary max-w-2xl">
              Logo, nome, CNPJ e Pix cadastrados uma vez por marca valem para
              todas as lojas dela. Trocar aqui atualiza as lojas de uma vez
              (Termos já emitidos não mudam).
            </p>
          </div>
          {novaMarca === null ? (
            <button
              type="button"
              onClick={() => {
                setErro("");
                setNovaMarca("");
              }}
              className="px-3 py-1.5 text-xs font-bold rounded-lg border border-gray-200 dark:border-dark-border text-gray-600 dark:text-dark-text-secondary hover:border-indigo-300 flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" />
              Nova marca
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <input
                autoFocus
                type="text"
                placeholder="Nome da marca"
                value={novaMarca}
                onChange={(e) => setNovaMarca(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void salvarNovaMarca();
                  if (e.key === "Escape") setNovaMarca(null);
                }}
                className={`${inputCls} w-48`}
              />
              <button
                type="button"
                disabled={salvando || !novaMarca.trim()}
                onClick={() => void salvarNovaMarca()}
                className="px-3 py-2 bg-indigo-600 text-white text-xs font-bold rounded-lg disabled:opacity-40"
              >
                Criar
              </button>
              <button
                type="button"
                onClick={() => setNovaMarca(null)}
                className="p-2 text-gray-400 hover:text-gray-600"
                aria-label="Cancelar"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        {!marcaAberta && !lojaAberta && <Erro msg={erro} />}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {marcas.map((m) => {
            const c = credorMarcaVigente(credoresMarca, m.id);
            const qtd = lojasPorMarca.get(m.id)?.length ?? 0;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => abrirMarca(m)}
                className="group text-left p-4 rounded-xl border border-gray-200 dark:border-dark-border hover:border-indigo-300 hover:bg-indigo-50/40 dark:hover:bg-dark-bg-tertiary transition-colors space-y-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <LogoBox src={c?.logoUrl ?? null} className="w-28 h-12" />
                  <Pencil className="w-3.5 h-3.5 text-gray-300 group-hover:text-indigo-500" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-gray-800 dark:text-dark-text truncate">
                    {m.nome}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-dark-text-secondary truncate">
                    {c?.empresaNome
                      ? `${c.empresaNome} · CNPJ ${formatCnpj(c.empresaCnpj)}`
                      : `Sem dados — usa ${nomePadrao}`}
                  </p>
                  {c?.empresaChavePix && (
                    <p className="text-[11px] text-gray-400 truncate">Pix {c.empresaChavePix}</p>
                  )}
                </div>
                <p className="text-[11px] font-bold text-indigo-600">
                  {qtd} {qtd === 1 ? "loja" : "lojas"}
                </p>
              </button>
            );
          })}
        </div>
      </section>

      {/* ---------- Lojas ---------- */}
      <section className={cardCls}>
        <div>
          <h3 className="flex items-center gap-2 text-sm font-bold text-gray-700 dark:text-dark-text">
            <Store className="w-4 h-4 text-indigo-500" />
            Lojas
          </h3>
          <p className="mt-1 text-xs text-gray-500 dark:text-dark-text-secondary max-w-2xl">
            Cada loja segue a marca. Abra uma loja para trocar a marca dela ou
            abrir uma exceção (dados ou logo só dela).
          </p>
        </div>

        {erroLojas && <p className="text-sm text-red-600">{erroLojas}</p>}

        {grupos.map(({ marca, lojas }) =>
          lojas.length === 0 ? null : (
            <div key={marca?.id ?? "sem-marca"} className="space-y-2">
              <p
                className={`text-[11px] font-bold uppercase tracking-wide ${
                  marca ? "text-gray-400" : "text-amber-600"
                }`}
              >
                {marca ? marca.nome : "Sem marca — escolha a marca destas lojas"}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
                {lojas.map((loja) => {
                  const r = resolverCredorAcordo(cadastroCredor, loja);
                  const excecao = r.origemDados === "loja" || r.origemLogo === "loja";
                  return (
                    <button
                      key={loja}
                      type="button"
                      onClick={() => abrirLoja(loja)}
                      className="group text-left flex items-center gap-3 p-3 rounded-xl border border-gray-200 dark:border-dark-border hover:border-indigo-300 hover:bg-indigo-50/40 dark:hover:bg-dark-bg-tertiary transition-colors"
                    >
                      <LogoBox src={srcLogo(r.logoUrl)} apagado={r.origemLogo !== "loja"} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <p className="text-sm font-bold text-gray-800 dark:text-dark-text truncate">
                            {nomeCurtoLoja(loja)}
                          </p>
                          <span
                            className={`shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                              !marca
                                ? "bg-amber-50 text-amber-700"
                                : excecao
                                  ? "bg-violet-50 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300"
                                  : "bg-gray-100 text-gray-500 dark:bg-dark-bg-tertiary"
                            }`}
                          >
                            {!marca ? "Sem marca" : excecao ? "Exceção" : "Segue a marca"}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 dark:text-dark-text-secondary truncate">
                          {r.empresaNome || "—"}
                        </p>
                      </div>
                      <Pencil className="w-3.5 h-3.5 shrink-0 text-gray-300 group-hover:text-indigo-500" />
                    </button>
                  );
                })}
              </div>
            </div>
          ),
        )}
      </section>

      {/* ---------- Modal da marca ---------- */}
      {marcaAberta && (
        <ModalBase
          titulo={marcaAberta.nome}
          subtitulo={`Marca · ${lojasPorMarca.get(marcaAberta.id)?.length ?? 0} lojas seguem estes dados`}
          onFechar={fecharModal}
          rodape={
            <BotoesRodape
              salvando={salvando}
              onCancelar={fecharModal}
              onSalvar={() => void salvarMarca()}
              rotulo="Salvar marca"
            />
          }
        >
          <div className="space-y-4">
            <Erro msg={erro} />
            <CamposDados dados={marcaDados} onChange={setMarcaDados} />
            <div>
              <label className={labelCls}>Logo</label>
              <CampoLogo logo={marcaLogo} onChange={setMarcaLogo} onErro={setErro} />
            </div>
            {!temAlgumDado(marcaDados) && (
              <p className="text-[11px] text-gray-400">
                Sem nome/CNPJ/Pix, as lojas desta marca usam os dados de{" "}
                {nomePadrao}.
              </p>
            )}
          </div>
          <Previa
            credor={temAlgumDado(marcaDados) ? marcaDados : dadosDe(padrao)}
            logo={
              marcaLogo.preview ?? (temAlgumDado(marcaDados) ? null : logoApp)
            }
          />
        </ModalBase>
      )}

      {/* ---------- Modal da loja ---------- */}
      {lojaAberta && previaLoja && (
        <ModalBase
          titulo={nomeCurtoLoja(lojaAberta)}
          subtitulo={lojaAberta}
          onFechar={fecharModal}
          rodape={
            <BotoesRodape
              salvando={salvando}
              onCancelar={fecharModal}
              onSalvar={() => void salvarLoja()}
              rotulo="Salvar loja"
            />
          }
        >
          <div className="space-y-5">
            <Erro msg={erro} />
            <div>
              <label className={labelCls}>Marca</label>
              <select
                value={lojaMarcaId}
                onChange={(e) => setLojaMarcaId(e.target.value)}
                className={inputCls}
              >
                <option value="">Sem marca (usa {nomePadrao})</option>
                {marcas.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nome}
                  </option>
                ))}
              </select>
              {!lojaMarca.get(lojaAberta) && lojaMarcaId && (
                <p className="mt-1 text-[11px] text-amber-600">
                  Marca sugerida pelo nome da loja — confira e salve.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-bold text-gray-500">Nome, CNPJ e Pix</span>
                <Alternar
                  proprio={dadosProprios}
                  onChange={setDadosProprios}
                  rotuloProprio="Próprios desta loja"
                />
              </div>
              {dadosProprios ? (
                <CamposDados dados={lojaDados} onChange={setLojaDados} />
              ) : (
                <p className="text-xs text-gray-500 dark:text-dark-text-secondary">
                  {previaLoja.origemBase === "marca"
                    ? "Usa os dados da marca."
                    : `Usa os dados de ${nomePadrao}.`}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-bold text-gray-500">Logo</span>
                <Alternar
                  proprio={logoPropria}
                  onChange={setLogoPropria}
                  rotuloProprio="Própria desta loja"
                />
              </div>
              {logoPropria ? (
                <CampoLogo logo={lojaLogo} onChange={setLojaLogo} onErro={setErro} />
              ) : (
                <p className="text-xs text-gray-500 dark:text-dark-text-secondary">
                  Usa a logo da marca.
                </p>
              )}
            </div>
          </div>
          <Previa credor={previaLoja.credor} logo={previaLoja.logo} />
        </ModalBase>
      )}
    </>
  );
};

export default MarcasLojasConfig;
