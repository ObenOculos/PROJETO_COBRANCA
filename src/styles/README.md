# 🎨 Guia de Estilos - Sistema de Cobrança

Este documento descreve o sistema de estilos padronizado para manter consistência visual em todas as páginas do sistema.

## 📁 Estrutura de Arquivos

```
src/styles/
├── variables.css    # Variáveis CSS e cores
├── layouts.css      # Layouts e estruturas
├── components.css   # Componentes padronizados
└── README.md       # Este guia
```

## 🎯 Como Usar

### 1. Importação Automática

Os estilos são importados automaticamente via `src/index.css`. Não é necessário importar manualmente.

### 2. Classes Disponíveis

#### 🏗️ **Containers**

```css
.container-main      /* Container principal com shadow */
.container-section   /* Seção com border */
.container-card      /* Card simples */
```

#### 📝 **Headers**

```css
.header-main         /* Header com padding e border */
.header-title        /* Título principal */
.header-subtitle     /* Subtítulo */
.header-icon         /* Ícone do header */
```

#### 🔘 **Botões**

```css
.btn-primary         /* Botão principal (azul) */
.btn-secondary       /* Botão secundário (cinza) */
.btn-success         /* Botão de sucesso (verde) */
.btn-danger          /* Botão de perigo (vermelho) */
.btn-filter          /* Botão de filtro */
.btn-sort            /* Botão de ordenação */
.btn-action          /* Botão de ação (pequeno) */
```

#### 📋 **Formulários**

```css
.input-base          /* Input padrão */
.select-base         /* Select padrão */
.textarea-base       /* Textarea padrão */
.label-base          /* Label padrão */
```

#### 🏷️ **Badges**

```css
.badge-base          /* Badge básico */
.badge-success       /* Badge verde */
.badge-warning       /* Badge amarelo */
.badge-danger        /* Badge vermelho */
.badge-info          /* Badge azul */
.badge-secondary     /* Badge cinza */
```

#### 📊 **Tabelas**

```css
.table-container     /* Container da tabela */
.table-base          /* Tabela básica */
.table-header        /* Header da tabela */
.table-body          /* Corpo da tabela */
.table-row           /* Linha da tabela */
.table-cell          /* Célula da tabela */
```

## 🎨 Cores Padronizadas

### Cores Principais

- **Primary**: `#2563eb` (azul)
- **Secondary**: `#6b7280` (cinza)

### Cores de Status

- **Success**: `#059669` (verde)
- **Warning**: `#d97706` (laranja)
- **Danger**: `#dc2626` (vermelho)
- **Info**: `#2563eb` (azul)

### Uso das Cores

```css
/* Via classes */
.color-primary
.bg-success
.border-danger

/* Via variáveis CSS */
color: var(--color-primary);
background-color: var(--color-success);
border-color: var(--color-danger);
```

## 📐 Layouts Responsivos

### Grids Responsivos

```css
.grid-responsive-2   /* 1 col mobile, 2 cols desktop */
.grid-responsive-3   /* 1 col mobile, 3 cols desktop */
.grid-responsive-4   /* 1 col mobile, 4 cols desktop */
```

### Layouts de Página

```css
.page-container      /* Container principal da página */
.page-header         /* Header da página */
.page-content        /* Conteúdo principal */
```

## 🔧 Classes Utilitárias

### Espaçamentos

```css
.space-y-form        /* Espaçamento para formulários */
.space-y-section     /* Espaçamento para seções */
.spacing-tight       /* Espaçamento apertado */
.spacing-normal      /* Espaçamento normal */
.spacing-relaxed     /* Espaçamento relaxado */
```

### Flexbox

```css
.flex-between        /* justify-between + align-center */
.flex-center         /* justify-center + align-center */
.flex-responsive     /* Flex responsivo (coluna/linha) */
```

### Texto

```css
.text-value          /* Texto de valor (negrito) */
.text-label          /* Texto de label */
.text-muted          /* Texto desbotado */
.text-error          /* Texto de erro */
```

## 🎯 Exemplos Práticos

### 1. Header de Página

```tsx
<div className="container-main">
  <div className="header-main">
    <h1 className="header-title">
      <DollarSign className="header-icon" />
      Título da Página
    </h1>
    <p className="header-subtitle">Descrição da página</p>
  </div>
</div>
```

### 2. Botões de Ação

```tsx
<div className="flex items-center space-x-2">
  <button className="btn-primary">
    <Plus className="h-4 w-4 mr-2" />
    Adicionar
  </button>
  <button className="btn-secondary">Cancelar</button>
</div>
```

### 3. Cards de Cliente

```tsx
<div className="card-client">
  <div className="card-client-header">
    <div className="flex-between">
      <h3 className="text-value">Nome do Cliente</h3>
      <span className="badge-success">Ativo</span>
    </div>
  </div>
</div>
```

### 4. Formulário

```tsx
<div className="form-section">
  <div className="form-group">
    <label className="label-base">Nome</label>
    <input className="input-base" type="text" />
  </div>
  <div className="form-actions">
    <button className="btn-secondary">Cancelar</button>
    <button className="btn-primary">Salvar</button>
  </div>
</div>
```

## 🏃‍♂️ Migração Gradual

### Passo 1: Identificar Padrões

Identifique elementos repetitivos nas páginas:

- Headers com mesmo estilo
- Botões com mesmas cores
- Cards com mesma estrutura

### Passo 2: Aplicar Classes

Substitua classes Tailwind repetitivas pelas classes padronizadas:

```tsx
// ❌ Antes
<div className="bg-white rounded-xl shadow-sm overflow-hidden">
  <div className="px-6 py-4 border-b border-gray-200">
    <h2 className="text-xl font-semibold text-gray-900 flex items-center">

// ✅ Depois
<div className="container-main">
  <div className="header-main">
    <h2 className="header-title">
```

### Passo 3: Validar Consistência

Verifique se a aparência visual permanece consistente após a migração.

## 🔄 Manutenção

### Adicionar Novos Componentes

1. Identifique padrões que se repetem
2. Adicione a classe em `components.css`
3. Documente aqui no README
4. Use a classe nos componentes

### Modificar Cores

1. Altere as variáveis em `variables.css`
2. As mudanças se aplicam automaticamente
3. Teste em todas as páginas

## 📜 **Scrollbar Customizada**

### Scrollbar Global

O sistema possui uma scrollbar minimalista aplicada globalmente em todos os elementos com scroll.

**Características:**
- Largura: 8px
- Cores suaves (cinza claro)
- Efeito hover
- Compatível com Firefox e WebKit browsers

**Variáveis:**
```css
--scrollbar-width: 8px;
--scrollbar-height: 8px;
--scrollbar-track-bg: #f1f5f9;
--scrollbar-thumb-bg: #cbd5e1;
--scrollbar-thumb-hover-bg: #94a3b8;
--scrollbar-border-radius: 4px;
```

**Classes Disponíveis:**
```css
.scrollbar-primary    /* Scrollbar com cor primária (azul) */
.minimal-scrollbar    /* Scrollbar padrão (compatibilidade) */
.custom-scrollbar     /* Scrollbar com cores antigas (legado) */
```

**Exemplo de Uso:**
```tsx
// Scrollbar global (aplicada automaticamente)
<div className="overflow-y-auto max-h-96">
  {/* Conteúdo com scroll automático */}
</div>

// Scrollbar com cor primária
<div className="overflow-y-auto max-h-96 scrollbar-primary">
  {/* Scroll com cor azul */}
</div>
```

**Customização:**

Para alterar as cores da scrollbar globalmente, modifique as variáveis em `variables.css`:

```css
:root {
  --scrollbar-thumb-bg: #sua-cor-aqui;
  --scrollbar-thumb-hover-bg: #sua-cor-hover;
}
```

## 🎨 Customização

### Variáveis CSS

Todas as cores, espaçamentos e outros valores estão em `variables.css` para fácil customização.

### Tema Personalizado

Para criar um tema personalizado, modifique as variáveis CSS sem alterar as classes dos componentes.

---

**💡 Dica**: Use as classes padronizadas sempre que possível para manter consistência visual e facilitar manutenção futura.
