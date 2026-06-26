import React, { useState, useEffect } from "react";
import { supabase } from "../../lib/supabase";
import {
  Phone,
  MessageCircle,
  MapPin,
  DollarSign,
  CheckCircle,
  Plus,
  Save,
  ClipboardList,
  History,
  Info,
} from "lucide-react";
import { Collection, UserType, CollectionAttempt } from "../../types";
import { useCollection } from "../../contexts/CollectionContext";
import {
  formatCurrency,
  formatDate,
  getStatusLabel,
  getStatusColor,
} from "../../utils/formatters";
import { Modal } from "../Modal";
import TabTransition from "../common/TabTransition";

interface CollectionModalProps {
  collection: Collection;
  userType: UserType;
  onClose: () => void;
}

const ATTEMPT_TYPE_LABELS: Record<CollectionAttempt["type"], string> = {
  call: "Ligação",
  visit: "Visita",
  email: "E-mail",
  whatsapp: "WhatsApp",
};

const ATTEMPT_RESULT_LABELS: Record<CollectionAttempt["result"], string> = {
  no_answer: "Não atendeu",
  busy: "Ocupado",
  not_found: "Não encontrado",
  promise: "Promessa de pagamento",
  refusal: "Recusa",
  partial_payment: "Pagamento parcial",
  full_payment: "Pagamento integral",
};

const CollectionModal: React.FC<CollectionModalProps> = ({
  collection,
  userType,
  onClose,
}) => {
  const { updateCollection, addAttempt } = useCollection();
  const [currentAddress, setCurrentAddress] = useState<any>(null);
  const [addressLoading, setAddressLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"details" | "attempts" | "action">(
    "details",
  );

  useEffect(() => {
    const fetchAddress = async () => {
      if (!collection.documento) return;
      setAddressLoading(true);
      try {
        const { data, error } = await supabase
          .from("enderecos_historico")
          .select("*")
          .eq("cliente_documento", collection.documento)
          .eq("is_atual", true)
          .limit(1)
          .single();

        if (error && error.code !== "PGRST116") throw error;
        setCurrentAddress(data);
      } catch (err) {
        console.error(
          "Error fetching current address for collection modal",
          err,
        );
      } finally {
        setAddressLoading(false);
      }
    };
    fetchAddress();
  }, [collection.documento]);

  const [attempts, setAttempts] = useState<CollectionAttempt[]>([]);
  const [attemptsLoading, setAttemptsLoading] = useState(true);

  const fetchAttempts = async () => {
    setAttemptsLoading(true);
    try {
      const { data, error } = await supabase
        .from("collection_attempts")
        .select("*")
        .eq("collection_id", collection.id_parcela.toString())
        .order("created_at", { ascending: false });

      if (error) throw error;

      setAttempts(
        (data || []).map((row) => ({
          id: row.id,
          date: row.date,
          type: row.type as CollectionAttempt["type"],
          result: row.result as CollectionAttempt["result"],
          notes: row.notes ?? undefined,
          nextAction: row.next_action ?? undefined,
          nextActionDate: row.next_action_date ?? undefined,
        })),
      );
    } catch (err) {
      console.error("Erro ao buscar tentativas de cobrança:", err);
    } finally {
      setAttemptsLoading(false);
    }
  };

  useEffect(() => {
    fetchAttempts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collection.id_parcela]);

  const [newStatus, setNewStatus] = useState(collection.status || "");
  const [newAttempt, setNewAttempt] = useState<{
    type: "call" | "visit" | "email" | "whatsapp";
    result:
      | "no_answer"
      | "busy"
      | "not_found"
      | "promise"
      | "refusal"
      | "partial_payment"
      | "full_payment";
    notes: string;
    nextAction: string;
    nextActionDate: string;
  }>({
    type: "call",
    result: "no_answer",
    notes: "",
    nextAction: "",
    nextActionDate: "",
  });
  const [observations, setObservations] = useState(collection.obs || "");
  const [correctedValue, setCorrectedValue] = useState(
    collection.valor_recebido.toString(),
  );
  const [correctedDate, setCorrectedDate] = useState(
    collection.data_de_recebimento || new Date().toISOString().split("T")[0],
  );

  const handleStatusUpdate = async () => {
    const updates: Partial<Collection> = { status: newStatus };
    if (newStatus.toLowerCase() === "recebido") {
      updates.valor_recebido = collection.valor_original;
      updates.data_de_recebimento = new Date().toISOString().split("T")[0];
    }
    await updateCollection(collection.id_parcela, updates);
    onClose();
  };

  const handleAddAttempt = async () => {
    if (!newAttempt.notes.trim()) return;
    await addAttempt(collection.id_parcela, {
      ...newAttempt,
      date: new Date().toISOString().split("T")[0],
    });
    await fetchAttempts();
    setNewAttempt({
      type: "call",
      result: "no_answer",
      notes: "",
      nextAction: "",
      nextActionDate: "",
    });
    setActiveTab("attempts");
  };

  const handleUpdateObservations = async () => {
    await updateCollection(collection.id_parcela, { obs: observations });
    onClose();
  };

  const handleUpdatePaymentValue = async () => {
    const value = parseFloat(correctedValue) || 0;
    if (value < 0) {
      alert("O valor não pode ser negativo");
      return;
    }

    if (value > collection.valor_original) {
      const confirm = window.confirm(
        `O valor informado (${formatCurrency(value)}) é maior que o valor original (${formatCurrency(collection.valor_original)}). Deseja continuar?`,
      );
      if (!confirm) return;
    }

    const updates: Partial<Collection> = {
      valor_recebido: value,
      data_de_recebimento: correctedDate || null,
    };

    const discount = collection.desconto || 0;
    if (value + discount >= collection.valor_original) {
      updates.status = discount > 0 ? "Pago com Desconto" : "Pago";
    } else if (value > 0 || discount > 0) {
      updates.status = "Parcial";
    } else {
      updates.status = "pendente";
    }

    await updateCollection(collection.id_parcela, updates);
    onClose();
  };

  const tabs = [
    { id: "details", name: "Detalhes", icon: Info },
    { id: "attempts", name: "Tentativas", icon: History },
    ...(userType !== "manager"
      ? [{ id: "action", name: "Ações", icon: CheckCircle }]
      : []),
  ];

  const formatWhatsApp = (num: string) => {
    const clean = num.replace(/\D/g, "");
    return `https://wa.me/55${clean}`;
  };

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title={collection.cliente ?? undefined}
      size="2xl"
    >
      <div className="flex flex-col h-full -mt-2">
        {/* Header Metadata */}
        <div className="flex items-center gap-3 mb-6 px-1">
          <span className="text-xs font-bold text-gray-500 dark:text-dark-text-secondary tracking-wide">
            DOC: {collection.documento}
          </span>
          <span
            className={`px-2 py-0.5 rounded text-[10px] font-bold tracking-tight ${getStatusColor(collection.status)}`}
          >
            {getStatusLabel(collection.status)}
          </span>
        </div>

        {/* Tab Navigation */}
        <div className="flex gap-1 mb-6 border-b border-gray-100 dark:border-dark-border">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-bold tracking-wide transition-all border-b-2 ${
                  isActive
                    ? "border-blue-600 text-blue-600"
                    : "border-transparent text-gray-400 hover:text-gray-600 dark:hover:text-dark-text"
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.name}
              </button>
            );
          })}
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto custom-scrollbar px-1">
          <TabTransition activeKey={activeTab}>
            {activeTab === "details" && (
              <div className="space-y-8">
                {/* Section: Dados da Venda */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                  <div className="space-y-4">
                    <h4 className="text-[10px] font-bold text-gray-400 tracking-[0.15em] border-b border-gray-50 pb-2">
                      Dados da Cobrança
                    </h4>
                    <div className="space-y-3">
                      <div>
                        <label className="block text-[10px] font-bold text-gray-400 mb-0.5">
                          Loja
                        </label>
                        <p className="text-sm font-semibold text-gray-800 dark:text-dark-text">
                          {collection.nome_da_loja}
                        </p>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[10px] font-bold text-gray-400 mb-0.5">
                            Venda
                          </label>
                          <p className="text-sm font-semibold text-gray-800 dark:text-dark-text">
                            #{collection.venda_n}
                          </p>
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-gray-400 mb-0.5">
                            Parcela
                          </label>
                          <p className="text-sm font-semibold text-gray-800 dark:text-dark-text">
                            {collection.parcela} ({collection.numero_titulo})
                          </p>
                        </div>
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-gray-400 mb-0.5">
                          Tipo
                        </label>
                        <p className="text-sm font-semibold text-gray-800 dark:text-dark-text">
                          {collection.tipo_de_cobranca}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h4 className="text-[10px] font-bold text-gray-400 tracking-[0.15em] border-b border-gray-50 pb-2">
                      Valores e Status
                    </h4>
                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <label className="text-[10px] font-bold text-gray-400">
                          Original
                        </label>
                        <p className="text-sm font-bold text-gray-800 dark:text-dark-text">
                          {formatCurrency(collection.valor_original)}
                        </p>
                      </div>
                      <div className="flex justify-between items-center bg-blue-50/50 dark:bg-blue-900/10 p-2 rounded-lg">
                        <label className="text-[10px] font-bold text-blue-600">
                          Valor Atual
                        </label>
                        <p className="text-sm font-black text-blue-700 dark:text-blue-400">
                          {formatCurrency(
                            collection.valor_reajustado ||
                              collection.valor_original,
                          )}
                        </p>
                      </div>
                      <div className="flex justify-between items-center">
                        <label className="text-[10px] font-bold text-gray-400">
                          Recebido
                        </label>
                        <p
                          className={`text-sm font-bold ${collection.valor_recebido > 0 ? "text-green-600" : "text-gray-400"}`}
                        >
                          {formatCurrency(collection.valor_recebido)}
                        </p>
                      </div>
                      <div className="flex justify-between items-center">
                        <label className="text-[10px] font-bold text-gray-400">
                          Vencimento
                        </label>
                        <p className="text-sm font-semibold text-gray-800 dark:text-dark-text">
                          {formatDate(collection.data_vencimento || "")}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Section: Localização e Contato */}
                <div className="space-y-4">
                  <h4 className="text-[10px] font-bold text-gray-400 tracking-[0.15em] border-b border-gray-50 pb-2">
                    Localização e Contato
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-3">
                      <div className="p-3 border border-gray-100 dark:border-dark-border rounded-xl bg-gray-50/50 dark:bg-dark-bg/30">
                        <div className="flex items-start gap-2">
                          <MapPin className="w-4 h-4 text-gray-400 mt-1" />
                          {addressLoading ? (
                            <div className="animate-pulse h-12 bg-gray-100 rounded w-full"></div>
                          ) : (
                            <div className="text-xs leading-relaxed text-gray-600 dark:text-dark-text-secondary">
                              <p className="font-bold text-gray-800 dark:text-dark-text">
                                {currentAddress?.logradouro ||
                                  collection.endereco}
                                , {currentAddress?.numero || collection.numero}
                              </p>
                              {collection.complemento && !currentAddress && (
                                <p>{collection.complemento}</p>
                              )}
                              <p>
                                {currentAddress?.bairro || collection.bairro} —{" "}
                                {currentAddress?.cidade || collection.cidade}/
                                {currentAddress?.estado || collection.estado}
                              </p>
                              <p className="font-mono">
                                {currentAddress?.cep || collection.cep}
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2">
                      {collection.telefone && (
                        <div className="flex items-center justify-between p-2 hover:bg-gray-50 dark:hover:bg-dark-bg rounded-lg transition-colors">
                          <div className="flex items-center gap-2">
                            <Phone className="w-4 h-4 text-blue-500" />
                            <span className="text-xs font-semibold">
                              {collection.telefone}
                            </span>
                          </div>
                          <button
                            onClick={() =>
                              window.open(`tel:${collection.telefone}`)
                            }
                            className="text-[10px] font-bold text-blue-600"
                          >
                            Ligar
                          </button>
                        </div>
                      )}
                      {collection.celular && (
                        <div className="flex items-center justify-between p-2 hover:bg-gray-50 dark:hover:bg-dark-bg rounded-lg transition-colors">
                          <div className="flex items-center gap-2">
                            <MessageCircle className="w-4 h-4 text-green-500" />
                            <span className="text-xs font-semibold">
                              {collection.celular}
                            </span>
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={() =>
                                window.open(`tel:${collection.celular}`)
                              }
                              className="text-[10px] font-bold text-blue-600"
                            >
                              Ligar
                            </button>
                            <button
                              onClick={() =>
                                collection.celular &&
                                window.open(
                                  formatWhatsApp(collection.celular),
                                  "_blank",
                                )
                              }
                              className="text-[10px] font-bold text-green-600"
                            >
                              WhatsApp
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Observations */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-[10px] font-bold text-gray-400 tracking-[0.15em]">
                      Observações Internas
                    </h4>
                    {userType !== "manager" && (
                      <button
                        onClick={handleUpdateObservations}
                        className="text-[10px] font-bold text-blue-600 flex items-center gap-1 hover:underline"
                      >
                        <Save className="w-3 h-3" />
                        Salvar Alterações
                      </button>
                    )}
                  </div>
                  <textarea
                    value={observations}
                    onChange={(e) => setObservations(e.target.value)}
                    className="w-full px-4 py-3 text-sm border border-gray-200 dark:border-dark-border rounded-xl focus:ring-2 focus:ring-blue-500 dark:bg-dark-bg min-h-[100px]"
                    placeholder="Sem observações registradas..."
                    disabled={userType === "manager"}
                  />
                </div>
              </div>
            )}

            {activeTab === "attempts" && (
              <div className="space-y-4 min-h-[300px]">
                {attemptsLoading ? (
                  <div className="flex items-center justify-center text-center p-8 min-h-[300px]">
                    <p className="text-xs text-gray-400">
                      Carregando tentativas...
                    </p>
                  </div>
                ) : attempts.length === 0 ? (
                  <div className="space-y-6 min-h-[300px] flex flex-col items-center justify-center text-center p-8 bg-gray-50/50 dark:bg-dark-bg/30 rounded-2xl border-2 border-dashed border-gray-100 dark:border-dark-border">
                    <div className="p-4 bg-white dark:bg-dark-bg rounded-full shadow-sm">
                      <ClipboardList className="w-8 h-8 text-gray-300" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-gray-800 dark:text-dark-text tracking-wide">
                        Sem Tentativas
                      </h3>
                      <p className="text-xs text-gray-400 mt-2 max-w-[200px]">
                        Registre novas interações através da aba de Ações
                      </p>
                    </div>
                  </div>
                ) : (
                  <ul className="space-y-3">
                    {attempts.map((attempt) => (
                      <li
                        key={attempt.id}
                        className="p-4 border border-gray-100 dark:border-dark-border rounded-2xl bg-white dark:bg-dark-bg shadow-sm"
                      >
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <span className="inline-flex items-center gap-1.5 text-xs font-bold text-gray-800 dark:text-dark-text">
                            <History className="w-4 h-4 text-blue-500" />
                            {ATTEMPT_TYPE_LABELS[attempt.type] ?? attempt.type}
                          </span>
                          <span className="text-[10px] text-gray-400">
                            {formatDate(attempt.date)}
                          </span>
                        </div>
                        <p className="text-xs font-semibold text-gray-600 dark:text-dark-text-secondary mb-1">
                          {ATTEMPT_RESULT_LABELS[attempt.result] ??
                            attempt.result}
                        </p>
                        {attempt.notes && (
                          <p className="text-xs text-gray-500 dark:text-gray-400 whitespace-pre-wrap">
                            {attempt.notes}
                          </p>
                        )}
                        {attempt.nextAction && (
                          <p className="text-[11px] text-gray-400 mt-2">
                            Próxima ação: {attempt.nextAction}
                            {attempt.nextActionDate
                              ? ` (${formatDate(attempt.nextActionDate)})`
                              : ""}
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {activeTab === "action" && userType !== "manager" && (
              <div className="space-y-6 pb-4">
                {/* Card: Status */}
                <div className="p-5 border border-gray-100 dark:border-dark-border rounded-2xl bg-white dark:bg-dark-bg shadow-sm">
                  <h3 className="text-xs font-bold text-gray-400 tracking-wide mb-4 flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-green-500" />
                    Atualizar Situação
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-bold text-gray-500 mb-1.5">
                        Novo Status
                      </label>
                      <select
                        value={newStatus}
                        onChange={(e) => setNewStatus(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-200 dark:border-dark-border rounded-lg text-sm dark:bg-dark-bg"
                      >
                        <option value="pendente">Pendente</option>
                        <option value="em_negociacao">Em Negociação</option>
                        <option value="acordado">Acordado</option>
                        <option value="recebido">Recebido</option>
                      </select>
                    </div>
                    <div className="flex items-end">
                      <button
                        onClick={handleStatusUpdate}
                        className="w-full py-2.5 bg-green-600 text-white text-xs font-bold tracking-wide rounded-lg hover:bg-green-700 transition-all shadow-lg shadow-green-100 dark:shadow-none"
                      >
                        Confirmar Status
                      </button>
                    </div>
                  </div>
                </div>

                {/* Card: Pagamento */}
                <div className="p-5 border border-gray-100 dark:border-dark-border rounded-2xl bg-white dark:bg-dark-bg shadow-sm">
                  <h3 className="text-xs font-bold text-gray-400 tracking-wide mb-4 flex items-center gap-2">
                    <DollarSign className="w-4 h-4 text-purple-500" />
                    Registrar Recebimento
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                    <div>
                      <label className="block text-[10px] font-bold text-gray-500 mb-1.5">
                        Valor Recebido
                      </label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs font-bold">
                          R$
                        </span>
                        <input
                          type="number"
                          step="0.01"
                          value={correctedValue}
                          onChange={(e) => setCorrectedValue(e.target.value)}
                          className="w-full pl-9 pr-3 py-2 border border-gray-200 dark:border-dark-border rounded-lg text-sm font-bold text-purple-600 dark:bg-dark-bg"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-gray-500 mb-1.5">
                        Data
                      </label>
                      <input
                        type="date"
                        value={correctedDate}
                        onChange={(e) => setCorrectedDate(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-200 dark:border-dark-border rounded-lg text-sm dark:bg-dark-bg"
                      />
                    </div>
                  </div>
                  <div className="p-3 bg-purple-50 dark:bg-purple-900/10 rounded-xl mb-4 flex justify-between items-center">
                    <span className="text-[10px] font-bold text-purple-600">
                      Restante Projetado
                    </span>
                    <span className="text-sm font-black text-red-600">
                      {formatCurrency(
                        Math.max(
                          0,
                          collection.valor_original -
                            (parseFloat(correctedValue) || 0),
                        ),
                      )}
                    </span>
                  </div>
                  <button
                    onClick={handleUpdatePaymentValue}
                    className="w-full py-2.5 bg-purple-600 text-white text-xs font-bold tracking-wide rounded-lg hover:bg-purple-700 transition-all shadow-lg shadow-purple-100 dark:shadow-none"
                  >
                    Salvar Recebimento
                  </button>
                </div>

                {/* Card: Tentativa */}
                <div className="p-5 border border-gray-100 dark:border-dark-border rounded-2xl bg-white dark:bg-dark-bg shadow-sm">
                  <h3 className="text-xs font-bold text-gray-400 tracking-wide mb-4 flex items-center gap-2">
                    <Plus className="w-4 h-4 text-blue-500" />
                    Registrar Interação
                  </h3>
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[10px] font-bold text-gray-500 mb-1.5">
                          Canal
                        </label>
                        <select
                          value={newAttempt.type}
                          onChange={(e) =>
                            setNewAttempt({
                              ...newAttempt,
                              type: e.target.value as any,
                            })
                          }
                          className="w-full px-3 py-2 border border-gray-200 dark:border-dark-border rounded-lg text-sm dark:bg-dark-bg"
                        >
                          <option value="call">Ligação</option>
                          <option value="visit">Visita</option>
                          <option value="whatsapp">WhatsApp</option>
                          <option value="email">E-mail</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-gray-500 mb-1.5">
                          Resultado
                        </label>
                        <select
                          value={newAttempt.result}
                          onChange={(e) =>
                            setNewAttempt({
                              ...newAttempt,
                              result: e.target.value as any,
                            })
                          }
                          className="w-full px-3 py-2 border border-gray-200 dark:border-dark-border rounded-lg text-sm dark:bg-dark-bg"
                        >
                          <option value="no_answer">Não atendeu</option>
                          <option value="busy">Ocupado</option>
                          <option value="promise">Promessa</option>
                          <option value="partial_payment">Pagto Parcial</option>
                          <option value="full_payment">Pagto Total</option>
                          <option value="refusal">Recusa</option>
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-gray-500 mb-1.5">
                        Relato
                      </label>
                      <textarea
                        value={newAttempt.notes}
                        onChange={(e) =>
                          setNewAttempt({
                            ...newAttempt,
                            notes: e.target.value,
                          })
                        }
                        className="w-full px-3 py-2 border border-gray-200 dark:border-dark-border rounded-lg text-sm dark:bg-dark-bg min-h-[60px]"
                        placeholder="Descreva brevemente..."
                      />
                    </div>
                    <button
                      onClick={handleAddAttempt}
                      disabled={!newAttempt.notes.trim()}
                      className="w-full py-2.5 bg-blue-600 text-white text-xs font-bold tracking-wide rounded-lg hover:bg-blue-700 transition-all disabled:opacity-50 shadow-lg shadow-blue-100 dark:shadow-none"
                    >
                      Registrar Tentativa
                    </button>
                  </div>
                </div>
              </div>
            )}
          </TabTransition>
        </div>
      </div>
    </Modal>
  );
};

export default CollectionModal;
