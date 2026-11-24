// Item 89 (2026-11-24): divergencias entre o app e o ERP.
// Venda cancelada no app vale ate o ERP confirmar; o painel do gestor marca
// como "atrasada" a divergencia com mais dias que isto (decisao do usuario).
export const DIAS_DIVERGENCIA_ATRASADA = 7;

export const ERP_LABEL: Record<string, string> = {
  ciclone: "Ciclone",
  ssotica: "SSÓtica",
};
