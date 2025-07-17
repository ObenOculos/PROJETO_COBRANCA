import React, { useState } from "react";
import {
  X,
  Phone,
  MessageCircle,
  MapPin,
  DollarSign,
  CheckCircle,
  Plus,
  Save,
} from "lucide-react";
import { Collection } from "../../types";
import { useCollection } from "../../contexts/CollectionContext";
import {
  formatCurrency,
  formatDate,
  getStatusLabel,
} from "../../utils/formatters";

interface CollectionModalProps {
  collection: Collection;
  userType: "manager" | "collector";
  onClose: () => void;
}

const CollectionModal: React.FC<CollectionModalProps> = ({
  collection,
  userType,
  onClose,
}) => {
  const { updateCollection, addAttempt } = useCollection();
  const [activeTab, setActiveTab] = useState<"details" | "attempts" | "action">(
    "details",
  );
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

    // Atualizar status baseado no valor
    if (value === 0) {
      updates.status = "pendente";
    } else if (value >= collection.valor_original) {
      updates.status = "recebido";
    } else {
      updates.status = "parcialmente_pago";
    }

    await updateCollection(collection.id_parcela, updates);
    onClose();
  };

  const tabs = [
    { id: "details", name: "Detalhes", icon: DollarSign },
    { id: "attempts", name: "Tentativas", icon: Phone },
    ...(userType === "collector"
      ? [{ id: "action", name: "Ações", icon: CheckCircle }]
      : []),
  ];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">
              {collection.cliente}
            </h2>
            <p className="text-sm text-gray-600">{collection.documento}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200">
          <nav className="flex">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() =>
                    setActiveTab(tab.id as "details" | "attempts" | "action")
                  }
                  className={`flex items-center px-6 py-3 font-medium text-sm ${
                    activeTab === tab.id
                      ? "border-b-2 border-blue-500 text-blue-600"
                      : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  <Icon className="h-4 w-4 mr-2" />
                  {tab.name}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[60vh]">
          {activeTab === "details" && (
            <div className="space-y-6">
              {/* Basic Info */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <h3 className="text-lg font-medium text-gray-900">
                    Informações da Cobrança
                  </h3>

                  <div className="space-y-3">
                    <div>
                      <label className="text-sm font-medium text-gray-700">
                        Loja
                      </label>
                      <p className="text-gray-900">{collection.nome_da_loja}</p>
                    </div>

                    <div>
                      <label className="text-sm font-medium text-gray-700">
                        Número da Venda
                      </label>
                      <p className="text-gray-900">{collection.venda_n}</p>
                    </div>

                    <div>
                      <label className="text-sm font-medium text-gray-700">
                        Parcela
                      </label>
                      <p className="text-gray-900">
                        {collection.parcela} - {collection.numero_titulo}
                      </p>
                    </div>

                    <div>
                      <label className="text-sm font-medium text-gray-700">
                        Tipo de Cobrança
                      </label>
                      <p className="text-gray-900">
                        {collection.tipo_de_cobranca}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="text-lg font-medium text-gray-900">
                    Valores e Datas
                  </h3>

                  <div className="space-y-3">
                    <div>
                      <label className="text-sm font-medium text-gray-700">
                        Valor Original
                      </label>
                      <p className="text-gray-900">
                        {formatCurrency(collection.valor_original)}
                      </p>
                    </div>

                    <div>
                      <label className="text-sm font-medium text-gray-700">
                        Valor da Cobrança
                      </label>
                      <p className="text-gray-900 font-medium">
                        {formatCurrency(collection.valor_original)}
                      </p>
                      {collection.valor_original !==
                        collection.valor_reajustado && (
                        <p className="text-sm text-gray-500">
                          Valor ajustado:{" "}
                          {formatCurrency(collection.valor_reajustado)}
                        </p>
                      )}
                    </div>

                    <div>
                      <label className="text-sm font-medium text-gray-700">
                        Valor Recebido
                      </label>
                      <p
                        className={`font-medium ${collection.valor_recebido > 0 ? "text-green-600" : "text-gray-500"}`}
                      >
                        {formatCurrency(collection.valor_recebido)}
                      </p>
                      {collection.valor_recebido > 0 &&
                        collection.valor_recebido <
                          collection.valor_original && (
                          <p className="text-sm text-red-600">
                            Restante:{" "}
                            {formatCurrency(
                              collection.valor_original -
                                collection.valor_recebido,
                            )}
                          </p>
                        )}
                    </div>

                    <div>
                      <label className="text-sm font-medium text-gray-700">
                        Data de Vencimento
                      </label>
                      <p className="text-gray-900">
                        {formatDate(collection.data_vencimento || "")}
                      </p>
                    </div>

                    <div>
                      <label className="text-sm font-medium text-gray-700">
                        Status
                      </label>
                      <p className="text-gray-900">
                        {getStatusLabel(collection.status || "")}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Contact Info */}
              <div className="space-y-4">
                <h3 className="text-lg font-medium text-gray-900">
                  Contato e Endereço
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-3">
                    {collection.telefone && (
                      <div className="flex items-center">
                        <Phone className="h-4 w-4 text-gray-400 mr-2" />
                        <span>{collection.telefone}</span>
                      </div>
                    )}

                    {collection.celular && (
                      <div className="flex items-center">
                        <MessageCircle className="h-4 w-4 text-gray-400 mr-2" />
                        <span>{collection.celular}</span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-start">
                    <MapPin className="h-4 w-4 text-gray-400 mr-2 mt-1" />
                    <div>
                      <p>
                        {collection.endereco}, {collection.numero}
                      </p>
                      {collection.complemento && (
                        <p>{collection.complemento}</p>
                      )}
                      <p>
                        {collection.bairro} - {collection.cidade}/
                        {collection.estado}
                      </p>
                      <p>{collection.cep}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Observations */}
              <div className="space-y-4">
                <h3 className="text-lg font-medium text-gray-900">
                  Observações
                </h3>
                <textarea
                  value={observations}
                  onChange={(e) => setObservations(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  rows={3}
                  placeholder="Adicione observações sobre este cliente..."
                  disabled={userType === "manager"}
                />
                {userType === "collector" && (
                  <button
                    onClick={handleUpdateObservations}
                    className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-2xl hover:bg-blue-700 transition-colors"
                  >
                    <Save className="h-4 w-4 mr-2" />
                    Salvar Observações
                  </button>
                )}
              </div>
            </div>
          )}

          {activeTab === "attempts" && (
            <div className="space-y-6">
              <h3 className="text-lg font-medium text-gray-900">
                Histórico de Tentativas
              </h3>

              <div className="text-center py-8">
                <p className="text-gray-500">Nenhuma tentativa registrada</p>
                <p className="text-sm text-gray-400 mt-2">
                  Use a aba "Ações" para registrar tentativas de contato
                </p>
              </div>
            </div>
          )}

          {activeTab === "action" && userType === "collector" && (
            <div className="space-y-6">
              {/* Status Update */}
              <div className="space-y-4">
                <h3 className="text-lg font-medium text-gray-900">
                  Atualizar Status
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Novo Status
                    </label>
                    <select
                      value={newStatus}
                      onChange={(e) => setNewStatus(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
                      className="w-full bg-green-600 text-white py-2 px-4 rounded-2xl hover:bg-green-700 transition-colors"
                    >
                      Atualizar Status
                    </button>
                  </div>
                </div>
              </div>

              {/* Payment Value Correction */}
              <div className="space-y-4 border-t border-gray-200 pt-6">
                <h3 className="text-lg font-medium text-gray-900">
                  Corrigir Valor Pago
                </h3>
                <p className="text-sm text-gray-600">
                  Valor atual recebido:{" "}
                  <span className="font-semibold">
                    {formatCurrency(collection.valor_recebido)}
                  </span>
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Novo Valor Recebido
                    </label>
                    <div className="relative">
                      <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={correctedValue}
                        onChange={(e) => setCorrectedValue(e.target.value)}
                        className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="0,00"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Data do Recebimento
                    </label>
                    <input
                      type="date"
                      value={correctedDate}
                      onChange={(e) => setCorrectedDate(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                </div>

                <div className="flex justify-between items-center p-3 bg-blue-50 rounded-2xl">
                  <div className="text-sm">
                    <p className="text-gray-600">
                      Valor original:{" "}
                      <span className="font-semibold">
                        {formatCurrency(collection.valor_original)}
                      </span>
                    </p>
                    <p className="text-gray-600">
                      Novo valor recebido:{" "}
                      <span className="font-semibold">
                        {formatCurrency(parseFloat(correctedValue) || 0)}
                      </span>
                    </p>
                    <p className="text-gray-600">
                      Restante:{" "}
                      <span className="font-semibold text-red-600">
                        {formatCurrency(
                          Math.max(
                            0,
                            collection.valor_original -
                              (parseFloat(correctedValue) || 0),
                          ),
                        )}
                      </span>
                    </p>
                  </div>
                </div>

                <button
                  onClick={handleUpdatePaymentValue}
                  className="w-full bg-purple-600 text-white py-2 px-4 rounded-2xl hover:bg-purple-700 transition-colors"
                >
                  Atualizar Valor Pago
                </button>
              </div>

              {/* Add Attempt */}
              <div className="space-y-4 border-t border-gray-200 pt-6">
                <h3 className="text-lg font-medium text-gray-900">
                  Registrar Tentativa
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Tipo de Contato
                    </label>
                    <select
                      value={newAttempt.type}
                      onChange={(e) =>
                        setNewAttempt({
                          ...newAttempt,
                          type: e.target.value as
                            | "call"
                            | "visit"
                            | "email"
                            | "whatsapp",
                        })
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="call">Ligação</option>
                      <option value="visit">Visita</option>
                      <option value="email">E-mail</option>
                      <option value="whatsapp">WhatsApp</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Resultado
                    </label>
                    <select
                      value={newAttempt.result}
                      onChange={(e) =>
                        setNewAttempt({
                          ...newAttempt,
                          result: e.target.value as
                            | "no_answer"
                            | "busy"
                            | "not_found"
                            | "promise"
                            | "refusal"
                            | "partial_payment"
                            | "full_payment",
                        })
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="no_answer">Não atendeu</option>
                      <option value="busy">Ocupado</option>
                      <option value="not_found">Não encontrado</option>
                      <option value="promise">Promessa de pagamento</option>
                      <option value="refusal">Recusa</option>
                      <option value="partial_payment">Pagamento parcial</option>
                      <option value="full_payment">Pagamento total</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Observações
                  </label>
                  <textarea
                    value={newAttempt.notes}
                    onChange={(e) =>
                      setNewAttempt({ ...newAttempt, notes: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    rows={3}
                    placeholder="Descreva o resultado da tentativa..."
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Próxima Ação
                    </label>
                    <input
                      type="text"
                      value={newAttempt.nextAction}
                      onChange={(e) =>
                        setNewAttempt({
                          ...newAttempt,
                          nextAction: e.target.value,
                        })
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Ex: Ligar novamente..."
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Data da Próxima Ação
                    </label>
                    <input
                      type="date"
                      value={newAttempt.nextActionDate}
                      onChange={(e) =>
                        setNewAttempt({
                          ...newAttempt,
                          nextActionDate: e.target.value,
                        })
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                </div>

                <button
                  onClick={handleAddAttempt}
                  disabled={!newAttempt.notes.trim()}
                  className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-2xl hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Registrar Tentativa
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CollectionModal;
