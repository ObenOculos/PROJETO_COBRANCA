# Segurança do Projeto - Sistema de Cobrança

## ⚠️ Problema Identificado e Resolvido

### Vulnerabilidade Original

- As variáveis `VITE_*` no arquivo `.env` eram incluídas automaticamente no bundle JavaScript
- Credenciais do Supabase ficavam visíveis no código do navegador
- Qualquer pessoa podia acessar as chaves através do DevTools

### Solução Implementada

#### 1. Configuração Segura

- Movemos as credenciais para `src/lib/supabase-config.ts`
- Removemos dependência das variáveis `VITE_*`
- Implementamos validações de segurança

#### 2. Arquitetura de Segurança do Supabase

**Importante**: A chave anon (pública) do Supabase é SEGURA para ser exposta quando:

- Row Level Security (RLS) está habilitado
- Políticas de segurança estão configuradas corretamente
- Autenticação e autorização estão implementadas

#### 3. Próximos Passos Críticos

**No Supabase Dashboard:**

1. Habilitar Row Level Security (RLS) em todas as tabelas
2. Criar políticas de segurança para cada tabela
3. Configurar autenticação adequada
4. Revisar permissões de usuários

**Exemplo de políticas RLS necessárias:**

```sql
-- Para tabela BANCO_DADOS
ALTER TABLE BANCO_DADOS ENABLE ROW LEVEL SECURITY;

-- Política para cobradores (apenas seus clientes)
CREATE POLICY "cobradores_proprios_clientes" ON BANCO_DADOS
    FOR ALL USING (user_id = auth.jwt() ->> 'sub');

-- Política para managers (acesso total)
CREATE POLICY "managers_acesso_total" ON BANCO_DADOS
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE id = auth.jwt() ->> 'sub'
            AND type = 'manager'
        )
    );
```

## 🛡️ Medidas de Segurança Atuais

### Frontend

- ✅ Removido logs de configuração sensível
- ✅ Configuração centralizada e validada
- ✅ Sem exposição de variáveis de ambiente
- ✅ Validações de entrada

### Backend/Banco

- ⚠️ **PENDENTE**: Configurar RLS no Supabase
- ⚠️ **PENDENTE**: Criar políticas de segurança
- ⚠️ **PENDENTE**: Revisar permissões

## 🚀 Deploy Seguro

### Antes do Deploy

1. Configurar RLS no Supabase
2. Testar políticas de segurança
3. Validar autenticação
4. Remover logs de debug

### Variáveis de Ambiente (Vercel)

- Remover todas as variáveis `VITE_*` se existirem
- A configuração agora é interna do código

## 📋 Checklist de Segurança

- [x] Remover logs de credenciais
- [x] Centralizar configuração
- [x] Validar entradas
- [ ] **CRÍTICO**: Configurar RLS no Supabase
- [ ] **CRÍTICO**: Criar políticas de segurança
- [ ] Implementar autenticação robusta
- [ ] Auditoria de segurança completa

## 📞 Próximos Passos Imediatos

1. **URGENTE**: Configurar Row Level Security no Supabase
2. Criar políticas de segurança por tipo de usuário
3. Testar acesso com diferentes perfis
4. Fazer novo deploy e validar segurança
