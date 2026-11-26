---
name: design-painel
description: Regras de hierarquia visual das telas de números deste projeto (Resumo Geral, Por cobrador, Por loja, Inadimplência e qualquer painel/card novo do gestor). Use ANTES de criar ou mexer em card, quadrinho, barra, faixa ou painel de indicadores.
---

# Design de painel (Sistema de Cobrança)

Quem lê é o **gestor leigo**. Ele entende pelo visual (número, barra, cor de
alerta), não por texto. Objetivo: **um ponto focal por card** e uma ordem de
leitura óbvia, sem tirar informação — o que é secundário fica menor e mais
calmo, não some.

## Os 4 níveis de um card (nunca dois no mesmo peso)

| Nível | O quê | Estilo |
|---|---|---|
| 1 | Número principal | `text-3xl font-extrabold tracking-tight text-gray-900` (aba Inadimplência: `text-4xl`). **Tinta neutra**, nunca a cor do assunto. |
| 2 | Visual de apoio | Barra com tracinho de referência (`BarraReferencia`) ou barra de partes (`BarraPartes`). Aqui a cor pode aparecer. |
| 3 | Métricas secundárias | Texto **sem caixa**: valor `text-base font-bold tabular-nums` + rótulo `text-[11px] text-gray-500`, separadas do bloco de cima por `border-t border-gray-200 pt-2.5`. Cor do valor via `METRICA[tom]` (`components/common/pilulaEstilo`). |
| 4 | Links | "ver detalhes" em **cinza** (`text-gray-500`). Só a ação de navegação ("mês a mês →") é azul. |

Frase de apoio do número: `text-sm text-gray-500`, uma linha (encurte o texto
em vez de deixar quebrar).

Explicação ("por que esse número é diferente", "de quem é") **não vai como
parágrafo no card**: vai no ícone (i) do canto (`info` do `CardSimples`), em
1–2 frases curtas (usuário, 26/11).

## Cor

- **Cor do assunto** (identidade do card): só no ícone do título e na borda
  do topo (`border-t-4`, tom -400). O usuário gosta da borda — manter.
- **Cor de estado** (vermelho/âmbar/verde): só onde é alerta ou bom de
  verdade (vencido, sem pagar, atraso sem cobrador, recuperado). Neutro
  (`gray`) para todo o resto. Se tudo tem cor, nada tem.
- Nada de fundo colorido + borda colorida em quadrinho (era o que poluía).
- Partes de um total: barra única dividida (cinza → verde → âmbar →
  vermelho) + legenda com bolinha, valor e rótulo. Não 4 caixas coloridas.

## Caixas e agrupamento (Gestalt)

- No máximo **2 níveis de caixa**: painel branco → card cinza (`bg-gray-100`).
  Dentro do card, agrupe por **espaço e linha fina**, não por mais caixas.
- Todo card tem **borda fina e discreta** (`border border-gray-200
  dark:border-dark-border`): sem ela, o card solto no fundo da página (sem
  painel branco por trás) fica difícil de ler (usuário, 26/11).
- Proximidade: o que se soma ou se compara fica junto; "↪ desses, ..." recuado
  embaixo da linha de que faz parte.
- Card de largura toda (faixa): número à esquerda (`lg:w-56`) e o visual à
  direita (`lg:flex-1`). Em espaço estreito (card de cada cobrador/loja) use
  `faixaEmpilhada`.
- Métricas: 2 colunas no card normal (3 lado a lado corta rótulo); 4 só em
  card da largura toda.

## Componentes para reutilizar (`components/dashboard/ResumoEmpresa.tsx`)

`CardSimples` (props `extra`, `etiqueta`, `acao`, `faixa`, `faixaEmpilhada`),
`CardInadimplencia`, `CardRecuperacao`, `BarraReferencia`, `BarraPartes`.
Saldo em aberto sempre **Vencido × A vencer** (`SaldoAberto`,
`clientBalanceSplit`) — ver CLAUDE.md.

## Gráficos

Siga a skill `dataviz`: um eixo só, rampa sequencial de um tom, tooltip no
hover, `viewBox` largo (1200×260) para o texto não crescer.

## Antes de dar por pronto

1. Abrir no navegador (localhost) e olhar: cada card tem **um** ponto focal?
   Algo secundário grita mais que o número? Algum rótulo cortado ou quebrando?
2. Conferir no celular (~390 px) e no modo escuro.
3. `npx tsc -b` e `npx eslint <arquivo>` sem aumentar a contagem.
