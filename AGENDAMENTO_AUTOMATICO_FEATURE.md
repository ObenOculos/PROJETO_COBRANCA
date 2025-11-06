# 📅 Funcionalidade: Agendamento Automático de Visitas

## Visão Geral

Foi implementado um sistema de **agendamento automático de visitas** baseado em datas pré-configuradas por cidade/bairro. Quando um cobrador seleciona um cliente para agendar uma visita, o sistema automaticamente sugere a próxima data disponível conforme a configuração.

## Como Funciona

### 1. **Configuração de Datas Permitidas**

Os gerentes podem configurar datas recorrentes para cada combinação de cidade/bairro através do menu **"Datas Permitidas"**:

- Selecione a **Cidade**
- Selecione o **Bairro**
- Escolha o **Dia do Mês** (1-31)
- Clique em **Adicionar Data**

**Exemplo:**

- Cidade: São Paulo
- Bairro: Centro
- Dia: 15

✅ Isso significa que todas as visitas ao bairro Centro em São Paulo serão agendadas automaticamente para o **dia 15 de cada mês**.

⚠️ **Atenção:** O sistema verifica se a data cai em um **domingo** e exibe um aviso visual caso isso ocorra.

### 2. **Agendamento Automático**

Quando o cobrador for agendar uma visita:

1. Abre o modal de agendamento
2. Seleciona um ou mais clientes
3. **O sistema automaticamente define a data** baseado na configuração
4. **Se a data cair em domingo, um aviso laranja é exibido** no modal de confirmação

#### Lógica de Cálculo

O sistema calcula a próxima data permitida seguindo estas regras:

```
Se o dia configurado ainda não passou no mês atual:
  → Agenda para esse dia no mês atual

Senão:
  → Agenda para esse dia no próximo mês

Se o dia não existe no próximo mês (ex: 31 em fevereiro):
  → Tenta o mês seguinte
```

### 3. **Indicadores Visuais**

#### Console Logs

Quando uma data é definida automaticamente, aparece no console:

```
📅 Data automática definida para João Silva: 2024-11-15 (Dia 15 de cada mês)
⚠️ ATENÇÃO: Data automática para João Silva cai em um DOMINGO (2024-11-17)
```

#### Aviso de Domingo

Quando uma ou mais visitas são agendadas para um domingo:

- ✅ **Banner laranja** aparece na tela de confirmação
- ✅ Lista todos os clientes com visitas em domingo
- ✅ Mostra a data e o dia da semana
- ✅ Oferece dica para ajustar manualmente
- ✅ Sugere reconfigurar nas "Datas Permitidas"

#### Interface do Usuário

- Clientes sem configuração: usam a data padrão selecionada
- Clientes com configuração: a data é ajustada automaticamente
- Clientes com data em domingo: aparecem destacados no aviso

## Arquivos Modificados

### 1. **CollectionContext.tsx**

```typescript
// Adicionado estado
const [allowedVisitDates, setAllowedVisitDates] = useState<AllowedVisitDate[]>([]);

// Adicionada função
const fetchAllowedVisitDates = async () => { ... }
```

### 2. **visitScheduling.ts** (novo arquivo)

```typescript
// Função principal
export const getNextAllowedVisitDate = (
  city: string,
  neighborhood: string,
  allowedDates: AllowedVisitDate[],
  startDate?: Date,
): string | null => { ... }

// Funções auxiliares
export const hasAllowedVisitDate = (...)
export const getAllowedDayOfMonth = (...)
```

### 3. **VisitScheduler.tsx**

```typescript
import { getNextAllowedVisitDate } from "../../utils/visitScheduling";

// Estado para rastrear visitas em domingo
const [sundayVisits, setSundayVisits] = useState<Set<string>>(new Set());

// No handleToggleClientSelection
const allowedDate = getNextAllowedVisitDate(
  clientData.city,
  clientData.neighborhood,
  allowedVisitDates
);

if (allowedDate) {
  scheduledDate = allowedDate;

  // Verificar se cai em domingo
  const date = new Date(allowedDate);
  const dayOfWeek = date.getDay();

  if (dayOfWeek === 0) {
    isSunday = true;
    newSundayVisits.add(clientDocument);
    console.warn(`⚠️ ATENÇÃO: Data cai em DOMINGO`);
  }
}

// Aviso visual no modal de confirmação
{sundayVisits.size > 0 && (
  <div className="bg-orange-50 border-2 border-orange-300">
    <AlertTriangle /> Visitas em Domingo
    {/* Lista de clientes afetados */}
  </div>
)}
```

### 4. **AllowedVisitDatesManager.tsx**

- Alterado de `date` (data completa) para `number` (dia do mês)
- Interface atualizada para selecionar dia de 1-31
- Exibição mostra "Dia X de cada mês"

### 5. **types/index.ts**

```typescript
export interface AllowedVisitDate {
  allowed_date: number; // Day of month (1-31)
  city: string;
  created_at: string | null;
  id: string;
  neighborhood: string;
  updated_at: string | null;
}
```

## Migração do Banco de Dados

Execute este SQL no Supabase para converter o esquema:

```sql
-- Step 1: Criar coluna temporária
ALTER TABLE public.allowed_visit_dates ADD COLUMN IF NOT EXISTS day_of_month INTEGER;

-- Step 2: Extrair dia das datas existentes
UPDATE public.allowed_visit_dates
SET day_of_month = EXTRACT(DAY FROM allowed_date);

-- Step 3: Remover coluna antiga
ALTER TABLE public.allowed_visit_dates DROP COLUMN allowed_date;

-- Step 4: Renomear coluna
ALTER TABLE public.allowed_visit_dates RENAME COLUMN day_of_month TO allowed_date;

-- Step 5: Adicionar constraint
ALTER TABLE public.allowed_visit_dates
ADD CONSTRAINT allowed_date_range CHECK (allowed_date >= 1 AND allowed_date <= 31);

-- Step 6: Adicionar comentário
COMMENT ON COLUMN public.allowed_visit_dates.allowed_date IS 'Day of month (1-31) when visits are allowed for this city/neighborhood combination. This applies to every month.';
```

Depois atualize os tipos:

```bash
npx supabase gen types typescript --project-id "rseiuknbwhmfjaiiywkj" --schema public > src/types/database.types.ts
```

## Exemplos de Uso

### Exemplo 1: Cliente com Data Configurada

```
Cliente: João Silva
Cidade: São Paulo
Bairro: Centro
Configuração: Dia 15

Resultado:
- Se hoje é 10/11/2024 → Agenda para 15/11/2024
- Se hoje é 20/11/2024 → Agenda para 15/12/2024
```

### Exemplo 2: Cliente sem Data Configurada

```
Cliente: Maria Santos
Cidade: Rio de Janeiro
Bairro: Copacabana
Configuração: Não existe

Resultado:
- Usa a data padrão selecionada pelo cobrador
```

### Exemplo 3: Seleção Múltipla

```
Seleciona 10 clientes:
- 5 de São Paulo/Centro (Dia 15) → 15/11/2024
- 3 de São Paulo/Mooca (Dia 20) → 20/11/2024
- 2 do Rio/Copacabana (sem config) → Data padrão

Cada cliente recebe sua data apropriada automaticamente!
```

## Benefícios

✅ **Automação**: Reduz trabalho manual do cobrador  
✅ **Consistência**: Garante visitas no mesmo dia todo mês  
✅ **Flexibilidade**: Permite configuração por cidade/bairro  
✅ **Inteligente**: Calcula automaticamente a próxima data válida  
✅ **Transparente**: Logs mostram quando usa data automática  
✅ **Seguro**: Avisa quando a data cai em domingo

## Próximos Passos (Opcional)

Melhorias futuras possíveis:

1. **Badge visual** no modal mostrando "Data Automática"
2. **Relatório** de coberturas de datas configuradas
3. **Validação** impedindo conflitos de datas
4. **Notificação** quando não há configuração para uma região
5. **Bulk import** de configurações via planilha

## Testes

Para testar a funcionalidade:

1. Configure algumas datas no menu "Datas Permitidas"
2. Vá para o agendamento de visitas
3. Selecione clientes dessas cidades/bairros
4. Observe no console a mensagem de data automática
5. Verifique que a data foi preenchida corretamente

## Suporte

Se houver dúvidas ou problemas, verifique:

- ✅ RLS policies estão aplicadas na tabela `allowed_visit_dates`
- ✅ Tipos do database foram atualizados
- ✅ Cache foi invalidado após mudanças
- ✅ Console mostra logs de data automática

---

**Data de Implementação:** 04/11/2024  
**Versão:** 1.0.0
