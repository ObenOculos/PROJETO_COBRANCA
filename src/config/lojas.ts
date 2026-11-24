// Nome curto de loja (24/11): so a parte que diferencia ("Messejana",
// "Itapipoca Ext") -- o prefixo da rede se repete e ocupa espaco. Loja sem
// prefixo conhecido (ex.: "Focco Brasil") fica como esta. O nome completo
// continua sendo a chave (BANCO_DADOS.nome_da_loja); use so para exibir.
const PREFIXOS_REDE = [/^Oticas Luana\s*-?\s*/i, /^Excellence Óticas\s*-?\s*/i];

export function nomeCurtoLoja(loja: string): string {
  for (const prefixo of PREFIXOS_REDE) {
    const curto = loja.replace(prefixo, "").trim();
    if (curto && curto !== loja) return curto;
  }
  return loja;
}

const REDES: { padrao: RegExp; nome: string }[] = [
  { padrao: /^Oticas Luana/i, nome: "Óticas Luana" },
  { padrao: /^Excellence Óticas/i, nome: "Excellence Óticas" },
];

/** Rede da loja para agrupar na tela ("Óticas Luana"); sem rede conhecida
 * a própria loja é a rede (ex.: "Focco Brasil"). */
export function redeDaLoja(loja: string): string {
  return REDES.find((r) => r.padrao.test(loja))?.nome ?? loja;
}
