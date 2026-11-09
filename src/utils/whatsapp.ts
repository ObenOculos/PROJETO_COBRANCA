// WhatsApp: fonte unica de como o app abre uma conversa.
//
// Nao da para embutir o WhatsApp Web dentro do app: o web.whatsapp.com
// proibe ser exibido em iframe (X-Frame-Options/CSP), em qualquer navegador.
// O que da para fazer -- e o que resolve "abre uma aba nova a cada cliente" --
// e reaproveitar SEMPRE A MESMA aba: window.open com um nome fixo navega a
// aba existente em vez de criar outra.
//
// Computador: vai direto ao WhatsApp Web (web.whatsapp.com/send), sem a
// pagina intermediaria do wa.me. Celular: wa.me, que abre o aplicativo.

/** Nome da aba reaproveitada do WhatsApp Web. */
export const WHATSAPP_TAB = "whatsapp_cobranca";

const ehCelular = (): boolean =>
  typeof navigator !== "undefined" &&
  /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);

/** So os digitos, com DDI 55 na frente quando o numero veio sem ele. */
const numeroComDdi = (telefone: string): string => {
  const digitos = (telefone || "").replace(/\D/g, "");
  if (!digitos) return "";
  return digitos.startsWith("55") && digitos.length > 11
    ? digitos
    : `55${digitos}`;
};

/** URL da conversa; "" quando nao ha numero. */
const urlWhatsApp = (telefone: string, mensagem?: string): string => {
  const numero = numeroComDdi(telefone);
  if (!numero) return "";
  const texto = mensagem ? encodeURIComponent(mensagem) : "";
  if (ehCelular()) {
    return `https://wa.me/${numero}${texto ? `?text=${texto}` : ""}`;
  }
  return `https://web.whatsapp.com/send?phone=${numero}${texto ? `&text=${texto}` : ""}`;
};

/**
 * Abre a conversa (na aba fixa, no computador). Sem numero, nao faz nada.
 *
 * Sem "noopener": com ele o navegador ignora o nome da aba e abre sempre
 * uma nova. Em troca, corta o vinculo da aba aberta com o app
 * (`opener = null`), que e a protecao que o noopener daria.
 */
export const abrirWhatsApp = (telefone: string, mensagem?: string): void => {
  const url = urlWhatsApp(telefone, mensagem);
  if (!url) return;
  const aba = window.open(url, ehCelular() ? "_blank" : WHATSAPP_TAB);
  if (aba) {
    try {
      aba.opener = null;
    } catch {
      // aba de outra origem ja carregada: o navegador pode recusar; inofensivo
    }
    aba.focus();
  }
};
