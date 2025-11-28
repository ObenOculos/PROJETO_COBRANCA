import React, { useState, useEffect } from "react";
import { supabase } from "../../lib/supabase";
import { Modal } from "../Modal"; // Assuming a generic Modal component exists

interface UpdateAddressModalProps {
  isOpen: boolean;
  onClose: () => void;
  clientDocumento: string;
  onSuccess: () => void; // To refetch data on the parent component
}

const UpdateAddressModal: React.FC<UpdateAddressModalProps> = ({
  isOpen,
  onClose,
  clientDocumento,
  onSuccess,
}) => {
  const [formData, setFormData] = useState({
    logradouro: "",
    numero: "",
    bairro: "",
    cidade: "",
    estado: "",
    cep: "",
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && clientDocumento) {
      const fetchCurrentAddress = async () => {
        setIsLoading(true);
        const { data, error } = await supabase
          .from("enderecos_historico")
          .select("*")
          .eq("cliente_documento", clientDocumento)
          .eq("is_atual", true)
          .limit(1)
          .single();

        if (data) {
          setFormData({
            logradouro: data.logradouro || "",
            numero: data.numero || "",
            bairro: data.bairro || "",
            cidade: data.cidade || "",
            estado: data.estado || "",
            cep: data.cep || "",
          });
        } else if (error && error.code !== "PGRST116") {
          // Ignore 'single row not found'
          setError("Falha ao buscar o endereço atual.");
          console.error("Address fetch error:", error);
        }
        setIsLoading(false);
      };
      fetchCurrentAddress();
    }
  }, [isOpen, clientDocumento]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    const { error: rpcError } = await supabase.rpc("update_client_address", {
      p_cliente_documento: clientDocumento,
      p_logradouro: formData.logradouro,
      p_numero: formData.numero,
      p_bairro: formData.bairro,
      p_cidade: formData.cidade,
      p_estado: formData.estado,
      p_cep: formData.cep,
    });

    setIsLoading(false);

    if (rpcError) {
      setError(`Erro ao atualizar o endereço: ${rpcError.message}`);
      console.error("RPC Error:", rpcError);
    } else {
      onSuccess();
      onClose();
    }
  };

  const inputClass =
    "w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white";

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Atualizar Endereço">
      <form onSubmit={handleSubmit} className="space-y-4">
        {isLoading && <p>Carregando...</p>}
        {error && <p className="text-red-500">{error}</p>}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label
              htmlFor="logradouro"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              Endereço (Rua)
            </label>
            <input
              type="text"
              id="logradouro"
              name="logradouro"
              value={formData.logradouro}
              onChange={handleChange}
              className={inputClass}
            />
          </div>
          <div>
            <label
              htmlFor="numero"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              Número
            </label>
            <input
              type="text"
              id="numero"
              name="numero"
              value={formData.numero}
              onChange={handleChange}
              className={inputClass}
            />
          </div>
          <div>
            <label
              htmlFor="bairro"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              Bairro
            </label>
            <input
              type="text"
              id="bairro"
              name="bairro"
              value={formData.bairro}
              onChange={handleChange}
              className={inputClass}
            />
          </div>
          <div>
            <label
              htmlFor="cidade"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              Cidade
            </label>
            <input
              type="text"
              id="cidade"
              name="cidade"
              value={formData.cidade}
              onChange={handleChange}
              className={inputClass}
            />
          </div>
          <div>
            <label
              htmlFor="estado"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              Estado
            </label>
            <input
              type="text"
              id="estado"
              name="estado"
              value={formData.estado}
              onChange={handleChange}
              className={inputClass}
            />
          </div>
          <div>
            <label
              htmlFor="cep"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              CEP
            </label>
            <input
              type="text"
              id="cep"
              name="cep"
              value={formData.cep}
              onChange={handleChange}
              className={inputClass}
            />
          </div>
        </div>

        <div className="flex justify-end space-x-2 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50 focus:outline-none dark:bg-gray-600 dark:text-gray-100 dark:border-gray-500 dark:hover:bg-gray-700"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={isLoading}
            className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 border border-transparent rounded-md shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
          >
            {isLoading ? "Salvando..." : "Salvar Novo Endereço"}
          </button>
        </div>
      </form>
    </Modal>
  );
};

export default UpdateAddressModal;
