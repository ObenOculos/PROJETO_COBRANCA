-- Item 19 do docs/PROGRESSO.md: monthly_goals.visits_goal muda de
-- significado por perfil do cobrador sem isso aparecer em lugar nenhum do
-- schema -- so documentacao (sem alteracao de dados ou comportamento).
--
-- Externo (collector): meta de VISITA presencial, "realizada" ja conta
-- sozinho (foi ao local, qualquer desfecho).
-- Carteira (internal_collector/third_party_collector/legal_collector):
-- meta de CONTATO EFETIVO (ligacao/WhatsApp com resposta do cliente) --
-- mais rigorosa, ver countsTowardVisitsGoal em src/config/collectionAttempts.ts.
COMMENT ON COLUMN public.monthly_goals.visits_goal IS
  'Meta mensal: VISITA presencial pro cobrador Externo (collector), ou CONTATO EFETIVO (ligacao/WhatsApp respondida) pros 3 perfis de carteira (internal_collector/third_party_collector/legal_collector) -- nao e a mesma unidade nos dois casos. Fonte unica da regra de contagem: countsTowardVisitsGoal em src/config/collectionAttempts.ts.';
