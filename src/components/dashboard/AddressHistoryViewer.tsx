import React, { useState, useEffect, useCallback } from "react";
import { supabase } from "../../lib/supabase";
import UpdateAddressModal from "./UpdateAddressModal";
import { MapPin } from "lucide-react";
import { ClientGroup } from "../../types";

interface AddressHistoryViewerProps {
  clientDocument: string;
  initialData?: ClientGroup;
}

const AddressHistoryViewer: React.FC<AddressHistoryViewerProps> = ({
  clientDocument,
  initialData,
}) => {
  const [addressHistory, setAddressHistory] = useState<any[]>([]);
  const [addressLoading, setAddressLoading] = useState(true);
  const [isUpdateAddressModalOpen, setIsUpdateAddressModalOpen] =
    useState(false);

  const fetchAddress = useCallback(async () => {
    if (!clientDocument) return;
    setAddressLoading(true);
    try {
      const { data, error } = await supabase
        .from("enderecos_historico")
        .select("*")
        .eq("cliente_documento", clientDocument)
        .order("created_at", { ascending: false });

      if (error) throw error;

      setAddressHistory(data || []);
    } catch (error) {
      console.error("Failed to fetch client address history:", error);
      setAddressHistory([]);
    } finally {
      setAddressLoading(false);
    }
  }, [clientDocument]);

  useEffect(() => {
    fetchAddress();
  }, [fetchAddress]);

  // Determine which address to show as "current"
  // Priority: 1. Latest from history (if exists) 2. Initial data (from BANCO_DADOS)
  const latestHistory = addressHistory?.[0] || null;

  // Use historical address if available, otherwise fallback to BANCO_DADOS data
  const displayAddress = latestHistory
    ? {
        logradouro: latestHistory.logradouro,
        numero: latestHistory.numero,
        complemento: latestHistory.complemento,
        bairro: latestHistory.bairro,
        cidade: latestHistory.cidade,
        estado: latestHistory.estado,
        cep: latestHistory.cep,
        source: "Histórico",
        date: latestHistory.created_at,
      }
    : initialData
      ? {
          logradouro: initialData.address,
          numero: initialData.number,
          complemento: initialData.complemento,
          bairro: initialData.neighborhood,
          cidade: initialData.city,
          estado: initialData.state,
          cep: initialData.cep,
          source: "Cadastro Original",
          date: null, // Original data doesn't have a specific update date in this context
        }
      : null;

  const historicalAddresses = latestHistory
    ? addressHistory.slice(1)
    : addressHistory;

  return (
    <>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900 flex items-center">
            <MapPin className="h-5 w-5 mr-2 text-blue-600" />
            Endereço Atual e Histórico
          </h3>
          <button
            onClick={() => setIsUpdateAddressModalOpen(true)}
            className="px-3 py-1 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
          >
            Atualizar Endereço
          </button>
        </div>
        <div className="bg-gray-50 p-4 rounded-2xl space-y-4 text-sm border border-gray-200">
          <div className="flex items-start">
            <MapPin className="h-4 w-4 text-gray-400 mr-2 mt-1 flex-shrink-0" />
            {addressLoading && !displayAddress ? (
              <div className="text-gray-800 animate-pulse">
                Carregando endereço...
              </div>
            ) : displayAddress ? (
              <div className="text-gray-800">
                <p className="font-semibold">
                  {displayAddress.logradouro || "Endereço não informado"},{" "}
                  {displayAddress.numero || "s/n"}
                </p>
                {displayAddress.complemento && (
                  <p className="text-xs">{displayAddress.complemento}</p>
                )}
                <p className="text-xs">
                  {displayAddress.bairro || "Bairro não informado"} -{" "}
                  {displayAddress.cidade || "Cidade não informada"}/
                  {displayAddress.estado || ""}
                </p>
                {displayAddress.cep && (
                  <p className="text-xs">{displayAddress.cep}</p>
                )}
                <p className="text-xs text-gray-400 mt-1">
                  (
                  {displayAddress.source === "Histórico"
                    ? `Atualizado em: ${new Date(displayAddress.date).toLocaleDateString("pt-BR")}`
                    : "Endereço Original do Cadastro"}
                  )
                </p>
              </div>
            ) : (
              <div className="text-gray-800">
                <p>Nenhum endereço cadastrado.</p>
                <p className="text-xs text-gray-500">
                  Clique em "Atualizar Endereço" para adicionar um.
                </p>
              </div>
            )}
          </div>
          {/* Address History Section */}
          {historicalAddresses.length > 0 && (
            <div className="pt-4 mt-4 border-t border-gray-200">
              <h4 className="text-sm font-semibold text-gray-700 mb-2">
                Histórico de Endereços Anteriores
              </h4>
              <div className="space-y-3 max-h-24 overflow-y-auto pr-2">
                {historicalAddresses.map((addr) => (
                  <div
                    key={addr.id}
                    className="text-xs text-gray-500 border-l-2 pl-2 border-gray-300"
                  >
                    <p>
                      {addr.logradouro}, {addr.numero}
                    </p>
                    {addr.complemento && <p>{addr.complemento}</p>}
                    <p>
                      {addr.bairro} - {addr.cidade}/{addr.estado}
                    </p>
                    <p className="text-gray-400">
                      (Registrado em:{" "}
                      {new Date(addr.created_at).toLocaleDateString("pt-BR")})
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {isUpdateAddressModalOpen && (
        <UpdateAddressModal
          isOpen={isUpdateAddressModalOpen}
          onClose={() => setIsUpdateAddressModalOpen(false)}
          clientDocumento={clientDocument}
          onSuccess={() => {
            fetchAddress();
            setIsUpdateAddressModalOpen(false);
          }}
        />
      )}
    </>
  );
};

export default AddressHistoryViewer;
