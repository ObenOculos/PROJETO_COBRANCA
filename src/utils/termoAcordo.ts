// Geracao do PDF "Termo de Acordo" -- Etapa 3c (ver docs/PROGRESSO.md, item 12).
// 100% client-side (jsPDF), sem backend/gateway, no mesmo espirito da
// geracao do Pix (src/utils/pix.ts). O documento e uma funcao determinista
// dos dados ja congelados em acordos/acordo_titulos/acordo_parcelas -- pode
// ser regenerado identico a qualquer momento, por isso nao precisa ser
// persistido em Storage. Layout proprio (nao copia o modelo de referencia
// do usuario), usando a mesma paleta indigo do app.

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import QRCode from "qrcode";
import {
  Acordo,
  AcordoTitulo,
  AcordoParcela,
  AcordoConfiguracaoPadrao,
} from "../types";
import { gerarPixCopiaECola } from "./pix";
import logoUrl from "../assets/focco-brasil-logo.png";

export interface DevedorInfo {
  nome: string;
  documento: string;
  endereco: string;
}

export interface TermoAcordoParams {
  acordo: Acordo;
  titulos: AcordoTitulo[];
  parcelas: AcordoParcela[];
  empresa: AcordoConfiguracaoPadrao | null;
  devedor: DevedorInfo;
}

type RGB = [number, number, number];
const PRIMARY: RGB = [79, 70, 229]; // indigo-600
const PRIMARY_DARK: RGB = [55, 48, 163]; // indigo-800
const PRIMARY_SOFT: RGB = [238, 242, 255]; // indigo-50
const TEXT: RGB = [31, 41, 55]; // gray-800
const MUTED: RGB = [107, 114, 128]; // gray-500
const LINE: RGB = [226, 232, 240]; // slate-200
const BG_SOFT: RGB = [248, 250, 252]; // slate-50

const formatCpfCnpj = (value: string): string => {
  const digits = (value || "").replace(/\D/g, "");
  if (digits.length === 11) {
    return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  }
  if (digits.length === 14) {
    return digits.replace(
      /(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/,
      "$1.$2.$3/$4-$5",
    );
  }
  return value || "";
};

// Monta "R$ 1.234,56" com espaco normal (nao NBSP) -- a fonte padrao do
// jsPDF (helvetica/WinAnsi) nao tem o glifo de NBSP que o
// Intl.NumberFormat("pt-BR") usa e imprimiria um quadrado no lugar.
const formatMoneyPdf = (value: number): string => {
  const numero = value.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return "R$ " + numero;
};

const formatDateBr = (dateStr: string): string => {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("pt-BR");
};

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

const formatDateExtenso = (dateStr: string): string => {
  const [y, m, d] = dateStr.split("-").map(Number);
  return `${d} de ${MESES[m - 1]} de ${y}`;
};

const loadImage = (src: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Falha ao carregar imagem"));
    img.src = src;
  });

/** Monta o jsPDF do Termo de Acordo. Nao salva/baixa -- quem chama decide. */
export const gerarTermoAcordoPdf = async ({
  acordo,
  titulos,
  parcelas,
  empresa,
  devedor,
}: TermoAcordoParams): Promise<jsPDF> => {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 16;
  const contentWidth = pageWidth - marginX * 2;
  let y = 0;

  const setColor = (c: RGB) => doc.setTextColor(c[0], c[1], c[2]);
  const setFill = (c: RGB) => doc.setFillColor(c[0], c[1], c[2]);
  const setDraw = (c: RGB) => doc.setDrawColor(c[0], c[1], c[2]);

  /** Quebra de pagina simples -- paginas extras seguem sem repetir o
   * cabecalho/logo (aceitavel para um documento de poucas paginas). */
  const ensureSpace = (needed: number) => {
    if (y + needed > pageHeight - 18) {
      doc.addPage();
      y = 16;
    }
  };

  const sectionTitle = (text: string) => {
    ensureSpace(12);
    setFill(PRIMARY);
    doc.rect(marginX, y, 2.2, 4.6, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10.5);
    setColor(PRIMARY_DARK);
    doc.text(text.toUpperCase(), marginX + 4.5, y + 3.8);
    y += 9;
    doc.setFont("helvetica", "normal");
    setColor(TEXT);
  };

  // ---------- Cabecalho ----------
  setFill(PRIMARY);
  doc.rect(0, 0, pageWidth, 3, "F");
  y = 13;

  let logoBottom = y;
  try {
    const logoImg = await loadImage(logoUrl);
    const logoH = 10;
    const logoW = (logoImg.width / logoImg.height) * logoH;
    doc.addImage(logoImg, "PNG", marginX, y, logoW, logoH);
    logoBottom = y + logoH;
  } catch {
    // segue sem logo se o navegador nao conseguir carregar a imagem
  }

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  setColor(MUTED);
  const referencia = `ACORDO Nº ${acordo.id.slice(0, 8).toUpperCase()}`;
  doc.text(referencia, pageWidth - marginX, y + 3, { align: "right" });
  doc.text(
    `Emitido em ${formatDateBr(new Date().toISOString().slice(0, 10))}`,
    pageWidth - marginX,
    y + 7.5,
    { align: "right" },
  );

  y = Math.max(logoBottom, y + 10) + 16;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(19);
  setColor(PRIMARY_DARK);
  doc.text("Termo de Acordo", pageWidth / 2, y, { align: "center" });
  doc.setFont("helvetica", "italic");
  doc.setFontSize(9.5);
  setColor(MUTED);
  doc.text("Confissão de dívida e parcelamento", pageWidth / 2, y + 5.5, {
    align: "center",
  });
  doc.setFont("helvetica", "normal");
  y += 12;

  setDraw(LINE);
  doc.setLineWidth(0.3);
  doc.line(marginX, y, pageWidth - marginX, y);
  y += 8;

  // ---------- Partes (DEVEDOR / CREDOR) ----------
  const empresaNome =
    empresa?.empresaNome || "Focco Brasil Distribuidora de Produtos Ópticos";
  const empresaCnpj = formatCpfCnpj(empresa?.empresaCnpj || "");
  const empresaEndereco = empresa?.empresaEndereco || "";
  const devedorDocFmt = formatCpfCnpj(devedor.documento);

  const cardGap = 6;
  const cardW = (contentWidth - cardGap) / 2;
  const padX = 4.5;
  const padTop = 6;

  doc.setFontSize(8.5);
  const devEnderecoLines = doc.splitTextToSize(
    devedor.endereco || "—",
    cardW - padX * 2,
  );
  const credEnderecoLines = doc.splitTextToSize(
    empresaEndereco || "—",
    cardW - padX * 2,
  );
  const enderecoLineCount = Math.max(
    devEnderecoLines.length,
    credEnderecoLines.length,
  );
  const cardH = padTop + 6 + 5 + 4 + enderecoLineCount * 3.6 + 4;

  ensureSpace(cardH + 2);
  const cardY = y;

  const drawParteCard = (
    x: number,
    label: string,
    nome: string,
    docFmt: string,
    enderecoLines: string[],
  ) => {
    setFill(BG_SOFT);
    setDraw(LINE);
    doc.setLineWidth(0.25);
    doc.roundedRect(x, cardY, cardW, cardH, 2, 2, "FD");

    let cy = cardY + padTop;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    setColor(PRIMARY);
    doc.text(label, x + padX, cy);
    cy += 5.5;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10.5);
    setColor(TEXT);
    const nomeLines = doc.splitTextToSize(nome, cardW - padX * 2);
    doc.text(nomeLines, x + padX, cy);
    cy += nomeLines.length * 4.4 + 1.5;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    setColor(MUTED);
    doc.text(`CPF/CNPJ: ${docFmt}`, x + padX, cy);
    cy += 4.6;

    setColor(TEXT);
    doc.text(enderecoLines, x + padX, cy);
  };

  drawParteCard(marginX, "DEVEDOR(A)", devedor.nome, devedorDocFmt, devEnderecoLines);
  drawParteCard(
    marginX + cardW + cardGap,
    "CREDOR(A)",
    empresaNome,
    empresaCnpj,
    credEnderecoLines,
  );

  y = cardY + cardH + 9;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  setColor(TEXT);
  const clausula1 = doc.splitTextToSize(
    "Cláusula Primeira – As partes acima ajustam o presente termo de acordo, com efeitos de " +
      "confissão de dívida, que vigorará pelas condições seguintes. O DEVEDOR(a) confirma " +
      "expressamente que possui uma dívida a ser paga ao CREDOR(a), conforme tabela abaixo:",
    contentWidth,
  );
  doc.text(clausula1, marginX, y);
  y += clausula1.length * 4.6 + 6;

  // ---------- Titulos negociados ----------
  sectionTitle("Títulos negociados");

  const totais = titulos.reduce(
    (acc, t) => {
      acc.saldo += t.saldoNoMomento;
      acc.multa += t.multaValor;
      acc.juros += t.jurosValor;
      acc.desconto += t.descontoValor;
      acc.total +=
        t.saldoNoMomento + t.multaValor + t.jurosValor - t.descontoValor;
      return acc;
    },
    { saldo: 0, multa: 0, juros: 0, desconto: 0, total: 0 },
  );

  autoTable(doc, {
    startY: y,
    margin: { left: marginX, right: marginX },
    head: [
      ["Título", "Venc. original", "Dias", "Vl. Orig.", "Multa", "Juros", "Desconto", "Total"],
    ],
    body: titulos.map((t) => [
      String(t.collectionId),
      t.vencimentoOriginal ? formatDateBr(t.vencimentoOriginal) : "-",
      String(t.diasAtrasoNoMomento),
      formatMoneyPdf(t.saldoNoMomento),
      formatMoneyPdf(t.multaValor),
      formatMoneyPdf(t.jurosValor),
      formatMoneyPdf(t.descontoValor),
      formatMoneyPdf(
        t.saldoNoMomento + t.multaValor + t.jurosValor - t.descontoValor,
      ),
    ]),
    foot: [
      [
        "",
        "",
        "Total",
        formatMoneyPdf(totais.saldo),
        formatMoneyPdf(totais.multa),
        formatMoneyPdf(totais.juros),
        formatMoneyPdf(totais.desconto),
        formatMoneyPdf(totais.total),
      ],
    ],
    styles: {
      fontSize: 7.8,
      cellPadding: 2,
      textColor: TEXT,
      lineColor: LINE,
      lineWidth: 0.2,
    },
    headStyles: { fillColor: PRIMARY, textColor: 255, fontStyle: "bold" },
    footStyles: {
      fillColor: PRIMARY_SOFT,
      textColor: PRIMARY_DARK,
      fontStyle: "bold",
    },
    alternateRowStyles: { fillColor: BG_SOFT },
    columnStyles: {
      0: { halign: "left" },
      1: { halign: "center" },
      2: { halign: "center" },
      3: { halign: "right" },
      4: { halign: "right" },
      5: { halign: "right" },
      6: { halign: "right" },
      7: { halign: "right" },
    },
    theme: "grid",
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  y = (doc as any).lastAutoTable.finalY + 6;

  // ---------- Faixa de resumo (3 chips) ----------
  const encargos = totais.multa + totais.juros - totais.desconto;
  const chips: Array<{ label: string; value: string; destaque?: boolean }> = [
    { label: "SALDO ORIGINAL", value: formatMoneyPdf(totais.saldo) },
    { label: "MULTA + JUROS - DESCONTO", value: formatMoneyPdf(encargos) },
    { label: "TOTAL NEGOCIADO", value: formatMoneyPdf(acordo.valorNegociado), destaque: true },
  ];
  ensureSpace(20);
  const chipGap = 5;
  const chipW = (contentWidth - chipGap * 2) / 3;
  const chipH = 15;
  chips.forEach((chip, i) => {
    const cx = marginX + i * (chipW + chipGap);
    if (chip.destaque) {
      setFill(PRIMARY);
      doc.roundedRect(cx, y, chipW, chipH, 2, 2, "F");
    } else {
      setFill(BG_SOFT);
      setDraw(LINE);
      doc.roundedRect(cx, y, chipW, chipH, 2, 2, "FD");
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.5);
    setColor(chip.destaque ? [224, 231, 255] : MUTED);
    doc.text(chip.label, cx + 3.5, y + 5.5);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    setColor(chip.destaque ? [255, 255, 255] : TEXT);
    doc.text(chip.value, cx + 3.5, y + 11.5);
  });
  y += chipH + 9;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  setColor(MUTED);
  doc.text(
    `Multa de ${acordo.multaPercentualAplicado.toFixed(2)}% sobre o saldo de cada título em atraso, mais juros simples de ` +
      `${acordo.jurosPercentualAmAplicado.toFixed(2)}% a.m. pro-rata pelos dias de atraso` +
      (acordo.descontoPercentualAplicado > 0
        ? `, com desconto de ${acordo.descontoPercentualAplicado.toFixed(2)}% aplicado sobre o total.`
        : "."),
    marginX,
    y,
  );
  y += 9;

  // ---------- Parcelas acordadas ----------
  sectionTitle("Parcelas acordadas");

  const parcelasOrdenadas = parcelas.slice().sort((a, b) => a.numero - b.numero);

  autoTable(doc, {
    startY: y,
    margin: { left: marginX, right: marginX },
    head: [["Parcela", "Vencimento", "Valor"]],
    body: parcelasOrdenadas.map((p) => [
      `${p.numero}/${parcelas.length}` + (p.numero === 1 ? "  (entrada)" : ""),
      formatDateBr(p.dataVencimento),
      formatMoneyPdf(p.valorParcela),
    ]),
    foot: [
      ["", "Total", formatMoneyPdf(parcelas.reduce((sum, p) => sum + p.valorParcela, 0))],
    ],
    styles: {
      fontSize: 8.2,
      cellPadding: 2,
      textColor: TEXT,
      lineColor: LINE,
      lineWidth: 0.2,
    },
    headStyles: { fillColor: PRIMARY, textColor: 255, fontStyle: "bold" },
    footStyles: {
      fillColor: PRIMARY_SOFT,
      textColor: PRIMARY_DARK,
      fontStyle: "bold",
    },
    alternateRowStyles: { fillColor: BG_SOFT },
    columnStyles: { 2: { halign: "right" } },
    theme: "grid",
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  y = (doc as any).lastAutoTable.finalY + 9;

  // ---------- Pagamento ----------
  const parcela1 = parcelas.find((p) => p.numero === 1);
  const qrSize = 28;
  const payCardH = qrSize + 8;
  // Garante que o titulo da secao nao fique "orfao" no fim da pagina,
  // separado do cartao que vem logo depois.
  ensureSpace(9 + payCardH + 10);
  sectionTitle("Pagamento");
  const payCardY = y;

  setFill(BG_SOFT);
  setDraw(LINE);
  doc.roundedRect(marginX, payCardY, contentWidth, payCardH, 2, 2, "FD");

  if (parcela1 && empresa?.empresaChavePix) {
    const payload = gerarPixCopiaECola({
      chave: empresa.empresaChavePix,
      nomeRecebedor: empresaNome,
      cidadeRecebedor: empresaEndereco,
      valor: parcela1.valorParcela,
      txid: acordo.clientDocument,
    });
    try {
      const qrDataUrl = await QRCode.toDataURL(payload, { margin: 0, width: 300 });
      doc.addImage(
        qrDataUrl,
        "PNG",
        marginX + 4,
        payCardY + 4,
        qrSize,
        qrSize,
      );

      const textX = marginX + qrSize + 11;
      const textW = contentWidth - qrSize - 15;
      let ty = payCardY + 7;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9.5);
      setColor(TEXT);
      doc.text(
        `Entrada: ${formatMoneyPdf(parcela1.valorParcela)} via Pix`,
        textX,
        ty,
      );
      ty += 5;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.3);
      setColor(MUTED);
      doc.text(
        doc.splitTextToSize(
          `Use o QR Code ao lado ou o código copia-e-cola para pagar a entrada. As demais ` +
            `parcelas são pagas via ${acordo.formaPagamentoParcelas || "a combinar"}.`,
          textW,
        ),
        textX,
        ty,
      );
      ty += 9;
      doc.setFont("courier", "normal");
      doc.setFontSize(6.3);
      setColor(MUTED);
      doc.text(doc.splitTextToSize(payload, textW), textX, ty);
      doc.setFont("helvetica", "normal");
    } catch {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      setColor(TEXT);
      doc.text(
        `Forma de pagamento das parcelas: ${acordo.formaPagamentoParcelas || "a combinar"}.`,
        marginX + 4,
        payCardY + payCardH / 2,
      );
    }
  } else {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    setColor(TEXT);
    doc.text(
      `Forma de pagamento das parcelas: ${acordo.formaPagamentoParcelas || "a combinar"}.`,
      marginX + 4,
      payCardY + payCardH / 2,
    );
  }

  y = payCardY + payCardH + 10;

  // ---------- Clausulas gerais ----------
  sectionTitle("Cláusulas gerais");
  doc.setFont("helvetica", "italic");
  doc.setFontSize(7.5);
  setColor(MUTED);
  doc.text("(texto jurídico final a definir)", marginX, y);
  y += 5.5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  setColor(TEXT);
  ["Segunda", "Terceira", "Quarta"].forEach((ordinal) => {
    ensureSpace(6.5);
    doc.text(`Cláusula ${ordinal} – xxxxx`, marginX, y);
    y += 6;
  });

  y += 2;
  ensureSpace(16);
  const fechamento = doc.splitTextToSize(
    "E por assim serem justas e contratadas, declaram-se cientes e esclarecidas quanto ao teor das " +
      "cláusulas deste instrumento, firmando-o em duas vias de igual teor e forma, na presença das " +
      "testemunhas abaixo, para que produzam os devidos e efeitos legais.",
    contentWidth,
  );
  doc.text(fechamento, marginX, y);
  y += fechamento.length * 4.6 + 7;

  ensureSpace(10);
  doc.setFont("helvetica", "normal");
  doc.text(
    `Fortaleza, ${formatDateExtenso(acordo.createdAt.slice(0, 10))}`,
    marginX,
    y,
  );
  y += 16;

  // ---------- Assinaturas ----------
  const assinaturaW = (contentWidth - cardGap) / 2;
  let assinaturaCol = 0;
  let rowStartY = y;

  const textOrDash = (v: string): string => (v && v.trim() ? v : "—");

  const assinatura = (nome: string, docFmt: string, label: string) => {
    if (assinaturaCol === 0) {
      ensureSpace(24);
      rowStartY = y;
    }
    const x = marginX + assinaturaCol * (assinaturaW + cardGap);
    let ay = rowStartY;
    setDraw(MUTED);
    doc.setLineWidth(0.25);
    doc.line(x, ay, x + assinaturaW - 10, ay);
    ay += 4.3;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    setColor(TEXT);
    doc.text(textOrDash(nome), x, ay);
    ay += 4.3;
    if (docFmt) {
      doc.setFontSize(8);
      setColor(MUTED);
      doc.text(`CPF/CNPJ: ${docFmt}`, x, ay);
      ay += 4.3;
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    setColor(PRIMARY);
    doc.text(label, x, ay);
    doc.setFont("helvetica", "normal");

    if (assinaturaCol === 1) {
      y = rowStartY + 20;
      assinaturaCol = 0;
    } else {
      assinaturaCol = 1;
    }
  };

  assinatura(devedor.nome, devedorDocFmt, "DEVEDOR(A)");
  assinatura(empresaNome, empresaCnpj, "CREDOR(A)");
  if (assinaturaCol !== 0) {
    y = rowStartY + 20;
    assinaturaCol = 0;
  }

  if (acordo.testemunha1Nome || acordo.testemunha2Nome) {
    y += 2;
    if (acordo.testemunha1Nome) {
      assinatura(
        acordo.testemunha1Nome,
        acordo.testemunha1Cpf ? formatCpfCnpj(acordo.testemunha1Cpf) : "",
        "TESTEMUNHA 1",
      );
    }
    if (acordo.testemunha2Nome) {
      assinatura(
        acordo.testemunha2Nome,
        acordo.testemunha2Cpf ? formatCpfCnpj(acordo.testemunha2Cpf) : "",
        "TESTEMUNHA 2",
      );
    }
  }

  // ---------- Rodape (todas as paginas) ----------
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    setDraw(LINE);
    doc.setLineWidth(0.2);
    doc.line(marginX, pageHeight - 12, pageWidth - marginX, pageHeight - 12);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    setColor(MUTED);
    doc.text(
      `${empresaNome} — Termo de Acordo`,
      marginX,
      pageHeight - 8,
    );
    doc.text(
      `Página ${p} de ${totalPages}`,
      pageWidth - marginX,
      pageHeight - 8,
      { align: "right" },
    );
  }

  return doc;
};

export const nomeArquivoTermoAcordo = (acordo: Acordo): string =>
  `Termo de Acordo - ${acordo.clientName || acordo.clientDocument}.pdf`.replace(
    /[\\/:*?"<>|]/g,
    "-",
  );
