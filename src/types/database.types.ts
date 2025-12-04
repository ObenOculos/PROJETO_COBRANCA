export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "12.2.3 (519615d)"
  }
  public: {
    Tables: {
      allowed_visit_dates: {
        Row: {
          allowed_date: number | null
          city: string
          collector_id: string | null
          created_at: string | null
          id: string
          updated_at: string | null
        }
        Insert: {
          allowed_date?: number | null
          city: string
          collector_id?: string | null
          created_at?: string | null
          id?: string
          updated_at?: string | null
        }
        Update: {
          allowed_date?: number | null
          city?: string
          collector_id?: string | null
          created_at?: string | null
          id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_allowed_visit_dates_collector_id"
            columns: ["collector_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      apelidos_temporario: {
        Row: {
          apelido: string | null
          cpf: string | null
        }
        Insert: {
          apelido?: string | null
          cpf?: string | null
        }
        Update: {
          apelido?: string | null
          cpf?: string | null
        }
        Relationships: []
      }
      authorization_history: {
        Row: {
          client_address: string | null
          client_city: string | null
          client_document: string
          client_mobile: string | null
          client_name: string
          client_neighborhood: string | null
          client_phone: string | null
          collector_id: string | null
          collector_name: string
          collector_performance_score: number | null
          created_at: string | null
          expires_at: string
          id: string
          last_payment_amount: number | null
          last_payment_date: string | null
          metadata: Json | null
          notes: string | null
          overdue_installments_count: number | null
          processed_at: string | null
          processed_by_id: string | null
          processed_by_name: string | null
          requested_at: string
          status: string
          token: string
          total_pending_value: number | null
          total_received_value: number | null
          total_sales_count: number | null
          total_sales_value: number | null
          type: string
          updated_at: string | null
        }
        Insert: {
          client_address?: string | null
          client_city?: string | null
          client_document: string
          client_mobile?: string | null
          client_name: string
          client_neighborhood?: string | null
          client_phone?: string | null
          collector_id?: string | null
          collector_name: string
          collector_performance_score?: number | null
          created_at?: string | null
          expires_at: string
          id?: string
          last_payment_amount?: number | null
          last_payment_date?: string | null
          metadata?: Json | null
          notes?: string | null
          overdue_installments_count?: number | null
          processed_at?: string | null
          processed_by_id?: string | null
          processed_by_name?: string | null
          requested_at: string
          status: string
          token: string
          total_pending_value?: number | null
          total_received_value?: number | null
          total_sales_count?: number | null
          total_sales_value?: number | null
          type?: string
          updated_at?: string | null
        }
        Update: {
          client_address?: string | null
          client_city?: string | null
          client_document?: string
          client_mobile?: string | null
          client_name?: string
          client_neighborhood?: string | null
          client_phone?: string | null
          collector_id?: string | null
          collector_name?: string
          collector_performance_score?: number | null
          created_at?: string | null
          expires_at?: string
          id?: string
          last_payment_amount?: number | null
          last_payment_date?: string | null
          metadata?: Json | null
          notes?: string | null
          overdue_installments_count?: number | null
          processed_at?: string | null
          processed_by_id?: string | null
          processed_by_name?: string | null
          requested_at?: string
          status?: string
          token?: string
          total_pending_value?: number | null
          total_received_value?: number | null
          total_sales_count?: number | null
          total_sales_value?: number | null
          type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "authorization_history_collector_id_fkey"
            columns: ["collector_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "authorization_history_processed_by_id_fkey"
            columns: ["processed_by_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      BANCO_DADOS: {
        Row: {
          acrescimo: string | null
          apelido: string | null
          bairro: string | null
          celular: string | null
          celular1: string | null
          celular2: string | null
          cep: string | null
          cidade: string | null
          cliente: string | null
          codigo_externo: string | null
          complemento: string | null
          convenio: string | null
          data_de_recebimento: string | null
          data_lancamento: string | null
          data_vencimento: string | null
          desconto: string | null
          descricao: string | null
          dias_carencia: string | null
          dias_em_atraso: number | null
          documento: string | null
          email: string | null
          endereco: string | null
          estado: string | null
          id_parcela: number
          juros_aplicado: string | null
          juros_pago: string | null
          juros_por_dia: string | null
          multa: string | null
          multa_aplicada: string | null
          multa_paga: string | null
          nome_da_loja: string | null
          numero: string | null
          numero_titulo: number | null
          obs: string | null
          parcela: number | null
          situacao: string | null
          status: string | null
          telefone: string | null
          tipo_de_cobranca: string | null
          user_id: string | null
          valor_original: string | null
          valor_reajustado: string | null
          valor_recebido: string | null
          venda_n: number | null
        }
        Insert: {
          acrescimo?: string | null
          apelido?: string | null
          bairro?: string | null
          celular?: string | null
          celular1?: string | null
          celular2?: string | null
          cep?: string | null
          cidade?: string | null
          cliente?: string | null
          codigo_externo?: string | null
          complemento?: string | null
          convenio?: string | null
          data_de_recebimento?: string | null
          data_lancamento?: string | null
          data_vencimento?: string | null
          desconto?: string | null
          descricao?: string | null
          dias_carencia?: string | null
          dias_em_atraso?: number | null
          documento?: string | null
          email?: string | null
          endereco?: string | null
          estado?: string | null
          id_parcela: number
          juros_aplicado?: string | null
          juros_pago?: string | null
          juros_por_dia?: string | null
          multa?: string | null
          multa_aplicada?: string | null
          multa_paga?: string | null
          nome_da_loja?: string | null
          numero?: string | null
          numero_titulo?: number | null
          obs?: string | null
          parcela?: number | null
          situacao?: string | null
          status?: string | null
          telefone?: string | null
          tipo_de_cobranca?: string | null
          user_id?: string | null
          valor_original?: string | null
          valor_reajustado?: string | null
          valor_recebido?: string | null
          venda_n?: number | null
        }
        Update: {
          acrescimo?: string | null
          apelido?: string | null
          bairro?: string | null
          celular?: string | null
          celular1?: string | null
          celular2?: string | null
          cep?: string | null
          cidade?: string | null
          cliente?: string | null
          codigo_externo?: string | null
          complemento?: string | null
          convenio?: string | null
          data_de_recebimento?: string | null
          data_lancamento?: string | null
          data_vencimento?: string | null
          desconto?: string | null
          descricao?: string | null
          dias_carencia?: string | null
          dias_em_atraso?: number | null
          documento?: string | null
          email?: string | null
          endereco?: string | null
          estado?: string | null
          id_parcela?: number
          juros_aplicado?: string | null
          juros_pago?: string | null
          juros_por_dia?: string | null
          multa?: string | null
          multa_aplicada?: string | null
          multa_paga?: string | null
          nome_da_loja?: string | null
          numero?: string | null
          numero_titulo?: number | null
          obs?: string | null
          parcela?: number | null
          situacao?: string | null
          status?: string | null
          telefone?: string | null
          tipo_de_cobranca?: string | null
          user_id?: string | null
          valor_original?: string | null
          valor_reajustado?: string | null
          valor_recebido?: string | null
          venda_n?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_banco_dados_user"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      enderecos_historico: {
        Row: {
          bairro: string | null
          cep: string | null
          cidade: string | null
          cliente_documento: string
          created_at: string
          estado: string | null
          id: string
          is_atual: boolean
          logradouro: string | null
          numero: string | null
        }
        Insert: {
          bairro?: string | null
          cep?: string | null
          cidade?: string | null
          cliente_documento: string
          created_at?: string
          estado?: string | null
          id?: string
          is_atual?: boolean
          logradouro?: string | null
          numero?: string | null
        }
        Update: {
          bairro?: string | null
          cep?: string | null
          cidade?: string | null
          cliente_documento?: string
          created_at?: string
          estado?: string | null
          id?: string
          is_atual?: boolean
          logradouro?: string | null
          numero?: string | null
        }
        Relationships: []
      }
      monthly_goals: {
        Row: {
          created_at: string
          id: string
          month: string
          payments_goal: number
          updated_at: string
          user_id: string
          visits_goal: number
        }
        Insert: {
          created_at?: string
          id?: string
          month: string
          payments_goal: number
          updated_at?: string
          user_id: string
          visits_goal: number
        }
        Update: {
          created_at?: string
          id?: string
          month?: string
          payments_goal?: number
          updated_at?: string
          user_id?: string
          visits_goal?: number
        }
        Relationships: [
          {
            foreignKeyName: "monthly_goals_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      sale_payments: {
        Row: {
          client_document: string
          client_name: string | null
          collector_id: string
          collector_name: string | null
          created_at: string | null
          discount_amount: number | null
          distribution_details: Json | null
          id: string
          is_agreement: boolean | null
          notes: string | null
          payment_amount: number
          payment_date: string
          payment_method: string | null
          sale_number: number | null
          store_name: string | null
          updated_at: string | null
        }
        Insert: {
          client_document: string
          client_name?: string | null
          collector_id: string
          collector_name?: string | null
          created_at?: string | null
          discount_amount?: number | null
          distribution_details?: Json | null
          id?: string
          is_agreement?: boolean | null
          notes?: string | null
          payment_amount: number
          payment_date?: string
          payment_method?: string | null
          sale_number?: number | null
          store_name?: string | null
          updated_at?: string | null
        }
        Update: {
          client_document?: string
          client_name?: string | null
          collector_id?: string
          collector_name?: string | null
          created_at?: string | null
          discount_amount?: number | null
          distribution_details?: Json | null
          id?: string
          is_agreement?: boolean | null
          notes?: string | null
          payment_amount?: number
          payment_date?: string
          payment_method?: string | null
          sale_number?: number | null
          store_name?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_collector_id"
            columns: ["collector_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      scheduled_visits: {
        Row: {
          cancellation_approved_at: string | null
          cancellation_approved_by: string | null
          cancellation_rejected_at: string | null
          cancellation_rejected_by: string | null
          cancellation_rejection_reason: string | null
          cancellation_request_date: string | null
          cancellation_request_reason: string | null
          client_address: string | null
          client_city: string | null
          client_document: string
          client_name: string
          client_neighborhood: string | null
          collector_id: string
          created_at: string | null
          data_visita_realizada: string | null
          id: string
          notes: string | null
          overdue_count: number | null
          reschedule_count: number | null
          scheduled_by_manager_id: string | null
          scheduled_date: string
          scheduled_time: string | null
          status: string
          total_pending_value: number | null
          updated_at: string | null
        }
        Insert: {
          cancellation_approved_at?: string | null
          cancellation_approved_by?: string | null
          cancellation_rejected_at?: string | null
          cancellation_rejected_by?: string | null
          cancellation_rejection_reason?: string | null
          cancellation_request_date?: string | null
          cancellation_request_reason?: string | null
          client_address?: string | null
          client_city?: string | null
          client_document: string
          client_name: string
          client_neighborhood?: string | null
          collector_id: string
          created_at?: string | null
          data_visita_realizada?: string | null
          id?: string
          notes?: string | null
          overdue_count?: number | null
          reschedule_count?: number | null
          scheduled_by_manager_id?: string | null
          scheduled_date: string
          scheduled_time?: string | null
          status?: string
          total_pending_value?: number | null
          updated_at?: string | null
        }
        Update: {
          cancellation_approved_at?: string | null
          cancellation_approved_by?: string | null
          cancellation_rejected_at?: string | null
          cancellation_rejected_by?: string | null
          cancellation_rejection_reason?: string | null
          cancellation_request_date?: string | null
          cancellation_request_reason?: string | null
          client_address?: string | null
          client_city?: string | null
          client_document?: string
          client_name?: string
          client_neighborhood?: string | null
          collector_id?: string
          created_at?: string | null
          data_visita_realizada?: string | null
          id?: string
          notes?: string | null
          overdue_count?: number | null
          reschedule_count?: number | null
          scheduled_by_manager_id?: string | null
          scheduled_date?: string
          scheduled_time?: string | null
          status?: string
          total_pending_value?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "scheduled_visits_scheduled_by_manager_id_fkey"
            columns: ["scheduled_by_manager_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          created_at: string | null
          id: string
          login: string
          name: string
          password: string
          type: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          login: string
          name: string
          password: string
          type: string
        }
        Update: {
          created_at?: string | null
          id?: string
          login?: string
          name?: string
          password?: string
          type?: string
        }
        Relationships: []
      }
    }
    Views: {
      daily_payment_report: {
        Row: {
          average_payment: number | null
          collector_id: string | null
          collector_name: string | null
          max_payment: number | null
          min_payment: number | null
          payment_date: string | null
          total_payments: number | null
          total_received: number | null
          unique_clients: number | null
          unique_sales: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_collector_id"
            columns: ["collector_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_clientes_cobradores: {
        Row: {
          cliente: string | null
          cobrador_login: string | null
          cobrador_nome: string | null
          cobrador_tipo: string | null
          data_vencimento: string | null
          dias_em_atraso: number | null
          documento: string | null
          id_parcela: number | null
          status: string | null
          valor_original: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      atribuir_cobrador: {
        Args: { p_documento: string; p_user_id: string }
        Returns: undefined
      }
      atribuir_cobrador_parcela: {
        Args: { p_id_parcela: number; p_user_id: string }
        Returns: undefined
      }
      atribuir_multiplos_clientes: {
        Args: { p_documentos: string[]; p_user_id: string }
        Returns: {
          documentos_atualizados: number
        }[]
      }
      clientes_do_cobrador: {
        Args: { p_cobrador_id: string }
        Returns: {
          cliente: string
          cpf: string
          parcelas_pagas: number
          parcelas_vencidas: number
          total_parcelas: number
          valor_total: number
        }[]
      }
      clientes_sem_cobrador: {
        Args: never
        Returns: {
          cliente: string
          cpf: string
          primeira_parcela: string
          total_parcelas: number
          ultima_parcela: string
          valor_total: number
        }[]
      }
      converter_valor_brasileiro: { Args: { valor: string }; Returns: number }
      distribuir_clientes_cobradores: {
        Args: never
        Returns: {
          clientes_atribuidos: number
          cobrador_id: string
          cobrador_nome: string
        }[]
      }
      listar_cobradores: {
        Args: never
        Returns: {
          cobrador_id: string
          cobrador_nome: string
          total_clientes: number
          total_parcelas: number
          valor_total: number
        }[]
      }
      process_payment: {
        Args: {
          p_client_document: string
          p_collector_id: string
          p_discount_amount?: number
          p_notes?: string
          p_payment_amount: number
          p_payment_method?: string
          p_sale_number?: number
        }
        Returns: undefined
      }
      remover_cobrador: { Args: { p_documento: string }; Returns: undefined }
      transferir_clientes: {
        Args: { p_cobrador_destino: string; p_cobrador_origem: string }
        Returns: {
          clientes_transferidos: number
        }[]
      }
      update_client_address: {
        Args: {
          p_bairro: string
          p_cep: string
          p_cidade: string
          p_cliente_documento: string
          p_estado: string
          p_logradouro: string
          p_numero: string
        }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
