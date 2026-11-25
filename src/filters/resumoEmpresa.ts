// Resumo da Empresa (reuniao com o gestor, 25/11): a base INTEIRA de clientes,
// nao so a dos cobradores -- inclusive quem esta sem cobrador e quem ja
// quitou. Fonte unica dos numeros do painel "Empresa" do Resumo.
//
// Cada cliente cai em UMA situacao (somam o total):
//   em atraso  -> tem saldo vencido (vencido x a vencer de clientBalanceSplit,
//                 que ja segue o acordo ativo)
//   em dia     -> tem saldo, nada vencido (so a vencer)
//   quitado    -> sem saldo
// e o em atraso se divide em: sem cobrador / com cobrador e com agendamento /
// com cobrador e sem agendamento (este e o que pede acao urgente).
//
// Previsao de recebimento (de HOJE ate o fim do periodo; nunca o passado):
//   parcelas a vencer (cliente sem acordo ativo)
// + parcelas de acordo a vencer (cliente com acordo ativo)
// + vencido de quem tem agendamento marcado na janela
// Sem dupla contagem: com acordo ativo o cliente entra pelas parcelas do
// acordo, nunca pelo titulo original (clientBalanceSplit); o agendamento soma
// so o VENCIDO, e as duas primeiras linhas so o que ainda vai vencer.
//
// Recebido no periodo tem DUAS fontes (reuniao 25/11, "deixar claro"):
//   baixa no ERP  -> valor_recebido das parcelas com data_de_recebimento no
//                    periodo (mesma regra da Conferencia de recebimentos)
//   cobrador      -> o que ele registrou no app (sale_payments)
// Nao se somam: o pagamento registrado pelo cobrador tambem baixa no ERP. Por
// isso o painel mostra a baixa do ERP SEM registro do cobrador a parte
// (cliente que pagou direto na loja/banco).

import { ScheduledVisit, Collection, SaleGroup } from "../types";
import {
  AcordoAtivoOverdueMap,
  clientBalanceSplit,
  hasInstallmentBalance,
  parcelaNoPeriodo,
} from "./clientStatus";
import { inadimplenciaDe, Inadimplencia } from "./inadimplencia";
import { toYYYYMMDD } from "./dates";
import { criarCalculoAtraso } from "../utils/formatters";
import { isVisitOpen } from "../config/visitStatus";

export interface ResumoEmpresa {
  clientes: {
    total: number;
    emDia: number;
    quitados: number;
    emAtraso: number;
    semCobrador: number;
    comAgendamento: number;
    semAgendamento: number;
    /** Dos sem agendamento, quantos foram acionados no periodo (ligacao,
     * WhatsApp, visita). null = acionamentos ainda carregando/indisponiveis. */
    semAgendamentoAcionados: number | null;
    /** Clientes que pagaram no periodo (registro do cobrador OU baixa no
     * ERP) e, deles, os que so tem baixa no ERP. */
    pagaram: number;
    pagaramSoErp: number;
  };
  carteira: {
    vencido: number;
    aVencer: number;
    /** Saldo (vencido + a vencer) de clientes sem cobrador. */
    foraDaCobranca: number;
    /** Recorte do periodo (vencimento dentro dele), por parcela. */
    vencidoPeriodo: number;
    aVencerPeriodo: number;
  };
  recebido: {
    /** Baixado no ERP no periodo (todas as parcelas da base recortada). */
    erp: number;
    /** Desse, de clientes sem registro do cobrador no periodo. */
    soErp: number;
  };
  inadimplencia: Inadimplencia;
  previsao: {
    /** Janela usada: de max(hoje, inicio) ate o fim; null = periodo ja passou. */
    de: string | null;
    ate: string;
    parcelas: number;
    parcelasClientes: number;
    acordo: number;
    acordoClientes: number;
    agendados: number;
    agendadosClientes: number;
    total: number;
  };
}

const saldoParcela = (c: Collection) =>
  (c.valor_original || 0) - (c.valor_recebido || 0) - (c.desconto || 0);

export const resumoEmpresa = ({
  collections,
  scheduledVisits,
  acordoAtivoParcelas,
  dateFrom,
  dateTo,
  today,
  lojasExcluidas = new Set<string>(),
  acionados = null,
  registradosCobrador = new Set<string>(),
}: {
  collections: Collection[];
  scheduledVisits: ScheduledVisit[];
  acordoAtivoParcelas: AcordoAtivoOverdueMap;
  dateFrom: string;
  dateTo: string;
  today: string;
  /** Lojas fora do recorte (nome_da_loja da parcela); vazio = todas. */
  lojasExcluidas?: Set<string>;
  /** Clientes acionados no periodo; null = carregando. */
  acionados?: Set<string> | null;
  /** Clientes com pagamento registrado pelo cobrador no periodo. */
  registradosCobrador?: Set<string>;
}): ResumoEmpresa => {
  const atrasoDias = criarCalculoAtraso();
  const titulos =
    lojasExcluidas.size > 0
      ? collections.filter((c) => !lojasExcluidas.has(c.nome_da_loja ?? ""))
      : collections;

  const porCliente = new Map<string, Collection[]>();
  titulos.forEach((c) => {
    if (!c.documento) return;
    const lista = porCliente.get(c.documento);
    if (lista) lista.push(c);
    else porCliente.set(c.documento, [c]);
  });

  // Agendamento aberto (inclui o que ja passou da data sem registro: o
  // cliente esta agendado, so que atrasado -- isso aparece por cobrador).
  const agendadoAberto = new Set<string>();
  // Data do proximo agendamento aberto de cada cliente (para a previsao).
  const proximoAgendamento = new Map<string, string>();
  scheduledVisits.forEach((v) => {
    if (!v.clientDocument || !isVisitOpen(v)) return;
    agendadoAberto.add(v.clientDocument);
    const d = v.scheduledDate;
    if (!d || d < today) return;
    const atual = proximoAgendamento.get(v.clientDocument);
    if (!atual || d < atual) proximoAgendamento.set(v.clientDocument, d);
  });

  const prevDe = dateFrom && dateFrom > today ? dateFrom : today;
  const prevAte = dateTo || "9999-12-31";
  const janelaValida = prevDe <= prevAte;
  const naJanela = (d: string | null | undefined) =>
    janelaValida && !!d && d >= prevDe && d <= prevAte;

  const r: ResumoEmpresa = {
    clientes: {
      total: 0,
      emDia: 0,
      quitados: 0,
      emAtraso: 0,
      semCobrador: 0,
      comAgendamento: 0,
      semAgendamento: 0,
      semAgendamentoAcionados: acionados ? 0 : null,
      pagaram: 0,
      pagaramSoErp: 0,
    },
    carteira: {
      vencido: 0,
      aVencer: 0,
      foraDaCobranca: 0,
      vencidoPeriodo: 0,
      aVencerPeriodo: 0,
    },
    recebido: { erp: 0, soErp: 0 },
    inadimplencia: inadimplenciaDe(titulos, { atrasoDias }),
    previsao: {
      de: janelaValida ? prevDe : null,
      ate: prevAte,
      parcelas: 0,
      parcelasClientes: 0,
      acordo: 0,
      acordoClientes: 0,
      agendados: 0,
      agendadosClientes: 0,
      total: 0,
    },
  };

  porCliente.forEach((lista, documento) => {
    const split = clientBalanceSplit(
      { document: documento, sales: [{ installments: lista } as SaleGroup] },
      acordoAtivoParcelas,
      atrasoDias,
    );
    const vencido = split.vencido > 0.01 ? split.vencido : 0;
    const aVencer = split.aVencer > 0.01 ? split.aVencer : 0;
    const comCobrador = lista.some(
      (c) => !!c.user_id && hasInstallmentBalance(c),
    );

    r.clientes.total++;
    if (vencido > 0) {
      r.clientes.emAtraso++;
      if (!comCobrador) r.clientes.semCobrador++;
      else if (agendadoAberto.has(documento)) r.clientes.comAgendamento++;
      else {
        r.clientes.semAgendamento++;
        if (acionados?.has(documento)) {
          r.clientes.semAgendamentoAcionados =
            (r.clientes.semAgendamentoAcionados ?? 0) + 1;
        }
      }
    } else if (aVencer > 0) {
      r.clientes.emDia++;
    } else {
      r.clientes.quitados++;
    }

    r.carteira.vencido += vencido;
    r.carteira.aVencer += aVencer;
    if (!comCobrador) r.carteira.foraDaCobranca += vencido + aVencer;

    // Recorte do periodo (mesma regra do card Valores da Atribuicao) e
    // recebido no periodo pela baixa do ERP.
    let baixaErp = 0;
    lista.forEach((c) => {
      const parcela = parcelaNoPeriodo(c, dateFrom, dateTo);
      if (parcela?.noPeriodo) {
        if (parcela.vencida) r.carteira.vencidoPeriodo += parcela.saldo;
        else r.carteira.aVencerPeriodo += parcela.saldo;
      }
      const receb = toYYYYMMDD(c.data_de_recebimento);
      if (
        receb &&
        receb >= dateFrom &&
        receb <= dateTo &&
        (c.valor_recebido || 0) > 0
      ) {
        baixaErp += c.valor_recebido || 0;
      }
    });
    const registrou = registradosCobrador.has(documento);
    if (baixaErp > 0) {
      r.recebido.erp += baixaErp;
      if (!registrou) {
        r.recebido.soErp += baixaErp;
        r.clientes.pagaramSoErp++;
      }
    }
    if (baixaErp > 0 || registrou) r.clientes.pagaram++;

    if (!janelaValida) return;

    const acordo = acordoAtivoParcelas.get(documento);
    if (acordo) {
      let soma = 0;
      acordo.forEach((p) => {
        if (p.saldo > 0.01 && naJanela(toYYYYMMDD(p.dataVencimento))) {
          soma += p.saldo;
        }
      });
      if (soma > 0) {
        r.previsao.acordo += soma;
        r.previsao.acordoClientes++;
      }
    } else {
      let soma = 0;
      lista.forEach((c) => {
        if (!hasInstallmentBalance(c)) return;
        if (naJanela(toYYYYMMDD(c.data_vencimento))) soma += saldoParcela(c);
      });
      if (soma > 0) {
        r.previsao.parcelas += soma;
        r.previsao.parcelasClientes++;
      }
    }

    if (vencido > 0 && naJanela(proximoAgendamento.get(documento))) {
      r.previsao.agendados += vencido;
      r.previsao.agendadosClientes++;
    }
  });

  r.previsao.total =
    r.previsao.parcelas + r.previsao.acordo + r.previsao.agendados;
  return r;
};

/** Lojas presentes na base (para o filtro do painel), em ordem alfabetica. */
export const lojasDaBase = (collections: Collection[]): string[] =>
  Array.from(
    new Set(
      collections
        .map((c) => c.nome_da_loja)
        .filter((l): l is string => !!l && !!l.trim()),
    ),
  ).sort((a, b) => a.localeCompare(b, "pt-BR"));
