import * as XLSX from "xlsx";
import { CLIENTE_IMPORT_FIELDS } from "./clientesImportService";

// ---------------------------------------------------------------------------
// Modelos de planilha para download
//
// O contas a receber da SSOtica nao tem modelo: o card aceita as planilhas
// BD_Contasareceber_*.xlsx como saem do script. Sobrou o modelo de cadastro.
// Os cabecalhos do modelo de cadastro sao derivados de CLIENTE_IMPORT_FIELDS,
// entao o que o modelo oferece e sempre o que o importador aceita.
// ---------------------------------------------------------------------------

export interface UploadTemplate {
  id: string;
  label: string;
  description: string;
  fileName: string;
  headers: string[];
}

/**
 * Todas as colunas da tabela BANCO_DADOS, na ordem usada na exportacao.
 *
 * Apelido, telefones e e-mail sairam daqui na migration 20260904000002: sao
 * cadastro do cliente e vivem em `clientes`. A exportacao os reanexa a partir
 * do cadastro (ver CADASTRO_EXPORT_HEADERS).
 */
export const BANCO_DADOS_HEADERS = [
  "nome_da_loja",
  "data_lancamento",
  "data_vencimento",
  "valor_original",
  "valor_reajustado",
  "multa",
  "juros_por_dia",
  "multa_aplicada",
  "juros_aplicado",
  "valor_recebido",
  "data_de_recebimento",
  "dias_em_atraso",
  "dias_carencia",
  "desconto",
  "acrescimo",
  "multa_paga",
  "juros_pago",
  "tipo_de_cobranca",
  "numero_titulo",
  "parcela",
  "id_parcela",
  "status",
  "cliente",
  "documento",
  "endereco",
  "numero",
  "bairro",
  "complemento",
  "cep",
  "cidade",
  "estado",
  "obs",
  "codigo_externo",
  "descricao",
  "venda_n",
  "convenio",
  "user_id",
  "situacao",
];

const CADASTRO_HEADERS = [
  "documento",
  ...CLIENTE_IMPORT_FIELDS.map((f) => f.key),
];

/**
 * Colunas de cadastro anexadas a exportacao do banco, vindas de `clientes`.
 * Sem elas a planilha exportada perderia os contatos do cliente.
 */
export const CADASTRO_EXPORT_HEADERS = [
  "apelido",
  "telefone",
  "celular",
  "celular1",
  "celular2",
  "email",
];

export const UPLOAD_TEMPLATES: UploadTemplate[] = [
  {
    id: "cadastro_clientes",
    label: "Cadastro de Clientes",
    description: `Chave documento (CPF/CNPJ) + ${CLIENTE_IMPORT_FIELDS.map(
      (f) => f.label,
    ).join(", ")}.`,
    fileName: "modelo_cadastro_clientes.csv",
    headers: CADASTRO_HEADERS,
  },
];

/** Gera e baixa o CSV (apenas o cabecalho) do modelo escolhido. */
export const downloadUploadTemplate = (template: UploadTemplate): void => {
  const ws = XLSX.utils.aoa_to_sheet([template.headers]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Modelo");
  XLSX.writeFile(wb, template.fileName);
};
