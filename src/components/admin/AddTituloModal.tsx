import React, { useState } from "react";
import { Modal } from "../Modal";
import { supabase } from "../../lib/supabase";
import { Database } from "../../types/database.types";
import { ChevronDown } from "lucide-react";
import { CollectionStatus } from "../../types/status";
import { ALL_SITUACOES } from "../../config/profiles";
import {
  CADASTRO_CONTATO_COLUMNS,
  CadastroContatoColumn,
} from "../../services/clientesRegistry";

type BancoDadosInsert = Database["public"]["Tables"]["BANCO_DADOS"]["Insert"];

// O formulario cria um titulo E, quando o cliente e novo, o cadastro dele.
// Apelido, telefones e e-mail nao existem mais em BANCO_DADOS (migration
// 20260904000002): sao campos de `clientes`, entao o formulario cobre a uniao
// dos dois conjuntos e `handleSubmit` separa o que vai para cada tabela.
type TituloFormField = keyof BancoDadosInsert | CadastroContatoColumn;
type TituloFormData = Partial<Record<TituloFormField, string | number | null>>;

const isCadastroField = (key: string): key is CadastroContatoColumn =>
  (CADASTRO_CONTATO_COLUMNS as readonly string[]).includes(key);

/** Separa o que foi digitado entre a parcela e o cadastro do cliente. */
const splitFormData = (data: TituloFormData) => {
  const titulo: Record<string, unknown> = {};
  const cadastro: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (isCadastroField(key)) cadastro[key] = value;
    else titulo[key] = value;
  }
  return { titulo, cadastro };
};

interface AddTituloModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface SectionType {
  id: string;
  title: string;
  fields: Array<TituloFormField>;
}

const AddTituloModal: React.FC<AddTituloModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [formData, setFormData] = useState<TituloFormData>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(["basic"]),
  );

  const toggleSection = (sectionId: string) => {
    const newExpanded = new Set(expandedSections);
    if (newExpanded.has(sectionId)) {
      newExpanded.delete(sectionId);
    } else {
      newExpanded.add(sectionId);
    }
    setExpandedSections(newExpanded);
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value === "" ? null : value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    if (!formData.id_parcela) {
      setError("O campo 'ID Parcela' é obrigatório.");
      setLoading(false);
      return;
    }

    const { titulo, cadastro } = splitFormData(formData);

    const dataToInsert: BancoDadosInsert = {
      ...sampleBancoDados,
      ...titulo,
      id_parcela: Number(formData.id_parcela),
      dias_em_atraso: formData.dias_em_atraso
        ? Number(formData.dias_em_atraso)
        : null,
      numero_titulo: formData.numero_titulo
        ? Number(formData.numero_titulo)
        : null,
      parcela: formData.parcela ? Number(formData.parcela) : null,
      venda_n: formData.venda_n ? Number(formData.venda_n) : null,
    };

    const { error: insertError } = await supabase
      .from("BANCO_DADOS")
      .insert(dataToInsert);

    if (insertError) {
      setLoading(false);
      setError(`Erro ao adicionar título: ${insertError.message}`);
      console.error(insertError);
      return;
    }

    await upsertCadastroCliente(dataToInsert.documento, dataToInsert.cliente, cadastro);

    setLoading(false);
    onSuccess();
    onClose();
    setFormData({});
  };

  // O cadastro do cliente mora em `clientes` (migration 20260904000001); as
  // colunas homonimas de BANCO_DADOS sao legado. Sem isto, um titulo criado por
  // aqui nasceria com o cadastro so no lugar antigo e a tela nao mostraria os
  // dados digitados.
  //
  // Falha aqui nao desfaz o titulo: ele ja foi gravado e o cadastro pode ser
  // corrigido pela importacao. So registramos o aviso.
  const upsertCadastroCliente = async (
    documentoRaw: string | null | undefined,
    nomeRaw: string | null | undefined,
    contatos: Record<string, unknown>,
  ) => {
    const documento = (documentoRaw ?? "").toString().trim();
    if (!documento) return;

    const cadastro = {
      documento,
      nome: (nomeRaw ?? "").toString().trim() || "Cliente sem nome",
      ...contatos,
    };

    const { data: existente, error: selectError } = await supabase
      .from("clientes")
      .select("id")
      .eq("documento", documento)
      .maybeSingle();

    if (selectError) {
      console.warn("Não foi possível verificar o cadastro do cliente:", selectError);
      return;
    }

    // Cliente ja cadastrado: nao mexemos. O formulario e de titulo, nao de
    // cadastro, e sobrescrever com os campos em branco dele apagaria dados bons.
    // Corrigir cadastro existente e papel da importacao.
    if (existente) return;

    const { error: insertCadastroError } = await supabase
      .from("clientes")
      .insert(cadastro);

    if (insertCadastroError) {
      console.warn(
        "Título criado, mas o cadastro do cliente não foi gravado:",
        insertCadastroError,
      );
    }
  };

  const sections: SectionType[] = [
    {
      id: "basic",
      title: "Informações Básicas",
      fields: [
        "id_parcela",
        "status",
        "situacao",
        "nome_da_loja",
        "tipo_de_cobranca",
        "numero_titulo",
        "parcela",
        "venda_n",
      ] as any[],
    },
    {
      id: "client",
      title: "Cliente",
      fields: ["cliente", "documento", "apelido", "email"] as any[],
    },
    {
      id: "contact",
      title: "Contatos",
      fields: ["telefone", "celular", "celular1", "celular2"] as any[],
    },
    {
      id: "address",
      title: "Endereço",
      fields: [
        "endereco",
        "numero",
        "complemento",
        "bairro",
        "cidade",
        "estado",
        "cep",
      ] as any[],
    },
    {
      id: "dates",
      title: "Datas",
      fields: [
        "data_lancamento",
        "data_vencimento",
        "data_de_recebimento",
      ] as any[],
    },
    {
      id: "values",
      title: "Valores",
      fields: [
        "valor_original",
        "valor_reajustado",
        "valor_recebido",
        "desconto",
        "acrescimo",
      ] as any[],
    },
    {
      id: "fees",
      title: "Multas e Juros",
      fields: [
        "multa",
        "multa_aplicada",
        "multa_paga",
        "juros_por_dia",
        "juros_aplicado",
        "juros_pago",
      ] as any[],
    },
    {
      id: "other",
      title: "Outras Informações",
      fields: [
        "codigo_externo",
        "convenio",
        "descricao",
        "obs",
        "user_id",
        "dias_carencia",
        "dias_em_atraso",
      ] as any[],
    },
  ];

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Adicionar Título" size="lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-lg text-sm">
            {error}
          </div>
        )}

        <div className="space-y-2 max-h-[60vh] overflow-y-auto">
          {sections.map((section) => (
            <div key={section.id} className="border border-gray-200 rounded-lg">
              <button
                type="button"
                onClick={() => toggleSection(section.id)}
                className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
              >
                <span className="font-medium text-gray-900 text-sm">
                  {section.title}
                </span>
                <ChevronDown
                  className={`w-4 h-4 text-gray-600 transition-transform ${
                    expandedSections.has(section.id) ? "" : "-rotate-90"
                  }`}
                />
              </button>

              {expandedSections.has(section.id) && (
                <div className="px-4 pb-4 border-t border-gray-200 bg-gray-50">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                    {section.fields.map((fieldName: TituloFormField) => {
                      const field = formFields[fieldName];
                      if (!field) return null;

                      return (
                        <div key={String(fieldName)}>
                          <label
                            htmlFor={String(fieldName)}
                            className="block text-xs font-medium text-gray-700 mb-1.5 tracking-wide"
                          >
                            {field.label}
                            {fieldName === "id_parcela" && (
                              <span className="text-red-500 ml-1">*</span>
                            )}
                          </label>
                          {field.type === "select" ? (
                            <select
                              name={String(fieldName)}
                              id={String(fieldName)}
                              onChange={handleChange}
                              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors bg-white"
                            >
                              <option value="">Selecione</option>
                              {field.options?.map((opt: string) => (
                                <option key={opt} value={opt}>
                                  {opt}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <input
                              type={field.type}
                              name={String(fieldName)}
                              id={String(fieldName)}
                              placeholder={field.placeholder}
                              required={fieldName === "id_parcela"}
                              onChange={handleChange}
                              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="flex gap-3 pt-4 border-t border-gray-200 mt-6">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={loading}
            className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? "Adicionando..." : "Adicionar Título"}
          </button>
        </div>
      </form>
    </Modal>
  );
};

const sampleBancoDados: Partial<BancoDadosInsert> = {
  acrescimo: null,
  bairro: null,
  cep: null,
  cidade: null,
  cliente: null,
  codigo_externo: null,
  complemento: null,
  convenio: null,
  data_de_recebimento: null,
  data_lancamento: null,
  data_vencimento: null,
  desconto: null,
  descricao: null,
  dias_carencia: null,
  dias_em_atraso: null,
  documento: null,
  endereco: null,
  estado: null,
  juros_aplicado: null,
  juros_pago: null,
  juros_por_dia: null,
  multa: null,
  multa_aplicada: null,
  multa_paga: null,
  nome_da_loja: null,
  numero: null,
  numero_titulo: null,
  obs: null,
  parcela: null,
  situacao: null,
  status: null,
  tipo_de_cobranca: null,
  user_id: null,
  valor_original: null,
  valor_reajustado: null,
  valor_recebido: null,
  venda_n: null,
};

// Helper for form generation
const formFields: Record<
  TituloFormField,
  { label: string; type: string; placeholder?: string; options?: string[] }
> = {
  id_parcela: { label: "ID Parcela", type: "number" },
  cliente: { label: "Cliente", type: "text" },
  documento: { label: "Documento (CPF/CNPJ)", type: "text" },
  data_vencimento: { label: "Data de Vencimento", type: "date" },
  valor_original: {
    label: "Valor Original",
    type: "text",
    placeholder: "Ex: 123,45",
  },
  nome_da_loja: { label: "Nome da Loja", type: "text" },
  cidade: { label: "Cidade", type: "text" },
  status: {
    label: "Status",
    type: "select",
    options: Object.values(CollectionStatus),
  },
  situacao: {
    label: "Situação",
    type: "select",
    // Fonte única (config/profiles): acompanha novos perfis automaticamente.
    options: ["", ...ALL_SITUACOES],
  },
  apelido: { label: "Apelido", type: "text" },
  bairro: { label: "Bairro", type: "text" },
  celular: { label: "Celular", type: "text" },
  celular1: { label: "Celular 1", type: "text" },
  celular2: { label: "Celular 2", type: "text" },
  cep: { label: "CEP", type: "text" },
  codigo_externo: { label: "Código Externo", type: "text" },
  complemento: { label: "Complemento", type: "text" },
  convenio: { label: "Convênio", type: "text" },
  data_de_recebimento: { label: "Data de Recebimento", type: "date" },
  data_lancamento: { label: "Data de Lançamento", type: "date" },
  desconto: { label: "Desconto", type: "text", placeholder: "Ex: 10,00" },
  descricao: { label: "Descrição", type: "text" },
  dias_carencia: { label: "Dias de Carência", type: "number" },
  dias_em_atraso: { label: "Dias em Atraso", type: "number" },
  email: { label: "E-mail", type: "email" },
  endereco: { label: "Endereço", type: "text" },
  estado: { label: "Estado", type: "text" },
  juros_aplicado: {
    label: "Juros Aplicado",
    type: "text",
    placeholder: "Ex: 5,25",
  },
  juros_pago: { label: "Juros Pago", type: "text", placeholder: "Ex: 5,25" },
  juros_por_dia: {
    label: "Juros por Dia",
    type: "text",
    placeholder: "Ex: 0,10",
  },
  multa: { label: "Multa", type: "text", placeholder: "Ex: 2,00" },
  multa_aplicada: {
    label: "Multa Aplicada",
    type: "text",
    placeholder: "Ex: 2,00",
  },
  multa_paga: { label: "Multa Paga", type: "text", placeholder: "Ex: 2,00" },
  numero: { label: "Número (endereço)", type: "text" },
  numero_titulo: { label: "Número do Título", type: "number" },
  obs: { label: "Observação", type: "text" },
  parcela: { label: "Parcela", type: "number" },
  telefone: { label: "Telefone", type: "text" },
  tipo_de_cobranca: { label: "Tipo de Cobrança", type: "text" },
  user_id: { label: "ID do Usuário (Cobrador)", type: "text" },
  valor_reajustado: {
    label: "Valor Reajustado",
    type: "text",
    placeholder: "Ex: 130,50",
  },
  valor_recebido: {
    label: "Valor Recebido",
    type: "text",
    placeholder: "Ex: 130,50",
  },
  venda_n: { label: "Venda N°", type: "number" },
  acrescimo: { label: "Acréscimo", type: "text", placeholder: "Ex: 1,50" },
};

export default AddTituloModal;
