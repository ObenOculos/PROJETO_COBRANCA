export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "12.2.3";
  };
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: {
          extensions?: Json;
          operationName?: string;
          query?: string;
          variables?: Json;
        };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      acordo_configuracao_padrao: {
        Row: {
          created_at: string;
          created_by: string | null;
          desconto_maximo_percentual: number;
          desconto_padrao_percentual: number;
          dias_entre_parcelas: number;
          empresa_chave_pix: string | null;
          empresa_cnpj: string | null;
          empresa_endereco: string | null;
          empresa_nome: string | null;
          id: string;
          juros_percentual_am: number;
          multa_percentual: number;
          vigente_ate: string | null;
          vigente_desde: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          desconto_maximo_percentual?: number;
          desconto_padrao_percentual?: number;
          dias_entre_parcelas?: number;
          empresa_chave_pix?: string | null;
          empresa_cnpj?: string | null;
          empresa_endereco?: string | null;
          empresa_nome?: string | null;
          id?: string;
          juros_percentual_am?: number;
          multa_percentual?: number;
          vigente_ate?: string | null;
          vigente_desde?: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          desconto_maximo_percentual?: number;
          desconto_padrao_percentual?: number;
          dias_entre_parcelas?: number;
          empresa_chave_pix?: string | null;
          empresa_cnpj?: string | null;
          empresa_endereco?: string | null;
          empresa_nome?: string | null;
          id?: string;
          juros_percentual_am?: number;
          multa_percentual?: number;
          vigente_ate?: string | null;
          vigente_desde?: string;
        };
        Relationships: [
          {
            foreignKeyName: "acordo_configuracao_padrao_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      acordo_pagamentos: {
        Row: {
          acordo_parcela_id: string;
          collector_id: string | null;
          created_at: string;
          data_pagamento: string;
          estorno_de: string | null;
          id: string;
          motivo: string | null;
          notes: string | null;
          registrado_por_id: string | null;
          valor_encargos: number | null;
          valor_pago: number;
          valor_principal: number | null;
        };
        Insert: {
          acordo_parcela_id: string;
          collector_id?: string | null;
          created_at?: string;
          data_pagamento: string;
          estorno_de?: string | null;
          id?: string;
          motivo?: string | null;
          notes?: string | null;
          registrado_por_id?: string | null;
          valor_encargos?: number | null;
          valor_pago: number;
          valor_principal?: number | null;
        };
        Update: {
          acordo_parcela_id?: string;
          collector_id?: string | null;
          created_at?: string;
          data_pagamento?: string;
          estorno_de?: string | null;
          id?: string;
          motivo?: string | null;
          notes?: string | null;
          registrado_por_id?: string | null;
          valor_encargos?: number | null;
          valor_pago?: number;
          valor_principal?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "acordo_pagamentos_acordo_parcela_id_fkey";
            columns: ["acordo_parcela_id"];
            isOneToOne: false;
            referencedRelation: "acordo_parcelas";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "acordo_pagamentos_collector_id_fkey";
            columns: ["collector_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "acordo_pagamentos_estorno_de_fkey";
            columns: ["estorno_de"];
            isOneToOne: false;
            referencedRelation: "acordo_pagamentos";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "acordo_pagamentos_registrado_por_id_fkey";
            columns: ["registrado_por_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      acordo_parcelas: {
        Row: {
          acordo_id: string;
          created_at: string;
          data_vencimento: string;
          id: string;
          numero: number;
          valor_parcela: number;
        };
        Insert: {
          acordo_id: string;
          created_at?: string;
          data_vencimento: string;
          id?: string;
          numero: number;
          valor_parcela: number;
        };
        Update: {
          acordo_id?: string;
          created_at?: string;
          data_vencimento?: string;
          id?: string;
          numero?: number;
          valor_parcela?: number;
        };
        Relationships: [
          {
            foreignKeyName: "acordo_parcelas_acordo_id_fkey";
            columns: ["acordo_id"];
            isOneToOne: false;
            referencedRelation: "acordos";
            referencedColumns: ["id"];
          },
        ];
      };
      acordo_titulos: {
        Row: {
          acordo_id: string;
          collection_id: number;
          created_at: string;
          desconto_valor: number;
          dias_atraso_no_momento: number;
          id: string;
          juros_valor: number;
          multa_valor: number;
          saldo_no_momento: number;
        };
        Insert: {
          acordo_id: string;
          collection_id: number;
          created_at?: string;
          desconto_valor?: number;
          dias_atraso_no_momento?: number;
          id?: string;
          juros_valor?: number;
          multa_valor?: number;
          saldo_no_momento: number;
        };
        Update: {
          acordo_id?: string;
          collection_id?: number;
          created_at?: string;
          desconto_valor?: number;
          dias_atraso_no_momento?: number;
          id?: string;
          juros_valor?: number;
          multa_valor?: number;
          saldo_no_momento?: number;
        };
        Relationships: [
          {
            foreignKeyName: "acordo_titulos_acordo_id_fkey";
            columns: ["acordo_id"];
            isOneToOne: false;
            referencedRelation: "acordos";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "acordo_titulos_collection_id_fkey";
            columns: ["collection_id"];
            isOneToOne: false;
            referencedRelation: "BANCO_DADOS";
            referencedColumns: ["id_parcela"];
          },
          {
            foreignKeyName: "acordo_titulos_collection_id_fkey";
            columns: ["collection_id"];
            isOneToOne: false;
            referencedRelation: "banco_dados_clientes_ativos";
            referencedColumns: ["id_parcela"];
          },
          {
            foreignKeyName: "acordo_titulos_collection_id_fkey";
            columns: ["collection_id"];
            isOneToOne: false;
            referencedRelation: "banco_dados_clientes_quitados";
            referencedColumns: ["id_parcela"];
          },
        ];
      };
      acordos: {
        Row: {
          acordo_origem_id: string | null;
          client_document: string;
          client_name: string | null;
          collector_id: string;
          created_at: string;
          created_by_id: string | null;
          desconto_percentual_aplicado: number;
          destino_pagamentos: string | null;
          encargos_reimputados: number | null;
          forma_pagamento_parcelas: string | null;
          id: string;
          juros_percentual_am_aplicado: number;
          motivo_cancelamento: string | null;
          multa_percentual_aplicado: number;
          numero_parcelas: number;
          resolved_at: string | null;
          status: string;
          testemunha1_cpf: string | null;
          testemunha1_nome: string | null;
          testemunha2_cpf: string | null;
          testemunha2_nome: string | null;
          valor_negociado: number;
        };
        Insert: {
          acordo_origem_id?: string | null;
          client_document: string;
          client_name?: string | null;
          collector_id: string;
          created_at?: string;
          created_by_id?: string | null;
          desconto_percentual_aplicado?: number;
          destino_pagamentos?: string | null;
          encargos_reimputados?: number | null;
          forma_pagamento_parcelas?: string | null;
          id?: string;
          juros_percentual_am_aplicado?: number;
          motivo_cancelamento?: string | null;
          multa_percentual_aplicado?: number;
          numero_parcelas: number;
          resolved_at?: string | null;
          status?: string;
          testemunha1_cpf?: string | null;
          testemunha1_nome?: string | null;
          testemunha2_cpf?: string | null;
          testemunha2_nome?: string | null;
          valor_negociado: number;
        };
        Update: {
          acordo_origem_id?: string | null;
          client_document?: string;
          client_name?: string | null;
          collector_id?: string;
          created_at?: string;
          created_by_id?: string | null;
          desconto_percentual_aplicado?: number;
          destino_pagamentos?: string | null;
          encargos_reimputados?: number | null;
          forma_pagamento_parcelas?: string | null;
          id?: string;
          juros_percentual_am_aplicado?: number;
          motivo_cancelamento?: string | null;
          multa_percentual_aplicado?: number;
          numero_parcelas?: number;
          resolved_at?: string | null;
          status?: string;
          testemunha1_cpf?: string | null;
          testemunha1_nome?: string | null;
          testemunha2_cpf?: string | null;
          testemunha2_nome?: string | null;
          valor_negociado?: number;
        };
        Relationships: [
          {
            foreignKeyName: "acordos_acordo_origem_id_fkey";
            columns: ["acordo_origem_id"];
            isOneToOne: false;
            referencedRelation: "acordos";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "acordos_collector_id_fkey";
            columns: ["collector_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "acordos_created_by_id_fkey";
            columns: ["created_by_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      allowed_visit_dates: {
        Row: {
          allowed_date: number | null;
          city: string;
          collector_id: string | null;
          created_at: string | null;
          id: string;
          neighborhood: string | null;
          updated_at: string | null;
        };
        Insert: {
          allowed_date?: number | null;
          city: string;
          collector_id?: string | null;
          created_at?: string | null;
          id?: string;
          neighborhood?: string | null;
          updated_at?: string | null;
        };
        Update: {
          allowed_date?: number | null;
          city?: string;
          collector_id?: string | null;
          created_at?: string | null;
          id?: string;
          neighborhood?: string | null;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "fk_allowed_visit_dates_collector_id";
            columns: ["collector_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      apelidos_temporario: {
        Row: {
          apelido: string | null;
          cpf: string | null;
        };
        Insert: {
          apelido?: string | null;
          cpf?: string | null;
        };
        Update: {
          apelido?: string | null;
          cpf?: string | null;
        };
        Relationships: [];
      };
      atribuicoes_historico: {
        Row: {
          assigned_at: string;
          cliente_nome: string | null;
          cobrador_anterior_id: string | null;
          cobrador_novo_id: string | null;
          documento: string;
          gerente_id: string;
          id: string;
          motivo: string | null;
          nome_da_loja: string | null;
        };
        Insert: {
          assigned_at?: string;
          cliente_nome?: string | null;
          cobrador_anterior_id?: string | null;
          cobrador_novo_id?: string | null;
          documento: string;
          gerente_id: string;
          id?: string;
          motivo?: string | null;
          nome_da_loja?: string | null;
        };
        Update: {
          assigned_at?: string;
          cliente_nome?: string | null;
          cobrador_anterior_id?: string | null;
          cobrador_novo_id?: string | null;
          documento?: string;
          gerente_id?: string;
          id?: string;
          motivo?: string | null;
          nome_da_loja?: string | null;
        };
        Relationships: [];
      };
      atribuicoes_pagamento: {
        Row: {
          cliente: string | null;
          created_at: string;
          data_pagamento: string;
          decidido_em: string | null;
          decidido_por_id: string | null;
          decisao: string | null;
          documento: string;
          excecao: boolean;
          id: string;
          id_parcela: number;
          lote: string;
          observacao: string;
          parcela: number | null;
          resposta: string | null;
          solicitado_por_id: string;
          ultimo_contato_em: string | null;
          valor: number;
          valor_aprovado: number | null;
          venda: number | null;
        };
        Insert: {
          cliente?: string | null;
          created_at?: string;
          data_pagamento: string;
          decidido_em?: string | null;
          decidido_por_id?: string | null;
          decisao?: string | null;
          documento: string;
          excecao?: boolean;
          id?: string;
          id_parcela: number;
          lote: string;
          observacao: string;
          parcela?: number | null;
          resposta?: string | null;
          solicitado_por_id: string;
          ultimo_contato_em?: string | null;
          valor: number;
          valor_aprovado?: number | null;
          venda?: number | null;
        };
        Update: {
          cliente?: string | null;
          created_at?: string;
          data_pagamento?: string;
          decidido_em?: string | null;
          decidido_por_id?: string | null;
          decisao?: string | null;
          documento?: string;
          excecao?: boolean;
          id?: string;
          id_parcela?: number;
          lote?: string;
          observacao?: string;
          parcela?: number | null;
          resposta?: string | null;
          solicitado_por_id?: string;
          ultimo_contato_em?: string | null;
          valor?: number;
          valor_aprovado?: number | null;
          venda?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "atribuicoes_pagamento_decidido_por_id_fkey";
            columns: ["decidido_por_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "atribuicoes_pagamento_solicitado_por_id_fkey";
            columns: ["solicitado_por_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      authorization_history: {
        Row: {
          client_address: string | null;
          client_city: string | null;
          client_document: string;
          client_mobile: string | null;
          client_name: string;
          client_neighborhood: string | null;
          client_phone: string | null;
          collector_id: string | null;
          collector_name: string;
          collector_performance_score: number | null;
          created_at: string | null;
          expires_at: string;
          id: string;
          last_payment_amount: number | null;
          last_payment_date: string | null;
          metadata: Json | null;
          notes: string | null;
          overdue_installments_count: number | null;
          processed_at: string | null;
          processed_by_id: string | null;
          processed_by_name: string | null;
          requested_at: string;
          status: string;
          token: string;
          total_pending_value: number | null;
          total_received_value: number | null;
          total_sales_count: number | null;
          total_sales_value: number | null;
          type: string;
          updated_at: string | null;
        };
        Insert: {
          client_address?: string | null;
          client_city?: string | null;
          client_document: string;
          client_mobile?: string | null;
          client_name: string;
          client_neighborhood?: string | null;
          client_phone?: string | null;
          collector_id?: string | null;
          collector_name: string;
          collector_performance_score?: number | null;
          created_at?: string | null;
          expires_at: string;
          id?: string;
          last_payment_amount?: number | null;
          last_payment_date?: string | null;
          metadata?: Json | null;
          notes?: string | null;
          overdue_installments_count?: number | null;
          processed_at?: string | null;
          processed_by_id?: string | null;
          processed_by_name?: string | null;
          requested_at: string;
          status: string;
          token: string;
          total_pending_value?: number | null;
          total_received_value?: number | null;
          total_sales_count?: number | null;
          total_sales_value?: number | null;
          type?: string;
          updated_at?: string | null;
        };
        Update: {
          client_address?: string | null;
          client_city?: string | null;
          client_document?: string;
          client_mobile?: string | null;
          client_name?: string;
          client_neighborhood?: string | null;
          client_phone?: string | null;
          collector_id?: string | null;
          collector_name?: string;
          collector_performance_score?: number | null;
          created_at?: string | null;
          expires_at?: string;
          id?: string;
          last_payment_amount?: number | null;
          last_payment_date?: string | null;
          metadata?: Json | null;
          notes?: string | null;
          overdue_installments_count?: number | null;
          processed_at?: string | null;
          processed_by_id?: string | null;
          processed_by_name?: string | null;
          requested_at?: string;
          status?: string;
          token?: string;
          total_pending_value?: number | null;
          total_received_value?: number | null;
          total_sales_count?: number | null;
          total_sales_value?: number | null;
          type?: string;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "authorization_history_collector_id_fkey";
            columns: ["collector_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "authorization_history_processed_by_id_fkey";
            columns: ["processed_by_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      BANCO_DADOS: {
        Row: {
          acrescimo: number | null;
          bairro: string | null;
          cep: string | null;
          cidade: string | null;
          cliente: string | null;
          codigo_externo: string | null;
          complemento: string | null;
          convenio: string | null;
          data_de_recebimento: string | null;
          data_lancamento: string | null;
          data_vencimento: string | null;
          desconto: number | null;
          descricao: string | null;
          dias_carencia: string | null;
          dias_em_atraso: number | null;
          documento: string | null;
          endereco: string | null;
          estado: string | null;
          id_parcela: number;
          juros_aplicado: number | null;
          juros_pago: number | null;
          juros_por_dia: number | null;
          multa: number | null;
          multa_aplicada: number | null;
          multa_paga: number | null;
          nome_da_loja: string | null;
          numero: string | null;
          numero_titulo: number | null;
          obs: string | null;
          parcela: number | null;
          situacao: string | null;
          status: string | null;
          tipo_de_cobranca: string | null;
          tipo_titulo_erp: number | null;
          user_id: string | null;
          valor_original: number | null;
          valor_reajustado: number | null;
          valor_recebido: number | null;
          venda_n: number | null;
        };
        Insert: {
          acrescimo?: number | null;
          bairro?: string | null;
          cep?: string | null;
          cidade?: string | null;
          cliente?: string | null;
          codigo_externo?: string | null;
          complemento?: string | null;
          convenio?: string | null;
          data_de_recebimento?: string | null;
          data_lancamento?: string | null;
          data_vencimento?: string | null;
          desconto?: number | null;
          descricao?: string | null;
          dias_carencia?: string | null;
          dias_em_atraso?: number | null;
          documento?: string | null;
          endereco?: string | null;
          estado?: string | null;
          id_parcela: number;
          juros_aplicado?: number | null;
          juros_pago?: number | null;
          juros_por_dia?: number | null;
          multa?: number | null;
          multa_aplicada?: number | null;
          multa_paga?: number | null;
          nome_da_loja?: string | null;
          numero?: string | null;
          numero_titulo?: number | null;
          obs?: string | null;
          parcela?: number | null;
          situacao?: string | null;
          status?: string | null;
          tipo_de_cobranca?: string | null;
          tipo_titulo_erp?: number | null;
          user_id?: string | null;
          valor_original?: number | null;
          valor_reajustado?: number | null;
          valor_recebido?: number | null;
          venda_n?: number | null;
        };
        Update: {
          acrescimo?: number | null;
          bairro?: string | null;
          cep?: string | null;
          cidade?: string | null;
          cliente?: string | null;
          codigo_externo?: string | null;
          complemento?: string | null;
          convenio?: string | null;
          data_de_recebimento?: string | null;
          data_lancamento?: string | null;
          data_vencimento?: string | null;
          desconto?: number | null;
          descricao?: string | null;
          dias_carencia?: string | null;
          dias_em_atraso?: number | null;
          documento?: string | null;
          endereco?: string | null;
          estado?: string | null;
          id_parcela?: number;
          juros_aplicado?: number | null;
          juros_pago?: number | null;
          juros_por_dia?: number | null;
          multa?: number | null;
          multa_aplicada?: number | null;
          multa_paga?: number | null;
          nome_da_loja?: string | null;
          numero?: string | null;
          numero_titulo?: number | null;
          obs?: string | null;
          parcela?: number | null;
          situacao?: string | null;
          status?: string | null;
          tipo_de_cobranca?: string | null;
          tipo_titulo_erp?: number | null;
          user_id?: string | null;
          valor_original?: number | null;
          valor_reajustado?: number | null;
          valor_recebido?: number | null;
          venda_n?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "fk_banco_dados_documento";
            columns: ["documento"];
            isOneToOne: false;
            referencedRelation: "clientes";
            referencedColumns: ["documento"];
          },
          {
            foreignKeyName: "fk_banco_dados_user";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      casos_gestor: {
        Row: {
          atualizado_em: string;
          cliente_nome: string | null;
          collector_id: string;
          criado_em: string;
          decidido_em: string | null;
          decidido_por: string | null;
          documento: string;
          id: string;
          motivo: string;
          motivo_reagendamento: string | null;
          notas_nova: string | null;
          notas_original: string | null;
          nova_data: string | null;
          novo_horario: string | null;
          observacao: string | null;
          observacao_gestor: string | null;
          quantidade: number;
          status: string;
          visita_id: string | null;
        };
        Insert: {
          atualizado_em?: string;
          cliente_nome?: string | null;
          collector_id: string;
          criado_em?: string;
          decidido_em?: string | null;
          decidido_por?: string | null;
          documento: string;
          id?: string;
          motivo: string;
          motivo_reagendamento?: string | null;
          notas_nova?: string | null;
          notas_original?: string | null;
          nova_data?: string | null;
          novo_horario?: string | null;
          observacao?: string | null;
          observacao_gestor?: string | null;
          quantidade: number;
          status?: string;
          visita_id?: string | null;
        };
        Update: {
          atualizado_em?: string;
          cliente_nome?: string | null;
          collector_id?: string;
          criado_em?: string;
          decidido_em?: string | null;
          decidido_por?: string | null;
          documento?: string;
          id?: string;
          motivo?: string;
          motivo_reagendamento?: string | null;
          notas_nova?: string | null;
          notas_original?: string | null;
          nova_data?: string | null;
          novo_horario?: string | null;
          observacao?: string | null;
          observacao_gestor?: string | null;
          quantidade?: number;
          status?: string;
          visita_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "casos_gestor_collector_id_fkey";
            columns: ["collector_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      ciclone_renegociacao_titulos: {
        Row: {
          baixa_uuid: string;
          data_vencimento: string | null;
          desconto: number | null;
          id_parcela: number;
          juros: number | null;
          multa: number | null;
          papel: string;
          parcela: number | null;
          principal: number | null;
          valor: number | null;
        };
        Insert: {
          baixa_uuid: string;
          data_vencimento?: string | null;
          desconto?: number | null;
          id_parcela: number;
          juros?: number | null;
          multa?: number | null;
          papel: string;
          parcela?: number | null;
          principal?: number | null;
          valor?: number | null;
        };
        Update: {
          baixa_uuid?: string;
          data_vencimento?: string | null;
          desconto?: number | null;
          id_parcela?: number;
          juros?: number | null;
          multa?: number | null;
          papel?: string;
          parcela?: number | null;
          principal?: number | null;
          valor?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "ciclone_renegociacao_titulos_baixa_uuid_fkey";
            columns: ["baixa_uuid"];
            isOneToOne: false;
            referencedRelation: "ciclone_renegociacoes";
            referencedColumns: ["baixa_uuid"];
          },
          {
            foreignKeyName: "ciclone_renegociacao_titulos_id_parcela_fkey";
            columns: ["id_parcela"];
            isOneToOne: false;
            referencedRelation: "BANCO_DADOS";
            referencedColumns: ["id_parcela"];
          },
          {
            foreignKeyName: "ciclone_renegociacao_titulos_id_parcela_fkey";
            columns: ["id_parcela"];
            isOneToOne: false;
            referencedRelation: "banco_dados_clientes_ativos";
            referencedColumns: ["id_parcela"];
          },
          {
            foreignKeyName: "ciclone_renegociacao_titulos_id_parcela_fkey";
            columns: ["id_parcela"];
            isOneToOne: false;
            referencedRelation: "banco_dados_clientes_quitados";
            referencedColumns: ["id_parcela"];
          },
        ];
      };
      ciclone_renegociacoes: {
        Row: {
          baixa_uuid: string;
          data_baixa: string;
          documento: string;
          novo_documento: string;
          sincronizado_em: string;
          situacao: string;
          valor_renegociado: number;
          valor_total_baixa: number;
        };
        Insert: {
          baixa_uuid: string;
          data_baixa: string;
          documento: string;
          novo_documento: string;
          sincronizado_em?: string;
          situacao: string;
          valor_renegociado: number;
          valor_total_baixa: number;
        };
        Update: {
          baixa_uuid?: string;
          data_baixa?: string;
          documento?: string;
          novo_documento?: string;
          sincronizado_em?: string;
          situacao?: string;
          valor_renegociado?: number;
          valor_total_baixa?: number;
        };
        Relationships: [];
      };
      ciclone_titulo_map: {
        Row: {
          created_at: string;
          fncrt_uuid: string;
          id_parcela: number;
        };
        Insert: {
          created_at?: string;
          fncrt_uuid: string;
          id_parcela?: number;
        };
        Update: {
          created_at?: string;
          fncrt_uuid?: string;
          id_parcela?: number;
        };
        Relationships: [];
      };
      cheque_marcacoes: {
        Row: {
          criado_em: string;
          documento: string;
          id: string;
          marcado: boolean;
          motivo: string;
          usuario_id: string;
        };
        Insert: {
          criado_em?: string;
          documento: string;
          id?: string;
          marcado: boolean;
          motivo: string;
          usuario_id: string;
        };
        Update: {
          criado_em?: string;
          documento?: string;
          id?: string;
          marcado?: boolean;
          motivo?: string;
          usuario_id?: string;
        };
        Relationships: [];
      };
      clientes: {
        Row: {
          apelido: string | null;
          celular: string | null;
          celular1: string | null;
          celular2: string | null;
          codigo_cliente_erp: string | null;
          codigo_cliente_ssotica: string | null;
          contato_nome: string | null;
          contato_telefone: string | null;
          contato_telefone2: string | null;
          created_at: string | null;
          data_nascimento: string | null;
          documento: string;
          email: string | null;
          erp_atualizado_em: string | null;
          id: number;
          nome: string;
          observacao_erp: string | null;
          razao_social: string | null;
          regiao: string | null;
          reincidencia_reset_at: string | null;
          telefone: string | null;
          ultima_baixa_cheque_erp: string | null;
          vendedor_responsavel: string | null;
        };
        Insert: {
          apelido?: string | null;
          celular?: string | null;
          celular1?: string | null;
          celular2?: string | null;
          codigo_cliente_erp?: string | null;
          codigo_cliente_ssotica?: string | null;
          contato_nome?: string | null;
          contato_telefone?: string | null;
          contato_telefone2?: string | null;
          created_at?: string | null;
          data_nascimento?: string | null;
          documento: string;
          email?: string | null;
          erp_atualizado_em?: string | null;
          id?: number;
          nome: string;
          observacao_erp?: string | null;
          razao_social?: string | null;
          regiao?: string | null;
          reincidencia_reset_at?: string | null;
          telefone?: string | null;
          ultima_baixa_cheque_erp?: string | null;
          vendedor_responsavel?: string | null;
        };
        Update: {
          apelido?: string | null;
          celular?: string | null;
          celular1?: string | null;
          celular2?: string | null;
          codigo_cliente_erp?: string | null;
          codigo_cliente_ssotica?: string | null;
          contato_nome?: string | null;
          contato_telefone?: string | null;
          contato_telefone2?: string | null;
          created_at?: string | null;
          data_nascimento?: string | null;
          documento?: string;
          email?: string | null;
          erp_atualizado_em?: string | null;
          id?: number;
          nome?: string;
          observacao_erp?: string | null;
          razao_social?: string | null;
          regiao?: string | null;
          reincidencia_reset_at?: string | null;
          telefone?: string | null;
          ultima_baixa_cheque_erp?: string | null;
          vendedor_responsavel?: string | null;
        };
        Relationships: [];
      };
      collection_attempts: {
        Row: {
          collection_id: string;
          collector_id: string | null;
          created_at: string;
          date: string;
          id: string;
          next_action: string | null;
          next_action_date: string | null;
          notes: string | null;
          registrado_por_id: string | null;
          result: string;
          type: string;
        };
        Insert: {
          collection_id: string;
          collector_id?: string | null;
          created_at?: string;
          date: string;
          id?: string;
          next_action?: string | null;
          next_action_date?: string | null;
          notes?: string | null;
          registrado_por_id?: string | null;
          result: string;
          type: string;
        };
        Update: {
          collection_id?: string;
          collector_id?: string | null;
          created_at?: string;
          date?: string;
          id?: string;
          next_action?: string | null;
          next_action_date?: string | null;
          notes?: string | null;
          registrado_por_id?: string | null;
          result?: string;
          type?: string;
        };
        Relationships: [
          {
            foreignKeyName: "collection_attempts_collector_id_fkey";
            columns: ["collector_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "collection_attempts_registrado_por_id_fkey";
            columns: ["registrado_por_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      collector_overdue_ranges: {
        Row: {
          ativa: boolean;
          collector_id: string;
          created_at: string;
          created_by: string | null;
          fila_ordem: string;
          fila_peso: number | null;
          fila_peso_tarde: number | null;
          fila_saldo_max: number | null;
          fila_saldo_min: number | null;
          id: string;
          lojas: string[] | null;
          max_dias: number | null;
          min_dias: number;
          vigente_ate: string | null;
          vigente_desde: string;
        };
        Insert: {
          ativa?: boolean;
          collector_id: string;
          created_at?: string;
          created_by?: string | null;
          fila_ordem?: string;
          fila_peso?: number | null;
          fila_peso_tarde?: number | null;
          fila_saldo_max?: number | null;
          fila_saldo_min?: number | null;
          id?: string;
          lojas?: string[] | null;
          max_dias?: number | null;
          min_dias: number;
          vigente_ate?: string | null;
          vigente_desde?: string;
        };
        Update: {
          ativa?: boolean;
          collector_id?: string;
          created_at?: string;
          created_by?: string | null;
          fila_ordem?: string;
          fila_peso?: number | null;
          fila_peso_tarde?: number | null;
          fila_saldo_max?: number | null;
          fila_saldo_min?: number | null;
          id?: string;
          lojas?: string[] | null;
          max_dias?: number | null;
          min_dias?: number;
          vigente_ate?: string | null;
          vigente_desde?: string;
        };
        Relationships: [
          {
            foreignKeyName: "collector_overdue_ranges_collector_id_fkey";
            columns: ["collector_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "collector_overdue_ranges_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      comissao_faixas: {
        Row: {
          created_at: string;
          created_by: string | null;
          forma: string;
          id: string;
          meta_valor: number;
          month: string;
          substituida_em: string | null;
          substituida_por: string | null;
          user_id: string;
          valor: number;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          forma: string;
          id?: string;
          meta_valor: number;
          month: string;
          substituida_em?: string | null;
          substituida_por?: string | null;
          user_id: string;
          valor: number;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          forma?: string;
          id?: string;
          meta_valor?: number;
          month?: string;
          substituida_em?: string | null;
          substituida_por?: string | null;
          user_id?: string;
          valor?: number;
        };
        Relationships: [
          {
            foreignKeyName: "comissao_faixas_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "comissao_faixas_substituida_por_fkey";
            columns: ["substituida_por"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "comissao_faixas_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      conferencia_marcacoes: {
        Row: {
          acao: string;
          app_valor: number;
          base_valor: number;
          created_at: string;
          documento: string;
          id: string;
          mes: string;
          observacao: string | null;
          registrado_por_id: string;
          visao: string;
        };
        Insert: {
          acao: string;
          app_valor: number;
          base_valor: number;
          created_at?: string;
          documento: string;
          id?: string;
          mes: string;
          observacao?: string | null;
          registrado_por_id: string;
          visao: string;
        };
        Update: {
          acao?: string;
          app_valor?: number;
          base_valor?: number;
          created_at?: string;
          documento?: string;
          id?: string;
          mes?: string;
          observacao?: string | null;
          registrado_por_id?: string;
          visao?: string;
        };
        Relationships: [
          {
            foreignKeyName: "conferencia_marcacoes_registrado_por_id_fkey";
            columns: ["registrado_por_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      distribuicao_config: {
        Row: {
          atualizado_em: string;
          atualizado_por: string | null;
          id: number;
          perfis: Json;
        };
        Insert: {
          atualizado_em?: string;
          atualizado_por?: string | null;
          id?: number;
          perfis: Json;
        };
        Update: {
          atualizado_em?: string;
          atualizado_por?: string | null;
          id?: number;
          perfis?: Json;
        };
        Relationships: [];
      };
      distribuicao_execucoes: {
        Row: {
          erro: string | null;
          executado_em: string;
          id: number;
          resultado: Json | null;
        };
        Insert: {
          erro?: string | null;
          executado_em?: string;
          id?: number;
          resultado?: Json | null;
        };
        Update: {
          erro?: string | null;
          executado_em?: string;
          id?: number;
          resultado?: Json | null;
        };
        Relationships: [];
      };
      enderecos_historico: {
        Row: {
          bairro: string | null;
          cep: string | null;
          cidade: string | null;
          cliente_documento: string;
          complemento: string | null;
          created_at: string;
          estado: string | null;
          id: string;
          is_atual: boolean;
          logradouro: string | null;
          numero: string | null;
        };
        Insert: {
          bairro?: string | null;
          cep?: string | null;
          cidade?: string | null;
          cliente_documento: string;
          complemento?: string | null;
          created_at?: string;
          estado?: string | null;
          id?: string;
          is_atual?: boolean;
          logradouro?: string | null;
          numero?: string | null;
        };
        Update: {
          bairro?: string | null;
          cep?: string | null;
          cidade?: string | null;
          cliente_documento?: string;
          complemento?: string | null;
          created_at?: string;
          estado?: string | null;
          id?: string;
          is_atual?: boolean;
          logradouro?: string | null;
          numero?: string | null;
        };
        Relationships: [];
      };
      fila_adiamentos: {
        Row: {
          collector_id: string;
          created_at: string;
          dia: string;
          documento: string;
          id: string;
          motivo: string;
          observacao: string | null;
        };
        Insert: {
          collector_id: string;
          created_at?: string;
          dia?: string;
          documento: string;
          id?: string;
          motivo: string;
          observacao?: string | null;
        };
        Update: {
          collector_id?: string;
          created_at?: string;
          dia?: string;
          documento?: string;
          id?: string;
          motivo?: string;
          observacao?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "fila_adiamentos_collector_id_fkey";
            columns: ["collector_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      fila_lote_itens: {
        Row: {
          documento: string;
          lote_id: string;
          posicao: number;
          regra_id: string | null;
          urgencia: string | null;
        };
        Insert: {
          documento: string;
          lote_id: string;
          posicao: number;
          regra_id?: string | null;
          urgencia?: string | null;
        };
        Update: {
          documento?: string;
          lote_id?: string;
          posicao?: number;
          regra_id?: string | null;
          urgencia?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "fila_lote_itens_lote_id_fkey";
            columns: ["lote_id"];
            isOneToOne: false;
            referencedRelation: "fila_lotes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "fila_lote_itens_regra_id_fkey";
            columns: ["regra_id"];
            isOneToOne: false;
            referencedRelation: "collector_overdue_ranges";
            referencedColumns: ["id"];
          },
        ];
      };
      fila_lotes: {
        Row: {
          collector_id: string;
          concluido_em: string | null;
          criado_em: string;
          id: string;
          tamanho_previsto: number;
          turno: string | null;
        };
        Insert: {
          collector_id: string;
          concluido_em?: string | null;
          criado_em?: string;
          id?: string;
          tamanho_previsto: number;
          turno?: string | null;
        };
        Update: {
          collector_id?: string;
          concluido_em?: string | null;
          criado_em?: string;
          id?: string;
          tamanho_previsto?: number;
          turno?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "fila_lotes_collector_id_fkey";
            columns: ["collector_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      manager_collector_links: {
        Row: {
          collector_id: string;
          created_at: string;
          created_by: string | null;
          id: string;
          manager_id: string;
          vigente_ate: string | null;
          vigente_desde: string;
        };
        Insert: {
          collector_id: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          manager_id: string;
          vigente_ate?: string | null;
          vigente_desde?: string;
        };
        Update: {
          collector_id?: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          manager_id?: string;
          vigente_ate?: string | null;
          vigente_desde?: string;
        };
        Relationships: [
          {
            foreignKeyName: "manager_collector_links_collector_id_fkey";
            columns: ["collector_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "manager_collector_links_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "manager_collector_links_manager_id_fkey";
            columns: ["manager_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      monthly_goals: {
        Row: {
          created_at: string;
          id: string;
          month: string;
          payments_goal: number;
          updated_at: string;
          user_id: string;
          visits_goal: number;
        };
        Insert: {
          created_at?: string;
          id?: string;
          month: string;
          payments_goal: number;
          updated_at?: string;
          user_id: string;
          visits_goal: number;
        };
        Update: {
          created_at?: string;
          id?: string;
          month?: string;
          payments_goal?: number;
          updated_at?: string;
          user_id?: string;
          visits_goal?: number;
        };
        Relationships: [
          {
            foreignKeyName: "monthly_goals_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      pedidos_correcao_pagamento: {
        Row: {
          cliente: string | null;
          created_at: string;
          decidido_em: string | null;
          decidido_por_id: string | null;
          decisao: string | null;
          documento: string;
          estorno_id: string | null;
          id: string;
          motivo: string;
          resposta: string | null;
          sale_payment_id: string;
          solicitado_por_id: string;
          valor: number;
        };
        Insert: {
          cliente?: string | null;
          created_at?: string;
          decidido_em?: string | null;
          decidido_por_id?: string | null;
          decisao?: string | null;
          documento: string;
          estorno_id?: string | null;
          id?: string;
          motivo: string;
          resposta?: string | null;
          sale_payment_id: string;
          solicitado_por_id: string;
          valor: number;
        };
        Update: {
          cliente?: string | null;
          created_at?: string;
          decidido_em?: string | null;
          decidido_por_id?: string | null;
          decisao?: string | null;
          documento?: string;
          estorno_id?: string | null;
          id?: string;
          motivo?: string;
          resposta?: string | null;
          sale_payment_id?: string;
          solicitado_por_id?: string;
          valor?: number;
        };
        Relationships: [
          {
            foreignKeyName: "pedidos_correcao_pagamento_decidido_por_id_fkey";
            columns: ["decidido_por_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "pedidos_correcao_pagamento_estorno_id_fkey";
            columns: ["estorno_id"];
            isOneToOne: false;
            referencedRelation: "sale_payments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "pedidos_correcao_pagamento_sale_payment_id_fkey";
            columns: ["sale_payment_id"];
            isOneToOne: false;
            referencedRelation: "sale_payments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "pedidos_correcao_pagamento_solicitado_por_id_fkey";
            columns: ["solicitado_por_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      pedidos_desconto: {
        Row: {
          cliente: string | null;
          created_at: string;
          decidido_em: string | null;
          decidido_por_id: string | null;
          decisao: string | null;
          desconto_aprovado: number | null;
          desconto_pedido: number;
          documento: string;
          id: string;
          motivo: string;
          parcelas: number[];
          resposta: string | null;
          solicitado_por_id: string;
          tipo: string;
          valido_ate: string | null;
          valor_devido: number;
          valor_pago: number;
        };
        Insert: {
          cliente?: string | null;
          created_at?: string;
          decidido_em?: string | null;
          decidido_por_id?: string | null;
          decisao?: string | null;
          desconto_aprovado?: number | null;
          desconto_pedido: number;
          documento: string;
          id?: string;
          motivo: string;
          parcelas?: number[];
          resposta?: string | null;
          solicitado_por_id: string;
          tipo: string;
          valido_ate?: string | null;
          valor_devido: number;
          valor_pago: number;
        };
        Update: {
          cliente?: string | null;
          created_at?: string;
          decidido_em?: string | null;
          decidido_por_id?: string | null;
          decisao?: string | null;
          desconto_aprovado?: number | null;
          desconto_pedido?: number;
          documento?: string;
          id?: string;
          motivo?: string;
          parcelas?: number[];
          resposta?: string | null;
          solicitado_por_id?: string;
          tipo?: string;
          valido_ate?: string | null;
          valor_devido?: number;
          valor_pago?: number;
        };
        Relationships: [
          {
            foreignKeyName: "pedidos_desconto_decidido_por_id_fkey";
            columns: ["decidido_por_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "pedidos_desconto_solicitado_por_id_fkey";
            columns: ["solicitado_por_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      recebimentos_historico: {
        Row: {
          acordo_pagamento_id: string | null;
          chave_venda: number;
          cobrador_carteira_id: string | null;
          data_de_recebimento: string | null;
          desconto_antes: number | null;
          desconto_depois: number | null;
          documento: string | null;
          id: number;
          id_parcela: number;
          origem: string;
          recebido_antes: number | null;
          recebido_depois: number | null;
          registrado_em: string;
          sale_payment_id: string | null;
        };
        Insert: {
          acordo_pagamento_id?: string | null;
          chave_venda: number;
          cobrador_carteira_id?: string | null;
          data_de_recebimento?: string | null;
          desconto_antes?: number | null;
          desconto_depois?: number | null;
          documento?: string | null;
          id?: never;
          id_parcela: number;
          origem: string;
          recebido_antes?: number | null;
          recebido_depois?: number | null;
          registrado_em?: string;
          sale_payment_id?: string | null;
        };
        Update: {
          acordo_pagamento_id?: string | null;
          chave_venda?: number;
          cobrador_carteira_id?: string | null;
          data_de_recebimento?: string | null;
          desconto_antes?: number | null;
          desconto_depois?: number | null;
          documento?: string | null;
          id?: never;
          id_parcela?: number;
          origem?: string;
          recebido_antes?: number | null;
          recebido_depois?: number | null;
          registrado_em?: string;
          sale_payment_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "recebimentos_historico_acordo_pagamento_id_fkey";
            columns: ["acordo_pagamento_id"];
            isOneToOne: false;
            referencedRelation: "acordo_pagamentos";
            referencedColumns: ["id"];
          },
        ];
      };
      saldo_por_documento_tbl: {
        Row: {
          documento: string;
          saldo: number;
          updated_at: string;
        };
        Insert: {
          documento: string;
          saldo: number;
          updated_at?: string;
        };
        Update: {
          documento?: string;
          saldo?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      sale_payments: {
        Row: {
          client_document: string;
          client_name: string | null;
          collector_id: string;
          collector_name: string | null;
          created_at: string | null;
          discount_amount: number | null;
          distribution_details: Json | null;
          estorno_de: string | null;
          id: string;
          is_agreement: boolean | null;
          juros_amount: number;
          motivo: string | null;
          notes: string | null;
          payment_amount: number;
          payment_date: string;
          payment_method: string | null;
          pedido_desconto_id: string | null;
          registrado_por_id: string | null;
          sale_number: number | null;
          store_name: string | null;
          updated_at: string | null;
        };
        Insert: {
          client_document: string;
          client_name?: string | null;
          collector_id: string;
          collector_name?: string | null;
          created_at?: string | null;
          discount_amount?: number | null;
          distribution_details?: Json | null;
          estorno_de?: string | null;
          id?: string;
          is_agreement?: boolean | null;
          juros_amount?: number;
          motivo?: string | null;
          notes?: string | null;
          payment_amount: number;
          payment_date?: string;
          payment_method?: string | null;
          pedido_desconto_id?: string | null;
          registrado_por_id?: string | null;
          sale_number?: number | null;
          store_name?: string | null;
          updated_at?: string | null;
        };
        Update: {
          client_document?: string;
          client_name?: string | null;
          collector_id?: string;
          collector_name?: string | null;
          created_at?: string | null;
          discount_amount?: number | null;
          distribution_details?: Json | null;
          estorno_de?: string | null;
          id?: string;
          is_agreement?: boolean | null;
          juros_amount?: number;
          motivo?: string | null;
          notes?: string | null;
          payment_amount?: number;
          payment_date?: string;
          payment_method?: string | null;
          pedido_desconto_id?: string | null;
          registrado_por_id?: string | null;
          sale_number?: number | null;
          store_name?: string | null;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "fk_collector_id";
            columns: ["collector_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sale_payments_estorno_de_fkey";
            columns: ["estorno_de"];
            isOneToOne: false;
            referencedRelation: "sale_payments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sale_payments_pedido_desconto_id_fkey";
            columns: ["pedido_desconto_id"];
            isOneToOne: false;
            referencedRelation: "pedidos_desconto";
            referencedColumns: ["id"];
          },
        ];
      };
      scheduled_visits: {
        Row: {
          cancellation_approved_at: string | null;
          cancellation_approved_by: string | null;
          cancellation_rejected_at: string | null;
          cancellation_rejected_by: string | null;
          cancellation_rejection_reason: string | null;
          cancellation_request_date: string | null;
          cancellation_request_reason: string | null;
          channel: string;
          client_address: string | null;
          client_city: string | null;
          client_document: string;
          client_name: string;
          client_neighborhood: string | null;
          client_number: string | null;
          collector_id: string;
          created_at: string | null;
          data_visita_realizada: string | null;
          id: string;
          notes: string | null;
          overdue_count: number | null;
          reschedule_count: number | null;
          reschedule_reason: string | null;
          rescheduled_from_id: string | null;
          rescheduled_to: string | null;
          rescheduled_to_id: string | null;
          scheduled_by_manager_id: string | null;
          scheduled_date: string;
          scheduled_time: string | null;
          status: string;
          total_pending_value: number | null;
          updated_at: string | null;
        };
        Insert: {
          cancellation_approved_at?: string | null;
          cancellation_approved_by?: string | null;
          cancellation_rejected_at?: string | null;
          cancellation_rejected_by?: string | null;
          cancellation_rejection_reason?: string | null;
          cancellation_request_date?: string | null;
          cancellation_request_reason?: string | null;
          channel?: string;
          client_address?: string | null;
          client_city?: string | null;
          client_document: string;
          client_name: string;
          client_neighborhood?: string | null;
          client_number?: string | null;
          collector_id: string;
          created_at?: string | null;
          data_visita_realizada?: string | null;
          id?: string;
          notes?: string | null;
          overdue_count?: number | null;
          reschedule_count?: number | null;
          reschedule_reason?: string | null;
          rescheduled_from_id?: string | null;
          rescheduled_to?: string | null;
          rescheduled_to_id?: string | null;
          scheduled_by_manager_id?: string | null;
          scheduled_date: string;
          scheduled_time?: string | null;
          status?: string;
          total_pending_value?: number | null;
          updated_at?: string | null;
        };
        Update: {
          cancellation_approved_at?: string | null;
          cancellation_approved_by?: string | null;
          cancellation_rejected_at?: string | null;
          cancellation_rejected_by?: string | null;
          cancellation_rejection_reason?: string | null;
          cancellation_request_date?: string | null;
          cancellation_request_reason?: string | null;
          channel?: string;
          client_address?: string | null;
          client_city?: string | null;
          client_document?: string;
          client_name?: string;
          client_neighborhood?: string | null;
          client_number?: string | null;
          collector_id?: string;
          created_at?: string | null;
          data_visita_realizada?: string | null;
          id?: string;
          notes?: string | null;
          overdue_count?: number | null;
          reschedule_count?: number | null;
          reschedule_reason?: string | null;
          rescheduled_from_id?: string | null;
          rescheduled_to?: string | null;
          rescheduled_to_id?: string | null;
          scheduled_by_manager_id?: string | null;
          scheduled_date?: string;
          scheduled_time?: string | null;
          status?: string;
          total_pending_value?: number | null;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "scheduled_visits_rescheduled_from_id_fkey";
            columns: ["rescheduled_from_id"];
            isOneToOne: false;
            referencedRelation: "scheduled_visits";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "scheduled_visits_rescheduled_to_id_fkey";
            columns: ["rescheduled_to_id"];
            isOneToOne: false;
            referencedRelation: "scheduled_visits";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "scheduled_visits_scheduled_by_manager_id_fkey";
            columns: ["scheduled_by_manager_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      ssotica_acordo_parcelas: {
        Row: {
          acordo_id: string;
          atualizado_em: string;
          data_lancamento: string | null;
          data_recebimento: string | null;
          data_vencimento: string | null;
          documento: string | null;
          id_parcela: number;
          ligado_em: string;
          nome_da_loja: string | null;
          numero: number;
          recebido_espelhado: number;
          status: string | null;
          valor: number | null;
          valor_recebido: number;
        };
        Insert: {
          acordo_id: string;
          atualizado_em?: string;
          data_lancamento?: string | null;
          data_recebimento?: string | null;
          data_vencimento?: string | null;
          documento?: string | null;
          id_parcela: number;
          ligado_em?: string;
          nome_da_loja?: string | null;
          numero: number;
          recebido_espelhado?: number;
          status?: string | null;
          valor?: number | null;
          valor_recebido?: number;
        };
        Update: {
          acordo_id?: string;
          atualizado_em?: string;
          data_lancamento?: string | null;
          data_recebimento?: string | null;
          data_vencimento?: string | null;
          documento?: string | null;
          id_parcela?: number;
          ligado_em?: string;
          nome_da_loja?: string | null;
          numero?: number;
          recebido_espelhado?: number;
          status?: string | null;
          valor?: number | null;
          valor_recebido?: number;
        };
        Relationships: [
          {
            foreignKeyName: "ssotica_acordo_parcelas_acordo_id_fkey";
            columns: ["acordo_id"];
            isOneToOne: false;
            referencedRelation: "acordos";
            referencedColumns: ["id"];
          },
        ];
      };
      users: {
        Row: {
          active: boolean;
          auth_email: string | null;
          auth_user_id: string | null;
          created_at: string | null;
          id: string;
          login: string;
          name: string;
          type: string;
        };
        Insert: {
          active?: boolean;
          auth_email?: string | null;
          auth_user_id?: string | null;
          created_at?: string | null;
          id?: string;
          login: string;
          name: string;
          type: string;
        };
        Update: {
          active?: boolean;
          auth_email?: string | null;
          auth_user_id?: string | null;
          created_at?: string | null;
          id?: string;
          login?: string;
          name?: string;
          type?: string;
        };
        Relationships: [];
      };
      vendas_canceladas: {
        Row: {
          cancelado_em: string;
          chave_venda: number;
          documento: string;
          id: number;
          motivo: string;
          parcelas: number;
          usuario_id: string | null;
          valor_em_aberto: number;
          valor_original: number;
        };
        Insert: {
          cancelado_em?: string;
          chave_venda: number;
          documento: string;
          id?: never;
          motivo: string;
          parcelas: number;
          usuario_id?: string | null;
          valor_em_aberto: number;
          valor_original: number;
        };
        Update: {
          cancelado_em?: string;
          chave_venda?: number;
          documento?: string;
          id?: never;
          motivo?: string;
          parcelas?: number;
          usuario_id?: string | null;
          valor_em_aberto?: number;
          valor_original?: number;
        };
        Relationships: [];
      };
      vendas_conferencia: {
        Row: {
          chave_venda: number;
          cobrador_id: string | null;
          decidido_em: string | null;
          decidido_por: string | null;
          decisao_motivo: string | null;
          documento: string;
          id: string;
          informado_em: string;
          informado_por: string;
          observacao: string;
          parcelas: number[];
          status: string;
          valor_em_aberto: number;
        };
        Insert: {
          chave_venda: number;
          cobrador_id?: string | null;
          decidido_em?: string | null;
          decidido_por?: string | null;
          decisao_motivo?: string | null;
          documento: string;
          id?: string;
          informado_em?: string;
          informado_por: string;
          observacao: string;
          parcelas: number[];
          status?: string;
          valor_em_aberto: number;
        };
        Update: {
          chave_venda?: number;
          cobrador_id?: string | null;
          decidido_em?: string | null;
          decidido_por?: string | null;
          decisao_motivo?: string | null;
          documento?: string;
          id?: string;
          informado_em?: string;
          informado_por?: string;
          observacao?: string;
          parcelas?: number[];
          status?: string;
          valor_em_aberto?: number;
        };
        Relationships: [
          {
            foreignKeyName: "vendas_conferencia_cobrador_id_fkey";
            columns: ["cobrador_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "vendas_conferencia_decidido_por_fkey";
            columns: ["decidido_por"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "vendas_conferencia_informado_por_fkey";
            columns: ["informado_por"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      atribuicoes_pagamento_vigentes: {
        Row: {
          cliente: string | null;
          created_at: string | null;
          data_pagamento: string | null;
          decidido_em: string | null;
          decidido_por_id: string | null;
          decisao: string | null;
          documento: string | null;
          excecao: boolean | null;
          id: string | null;
          id_parcela: number | null;
          lote: string | null;
          observacao: string | null;
          parcela: number | null;
          resposta: string | null;
          solicitado_por_id: string | null;
          ultimo_contato_em: string | null;
          valor: number | null;
          valor_aprovado: number | null;
          valor_vigente: number | null;
          venda: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "atribuicoes_pagamento_decidido_por_id_fkey";
            columns: ["decidido_por_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "atribuicoes_pagamento_solicitado_por_id_fkey";
            columns: ["solicitado_por_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      banco_dados_clientes_ativos: {
        Row: {
          acrescimo: number | null;
          bairro: string | null;
          cep: string | null;
          cidade: string | null;
          cliente: string | null;
          codigo_externo: string | null;
          complemento: string | null;
          convenio: string | null;
          data_de_recebimento: string | null;
          data_lancamento: string | null;
          data_vencimento: string | null;
          desconto: number | null;
          descricao: string | null;
          dias_carencia: string | null;
          dias_em_atraso: number | null;
          documento: string | null;
          endereco: string | null;
          estado: string | null;
          id_parcela: number | null;
          juros_aplicado: number | null;
          juros_pago: number | null;
          juros_por_dia: number | null;
          multa: number | null;
          multa_aplicada: number | null;
          multa_paga: number | null;
          nome_da_loja: string | null;
          numero: string | null;
          numero_titulo: number | null;
          obs: string | null;
          parcela: number | null;
          situacao: string | null;
          status: string | null;
          tipo_de_cobranca: string | null;
          user_id: string | null;
          valor_original: number | null;
          valor_reajustado: number | null;
          valor_recebido: number | null;
          venda_n: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "fk_banco_dados_documento";
            columns: ["documento"];
            isOneToOne: false;
            referencedRelation: "clientes";
            referencedColumns: ["documento"];
          },
          {
            foreignKeyName: "fk_banco_dados_user";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      banco_dados_clientes_quitados: {
        Row: {
          acrescimo: number | null;
          bairro: string | null;
          cep: string | null;
          cidade: string | null;
          cliente: string | null;
          codigo_externo: string | null;
          complemento: string | null;
          convenio: string | null;
          data_de_recebimento: string | null;
          data_lancamento: string | null;
          data_vencimento: string | null;
          desconto: number | null;
          descricao: string | null;
          dias_carencia: string | null;
          dias_em_atraso: number | null;
          documento: string | null;
          endereco: string | null;
          estado: string | null;
          id_parcela: number | null;
          juros_aplicado: number | null;
          juros_pago: number | null;
          juros_por_dia: number | null;
          multa: number | null;
          multa_aplicada: number | null;
          multa_paga: number | null;
          nome_da_loja: string | null;
          numero: string | null;
          numero_titulo: number | null;
          obs: string | null;
          parcela: number | null;
          situacao: string | null;
          status: string | null;
          tipo_de_cobranca: string | null;
          user_id: string | null;
          valor_original: number | null;
          valor_reajustado: number | null;
          valor_recebido: number | null;
          venda_n: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "fk_banco_dados_documento";
            columns: ["documento"];
            isOneToOne: false;
            referencedRelation: "clientes";
            referencedColumns: ["documento"];
          },
          {
            foreignKeyName: "fk_banco_dados_user";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      daily_payment_report: {
        Row: {
          average_payment: number | null;
          collector_id: string | null;
          collector_name: string | null;
          max_payment: number | null;
          min_payment: number | null;
          payment_date: string | null;
          total_payments: number | null;
          total_received: number | null;
          unique_clients: number | null;
          unique_sales: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "fk_collector_id";
            columns: ["collector_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      saldo_por_documento: {
        Row: {
          documento: string | null;
          saldo: number | null;
        };
        Insert: {
          documento?: string | null;
          saldo?: number | null;
        };
        Update: {
          documento?: string | null;
          saldo?: number | null;
        };
        Relationships: [];
      };
    };
    Functions: {
      _aplicar_distribuicao_carteira: {
        Args: {
          p_motivo: string;
          p_perfis: Json;
          p_retirar_de: string[];
          p_usuario: string;
        };
        Returns: Json;
      };
      _saldo_para_desconto: {
        Args: { p_documento: string; p_parcelas: number[] };
        Returns: number;
      };
      abrir_lote_fila: {
        Args: { p_itens: Json; p_tamanho_previsto: number; p_turno: string };
        Returns: string;
      };
      acordo_lancamento_ciclone: {
        Args: { p_acordo_id: string };
        Returns: Json;
      };
      acordo_lancamento_ssotica: {
        Args: { p_acordo_id: string };
        Returns: Json;
      };
      aplicar_distribuicao_carteira: {
        Args: { p_perfis: Json; p_retirar_de?: string[] };
        Returns: Json;
      };
      app_current_user_id: { Args: never; Returns: string };
      app_current_user_type: { Args: never; Returns: string };
      atendimentos_periodo: {
        Args: { p_inicio: string; p_fim: string; p_collector?: string | null };
        Returns: {
          collector_id: string;
          clientes: number;
          conversaram: number;
          promessas: number;
          tentativas: number;
        }[];
      };
      atribuicao_bloqueio_parcela: {
        Args: { p_id_parcela: number };
        Returns: string;
      };
      atribuicao_contato_conta: {
        Args: { p_result: string };
        Returns: boolean;
      };
      atribuicoes_painel_gestor: {
        Args: never;
        Returns: {
          cliente: string;
          cobrador_id: string;
          contatos: number;
          data_pagamento: string;
          documento: string;
          id_parcela: number;
          loja: string;
          parcela: number;
          pedido_cobrador_id: string;
          pedido_decisao: string;
          pedido_lote: string;
          ultimo_contato_em: string;
          ultimo_resultado: string;
          valor: number;
          venda: number;
        }[];
      };
      atribuir_clientes_em_lote: {
        Args: {
          p_clientes?: string[];
          p_documentos?: string[];
          p_gerente_id?: string;
          p_manter_situacoes?: string[];
          p_situacao?: string;
          p_user_id: string;
        };
        Returns: number;
      };
      atribuir_cobrador: {
        Args: { p_documento: string; p_user_id: string };
        Returns: undefined;
      };
      atribuir_cobrador_parcela: {
        Args: { p_id_parcela: number; p_user_id: string };
        Returns: undefined;
      };
      atribuir_multiplos_clientes: {
        Args: { p_documentos: string[]; p_user_id: string };
        Returns: {
          documentos_atualizados: number;
        }[];
      };
      atribuir_pagamento_excecao: {
        Args: {
          p_cobrador_id: string;
          p_documento: string;
          p_motivo: string;
          p_parcelas: number[];
        };
        Returns: Json;
      };
      cancelar_acordo: {
        Args: {
          p_acordo_id: string;
          p_destino_pagamentos?: string;
          p_motivo: string;
        };
        Returns: {
          acordo_origem_id: string | null;
          client_document: string;
          client_name: string | null;
          collector_id: string;
          created_at: string;
          created_by_id: string | null;
          desconto_percentual_aplicado: number;
          destino_pagamentos: string | null;
          encargos_reimputados: number | null;
          forma_pagamento_parcelas: string | null;
          id: string;
          juros_percentual_am_aplicado: number;
          motivo_cancelamento: string | null;
          multa_percentual_aplicado: number;
          numero_parcelas: number;
          resolved_at: string | null;
          status: string;
          testemunha1_cpf: string | null;
          testemunha1_nome: string | null;
          testemunha2_cpf: string | null;
          testemunha2_nome: string | null;
          valor_negociado: number;
        };
        SetofOptions: {
          from: "*";
          to: "acordos";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      cancelar_clientes: {
        Args: {
          p_documentos: string[];
          p_motivo: string;
          p_usuario_id: string;
        };
        Returns: Json;
      };
      cancelar_parcelas_ssotica: { Args: { p_itens: Json }; Returns: Json };
      cancelar_vendas: {
        Args: {
          p_chaves?: number[];
          p_documento: string;
          p_motivo: string;
          p_usuario_id: string;
        };
        Returns: number;
      };
      cancelar_visitas_de_clientes_quitados: {
        Args: { p_documentos: string[] };
        Returns: number;
      };
      carteira_movimentacao_periodo: {
        Args: { p_fim: string; p_inicio: string };
        Returns: {
          cobrador_id: string;
          entraram: number;
          sairam: number;
          saidas_sem_acao: number;
        }[];
      };
      carteira_por_cobrador: {
        Args: never;
        Returns: {
          clientes_em_aberto: number;
          collector_id: string;
        }[];
      };
      cliente_loja_referencia: {
        Args: { p_documento: string };
        Returns: string;
      };
      cliente_max_atraso_dias: {
        Args: { p_documento: string };
        Returns: number;
      };
      cliente_tem_acordo_ativo: {
        Args: { p_documento: string };
        Returns: boolean;
      };
      cliente_tem_saldo_aberto: {
        Args: { p_documento: string };
        Returns: boolean;
      };
      cliente_tem_visita_agendada_ativa: {
        Args: { p_documento: string };
        Returns: boolean;
      };
      clientes_fora_da_faixa: {
        Args: never;
        Returns: {
          atraso_atual: number;
          bloqueado_por: string;
          cliente: string;
          collector_id: string;
          collector_name: string;
          dias_excedidos: number;
          documento: string;
          faixa_max: number;
          faixa_min: number;
        }[];
      };
      cobrador_na_data_em_lote: {
        Args: { p_pares: Json };
        Returns: {
          cobrador_id: string;
          data: string;
          documento: string;
        }[];
      };
      cobrador_teve_acao_recente: {
        Args: { p_cobrador: string; p_documento: string };
        Returns: boolean;
      };
      conferencia_conversas: {
        Args: { p_fim: string; p_inicio: string };
        Returns: {
          cobrador_id: string;
          contatos: number;
          data_pagamento: string;
          documento: string;
          id_parcela: number;
          pedido_cobrador_id: string;
          pedido_decisao: string;
          pedido_lote: string;
          pode_pedir: boolean;
          ultimo_contato_em: string;
          ultimo_resultado: string;
          valor: number;
          valor_aprovado: number;
        }[];
      };
      conferencia_recebimentos: {
        Args: { p_fim: string; p_inicio: string; p_so_carteira?: boolean };
        Returns: {
          app_cedrus: number;
          app_janela: number;
          app_lancamentos: number;
          app_valor: number;
          base_janela: number;
          base_parcelas: number;
          base_valor: number;
          carteira_id: string;
          cliente: string;
          cobrador_id: string;
          documento: string;
          na_carteira: boolean;
        }[];
      };
      converter_valor_brasileiro: { Args: { valor: string }; Returns: number };
      criar_acordo:
        | {
            Args: {
              p_client_document: string;
              p_parcelas: Json;
              p_titulos: Json;
            };
            Returns: {
              acordo_origem_id: string | null;
              client_document: string;
              client_name: string | null;
              collector_id: string;
              created_at: string;
              created_by_id: string | null;
              desconto_percentual_aplicado: number;
              destino_pagamentos: string | null;
              encargos_reimputados: number | null;
              forma_pagamento_parcelas: string | null;
              id: string;
              juros_percentual_am_aplicado: number;
              motivo_cancelamento: string | null;
              multa_percentual_aplicado: number;
              numero_parcelas: number;
              resolved_at: string | null;
              status: string;
              testemunha1_cpf: string | null;
              testemunha1_nome: string | null;
              testemunha2_cpf: string | null;
              testemunha2_nome: string | null;
              valor_negociado: number;
            };
            SetofOptions: {
              from: "*";
              to: "acordos";
              isOneToOne: true;
              isSetofReturn: false;
            };
          }
        | {
            Args: {
              p_client_document: string;
              p_desconto_percentual_aplicado?: number;
              p_em_nome_de?: string;
              p_forma_pagamento_parcelas?: string;
              p_juros_percentual_am_aplicado?: number;
              p_multa_percentual_aplicado?: number;
              p_parcelas: Json;
              p_testemunha1_cpf?: string;
              p_testemunha1_nome?: string;
              p_testemunha2_cpf?: string;
              p_testemunha2_nome?: string;
              p_titulos: Json;
            };
            Returns: {
              acordo_origem_id: string | null;
              client_document: string;
              client_name: string | null;
              collector_id: string;
              created_at: string;
              created_by_id: string | null;
              desconto_percentual_aplicado: number;
              destino_pagamentos: string | null;
              encargos_reimputados: number | null;
              forma_pagamento_parcelas: string | null;
              id: string;
              juros_percentual_am_aplicado: number;
              motivo_cancelamento: string | null;
              multa_percentual_aplicado: number;
              numero_parcelas: number;
              resolved_at: string | null;
              status: string;
              testemunha1_cpf: string | null;
              testemunha1_nome: string | null;
              testemunha2_cpf: string | null;
              testemunha2_nome: string | null;
              valor_negociado: number;
            };
            SetofOptions: {
              from: "*";
              to: "acordos";
              isOneToOne: true;
              isSetofReturn: false;
            };
          };
      criar_usuario_com_login: {
        Args: {
          p_login: string;
          p_name: string;
          p_senha: string;
          p_type: string;
        };
        Returns: string;
      };
      decidir_caso_gestor: {
        Args: { p_caso_id: string; p_decisao: string; p_observacao?: string };
        Returns: Json;
      };
      decidir_atribuicao_pagamento: {
        Args: { p_aprovar: boolean; p_lote: string; p_resposta?: string };
        Returns: Json;
      };
      decidir_pedido_correcao: {
        Args: {
          p_aprovar: boolean;
          p_pedido: string;
          p_resposta?: string;
          p_valor?: number;
        };
        Returns: Json;
      };
      decidir_pedido_desconto: {
        Args: {
          p_aprovar: boolean;
          p_desconto_aprovado?: number;
          p_id: string;
          p_resposta?: string;
        };
        Returns: Json;
      };
      decidir_venda_cancelada: {
        Args: { p_conferencia_id: string; p_decisao: string; p_motivo: string };
        Returns: {
          chave_venda: number;
          cobrador_id: string | null;
          decidido_em: string | null;
          decidido_por: string | null;
          decisao_motivo: string | null;
          documento: string;
          id: string;
          informado_em: string;
          informado_por: string;
          observacao: string;
          parcelas: number[];
          status: string;
          valor_em_aberto: number;
        };
        SetofOptions: {
          from: "*";
          to: "vendas_conferencia";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      definir_configuracao_padrao_acordo: {
        Args: {
          p_desconto_maximo_percentual: number;
          p_desconto_padrao_percentual: number;
          p_dias_entre_parcelas: number;
          p_empresa_chave_pix: string;
          p_empresa_cnpj: string;
          p_empresa_endereco: string;
          p_empresa_nome: string;
          p_juros_percentual_am: number;
          p_multa_percentual: number;
        };
        Returns: {
          created_at: string;
          created_by: string | null;
          desconto_maximo_percentual: number;
          desconto_padrao_percentual: number;
          dias_entre_parcelas: number;
          empresa_chave_pix: string | null;
          empresa_cnpj: string | null;
          empresa_endereco: string | null;
          empresa_nome: string | null;
          id: string;
          juros_percentual_am: number;
          multa_percentual: number;
          vigente_ate: string | null;
          vigente_desde: string;
        };
        SetofOptions: {
          from: "*";
          to: "acordo_configuracao_padrao";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      definir_fila_cobranca: {
        Args: { p_collector_id: string; p_pesos: Json };
        Returns: undefined;
      };
      definir_metas_mes: {
        Args: {
          p_faixas: Json;
          p_forma: string;
          p_month: string;
          p_user_id: string;
          p_visits_goal: number;
        };
        Returns: undefined;
      };
      definir_regra_carteira_ativa: {
        Args: { p_ativa: boolean; p_regra_id: string };
        Returns: {
          ativa: boolean;
          collector_id: string;
          created_at: string;
          created_by: string | null;
          fila_ordem: string;
          fila_peso: number | null;
          fila_peso_tarde: number | null;
          fila_saldo_max: number | null;
          fila_saldo_min: number | null;
          id: string;
          lojas: string[] | null;
          max_dias: number | null;
          min_dias: number;
          vigente_ate: string | null;
          vigente_desde: string;
        };
        SetofOptions: {
          from: "*";
          to: "collector_overdue_ranges";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      desvincular_cobrador: {
        Args: { p_collector_id: string };
        Returns: undefined;
      };
      divergencias_cancelamento: {
        Args: never;
        Returns: {
          venda_cancelada_id: number;
          documento: string;
          cliente: string | null;
          chave_venda: number;
          parcelas: number;
          valor_em_aberto: number;
          motivo: string;
          cancelado_em: string;
          cancelado_por: string | null;
          erp: string | null;
          status_erp: string | null;
          em_aberto_desde: string | null;
          conferido_em: string | null;
          confirmado_em: string | null;
          reaberta_em: string | null;
          reaberta_por: string | null;
          reaberta_motivo: string | null;
          pode_reabrir: boolean;
        }[];
      };
      distribuicao_carteira_previa: {
        Args: { p_perfis: Json; p_retirar_de?: string[] };
        Returns: Json;
      };
      encerrar_regra_carteira: {
        Args: { p_regra_id: string };
        Returns: undefined;
      };
      estornar_pagamento: {
        Args: { p_motivo: string; p_pagamento: string; p_valor: number };
        Returns: Json;
      };
      estornar_pagamentos_acordo_cancelado: {
        Args: { p_acordo_id: string; p_motivo: string };
        Returns: number;
      };
      estornar_valor_no_titulo: {
        Args: { p_id_parcela: number; p_valor: number };
        Returns: undefined;
      };
      executar_distribuicao_automatica: { Args: never; Returns: Json };
      faixa_cobre_cliente: {
        Args: {
          p_atraso: number;
          p_loja: string;
          p_lojas: string[];
          p_max_dias: number;
          p_min_dias: number;
        };
        Returns: boolean;
      };
      fila_espera_cobrador: {
        Args: { p_collector?: string | null };
        Returns: {
          documento: string;
          tentativas: number;
          ultima_tentativa: string;
          volta_em: string | null;
          em_limbo: boolean;
        }[];
      };
      fila_item_finalizado: {
        Args: { p_collector: string; p_desde: string; p_documento: string };
        Returns: boolean;
      };
      fila_lote_atual: {
        Args: never;
        Returns: {
          criado_em: string;
          documento: string;
          finalizado: boolean;
          lote_id: string;
          posicao: number;
          regra_id: string;
          tamanho_previsto: number;
          turno: string;
          urgencia: string;
        }[];
      };
      importar_parcelas_ssotica: { Args: { p_linhas: Json }; Returns: Json };
      informar_venda_cancelada: {
        Args: {
          p_chaves: number[];
          p_documento: string;
          p_em_nome_de?: string;
          p_observacao: string;
          p_tipo_contato?: string;
        };
        Returns: number;
      };
      liberar_cliente_da_carteira: {
        Args: {
          p_documento: string;
          p_situacao: string;
          p_usuario_id?: string;
        };
        Returns: number;
      };
      lojas_carteira: {
        Args: never;
        Returns: {
          clientes_em_aberto: number;
          loja: string;
        }[];
      };
      lojas_ultima_baixa_externa: {
        Args: never;
        Returns: {
          loja: string;
          ultima_baixa: string;
        }[];
      };
      marcar_paga_em_cheque: {
        Args: { p_documento: string; p_marcar: boolean; p_motivo: string };
        Returns: Json;
      };
      marcar_acordos_quebrados: { Args: never; Returns: number };
      pagos_na_loja_pediveis: {
        Args: never;
        Returns: {
          cliente: string;
          descricao: string;
          documento: string;
          em_analise: boolean;
          id_parcela: number;
          loja: string;
          na_carteira: boolean;
          parcela: number;
          prazo: string;
          ultimo_contato_em: string;
          ultimo_resultado: string;
          valor: number;
          venda: number;
          data_pagamento: string;
        }[];
      };
      condicao_cheque_cliente: {
        Args: { p_documento: string };
        Returns: Json;
      };
      painel_cheques: {
        Args: { p_dias_conferir?: number; p_meses_sugestao?: number };
        Returns: {
          a_vencer: number;
          cheque_venc_mais_antigo: string | null;
          cheques_qtd: number;
          cheques_valor: number;
          cliente: string;
          cobrador_atual: string | null;
          codigo_cliente_erp: string | null;
          dias_cheque_vencido: number | null;
          documento: string;
          grupo: string;
          loja: string | null;
          marcado_em: string | null;
          marcado_por: string | null;
          motivo: string | null;
          paga_em_cheque: boolean;
          saiu_de: string | null;
          saiu_em: string | null;
          ultima_baixa_cheque: string | null;
          vencido: number;
        }[];
      };
      parcelas_para_atribuicao: {
        Args: { p_documento: string };
        Returns: {
          bloqueio: string;
          data_pagamento: string;
          data_vencimento: string;
          descricao: string;
          id_parcela: number;
          loja: string;
          parcela: number;
          pedido_decisao: string;
          pedido_meu: boolean;
          ultimo_contato_em: string;
          valor: number;
          venda: number;
        }[];
      };
      parcelas_para_excecao: {
        Args: { p_cobrador_id: string; p_documento: string };
        Returns: {
          bloqueio: string;
          data_pagamento: string;
          data_vencimento: string;
          descricao: string;
          id_parcela: number;
          loja: string;
          parcela: number;
          pedido_decisao: string;
          pedido_meu: boolean;
          ultimo_contato_em: string;
          valor: number;
          venda: number;
        }[];
      };
      pedidos_desconto_do_cliente: {
        Args: { p_documento: string };
        Returns: {
          created_at: string;
          decidido_em: string;
          decidido_por_id: string;
          decisao: string;
          desconto_aprovado: number;
          desconto_pedido: number;
          desconto_usado: number;
          id: string;
          motivo: string;
          parcelas: number[];
          resposta: string;
          solicitado_por_id: string;
          tipo: string;
          valido_ate: string;
          valor_devido: number;
          valor_pago: number;
        }[];
      };
      pedir_atribuicao_pagamento: {
        Args: {
          p_documento: string;
          p_observacao: string;
          p_parcelas: number[];
        };
        Returns: string;
      };
      pedir_autorizacao_remarcacao: {
        Args: {
          p_motivo_chave?: string;
          p_notas_nova?: string;
          p_notas_original?: string;
          p_nova_data: string;
          p_novo_horario?: string;
          p_observacao?: string;
          p_visit_id: string;
        };
        Returns: string;
      };
      pedir_desconto: {
        Args: {
          p_documento: string;
          p_motivo: string;
          p_parcelas: number[];
          p_tipo: string;
          p_valor_pago: number;
        };
        Returns: string;
      };
      plano_distribuicao_carteira: {
        Args: { p_perfis: Json; p_retirar_de?: string[] };
        Returns: {
          acao: string;
          atraso: number;
          bloqueado_por: string;
          cliente: string;
          cobrador_atual: string;
          cobrador_destino: string;
          documento: string;
          loja: string;
          situacao: string;
        }[];
      };
      process_payment: {
        Args: {
          p_client_document: string;
          p_collector_id: string;
          p_discount_amount?: number;
          p_juros_amount?: number;
          p_notes?: string;
          p_parcelas?: number[];
          p_payment_amount: number;
          p_payment_date?: string;
          p_payment_method?: string;
          p_sale_number?: number;
        };
        Returns: undefined;
      };
      reabrir_venda_cancelada: {
        Args: { p_venda_cancelada_id: number; p_motivo: string };
        Returns: number;
      };
      reagendar_visita: {
        Args: {
          p_motivo_chave?: string;
          p_notas_nova?: string;
          p_notas_original?: string;
          p_nova_data: string;
          p_novo_horario?: string;
          p_visit_id: string;
        };
        Returns: {
          cancellation_approved_at: string | null;
          cancellation_approved_by: string | null;
          cancellation_rejected_at: string | null;
          cancellation_rejected_by: string | null;
          cancellation_rejection_reason: string | null;
          cancellation_request_date: string | null;
          cancellation_request_reason: string | null;
          channel: string;
          client_address: string | null;
          client_city: string | null;
          client_document: string;
          client_name: string;
          client_neighborhood: string | null;
          client_number: string | null;
          collector_id: string;
          created_at: string | null;
          data_visita_realizada: string | null;
          id: string;
          notes: string | null;
          overdue_count: number | null;
          reschedule_count: number | null;
          reschedule_reason: string | null;
          rescheduled_from_id: string | null;
          rescheduled_to: string | null;
          rescheduled_to_id: string | null;
          scheduled_by_manager_id: string | null;
          scheduled_date: string;
          scheduled_time: string | null;
          status: string;
          total_pending_value: number | null;
          updated_at: string | null;
        }[];
        SetofOptions: {
          from: "*";
          to: "scheduled_visits";
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      redefinir_senha_usuario: {
        Args: { p_senha: string; p_user_id: string };
        Returns: undefined;
      };
      registrar_ajuste_recebimento: {
        Args: {
          p_client_document: string;
          p_client_name: string;
          p_diferenca: number;
          p_motivo: string;
          p_pagamento_estornado?: string;
          p_sale_number: number;
          p_usuario_id: string;
        };
        Returns: undefined;
      };
      registrar_contato: {
        Args: {
          p_data: string;
          p_data_promessa?: string;
          p_documento: string;
          p_em_nome_de?: string;
          p_motivo_reagendamento?: string;
          p_nome_cliente: string;
          p_notas: string;
          p_notas_proximo?: string;
          p_notas_reagendamento_nova?: string;
          p_notas_reagendamento_original?: string;
          p_proxima_acao?: string;
          p_proxima_data?: string;
          p_proximo_canal?: string;
          p_proximo_horario?: string;
          p_reagendar?: boolean;
          p_resultado: string;
          p_rotulo_resultado?: string;
          p_situacao_liberacao?: string;
          p_tipo: string;
          p_titulos: string[];
          p_visita_id?: string;
        };
        Returns: Json;
      };
      registrar_pagamento_acordo: {
        Args: {
          p_acordo_parcela_id: string;
          p_data_pagamento: string;
          p_notes?: string;
          p_valor_pago: number;
        };
        Returns: {
          acordo_parcela_id: string;
          collector_id: string | null;
          created_at: string;
          data_pagamento: string;
          estorno_de: string | null;
          id: string;
          motivo: string | null;
          notes: string | null;
          registrado_por_id: string | null;
          valor_encargos: number | null;
          valor_pago: number;
          valor_principal: number | null;
        };
        SetofOptions: {
          from: "*";
          to: "acordo_pagamentos";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      registrar_pagamento_acordo_interno: {
        Args: {
          p_acordo_parcela_id: string;
          p_collector_id: string;
          p_data_pagamento: string;
          p_notes: string;
          p_registrado_por_id: string;
          p_valor_pago: number;
        };
        Returns: {
          acordo_parcela_id: string;
          collector_id: string | null;
          created_at: string;
          data_pagamento: string;
          estorno_de: string | null;
          id: string;
          motivo: string | null;
          notes: string | null;
          registrado_por_id: string | null;
          valor_encargos: number | null;
          valor_pago: number;
          valor_principal: number | null;
        };
        SetofOptions: {
          from: "*";
          to: "acordo_pagamentos";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      regra_carteira_conflito: {
        Args: {
          p_ignorar_id: string;
          p_lojas: string[];
          p_max_dias: number;
          p_min_dias: number;
        };
        Returns: string;
      };
      reimputar_encargos_acordo_cancelado: {
        Args: { p_acordo_id: string };
        Returns: number;
      };
      remover_cobrador: { Args: { p_documento: string }; Returns: undefined };
      remover_cobrador_em_lote: {
        Args: {
          p_clientes?: string[];
          p_documentos?: string[];
          p_usuario_id?: string;
        };
        Returns: number;
      };
      resolve_auth_email: { Args: { p_login: string }; Returns: string };
      saldo_acordo_parcela: { Args: { p_parcela_id: string }; Returns: number };
      reportar_tentativas_gestor: {
        Args: { p_documento: string; p_observacao?: string };
        Returns: string;
      };
      salvar_regra_carteira: {
        Args: {
          p_ativa?: boolean;
          p_collector_id: string;
          p_lojas?: string[];
          p_max_dias: number;
          p_min_dias: number;
          p_regra_id: string;
        };
        Returns: {
          ativa: boolean;
          collector_id: string;
          created_at: string;
          created_by: string | null;
          fila_ordem: string;
          fila_peso: number | null;
          fila_peso_tarde: number | null;
          fila_saldo_max: number | null;
          fila_saldo_min: number | null;
          id: string;
          lojas: string[] | null;
          max_dias: number | null;
          min_dias: number;
          vigente_ate: string | null;
          vigente_desde: string;
        };
        SetofOptions: {
          from: "*";
          to: "collector_overdue_ranges";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      situacao_primaria_do_tipo: { Args: { p_type: string }; Returns: string };
      texto_para_valor: { Args: { p: string }; Returns: number };
      tentativas_sem_retorno: {
        Args: { p_documento: string };
        Returns: number;
      };
      titulo_em_acordo_ativo: {
        Args: { p_id_parcela: number };
        Returns: boolean;
      };
      transferir_clientes: {
        Args: { p_cobrador_destino: string; p_cobrador_origem: string };
        Returns: {
          clientes_transferidos: number;
        }[];
      };
      ultimos_contatos_titulos: {
        Args: { p_desde: string; p_efetivos: string[]; p_ids: string[] };
        Returns: {
          collection_id: string;
          date: string;
          next_action_date: string;
          notes: string;
          papel: string;
          result: string;
        }[];
      };
      update_client_address:
        | {
            Args: {
              p_bairro: string;
              p_cep: string;
              p_cidade: string;
              p_cliente_documento: string;
              p_estado: string;
              p_logradouro: string;
              p_numero: string;
            };
            Returns: undefined;
          }
        | {
            Args: {
              p_bairro: string;
              p_cep: string;
              p_cidade: string;
              p_cliente_documento: string;
              p_complemento?: string;
              p_estado: string;
              p_logradouro: string;
              p_numero: string;
            };
            Returns: undefined;
          };
      vincular_cobrador_a_gerente: {
        Args: { p_collector_id: string; p_manager_id: string };
        Returns: {
          collector_id: string;
          created_at: string;
          created_by: string | null;
          id: string;
          manager_id: string;
          vigente_ate: string | null;
          vigente_desde: string;
        };
        SetofOptions: {
          from: "*";
          to: "manager_collector_links";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<
  keyof Database,
  "public"
>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const;
