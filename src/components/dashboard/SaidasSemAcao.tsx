import React, { useEffect, useMemo, useState } from "react";
import { Loader2, Undo2 } from "lucide-react";
import { Modal } from "../Modal";
import { supabase } from "../../lib/supabase";
import { fetchAllRows } from "../../utils/fetchAllRows";
import { useCollection } from "../../contexts/CollectionContext";
import { hasInstallmentBalance } from "../../filters/clientStatus";
import { isCancelado } from "../../types/status";
import { User } from "../../types";
import { SaidaSemAcao } from "../../hooks/useSaidasSemAcao";

interface Props {
  cobrador: User;
  saidas: SaidaSemAcao[];
  users: User[];
  onClose: () => void;
  /** Depois de devolver: recarregar a lista e os numeros da tela. */
  onDevolvido: () => void;
}

type Situacao =
  | { tipo: "comAntigo" }
  | { tipo: "comOutro"; id: string }
  | { tipo: "semCobrador" }
  | { tipo: "quitado" };

interface ParcelaDono {
  id_parcela: number;
  documento: string | null;
  user_id: string | null;
  valor_original: number | null;
  valor_recebido: number | null;
  desconto: number | null;
  status: string | null;
}

/**
 * Clientes que sairam da carteira do cobrador sem acao (carteira automatica,
 * item 55). Mostra com quem cada um esta HOJE e deixa o gestor devolver ao
 * cobrador antigo os que marcar -- quem nao for marcado fica onde esta (com
 * o cobrador novo, ou sem cobrador). A devolucao e a atribuicao manual de
 * sempre (assignCollectorToClients): mesmas travas, situacao por perfil,
 * agendamentos seguem a carteira, e a rotina das 7h respeita por 30 dias.
 */
const SaidasSemAcaoModal: React.FC<Props> = ({
  cobrador,
  saidas,
  users,
  onClose,
  onDevolvido,
}) => {
  const { assignCollectorToClients } = useCollection();
  const [situacao, setSituacao] = useState<Map<string, Situacao> | null>(null);
  const [erroCarga, setErroCarga] = useState(false);
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [salvando, setSalvando] = useState(false);
  const [mensagem, setMensagem] = useState<{ ok: boolean; texto: string } | null>(
    null,
  );
  const [versao, setVersao] = useState(0);

  const nomePorId = useMemo(
    () => new Map(users.map((u) => [u.id, u.name])),
    [users],
  );
  const docs = useMemo(
    () => Array.from(new Set(saidas.map((s) => s.documento))),
    [saidas],
  );

  // Dono atual de cada cliente, direto do banco (o gestor pode nao ter a
  // carteira inteira carregada nesta tela).
  useEffect(() => {
    let cancelled = false;
    setErroCarga(false);
    (async () => {
      const parcelas: ParcelaDono[] = [];
      for (let i = 0; i < docs.length; i += 200) {
        const lote = docs.slice(i, i + 200);
        const linhas = await fetchAllRows<ParcelaDono>(
          (from, to) =>
            supabase
              .from("BANCO_DADOS")
              .select(
                "id_parcela, documento, user_id, valor_original, valor_recebido, desconto, status",
              )
              .in("documento", lote)
              .order("id_parcela", { ascending: true })
              .range(from, to),
          () => cancelled,
        );
        parcelas.push(...linhas);
      }
      const mapa = new Map<string, Situacao>();
      docs.forEach((doc) => {
        const abertas = parcelas.filter(
          (p) =>
            p.documento === doc &&
            !isCancelado(p.status) &&
            hasInstallmentBalance({
              valor_original: p.valor_original ?? 0,
              valor_recebido: p.valor_recebido ?? 0,
              desconto: p.desconto ?? 0,
            }),
        );
        if (abertas.length === 0) {
          mapa.set(doc, { tipo: "quitado" });
          return;
        }
        const dono = abertas.find((p) => p.user_id)?.user_id ?? null;
        mapa.set(
          doc,
          !dono
            ? { tipo: "semCobrador" }
            : dono === cobrador.id
              ? { tipo: "comAntigo" }
              : { tipo: "comOutro", id: dono },
        );
      });
      if (!cancelled) setSituacao(mapa);
    })().catch((err) => {
      console.error("Erro ao carregar com quem estão os clientes:", err);
      if (!cancelled) setErroCarga(true);
    });
    return () => {
      cancelled = true;
    };
  }, [docs, cobrador.id, versao]);

  const podeDevolver = (doc: string) => {
    const s = situacao?.get(doc);
    return !!s && (s.tipo === "comOutro" || s.tipo === "semCobrador");
  };
  const devolviveis = docs.filter(podeDevolver);

  const alternar = (doc: string) =>
    setMarcados((prev) => {
      const n = new Set(prev);
      if (n.has(doc)) n.delete(doc);
      else n.add(doc);
      return n;
    });

  const devolver = async () => {
    const lista = Array.from(marcados).filter(podeDevolver);
    if (lista.length === 0) return;
    setSalvando(true);
    setMensagem(null);
    try {
      await assignCollectorToClients(
        cobrador.id,
        lista.map((document) => ({ document })),
      );
      setMensagem({
        ok: true,
        texto: `${lista.length} ${lista.length === 1 ? "cliente devolvido" : "clientes devolvidos"} para ${cobrador.name}. A carteira automática não tira esses clientes por 30 dias.`,
      });
      setMarcados(new Set());
      setVersao((v) => v + 1);
      onDevolvido();
    } catch (err) {
      console.error("Erro ao devolver clientes:", err);
      setMensagem({
        ok: false,
        texto:
          "Não foi possível devolver. Cliente com acordo ou agendamento ativo com outro cobrador não pode ser movido.",
      });
    } finally {
      setSalvando(false);
    }
  };

  const textoSituacao = (doc: string): React.ReactNode => {
    const s = situacao?.get(doc);
    if (!s) return "…";
    switch (s.tipo) {
      case "comAntigo":
        return <span className="text-green-700 dark:text-green-400">Já voltou para {cobrador.name}</span>;
      case "comOutro":
        return <span className="font-semibold text-gray-900 dark:text-dark-text">{nomePorId.get(s.id) ?? "Outro cobrador"}</span>;
      case "semCobrador":
        return <span className="text-amber-700 dark:text-amber-400">Sem cobrador</span>;
      case "quitado":
        return <span className="text-gray-400">Quitado / fora da cobrança</span>;
    }
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={`Saíram da carteira de ${cobrador.name} sem ação`}
      size="3xl"
    >
      <p className="text-sm text-gray-600 dark:text-dark-text-secondary">
        Estes clientes passaram da faixa de {cobrador.name} sem nenhum
        atendimento, pagamento, acordo ou agendamento do cobrador nos
        últimos 30 dias, e a carteira automática os tirou. Marque quem deve{" "}
        <strong>voltar para {cobrador.name}</strong>; quem não for marcado
        fica com quem está hoje.
      </p>

      {mensagem && (
        <div
          className={`mt-3 rounded-lg px-3 py-2 text-sm ${mensagem.ok ? "bg-green-50 text-green-800 dark:bg-green-900/20 dark:text-green-300" : "bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300"}`}
        >
          {mensagem.texto}
        </div>
      )}

      {erroCarga ? (
        <p className="mt-4 text-sm text-red-600">
          Não foi possível ver com quem os clientes estão hoje. Feche e abra de novo.
        </p>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-xl border border-gray-200 dark:border-dark-border">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-dark-bg-secondary text-xs text-gray-500 dark:text-dark-text-secondary">
              <tr>
                <th className="px-3 py-2 w-8" />
                <th className="px-3 py-2 text-left font-medium">Cliente</th>
                <th className="px-3 py-2 text-left font-medium">Loja</th>
                <th className="px-3 py-2 text-left font-medium">Saiu em</th>
                <th className="px-3 py-2 text-left font-medium">Hoje está com</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-dark-border">
              {saidas.map((s) => (
                <tr
                  key={s.id}
                  onClick={() => podeDevolver(s.documento) && alternar(s.documento)}
                  className={podeDevolver(s.documento) ? "cursor-pointer hover:bg-gray-50 dark:hover:bg-dark-bg-secondary" : ""}
                >
                  <td className="px-3 py-2 text-center">
                    {podeDevolver(s.documento) && (
                      <input
                        type="checkbox"
                        checked={marcados.has(s.documento)}
                        onChange={() => alternar(s.documento)}
                        onClick={(e) => e.stopPropagation()}
                        aria-label={`Devolver ${s.cliente_nome ?? s.documento}`}
                      />
                    )}
                  </td>
                  <td className="px-3 py-2 text-gray-900 dark:text-dark-text">
                    {s.cliente_nome || s.documento}
                  </td>
                  <td className="px-3 py-2 text-gray-600 dark:text-dark-text-secondary">
                    {s.nome_da_loja || "—"}
                  </td>
                  <td className="px-3 py-2 text-gray-600 dark:text-dark-text-secondary whitespace-nowrap">
                    {new Date(s.assigned_at).toLocaleDateString("pt-BR")}
                  </td>
                  <td className="px-3 py-2">{textoSituacao(s.documento)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <span className="text-xs text-gray-500 dark:text-dark-text-secondary">
          {situacao === null && !erroCarga
            ? "Vendo com quem os clientes estão hoje…"
            : devolviveis.length === 0
              ? "Nenhum cliente para devolver."
              : `${marcados.size} de ${devolviveis.length} marcados`}
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-100 dark:text-dark-text-secondary dark:hover:bg-dark-bg-tertiary"
          >
            Fechar
          </button>
          <button
            type="button"
            disabled={marcados.size === 0 || salvando}
            onClick={devolver}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {salvando ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Undo2 className="w-4 h-4" />
            )}
            Devolver para {cobrador.name}
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default SaidasSemAcaoModal;
