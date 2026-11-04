// Gera o payload Pix "copia e cola" (BR Code, padrao EMVCo do Banco Central)
// 100% local -- sem gateway/servico externo (decisao do usuario em
// 2026-11-04: QR Code estatico, confirmacao manual do cobrador). Ver
// docs/PROGRESSO.md, item 12 (Etapa 3b).

const tlv = (id: string, value: string): string =>
  `${id}${value.length.toString().padStart(2, "0")}${value}`;

// Remove acentos e qualquer caractere fora do alfabeto simples que o padrao
// Pix aceita em nome/cidade (evita payload invalido por "ã"/"ç"/etc.).
const somenteAscii = (value: string): string =>
  value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9 ]/g, "")
    .trim();

const crc16ccitt = (payload: string): string => {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = (crc & 0x8000) !== 0 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
};

export interface PixPayloadParams {
  chave: string;
  nomeRecebedor: string;
  cidadeRecebedor: string;
  valor: number;
  /** Identificador da cobranca, max 25 caracteres (ex.: id do acordo). "***" se omitido. */
  txid?: string;
}

/** Monta o payload Pix "copia e cola" com valor fixo (QR dinamico de uso unico, mas sem backend/gateway). */
export const gerarPixCopiaECola = ({
  chave,
  nomeRecebedor,
  cidadeRecebedor,
  valor,
  txid,
}: PixPayloadParams): string => {
  const merchantAccountInfo =
    tlv("00", "BR.GOV.BCB.PIX") + tlv("01", chave.trim());

  const nome = somenteAscii(nomeRecebedor).slice(0, 25) || "FOCCO BRASIL";
  const cidade = somenteAscii(cidadeRecebedor).slice(0, 15) || "FORTALEZA";
  const identificador = (txid || "***").replace(/[^A-Za-z0-9]/g, "").slice(0, 25) || "***";

  const additionalData = tlv("05", identificador);

  const semCrc =
    tlv("00", "01") +
    tlv("26", merchantAccountInfo) +
    tlv("52", "0000") +
    tlv("53", "986") +
    tlv("54", valor.toFixed(2)) +
    tlv("58", "BR") +
    tlv("59", nome) +
    tlv("60", cidade) +
    tlv("62", additionalData) +
    "6304";

  return semCrc + crc16ccitt(semCrc);
};
