import * as XLSX from "xlsx";
import { formatCurrency } from "../../utils/formatters";
import {
  CONFERENCIA_GRUPO,
  CONFERENCIA_SITUACAO_LABEL,
  ConferenciaSituacao,
} from "../../filters/conferenciaRecebimentos";

// Relatorios da Conferencia de recebimentos (item 61): TXT, Excel e impressao,
// no mesmo formato do Relatorio do Caixa. Saem com o recorte da tela
// (cobrador, grupo, situacao, busca) -- a descricao do recorte vai no topo.

export interface LinhaRelatorio {
  cliente: string;
  documento: string;
  cobradorNome: string;
  carteiraNome: string;
  situacao: ConferenciaSituacao;
  baseValor: number;
  baseParcelas: number;
  appValor: number;
  appLancamentos: number;
  appCedrus: number;
}

export interface DadosRelatorio {
  periodo: string; // "Novembro de 2026"
  visao: string; // "Todos os recebimentos" | "Só carteira"
  filtros: string[]; // ex.: ["Cobrador: José", "Grupo: Precisa conferir"]
  linhas: LinhaRelatorio[];
  arquivo: string; // base do nome do arquivo, sem extensao
}

interface ResumoCobrador {
  nome: string;
  base: number;
  app: number;
  acao: number;
  juros: number;
  confere: number;
  clientes: number;
}

const resumir = (linhas: LinhaRelatorio[]) => {
  const total = { base: 0, app: 0, cedrus: 0, acao: 0, juros: 0, confere: 0 };
  const porCobrador = new Map<string, ResumoCobrador>();
  linhas.forEach((l) => {
    const grupo = CONFERENCIA_GRUPO[l.situacao];
    total.base += l.baseValor;
    total.app += l.appValor;
    total.cedrus += l.appCedrus;
    total[grupo]++;
    let c = porCobrador.get(l.cobradorNome);
    if (!c) {
      c = { nome: l.cobradorNome, base: 0, app: 0, acao: 0, juros: 0, confere: 0, clientes: 0 };
      porCobrador.set(l.cobradorNome, c);
    }
    c.base += l.baseValor;
    c.app += l.appValor;
    c[grupo]++;
    c.clientes++;
  });
  const cobradores = Array.from(porCobrador.values()).sort((a, b) =>
    a.nome.localeCompare(b.nome, "pt-BR"),
  );
  return { total, cobradores };
};

const agora = () => new Date().toLocaleString("pt-BR");

const baixar = (conteudo: BlobPart, tipo: string, nome: string) => {
  const blob = new Blob([conteudo], { type: tipo });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = nome;
  link.click();
  URL.revokeObjectURL(url);
};

export const exportarTxt = (d: DadosRelatorio) => {
  const { total, cobradores } = resumir(d.linhas);
  const linhas: string[] = [
    "=".repeat(70),
    `CONFERÊNCIA DE RECEBIMENTOS - ${d.periodo.toUpperCase()}`,
    "=".repeat(70),
    `Visão: ${d.visao}`,
    ...(d.filtros.length ? [`Filtros: ${d.filtros.join(" | ")}`] : []),
    `Gerado em: ${agora()}`,
    "",
    `Baixado na base: ${formatCurrency(total.base)}`,
    `Registrado no app: ${formatCurrency(total.app)}${total.cedrus ? ` (${formatCurrency(total.cedrus)} do Cedrus)` : ""}`,
    `Diferença (app - base): ${formatCurrency(total.app - total.base)}`,
    `Clientes: ${d.linhas.length} (precisa conferir ${total.acao} · app maior ${total.juros} · confere ${total.confere})`,
    "",
    "RESUMO POR COBRADOR:",
    "-".repeat(70),
  ];
  cobradores.forEach((c) => {
    linhas.push(
      `${c.nome}:`,
      `  Base: ${formatCurrency(c.base)}   App: ${formatCurrency(c.app)}   Diferença: ${formatCurrency(c.app - c.base)}`,
      `  Clientes: ${c.clientes} (precisa conferir ${c.acao} · app maior ${c.juros} · confere ${c.confere})`,
      "",
    );
  });
  if (d.linhas.length) {
    linhas.push("CLIENTES:", "-".repeat(70));
    d.linhas.forEach((l, i) => {
      linhas.push(
        `${i + 1}. ${l.cliente} (${l.documento || "sem documento"})`,
        `   Cobrador: ${l.cobradorNome}${l.carteiraNome ? ` · carteira: ${l.carteiraNome}` : ""}`,
        `   Situação: ${CONFERENCIA_SITUACAO_LABEL[l.situacao]}`,
        `   Base: ${formatCurrency(l.baseValor)} (${l.baseParcelas} parcela(s))   App: ${formatCurrency(l.appValor)} (${l.appLancamentos} lançamento(s))   Diferença: ${formatCurrency(l.appValor - l.baseValor)}`,
        "",
      );
    });
  }
  baixar(linhas.join("\n"), "text/plain;charset=utf-8", `${d.arquivo}.txt`);
};

export const exportarExcel = (d: DadosRelatorio) => {
  const { total, cobradores } = resumir(d.linhas);
  const resumoWS = XLSX.utils.aoa_to_sheet([
    ["CONFERÊNCIA DE RECEBIMENTOS - FOCCO BRASIL"],
    [`Período: ${d.periodo}`],
    [`Visão: ${d.visao}`],
    ...(d.filtros.length ? [[`Filtros: ${d.filtros.join(" | ")}`]] : []),
    [`Data de Extração: ${agora()}`],
    [""],
    ["TOTAIS"],
    ["Baixado na base", total.base],
    ["Registrado no app", total.app],
    ["Importado do Cedrus (dentro do app)", total.cedrus],
    ["Diferença (app − base)", total.app - total.base],
    ["Clientes", d.linhas.length],
    ["Precisa conferir", total.acao],
    ["App maior (provável juros)", total.juros],
    ["Confere", total.confere],
    [""],
    ["POR COBRADOR"],
    ["Cobrador", "Base", "App", "Diferença", "Clientes", "Precisa conferir", "App maior", "Confere"],
    ...cobradores.map((c) => [
      c.nome,
      c.base,
      c.app,
      c.app - c.base,
      c.clientes,
      c.acao,
      c.juros,
      c.confere,
    ]),
  ]);
  resumoWS["!cols"] = [
    { wch: 34 },
    { wch: 15 },
    { wch: 15 },
    { wch: 15 },
    { wch: 10 },
    { wch: 16 },
    { wch: 11 },
    { wch: 10 },
  ];

  const clientesWS = XLSX.utils.aoa_to_sheet([
    [
      "Cliente",
      "CPF/CNPJ",
      "Cobrador",
      "Carteira (se de outro cobrador)",
      "Situação",
      "Base",
      "Parcelas baixadas",
      "App",
      "Lançamentos",
      "Do Cedrus",
      "Diferença (app − base)",
    ],
    ...d.linhas.map((l) => [
      l.cliente,
      l.documento,
      l.cobradorNome,
      l.carteiraNome,
      CONFERENCIA_SITUACAO_LABEL[l.situacao],
      l.baseValor,
      l.baseParcelas,
      l.appValor,
      l.appLancamentos,
      l.appCedrus,
      l.appValor - l.baseValor,
    ]),
  ]);
  clientesWS["!cols"] = [
    { wch: 36 },
    { wch: 20 },
    { wch: 24 },
    { wch: 24 },
    { wch: 30 },
    { wch: 14 },
    { wch: 10 },
    { wch: 14 },
    { wch: 12 },
    { wch: 12 },
    { wch: 16 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, resumoWS, "Resumo");
  XLSX.utils.book_append_sheet(wb, clientesWS, "Clientes");
  XLSX.writeFile(wb, `${d.arquivo}.xlsx`);
};

const esc = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const corDif = (v: number) =>
  Math.abs(v) < 0.005 ? "#888" : v > 0 ? "#2563eb" : "#dc2626";

export const imprimir = (d: DadosRelatorio) => {
  const { total, cobradores } = resumir(d.linhas);
  const dif = total.app - total.base;
  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>Conferência de recebimentos - ${esc(d.periodo)}</title>
<style>
  @page { margin: 12mm; size: A4 landscape; }
  * { box-sizing: border-box; }
  body { font-family: Arial, sans-serif; color: #333; font-size: 11px; margin: 0; }
  h1 { font-size: 18px; margin: 0 0 4px; text-align: center; }
  .sub { text-align: center; color: #666; margin-bottom: 12px; }
  .cards { display: flex; gap: 8px; margin-bottom: 12px; }
  .card { flex: 1; border: 1px solid #ddd; border-radius: 6px; padding: 6px 10px; }
  .card .l { font-size: 10px; color: #666; }
  .card .v { font-size: 15px; font-weight: bold; }
  h2 { font-size: 13px; margin: 14px 0 6px; border-bottom: 1px solid #ccc; padding-bottom: 3px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border-bottom: 1px solid #eee; padding: 3px 5px; text-align: left; vertical-align: top; }
  th { background: #f5f5f5; font-size: 10px; text-transform: uppercase; }
  td.n, th.n { text-align: right; white-space: nowrap; }
  .doc { color: #888; font-size: 9px; }
  tr { page-break-inside: avoid; }
</style>
</head>
<body>
  <h1>Conferência de recebimentos — ${esc(d.periodo)}</h1>
  <div class="sub">Visão: ${esc(d.visao)}${d.filtros.length ? ` · ${esc(d.filtros.join(" · "))}` : ""} · Gerado em ${esc(agora())}</div>
  <div class="cards">
    <div class="card"><div class="l">Baixado na base</div><div class="v">${formatCurrency(total.base)}</div></div>
    <div class="card"><div class="l">Registrado no app</div><div class="v">${formatCurrency(total.app)}</div>${total.cedrus ? `<div class="l">${formatCurrency(total.cedrus)} do Cedrus</div>` : ""}</div>
    <div class="card"><div class="l">Diferença (app − base)</div><div class="v" style="color:${corDif(dif)}">${formatCurrency(dif)}</div></div>
    <div class="card"><div class="l">Clientes</div><div class="v">${d.linhas.length}</div><div class="l">conferir ${total.acao} · app maior ${total.juros} · confere ${total.confere}</div></div>
  </div>
  <h2>Por cobrador</h2>
  <table>
    <thead><tr><th>Cobrador</th><th class="n">Base</th><th class="n">App</th><th class="n">Diferença</th><th class="n">Clientes</th><th class="n">Precisa conferir</th><th class="n">App maior</th><th class="n">Confere</th></tr></thead>
    <tbody>
      ${cobradores
        .map(
          (c) =>
            `<tr><td>${esc(c.nome)}</td><td class="n">${formatCurrency(c.base)}</td><td class="n">${formatCurrency(c.app)}</td><td class="n" style="color:${corDif(c.app - c.base)}">${formatCurrency(c.app - c.base)}</td><td class="n">${c.clientes}</td><td class="n">${c.acao}</td><td class="n">${c.juros}</td><td class="n">${c.confere}</td></tr>`,
        )
        .join("")}
    </tbody>
  </table>
  <h2>Clientes (${d.linhas.length})</h2>
  <table>
    <thead><tr><th>Cliente</th><th>Cobrador</th><th>Situação</th><th class="n">Base</th><th class="n">App</th><th class="n">Diferença</th></tr></thead>
    <tbody>
      ${d.linhas
        .map((l) => {
          const df = l.appValor - l.baseValor;
          return `<tr><td>${esc(l.cliente)}<div class="doc">${esc(l.documento)}${l.carteiraNome ? ` · carteira: ${esc(l.carteiraNome)}` : ""}</div></td><td>${esc(l.cobradorNome)}</td><td>${esc(CONFERENCIA_SITUACAO_LABEL[l.situacao])}</td><td class="n">${l.baseParcelas > 0 ? formatCurrency(l.baseValor) : "—"}</td><td class="n">${l.appLancamentos > 0 ? formatCurrency(l.appValor) : "—"}</td><td class="n" style="color:${corDif(df)}">${Math.abs(df) < 0.005 ? "—" : formatCurrency(df)}</td></tr>`;
        })
        .join("")}
    </tbody>
  </table>
</body>
</html>`;
  const w = window.open("", "_blank");
  if (w) {
    w.document.write(html);
    w.document.close();
    w.print();
  }
};
