# -*- coding: utf-8 -*-
"""
consulta_titulos_cliente.py

App de consulta rapida (janela Tkinter) dos titulos de um cliente no
Ciclone, sem precisar abrir o sistema. Digita o codigo do cliente
(ex.: 101661) e mostra numa tabela todos os titulos, com situacao
(Aberto/Pago/Cancelado/Agrupado), dados da baixa e um aviso quando a
observacao do titulo menciona "ACORDO" (nao existe uma tabela de
acordo/negociacao no Ciclone - isso fica so no texto livre do titulo
ou no sistema Cedrus).

Conexao somente-leitura via ciclone_conexao.py (ERP_* do .env da raiz do
repositorio). Veio do Dropbox (5 - Scripts, processo do Cedrus) em
2026-11-13, quando o Cedrus foi encerrado.

Uso: duplo-clique em "Consulta_Titulos_Cliente.bat" (pasta ao lado),
ou `python scripts/ciclone/consulta_titulos/consulta_titulos_cliente.py`.
"""

import tkinter as tk
from datetime import date
from decimal import Decimal
from tkinter import font as tkfont
from tkinter import messagebox, ttk

from ciclone_conexao import conectar

SQL_CLIENTE = """
    SELECT pgcln_codigo, pgcln_nome, pgcln_nomefantasia, pgcln_cpfcnpj,
           pgcln_situacao, pgcln_telefonecelular, pgcln_telefonefixo, pgcln_email
    FROM pg_cliente
    WHERE pgcln_codigo = %s
"""

SQL_TITULOS = """
    SELECT
        t.pgemp_codigo, t.pgfll_codigo, t.fncrt_sequenciatitulo,
        t.fncrt_numerotitulo, t.fncrt_parcela,
        t.fncrt_dataemissao, t.fncrt_datavencimento,
        t.fncrt_valor, t.fncrt_saldo, t.fncrt_situacao,
        t.fntti_codigo, tt.fntti_descricao,
        t.fncrt_observacao,
        bx.data_baixa, bx.valor_baixa, bx.situacoes_baixa, bx.formas_pagamento
    FROM fn_crtitulo t
    LEFT JOIN fn_tipotitulo tt ON tt.fntti_codigo = t.fntti_codigo
    LEFT JOIN (
        SELECT
            tb.pgemp_codigo, tb.pgfll_codigo, tb.pgcln_codigo, tb.fncrt_sequenciatitulo,
            MAX(cb.fncrb_databaixa) AS data_baixa,
            SUM(tb.fntbd_valorbaixa) AS valor_baixa,
            STRING_AGG(DISTINCT cb.fncrb_situacao, ',') AS situacoes_baixa,
            STRING_AGG(DISTINCT fp.fnfpt_descricao, ', ') AS formas_pagamento
        FROM fn_crtitulobaixado tb
        JOIN fn_crbaixa cb
          ON cb.pgemp_codigo = tb.pgemp_codigo
         AND cb.pgfll_codigo = tb.pgfll_codigo
         AND cb.fncrb_numerobaixa = tb.fncrb_numerobaixa
        LEFT JOIN fn_crbaixaformapagamento bfp
          ON bfp.pgemp_codigo = cb.pgemp_codigo
         AND bfp.pgfll_codigo = cb.pgfll_codigo
         AND bfp.fncrb_numerobaixa = cb.fncrb_numerobaixa
        LEFT JOIN fn_formapagamento fp ON fp.fnfpt_codigo = bfp.fnfpt_codigo
        WHERE tb.pgcln_codigo = %s
        GROUP BY tb.pgemp_codigo, tb.pgfll_codigo, tb.pgcln_codigo, tb.fncrt_sequenciatitulo
    ) bx
      ON bx.pgemp_codigo = t.pgemp_codigo
     AND bx.pgfll_codigo = t.pgfll_codigo
     AND bx.pgcln_codigo = t.pgcln_codigo
     AND bx.fncrt_sequenciatitulo = t.fncrt_sequenciatitulo
    WHERE t.pgcln_codigo = %s
    ORDER BY t.fncrt_datavencimento, t.fncrt_numerotitulo, t.fncrt_parcela
"""

COR_PAGO = "#1a7f37"
COR_ABERTO = "#1f2937"
COR_VENCIDO = "#b42318"
COR_CANCELADO = "#8a8f98"
COR_AGRUPADO = "#9a6700"
COR_ACORDO_BG = "#fff6d8"


def fmt_moeda(v):
    if v is None:
        return ""
    v = Decimal(v)
    s = f"{v:,.2f}"
    s = s.replace(",", "§").replace(".", ",").replace("§", ".")
    return f"R$ {s}"


def fmt_data(d):
    if d is None:
        return ""
    return d.strftime("%d/%m/%Y")


def classificar(situacao, saldo, tipo_codigo, tem_baixa_valida, data_vencimento):
    """Retorna (rotulo_facil_de_ler, cor)."""
    if situacao == "C":
        return "Cancelado", COR_CANCELADO
    if situacao == "F":
        return "Agrupado (substituído)", COR_AGRUPADO
    # situacao == 'A' (ativo)
    if saldo is not None and saldo <= 0:
        return "Pago", COR_PAGO
    if tipo_codigo == 2:
        return "Aberto (cheque em carteira)", COR_ABERTO
    if data_vencimento and data_vencimento < date.today():
        return "Aberto - VENCIDO", COR_VENCIDO
    return "Aberto", COR_ABERTO


class App(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("Consulta de Títulos do Cliente — Ciclone")
        self.geometry("1280x720")
        self.minsize(1000, 600)

        self.linhas_originais = []  # lista de dicts, dados crus da ultima busca
        self.cliente_atual = None

        self._montar_topo()
        self._montar_filtros()
        self._montar_tabela()
        self._montar_detalhe()

        self.entry_codigo.focus_set()

    # ---------- construção da UI ----------

    def _montar_topo(self):
        f = ttk.Frame(self, padding=10)
        f.pack(fill="x")

        ttk.Label(f, text="Código do cliente:", font=("Segoe UI", 11)).pack(side="left")
        self.entry_codigo = ttk.Entry(f, width=12, font=("Segoe UI", 11))
        self.entry_codigo.pack(side="left", padx=(6, 10))
        self.entry_codigo.bind("<Return>", lambda e: self.buscar())

        ttk.Button(f, text="Buscar", command=self.buscar).pack(side="left")

        self.label_cliente = ttk.Label(
            f, text="", font=("Segoe UI", 11, "bold"), foreground="#1f2937"
        )
        self.label_cliente.pack(side="left", padx=20)

        self.label_resumo = ttk.Label(f, text="", font=("Segoe UI", 10), foreground="#555")
        self.label_resumo.pack(side="right")

    def _montar_filtros(self):
        f = ttk.Frame(self, padding=(10, 0, 10, 6))
        f.pack(fill="x")

        ttk.Label(f, text="Situação:").pack(side="left")
        self.combo_situacao = ttk.Combobox(
            f,
            state="readonly",
            width=20,
            values=["Todos", "Aberto", "Aberto - VENCIDO", "Pago", "Cancelado", "Agrupado (substituído)"],
        )
        self.combo_situacao.set("Todos")
        self.combo_situacao.pack(side="left", padx=(6, 16))
        self.combo_situacao.bind("<<ComboboxSelected>>", lambda e: self.aplicar_filtros())

        self.var_so_acordo = tk.BooleanVar(value=False)
        ttk.Checkbutton(
            f,
            text="Só com possível acordo (observação cita 'ACORDO' ou baixa por renegociação)",
            variable=self.var_so_acordo,
            command=self.aplicar_filtros,
        ).pack(side="left", padx=(0, 16))

        ttk.Label(f, text="Buscar (nº título / observação):").pack(side="left")
        self.entry_busca = ttk.Entry(f, width=30)
        self.entry_busca.pack(side="left", padx=(6, 0))
        self.entry_busca.bind("<KeyRelease>", lambda e: self.aplicar_filtros())

    def _montar_tabela(self):
        cols = [
            ("emp_fil", "Emp/Fil", 60),
            ("titulo", "Título", 110),
            ("parcela", "Parc", 45),
            ("emissao", "Emissão", 85),
            ("vencimento", "Vencimento", 85),
            ("valor", "Valor", 100),
            ("saldo", "Saldo", 100),
            ("situacao", "Situação", 150),
            ("tipo", "Tipo de título", 140),
            ("data_baixa", "Data baixa", 85),
            ("valor_baixa", "Valor baixa", 100),
            ("forma_pagto", "Forma pagto", 130),
            ("acordo", "Acordo?", 70),
        ]

        frame = ttk.Frame(self, padding=(10, 0, 10, 0))
        frame.pack(fill="both", expand=True)

        self.tree = ttk.Treeview(
            frame, columns=[c[0] for c in cols], show="headings", selectmode="browse"
        )
        for key, titulo, largura in cols:
            anchor = "e" if key in ("valor", "saldo", "valor_baixa", "parcela") else "w"
            self.tree.heading(key, text=titulo)
            self.tree.column(key, width=largura, anchor=anchor, stretch=(key in ("tipo",)))

        vsb = ttk.Scrollbar(frame, orient="vertical", command=self.tree.yview)
        self.tree.configure(yscrollcommand=vsb.set)
        self.tree.pack(side="left", fill="both", expand=True)
        vsb.pack(side="right", fill="y")

        self.tree.tag_configure("pago", foreground=COR_PAGO)
        self.tree.tag_configure("aberto", foreground=COR_ABERTO)
        self.tree.tag_configure("vencido", foreground=COR_VENCIDO)
        self.tree.tag_configure("cancelado", foreground=COR_CANCELADO)
        self.tree.tag_configure("agrupado", foreground=COR_AGRUPADO)
        self.tree.tag_configure("acordo_bg", background=COR_ACORDO_BG)

        self.tree.bind("<<TreeviewSelect>>", self.mostrar_detalhe)

    def _montar_detalhe(self):
        f = ttk.LabelFrame(self, text="Detalhe do título selecionado (observação completa)", padding=8)
        f.pack(fill="x", padx=10, pady=(6, 10))

        self.texto_detalhe = tk.Text(f, height=6, wrap="word", font=("Segoe UI", 10))
        self.texto_detalhe.pack(fill="x", expand=True)
        self.texto_detalhe.configure(state="disabled")

    # ---------- lógica ----------

    def buscar(self):
        codigo_txt = self.entry_codigo.get().strip()
        if not codigo_txt.isdigit():
            messagebox.showwarning("Código inválido", "Digite um código de cliente numérico (ex.: 101661).")
            return
        codigo = int(codigo_txt)

        try:
            conn = conectar()
        except Exception as exc:
            messagebox.showerror("Erro de conexão", f"Não foi possível conectar ao Ciclone:\n{exc}")
            return

        try:
            cur = conn.cursor()
            cur.execute(SQL_CLIENTE, (codigo,))
            cliente = cur.fetchone()
            if not cliente:
                messagebox.showinfo("Cliente não encontrado", f"Nenhum cliente com código {codigo} no Ciclone.")
                self.cliente_atual = None
                self.label_cliente.configure(text="")
                self.linhas_originais = []
                self._popular_tabela([])
                return

            self.cliente_atual = cliente
            nome = cliente[1] or cliente[2] or "(sem nome)"
            situacao_cli = "Ativo" if cliente[4] == "A" else (cliente[4] or "")
            self.label_cliente.configure(text=f"{codigo} — {nome}  [{situacao_cli}]")

            cur.execute(SQL_TITULOS, (codigo, codigo))
            colnames = [d[0] for d in cur.description]
            linhas = [dict(zip(colnames, row)) for row in cur.fetchall()]
            self.linhas_originais = linhas
            self.aplicar_filtros()
        except Exception as exc:
            messagebox.showerror("Erro na consulta", str(exc))
        finally:
            conn.close()

    def aplicar_filtros(self):
        situacao_filtro = self.combo_situacao.get()
        so_acordo = self.var_so_acordo.get()
        busca = self.entry_busca.get().strip().lower()

        linhas_exibir = []
        for linha in self.linhas_originais:
            rotulo, cor = classificar(
                linha["fncrt_situacao"],
                linha["fncrt_saldo"],
                linha["fntti_codigo"],
                linha["situacoes_baixa"],
                linha["fncrt_datavencimento"],
            )
            observacao = linha["fncrt_observacao"] or ""
            forma_pagto = (linha["formas_pagamento"] or "").lower()
            tem_acordo = "acordo" in observacao.lower() or "renegocia" in forma_pagto

            if situacao_filtro != "Todos" and rotulo != situacao_filtro:
                continue
            if so_acordo and not tem_acordo:
                continue
            if busca:
                alvo = f"{linha['fncrt_numerotitulo']} {observacao}".lower()
                if busca not in alvo:
                    continue

            linhas_exibir.append((linha, rotulo, cor, tem_acordo))

        self._popular_tabela(linhas_exibir)
        self.label_resumo.configure(text=f"{len(linhas_exibir)} de {len(self.linhas_originais)} título(s)")

    def _popular_tabela(self, linhas_exibir):
        self.tree.delete(*self.tree.get_children())
        for linha, rotulo, cor, tem_acordo in linhas_exibir:
            tag_cor = {
                COR_PAGO: "pago",
                COR_ABERTO: "aberto",
                COR_VENCIDO: "vencido",
                COR_CANCELADO: "cancelado",
                COR_AGRUPADO: "agrupado",
            }.get(cor, "aberto")
            tags = (tag_cor, "acordo_bg") if tem_acordo else (tag_cor,)

            self.tree.insert(
                "",
                "end",
                iid=str(id(linha)),
                values=(
                    f"{linha['pgemp_codigo']}/{linha['pgfll_codigo']}",
                    linha["fncrt_numerotitulo"],
                    linha["fncrt_parcela"],
                    fmt_data(linha["fncrt_dataemissao"]),
                    fmt_data(linha["fncrt_datavencimento"]),
                    fmt_moeda(linha["fncrt_valor"]),
                    fmt_moeda(linha["fncrt_saldo"]),
                    rotulo,
                    linha["fntti_descricao"] or "",
                    fmt_data(linha["data_baixa"]),
                    fmt_moeda(linha["valor_baixa"]),
                    linha["formas_pagamento"] or "",
                    "Sim" if tem_acordo else "",
                ),
                tags=tags,
            )
            self._tree_dados = getattr(self, "_tree_dados", {})
            self._tree_dados[str(id(linha))] = linha

    def mostrar_detalhe(self, _event=None):
        sel = self.tree.selection()
        self.texto_detalhe.configure(state="normal")
        self.texto_detalhe.delete("1.0", "end")
        if sel and hasattr(self, "_tree_dados") and sel[0] in self._tree_dados:
            linha = self._tree_dados[sel[0]]
            partes = []
            if linha["fncrt_observacao"]:
                partes.append(linha["fncrt_observacao"].strip())
            if linha["situacoes_baixa"]:
                partes.append(f"[Situação da(s) baixa(s) no Ciclone: {linha['situacoes_baixa']}]")
            self.texto_detalhe.insert("1.0", "\n\n".join(partes) if partes else "(sem observação)")
        self.texto_detalhe.configure(state="disabled")


if __name__ == "__main__":
    app = App()
    default_font = tkfont.nametofont("TkDefaultFont")
    default_font.configure(size=10)
    app.mainloop()
