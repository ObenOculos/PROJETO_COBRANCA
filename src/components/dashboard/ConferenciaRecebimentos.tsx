import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  FileSpreadsheet,
  FileText,
  Info,
  Printer,
  Scale,
  Search,
  X,
} from "lucide-react";
import {
  DadosRelatorio,
  exportarExcel,
  exportarTxt,
  imprimir,
} from "./conferenciaRelatorio";
import { useCollection } from "../../contexts/CollectionContext";
import { useAuth } from "../../contexts/AuthContext";
import { ClientGroup } from "../../types";
import ClientDetailModal from "./ClientDetailModal";
import ConferenciaDetalhe from "./ConferenciaDetalhe";
import { supabase } from "../../lib/supabase";
import { fetchAllRows } from "../../utils/fetchAllRows";
import { formatCurrency } from "../../utils/formatters";
import { todayLocalStr } from "../../config/visitStatus";
import {
  classificarConferencia,
  CONFERENCIA_GRUPO,
  CONFERENCIA_GRUPO_DICA,
  CONFERENCIA_GRUPO_LABEL,
  ConferenciaGrupo,
  ConferenciaSituacao,
  CONFERENCIA_SITUACAO_DICA,
  CONFERENCIA_SITUACAO_LABEL,
  ConferenciaEstadoMarcacao,
  ConferenciaMarcacao,
  estadoMarcacao,
} from "../../filters/conferenciaRecebimentos";

// Item 50: conferencia mensal do gestor -- base do app (BANCO_DADOS, atualizada
// todo dia pelo Ciclone e pelas lojas) x registrado pelos
// cobradores no app. Duas visoes (o gestor escolhe): todos os recebimentos
// (linha fica com quem registrou; sem registro, com o dono da carteira) ou so a
// carteira de cada cobrador. Dados da RPC conferencia_recebimentos (migration
// 20261111000004), uma linha por cobrador x cliente.
//
// Tela (2026-11-13): cobrador em chips no topo, busca por nome/CPF, cards de
// grupo (precisa conferir / provavel juros / confere) que filtram a lista, e
// uma lista unica de clientes logo abaixo.
//
// Etapa D: o gestor marca o cliente do mes como conferido (tabela
// conferencia_marcacoes, migration 20261113000005, so INSERT). Conferido e
// sem mudanca desde a marcacao sai de "Precisa conferir" e vai para "Ja
// conferidos"; se entrou baixa/registro novo depois, volta a pedir conferencia.

interface LinhaRpc {
  cobrador_id: string | null;
  carteira_id: string | null;
  documento: string | null;
  cliente: string | null;
  base_valor: number | string;
  base_parcelas: number;
  app_valor: number | string;
  app_lancamentos: number;
  app_cedrus: number | string;
  na_carteira: boolean;
}

type Visao = "todos" | "carteira";

interface LinhaCliente {
  chave: string;
  cobradorId: string | null;
  cobradorNome: string;
  carteiraId: string | null;
  documento: string;
  cliente: string;
  baseValor: number;
  baseParcelas: number;
  appValor: number;
  appLancamentos: number;
  appCedrus: number;
  situacao: ConferenciaSituacao;
  marcacao: ConferenciaEstadoMarcacao;
  ultima: ConferenciaMarcacao | undefined;
}

// Grupo da tela: os da regra + "conferido" (marcado pelo gestor).
type GrupoTela = ConferenciaGrupo | "conferido";

const grupoDe = (c: LinhaCliente): GrupoTela =>
  c.marcacao === "conferido" ? "conferido" : CONFERENCIA_GRUPO[c.situacao];

const GRUPO_TELA_LABEL: Record<GrupoTela, string> = {
  ...CONFERENCIA_GRUPO_LABEL,
  conferido: "Já conferidos",
};
const GRUPO_TELA_DICA: Record<GrupoTela, string> = {
  ...CONFERENCIA_GRUPO_DICA,
  conferido:
    "Marcados como conferidos pelo gestor neste mês, sem baixa ou registro novo depois.",
};

interface GrupoCobrador {
  id: string; // "" = sem cobrador (so na visao "todos")
  nome: string;
  // Lancado para cliente fora da carteira: so informacao, nao entra na
  // conferencia.
  foraQtd: number;
  foraValor: number;
  pendencias: number;
  clientes: LinhaCliente[];
}

const SITUACOES: ConferenciaSituacao[] = [
  "sem_registro_app",
  "base_maior",
  "sem_baixa_base",
  "app_maior",
  "confere",
];

const GRUPOS: GrupoTela[] = ["acao", "juros", "confere", "conferido"];

const SITUACAO_TONE: Record<ConferenciaSituacao, string> = {
  confere:
    "bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-300",
  sem_registro_app:
    "bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300",
  base_maior:
    "bg-orange-50 text-orange-700 dark:bg-orange-900/20 dark:text-orange-300",
  sem_baixa_base:
    "bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300",
  app_maior: "bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300",
};

// Card de grupo: borda/numero quando selecionado e quando nao.
const GRUPO_TONE: Record<GrupoTela, { ativo: string; numero: string }> = {
  conferido: {
    ativo:
      "border-teal-300 bg-teal-50 ring-1 ring-teal-200 dark:border-teal-700 dark:bg-teal-900/20 dark:ring-teal-800/50",
    numero: "text-teal-600 dark:text-teal-400",
  },
  acao: {
    ativo:
      "border-red-300 bg-red-50 ring-1 ring-red-200 dark:border-red-700 dark:bg-red-900/20 dark:ring-red-800/50",
    numero: "text-red-600 dark:text-red-400",
  },
  juros: {
    ativo:
      "border-blue-300 bg-blue-50 ring-1 ring-blue-200 dark:border-blue-700 dark:bg-blue-900/20 dark:ring-blue-800/50",
    numero: "text-blue-600 dark:text-blue-400",
  },
  confere: {
    ativo:
      "border-green-300 bg-green-50 ring-1 ring-green-200 dark:border-green-700 dark:bg-green-900/20 dark:ring-green-800/50",
    numero: "text-green-600 dark:text-green-400",
  },
};

const POR_PAGINA = 50;

const MESES = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

/** "2026-11" -> { inicio: "2026-11-01", fim: "2026-11-30" }, sem Date local. */
const limitesDoMes = (mes: string): { inicio: string; fim: string } => {
  const [y, m] = mes.split("-").map(Number);
  const ultimo = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const mm = String(m).padStart(2, "0");
  return {
    inicio: `${y}-${mm}-01`,
    fim: `${y}-${mm}-${String(ultimo).padStart(2, "0")}`,
  };
};

const somarMes = (mes: string, delta: number): string => {
  const [y, m] = mes.split("-").map(Number);
  const total = y * 12 + (m - 1) + delta;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
};

const rotuloMes = (mes: string): string => {
  const [y, m] = mes.split("-").map(Number);
  const nome = MESES[m - 1];
  return `${nome.charAt(0).toUpperCase()}${nome.slice(1)} de ${y}`;
};

const num = (v: number | string | null | undefined): number =>
  typeof v === "number" ? v : Number(v ?? 0) || 0;

/** Minusculo e sem acento, para a busca por nome. */
const normalizar = (s: string): string =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const Diferenca: React.FC<{ valor: number }> = ({ valor }) => {
  if (Math.abs(valor) < 0.005)
    return (
      <span className="text-gray-400 dark:text-dark-text-secondary">—</span>
    );
  return (
    <span
      className={
        valor > 0
          ? "text-blue-600 dark:text-blue-400"
          : "text-red-600 dark:text-red-400"
      }
    >
      {valor > 0 ? "+" : ""}
      {formatCurrency(valor)}
    </span>
  );
};

const ConferenciaRecebimentos: React.FC = () => {
  const { users, getClientGroups } = useCollection();
  const { user } = useAuth();
  // Linha com o detalhe aberto (chave da linha) e Ficha aberta.
  const [aberta, setAberta] = useState<string | null>(null);
  const [ficha, setFicha] = useState<ClientGroup | null>(null);
  const [mes, setMes] = useState(() => todayLocalStr().slice(0, 7));
  const [linhas, setLinhas] = useState<LinhaRpc[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [infoOpen, setInfoOpen] = useState(false);
  // null = todos os cobradores; "" = "Sem cobrador".
  const [cobradorSel, setCobradorSel] = useState<string | null>(null);
  const [grupoFiltro, setGrupoFiltro] = useState<GrupoTela | "todos">("acao");
  // Marcacoes do mes (historico; vale a ultima por cliente). null = carregando.
  const [marcacoes, setMarcacoes] = useState<ConferenciaMarcacao[] | null>(
    null,
  );
  const [versaoMarcacoes, setVersaoMarcacoes] = useState(0);
  const [situacaoFiltro, setSituacaoFiltro] =
    useState<ConferenciaSituacao | null>(null);
  const [busca, setBusca] = useState("");
  const [pagina, setPagina] = useState(1);
  const [exportAberto, setExportAberto] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);
  const [visao, setVisao] = useState<Visao>(() => {
    try {
      return localStorage.getItem("conferenciaVisao") === "carteira"
        ? "carteira"
        : "todos";
    } catch {
      return "todos";
    }
  });
  const trocarVisao = (v: Visao) => {
    setVisao(v);
    try {
      localStorage.setItem("conferenciaVisao", v);
    } catch {
      // sem storage: so nao lembra a escolha
    }
  };

  useEffect(() => {
    let cancelado = false;
    setLinhas(null);
    setErro(null);
    const { inicio, fim } = limitesDoMes(mes);
    (async () => {
      try {
        const dados = await fetchAllRows<LinhaRpc>((from, to) =>
          supabase
            .rpc("conferencia_recebimentos", {
              p_inicio: inicio,
              p_fim: fim,
              p_so_carteira: visao === "carteira",
            })
            // Ordem unica para a paginacao (CLAUDE.md): documento + cobrador.
            .order("documento")
            .order("cobrador_id")
            .range(from, to),
        );
        if (!cancelado) setLinhas(dados);
      } catch (e) {
        console.error("Erro ao carregar conferência de recebimentos:", e);
        if (!cancelado)
          setErro(e instanceof Error ? e.message : "Falha ao carregar");
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [mes, visao]);

  useEffect(() => {
    let cancelado = false;
    const { inicio } = limitesDoMes(mes);
    (async () => {
      try {
        const dados = await fetchAllRows<ConferenciaMarcacao>((from, to) =>
          supabase
            .from("conferencia_marcacoes")
            .select("*")
            .eq("mes", inicio)
            .order("created_at")
            .order("id")
            .range(from, to)
            .returns<ConferenciaMarcacao[]>(),
        );
        if (!cancelado) setMarcacoes(dados);
      } catch (e) {
        // Sem a tabela (migration nao aplicada) a conferencia segue sem
        // marcacoes; o detalhe avisa ao tentar marcar.
        console.error("Erro ao carregar marcações da conferência:", e);
        if (!cancelado) setMarcacoes([]);
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [mes, versaoMarcacoes]);

  // Historico por documento, em ordem de registro (a ultima vale).
  const marcacoesPorDoc = useMemo(() => {
    const m = new Map<string, ConferenciaMarcacao[]>();
    (marcacoes ?? []).forEach((x) => {
      const lista = m.get(x.documento);
      if (lista) lista.push(x);
      else m.set(x.documento, [x]);
    });
    return m;
  }, [marcacoes]);

  const marcar = async (
    c: LinhaCliente,
    acao: "conferido" | "reaberto",
    observacao: string,
  ) => {
    if (!user?.id) throw new Error("Sessão sem usuário.");
    const r2 = (v: number) => Math.round(v * 100) / 100;
    const { error, status } = await supabase
      .from("conferencia_marcacoes")
      .insert({
        mes: limitesDoMes(mes).inicio,
        documento: c.documento,
        acao,
        observacao: observacao.trim() || null,
        visao,
        base_valor: r2(c.baseValor),
        app_valor: r2(c.appValor),
        registrado_por_id: user.id,
      });
    // Insert sem retorno: tabela inexistente volta 404 com erro vazio.
    if (error)
      throw {
        code: error.code || (status === 404 ? "PGRST205" : undefined),
        message: error.message || `HTTP ${status}`,
      };
    setVersaoMarcacoes((v) => v + 1);
  };

  // Lista volta a 1a pagina quando o recorte muda.
  useEffect(() => {
    setPagina(1);
  }, [mes, visao, cobradorSel, grupoFiltro, situacaoFiltro, busca]);

  // Menu de exportar fecha ao clicar fora.
  useEffect(() => {
    if (!exportAberto) return;
    const fora = (e: MouseEvent) => {
      if (exportRef.current && !exportRef.current.contains(e.target as Node))
        setExportAberto(false);
    };
    document.addEventListener("mousedown", fora);
    return () => document.removeEventListener("mousedown", fora);
  }, [exportAberto]);

  const nomePorId = useMemo(() => {
    const m = new Map<string, string>();
    users.forEach((u) => m.set(u.id, u.name));
    return m;
  }, [users]);

  const grupos = useMemo<GrupoCobrador[]>(() => {
    if (!linhas) return [];
    const porCobrador = new Map<string, GrupoCobrador>();
    linhas.forEach((l, i) => {
      const baseValor = num(l.base_valor);
      const appValor = num(l.app_valor);
      const id = l.cobrador_id ?? "";
      let g = porCobrador.get(id);
      if (!g) {
        g = {
          id,
          nome: id ? (nomePorId.get(id) ?? "Usuário removido") : "Sem cobrador",
          foraQtd: 0,
          foraValor: 0,
          pendencias: 0,
          clientes: [],
        };
        porCobrador.set(id, g);
      }
      if (!l.na_carteira) {
        g.foraQtd++;
        g.foraValor += appValor;
        return;
      }
      const situacao = classificarConferencia(baseValor, appValor);
      const historico = marcacoesPorDoc.get(l.documento ?? "");
      const ultima = historico?.[historico.length - 1];
      const marcacao = estadoMarcacao(ultima, visao, baseValor, appValor);
      if (marcacao !== "conferido" && CONFERENCIA_GRUPO[situacao] === "acao")
        g.pendencias++;
      g.clientes.push({
        chave: `${l.documento ?? ""}:${id}:${i}`,
        cobradorId: l.cobrador_id,
        cobradorNome: g.nome,
        carteiraId: l.carteira_id,
        documento: l.documento ?? "",
        cliente: l.cliente ?? "(sem nome)",
        baseValor,
        baseParcelas: l.base_parcelas,
        appValor,
        appLancamentos: l.app_lancamentos,
        appCedrus: num(l.app_cedrus),
        situacao,
        marcacao,
        ultima,
      });
    });
    // "Sem cobrador" por ultimo; os demais pelo nome.
    return Array.from(porCobrador.values())
      .filter((g) => g.clientes.length > 0 || g.foraQtd > 0)
      .sort((a, b) => {
        if (!a.id !== !b.id) return a.id ? -1 : 1;
        return a.nome.localeCompare(b.nome, "pt-BR");
      });
  }, [linhas, nomePorId, marcacoesPorDoc, visao]);

  // Cobrador escolhido que sumiu (troca de mes/visao) volta para "Todos".
  const cobradorAtual =
    cobradorSel !== null && grupos.some((g) => g.id === cobradorSel)
      ? cobradorSel
      : null;
  const grupoAtual =
    cobradorAtual === null ? null : grupos.find((g) => g.id === cobradorAtual);

  // Clientes do cobrador escolhido (ou de todos) que passam na busca.
  const escopo = useMemo<LinhaCliente[]>(() => {
    const base =
      grupoAtual != null
        ? grupoAtual.clientes
        : grupos.flatMap((g) => g.clientes);
    const termo = busca.trim();
    if (!termo) return base;
    const digitos = termo.replace(/\D/g, "");
    const texto = normalizar(termo);
    return base.filter(
      (c) =>
        normalizar(c.cliente).includes(texto) ||
        (digitos.length >= 3 &&
          c.documento.replace(/\D/g, "").includes(digitos)),
    );
  }, [grupos, grupoAtual, busca]);

  const resumo = useMemo(() => {
    const r = {
      base: 0,
      app: 0,
      cedrus: 0,
      porGrupo: { acao: 0, juros: 0, confere: 0, conferido: 0 } as Record<
        GrupoTela,
        number
      >,
      porSituacao: {
        confere: 0,
        sem_registro_app: 0,
        sem_baixa_base: 0,
        app_maior: 0,
        base_maior: 0,
      } as Record<ConferenciaSituacao, number>,
    };
    escopo.forEach((c) => {
      r.base += c.baseValor;
      r.app += c.appValor;
      r.cedrus += c.appCedrus;
      const grupo = grupoDe(c);
      r.porGrupo[grupo]++;
      // Sub-chips de situacao contam so dentro do grupo escolhido.
      if (grupoFiltro === "todos" || grupo === grupoFiltro)
        r.porSituacao[c.situacao]++;
    });
    return r;
  }, [escopo, grupoFiltro]);

  const lista = useMemo(() => {
    return escopo
      .filter(
        (c) =>
          (grupoFiltro === "todos" || grupoDe(c) === grupoFiltro) &&
          (situacaoFiltro === null || c.situacao === situacaoFiltro),
      )
      .sort(
        (a, b) =>
          SITUACOES.indexOf(a.situacao) - SITUACOES.indexOf(b.situacao) ||
          Math.abs(b.appValor - b.baseValor) -
            Math.abs(a.appValor - a.baseValor),
      );
  }, [escopo, grupoFiltro, situacaoFiltro]);

  const escolherGrupo = (g: GrupoTela | "todos") => {
    setGrupoFiltro(g);
    setSituacaoFiltro(null);
  };

  const totalPaginas = Math.max(1, Math.ceil(lista.length / POR_PAGINA));
  const paginaAtual = Math.min(pagina, totalPaginas);
  const listaPagina = lista.slice(
    (paginaAtual - 1) * POR_PAGINA,
    paginaAtual * POR_PAGINA,
  );

  // Visao "todos": registrado por alguem que nao e o dono da carteira.
  const carteiraDeOutro = (c: LinhaCliente): string =>
    visao === "todos" &&
    !!c.cobradorId &&
    c.appLancamentos > 0 &&
    c.carteiraId !== c.cobradorId
      ? c.carteiraId
        ? (nomePorId.get(c.carteiraId) ?? "outro")
        : "sem cobrador"
      : "";

  // "Conferido por Fulano em 13/11/2026 - obs" (ou mudou depois), para o relatorio.
  const textoMarcacao = (c: LinhaCliente): string => {
    if (!c.ultima || !c.marcacao) return "";
    const quem = nomePorId.get(c.ultima.registrado_por_id) ?? "gestor";
    const quando = new Date(c.ultima.created_at).toLocaleDateString("pt-BR");
    const obs = c.ultima.observacao ? ` — ${c.ultima.observacao}` : "";
    return `${c.marcacao === "mudou" ? "Conferido (valores mudaram depois)" : "Conferido"} por ${quem} em ${quando}${obs}`;
  };

  // Relatorio = a lista filtrada inteira (todas as paginas).
  const dadosRelatorio = (): DadosRelatorio => {
    const filtros: string[] = [];
    if (grupoAtual) filtros.push(`Cobrador: ${grupoAtual.nome}`);
    if (grupoFiltro !== "todos")
      filtros.push(`Grupo: ${GRUPO_TELA_LABEL[grupoFiltro]}`);
    if (situacaoFiltro)
      filtros.push(`Situação: ${CONFERENCIA_SITUACAO_LABEL[situacaoFiltro]}`);
    if (busca.trim()) filtros.push(`Busca: "${busca.trim()}"`);
    return {
      periodo: rotuloMes(mes),
      visao: visao === "carteira" ? "Só carteira" : "Todos os recebimentos",
      filtros,
      linhas: lista.map((c) => ({
        cliente: c.cliente,
        documento: c.documento,
        cobradorNome: c.cobradorNome,
        carteiraNome: carteiraDeOutro(c),
        situacao: c.situacao,
        baseValor: c.baseValor,
        baseParcelas: c.baseParcelas,
        appValor: c.appValor,
        appLancamentos: c.appLancamentos,
        appCedrus: c.appCedrus,
        conferencia: textoMarcacao(c),
      })),
      arquivo: `Conferencia_Recebimentos_${mes}${grupoAtual ? `_${grupoAtual.nome.replace(/[^\p{L}\p{N}]+/gu, "_")}` : ""}`,
    };
  };

  // Ficha do cliente pelo documento; null se o cliente nao esta carregado.
  const fichaDe = (documento: string): (() => void) | null => {
    const grupo = getClientGroups().find((g) => g.document === documento);
    return grupo ? () => setFicha(grupo) : null;
  };

  const pendenciasTotal = grupos.reduce((s, g) => s + g.pendencias, 0);
  const situacoesDoGrupo =
    grupoFiltro === "todos" || grupoFiltro === "conferido"
      ? []
      : SITUACOES.filter((s) => CONFERENCIA_GRUPO[s] === grupoFiltro);

  return (
    <div className="bg-white dark:bg-dark-bg-secondary rounded-2xl shadow-sm border border-gray-200 dark:border-dark-border p-4 lg:p-5 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h2 className="text-xl lg:text-2xl font-bold text-gray-900 dark:text-dark-text flex items-center">
          <Scale className="h-5 w-5 lg:h-6 lg:w-6 mr-2 text-blue-600 dark:text-blue-400 flex-shrink-0" />
          Conferência de recebimentos
          <span className="relative ml-1.5">
            <button
              onClick={() => setInfoOpen((v) => !v)}
              className="text-gray-300 hover:text-blue-600 dark:text-dark-text-secondary dark:hover:text-blue-400"
              aria-label="Como a conferência é feita"
            >
              <Info className="h-4 w-4" />
            </button>
            {infoOpen && (
              <div className="absolute z-20 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-xl border border-blue-100 dark:border-blue-800/40 bg-blue-50 dark:bg-blue-900/20 px-4 py-3 text-xs font-normal text-blue-700 dark:text-blue-300 shadow-lg space-y-1.5">
                <p>
                  <strong>Base</strong>: o recebido que a base do app registra
                  no mês (atualizada todo dia pelo Ciclone e pelas lojas), pela
                  data da baixa. Guarda só o principal, sem juros.
                </p>
                <p>
                  <strong>App</strong>: o que o cobrador registrou no mês
                  (pagamentos, acordos e estornos; inclui o importado do
                  Cedrus).
                </p>
                <p>
                  <strong>Todos os recebimentos</strong>: cada cliente fica com
                  quem registrou; se ninguém registrou, com o dono da carteira
                  (ou "Sem cobrador").
                </p>
                <p>
                  <strong>Só carteira</strong>: só os clientes e valores da
                  carteira de cada cobrador. Lançamento para cliente fora da
                  carteira aparece à parte e não entra na conferência.
                </p>
              </div>
            )}
          </span>
        </h2>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex bg-gray-100 dark:bg-dark-bg rounded-md p-0.5">
            {(
              [
                ["todos", "Todos os recebimentos"],
                ["carteira", "Só carteira"],
              ] as const
            ).map(([v, rotulo]) => (
              <button
                key={v}
                onClick={() => trocarVisao(v)}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-all whitespace-nowrap ${
                  visao === v
                    ? "bg-white dark:bg-dark-bg-secondary text-blue-600 dark:text-blue-400 shadow-sm"
                    : "text-gray-600 dark:text-dark-text-secondary hover:text-gray-900 dark:hover:text-dark-text"
                }`}
              >
                {rotulo}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setMes((m) => somarMes(m, -1))}
              className="p-1.5 rounded-md text-gray-500 hover:bg-gray-100 dark:text-dark-text-secondary dark:hover:bg-dark-bg"
              aria-label="Mês anterior"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="min-w-[9.5rem] text-center text-sm font-semibold text-gray-700 dark:text-dark-text">
              {rotuloMes(mes)}
            </span>
            <button
              onClick={() => setMes((m) => somarMes(m, 1))}
              className="p-1.5 rounded-md text-gray-500 hover:bg-gray-100 dark:text-dark-text-secondary dark:hover:bg-dark-bg"
              aria-label="Próximo mês"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <div className="flex items-center">
            <button
              onClick={() => imprimir(dadosRelatorio())}
              disabled={lista.length === 0}
              className="p-2 text-gray-600 dark:text-dark-text-secondary hover:text-gray-900 dark:hover:text-dark-text hover:bg-gray-100 dark:hover:bg-dark-bg rounded-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              title="Imprimir"
              aria-label="Imprimir"
            >
              <Printer className="h-5 w-5" />
            </button>
            <div className="relative" ref={exportRef}>
              <button
                onClick={() => setExportAberto((v) => !v)}
                disabled={lista.length === 0}
                className="flex items-center gap-1 p-2 text-gray-600 dark:text-dark-text-secondary hover:text-gray-900 dark:hover:text-dark-text hover:bg-gray-100 dark:hover:bg-dark-bg rounded-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                title="Exportar"
                aria-label="Exportar"
              >
                <Download className="h-5 w-5" />
                <ChevronDown
                  className={`h-3 w-3 transition-transform ${exportAberto ? "rotate-180" : ""}`}
                />
              </button>
              {exportAberto && (
                <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-dark-bg-secondary rounded-2xl shadow-xl border border-gray-100 dark:border-dark-border py-2 z-30">
                  <button
                    onClick={() => {
                      exportarTxt(dadosRelatorio());
                      setExportAberto(false);
                    }}
                    className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 dark:text-dark-text hover:bg-gray-50 dark:hover:bg-dark-bg transition-colors"
                  >
                    <FileText className="h-4 w-4 text-blue-500" />
                    Salvar em TXT
                  </button>
                  <button
                    onClick={() => {
                      exportarExcel(dadosRelatorio());
                      setExportAberto(false);
                    }}
                    className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 dark:text-dark-text hover:bg-gray-50 dark:hover:bg-dark-bg transition-colors"
                  >
                    <FileSpreadsheet className="h-4 w-4 text-green-600" />
                    Salvar em Excel
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {erro && (
        <div className="rounded-lg bg-red-50 dark:bg-red-900/20 px-3 py-2 text-sm text-red-700 dark:text-red-300">
          Não foi possível carregar a conferência: {erro}
        </div>
      )}

      {!erro && linhas === null && (
        <div className="py-10 text-center text-sm text-gray-500 dark:text-dark-text-secondary">
          Carregando…
        </div>
      )}

      {linhas !== null && grupos.length === 0 && (
        <div className="py-10 text-center text-sm text-gray-500 dark:text-dark-text-secondary">
          Nenhum recebimento neste mês.
        </div>
      )}

      {linhas !== null && grupos.length > 0 && (
        <>
          {/* Cobrador */}
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => setCobradorSel(null)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                cobradorAtual === null
                  ? "bg-gray-900 text-white dark:bg-white dark:text-gray-900"
                  : "bg-gray-100 dark:bg-dark-bg text-gray-700 dark:text-dark-text-secondary hover:bg-gray-200 dark:hover:bg-dark-border"
              }`}
            >
              Todos
              {pendenciasTotal > 0 && (
                <span className="rounded-full bg-red-500 px-1.5 text-[10px] font-semibold text-white">
                  {pendenciasTotal}
                </span>
              )}
            </button>
            {grupos.map((g) => {
              const ativo = cobradorAtual === g.id;
              return (
                <button
                  key={g.id || "sem"}
                  onClick={() => setCobradorSel(ativo ? null : g.id)}
                  title={
                    g.pendencias > 0
                      ? `${g.pendencias} cliente(s) para conferir`
                      : "Nada para conferir"
                  }
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                    ativo
                      ? "bg-gray-900 text-white dark:bg-white dark:text-gray-900"
                      : "bg-gray-100 dark:bg-dark-bg text-gray-700 dark:text-dark-text-secondary hover:bg-gray-200 dark:hover:bg-dark-border"
                  } ${g.id ? "" : "italic"}`}
                >
                  {g.nome}
                  {g.pendencias > 0 && (
                    <span className="rounded-full bg-red-500 px-1.5 text-[10px] font-semibold not-italic text-white">
                      {g.pendencias}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Totais do recorte */}
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            <div className="rounded-xl border border-gray-100 dark:border-dark-border/40 bg-gray-50/60 dark:bg-dark-bg/30 px-3 sm:px-4 py-2.5">
              <div className="text-[11px] sm:text-xs font-semibold text-gray-500 dark:text-dark-text-secondary">
                Baixado na base
              </div>
              <div className="mt-0.5 text-base sm:text-xl font-bold text-gray-900 dark:text-dark-text">
                {formatCurrency(resumo.base)}
              </div>
            </div>
            <div className="rounded-xl border border-gray-100 dark:border-dark-border/40 bg-gray-50/60 dark:bg-dark-bg/30 px-3 sm:px-4 py-2.5">
              <div className="text-[11px] sm:text-xs font-semibold text-gray-500 dark:text-dark-text-secondary">
                Registrado no app
              </div>
              <div className="mt-0.5 text-base sm:text-xl font-bold text-gray-900 dark:text-dark-text">
                {formatCurrency(resumo.app)}
              </div>
              {resumo.cedrus !== 0 && (
                <div className="text-[11px] text-gray-400 dark:text-dark-text-secondary">
                  {formatCurrency(resumo.cedrus)} do Cedrus
                </div>
              )}
            </div>
            <div className="rounded-xl border border-gray-100 dark:border-dark-border/40 bg-gray-50/60 dark:bg-dark-bg/30 px-3 sm:px-4 py-2.5">
              <div className="text-[11px] sm:text-xs font-semibold text-gray-500 dark:text-dark-text-secondary">
                Diferença (app − base)
              </div>
              <div className="mt-0.5 text-base sm:text-xl font-bold">
                <Diferenca valor={resumo.app - resumo.base} />
              </div>
            </div>
          </div>

          {grupoAtual && grupoAtual.foraQtd > 0 && (
            <div
              className="text-xs text-gray-500 dark:text-dark-text-secondary"
              title="Clientes que não estão na carteira deste cobrador: não entram na conferência."
            >
              Lançado fora da carteira: {grupoAtual.foraQtd} cliente(s),{" "}
              {formatCurrency(grupoAtual.foraValor)} (não conferido)
            </div>
          )}

          {/* Grupos (filtro da lista) */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
            {GRUPOS.map((gr) => {
              const ativo = grupoFiltro === gr;
              return (
                <button
                  key={gr}
                  onClick={() => escolherGrupo(gr)}
                  title={GRUPO_TELA_DICA[gr]}
                  className={`rounded-xl border px-3 py-2 text-left transition-colors ${
                    ativo
                      ? GRUPO_TONE[gr].ativo
                      : "border-gray-200 dark:border-dark-border hover:bg-gray-50 dark:hover:bg-dark-bg/40"
                  }`}
                >
                  <div className={`text-xl font-bold ${GRUPO_TONE[gr].numero}`}>
                    {resumo.porGrupo[gr]}
                  </div>
                  <div className="text-xs font-medium text-gray-600 dark:text-dark-text-secondary">
                    {GRUPO_TELA_LABEL[gr]}
                  </div>
                </button>
              );
            })}
            <button
              onClick={() => escolherGrupo("todos")}
              className={`rounded-xl border px-3 py-2 text-left transition-colors ${
                grupoFiltro === "todos"
                  ? "border-gray-400 bg-gray-50 ring-1 ring-gray-300 dark:border-dark-text-secondary dark:bg-dark-bg/40 dark:ring-dark-border"
                  : "border-gray-200 dark:border-dark-border hover:bg-gray-50 dark:hover:bg-dark-bg/40"
              }`}
            >
              <div className="text-xl font-bold text-gray-900 dark:text-dark-text">
                {escopo.length}
              </div>
              <div className="text-xs font-medium text-gray-600 dark:text-dark-text-secondary">
                Todos os clientes
              </div>
            </button>
          </div>

          {/* Busca + situacao dentro do grupo */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            <div className="relative sm:w-72">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar cliente ou CPF/CNPJ"
                className="w-full rounded-lg border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg pl-8 pr-8 py-1.5 text-sm text-gray-900 dark:text-dark-text placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {busca && (
                <button
                  onClick={() => setBusca("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  aria-label="Limpar busca"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            {situacoesDoGrupo.length > 1 && (
              <div className="flex flex-wrap gap-1.5">
                <button
                  onClick={() => setSituacaoFiltro(null)}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                    situacaoFiltro === null
                      ? "bg-blue-600 text-white"
                      : "bg-gray-100 dark:bg-dark-bg text-gray-600 dark:text-dark-text-secondary hover:bg-gray-200 dark:hover:bg-dark-border"
                  }`}
                >
                  Todas
                </button>
                {situacoesDoGrupo.map((s) => (
                  <button
                    key={s}
                    onClick={() =>
                      setSituacaoFiltro(situacaoFiltro === s ? null : s)
                    }
                    title={CONFERENCIA_SITUACAO_DICA[s]}
                    className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                      situacaoFiltro === s
                        ? "bg-blue-600 text-white"
                        : "bg-gray-100 dark:bg-dark-bg text-gray-600 dark:text-dark-text-secondary hover:bg-gray-200 dark:hover:bg-dark-border"
                    }`}
                  >
                    {CONFERENCIA_SITUACAO_LABEL[s]} ({resumo.porSituacao[s]})
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Lista de clientes */}
          {lista.length === 0 ? (
            <div className="py-10 text-center text-sm text-gray-500 dark:text-dark-text-secondary">
              {busca.trim()
                ? "Nenhum cliente encontrado."
                : grupoFiltro === "acao"
                  ? "Nada para conferir aqui."
                  : "Nenhum cliente neste grupo."}
            </div>
          ) : (
            <div className="overflow-x-auto -mx-4 lg:-mx-5">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wide text-gray-400 dark:text-dark-text-secondary border-b border-gray-100 dark:border-dark-border/40">
                    <th className="px-4 lg:px-5 py-2 font-semibold">Cliente</th>
                    {cobradorAtual === null && (
                      <th className="px-3 py-2 font-semibold">Cobrador</th>
                    )}
                    <th className="px-3 py-2 font-semibold">Situação</th>
                    <th className="px-3 py-2 font-semibold text-right">Base</th>
                    <th className="px-3 py-2 font-semibold text-right">App</th>
                    <th className="px-4 lg:px-5 py-2 font-semibold text-right">
                      Diferença
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {listaPagina.map((c) => {
                    const outraCarteira = carteiraDeOutro(c);
                    const expandida = aberta === c.chave;
                    return (
                      <React.Fragment key={c.chave}>
                        <tr
                          onClick={() => setAberta(expandida ? null : c.chave)}
                          className={`cursor-pointer border-t border-gray-100 dark:border-dark-border/40 ${expandida ? "bg-blue-50/50 dark:bg-blue-900/10" : "hover:bg-gray-50/60 dark:hover:bg-dark-bg/30"}`}
                          title="Ver parcelas baixadas e lançamentos do app"
                        >
                          <td className="px-4 lg:px-5 py-2">
                            <div className="flex items-center gap-1 font-medium text-gray-900 dark:text-dark-text">
                              <ChevronDown
                                className={`h-3.5 w-3.5 flex-shrink-0 text-gray-400 transition-transform ${expandida ? "" : "-rotate-90"}`}
                              />
                              {c.cliente}
                            </div>
                            <div className="text-[11px] text-gray-400 dark:text-dark-text-secondary">
                              {c.documento}
                              {outraCarteira && ` · carteira: ${outraCarteira}`}
                            </div>
                          </td>
                          {cobradorAtual === null && (
                            <td className="px-3 py-2 whitespace-nowrap text-gray-600 dark:text-dark-text-secondary">
                              {c.cobradorNome}
                            </td>
                          )}
                          <td className="px-3 py-2">
                            <span
                              title={CONFERENCIA_SITUACAO_DICA[c.situacao]}
                              className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ${SITUACAO_TONE[c.situacao]}`}
                            >
                              {CONFERENCIA_SITUACAO_LABEL[c.situacao]}
                            </span>
                            {c.marcacao === "conferido" && (
                              <span
                                title={textoMarcacao(c)}
                                className="mt-0.5 flex items-center gap-1 text-[11px] font-medium text-teal-600 dark:text-teal-400"
                              >
                                <CheckCircle2 className="h-3 w-3" />
                                Conferido
                              </span>
                            )}
                            {c.marcacao === "mudou" && (
                              <span
                                title={textoMarcacao(c)}
                                className="mt-0.5 block text-[11px] font-medium text-amber-600 dark:text-amber-400"
                              >
                                Mudou depois de conferido
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right whitespace-nowrap text-gray-700 dark:text-dark-text">
                            {c.baseParcelas > 0 ? (
                              <>
                                {formatCurrency(c.baseValor)}
                                <div className="text-[11px] text-gray-400">
                                  {c.baseParcelas} parcela(s)
                                </div>
                              </>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td className="px-3 py-2 text-right whitespace-nowrap text-gray-700 dark:text-dark-text">
                            {c.appLancamentos > 0 ? (
                              <>
                                {formatCurrency(c.appValor)}
                                <div className="text-[11px] text-gray-400">
                                  {c.appLancamentos} lançamento(s)
                                  {c.appCedrus !== 0 && " · Cedrus"}
                                </div>
                              </>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td className="px-4 lg:px-5 py-2 text-right whitespace-nowrap font-medium">
                            <Diferenca valor={c.appValor - c.baseValor} />
                          </td>
                        </tr>
                        {expandida && (
                          <tr>
                            <td
                              colSpan={cobradorAtual === null ? 6 : 5}
                              className="px-4 lg:px-5 pb-4 pt-1 bg-blue-50/50 dark:bg-blue-900/10"
                            >
                              <ConferenciaDetalhe
                                documento={c.documento}
                                cobradorId={c.cobradorId}
                                visao={visao}
                                inicio={limitesDoMes(mes).inicio}
                                fim={limitesDoMes(mes).fim}
                                nomePorId={nomePorId}
                                onAbrirFicha={fichaDe(c.documento)}
                                baseValor={c.baseValor}
                                appValor={c.appValor}
                                marcacoes={
                                  marcacoesPorDoc.get(c.documento) ?? []
                                }
                                estadoMarcacao={c.marcacao}
                                onMarcar={(acao, obs) => marcar(c, acao, obs)}
                              />
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
              {totalPaginas > 1 && (
                <div className="flex items-center justify-between gap-4 px-4 lg:px-5 pt-3 border-t border-gray-100 dark:border-dark-border/40">
                  <span className="text-xs font-medium text-gray-500 dark:text-dark-text-secondary">
                    Mostrando {(paginaAtual - 1) * POR_PAGINA + 1}–
                    {Math.min(paginaAtual * POR_PAGINA, lista.length)} de{" "}
                    {lista.length}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setPagina(Math.max(1, paginaAtual - 1))}
                      disabled={paginaAtual === 1}
                      className="flex items-center px-3 py-1.5 rounded-lg text-sm font-medium text-gray-600 dark:text-dark-text-secondary border border-gray-200 dark:border-dark-border hover:bg-gray-50 dark:hover:bg-dark-bg disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      aria-label="Página anterior"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    <span className="px-3 text-sm font-semibold text-gray-700 dark:text-dark-text tabular-nums">
                      {paginaAtual} / {totalPaginas}
                    </span>
                    <button
                      onClick={() =>
                        setPagina(Math.min(totalPaginas, paginaAtual + 1))
                      }
                      disabled={paginaAtual === totalPaginas}
                      className="flex items-center px-3 py-1.5 rounded-lg text-sm font-medium text-gray-600 dark:text-dark-text-secondary border border-gray-200 dark:border-dark-border hover:bg-gray-50 dark:hover:bg-dark-bg disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      aria-label="Próxima página"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {ficha && (
        <ClientDetailModal
          clientGroup={ficha}
          userType={user?.type || "manager"}
          onClose={() => setFicha(null)}
        />
      )}
    </div>
  );
};

export default ConferenciaRecebimentos;
