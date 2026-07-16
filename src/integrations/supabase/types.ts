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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      bank_accounts: {
        Row: {
          color: string | null
          company_id: string
          created_at: string
          id: string
          initial_balance_cents: number
          name: string
          type: string
          updated_at: string
        }
        Insert: {
          color?: string | null
          company_id: string
          created_at?: string
          id?: string
          initial_balance_cents?: number
          name: string
          type?: string
          updated_at?: string
        }
        Update: {
          color?: string | null
          company_id?: string
          created_at?: string
          id?: string
          initial_balance_cents?: number
          name?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bank_accounts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          account_class: Database["public"]["Enums"]["account_class"] | null
          codigo: string | null
          company_id: string
          created_at: string
          dre_group: Database["public"]["Enums"]["dre_group"]
          dre_line: Database["public"]["Enums"]["dre_line"] | null
          id: string
          is_balance_sheet: boolean
          kind: Database["public"]["Enums"]["category_kind"]
          name: string
          ordem: number
          parent_id: string | null
        }
        Insert: {
          account_class?: Database["public"]["Enums"]["account_class"] | null
          codigo?: string | null
          company_id: string
          created_at?: string
          dre_group: Database["public"]["Enums"]["dre_group"]
          dre_line?: Database["public"]["Enums"]["dre_line"] | null
          id?: string
          is_balance_sheet?: boolean
          kind: Database["public"]["Enums"]["category_kind"]
          name: string
          ordem?: number
          parent_id?: string | null
        }
        Update: {
          account_class?: Database["public"]["Enums"]["account_class"] | null
          codigo?: string | null
          company_id?: string
          created_at?: string
          dre_group?: Database["public"]["Enums"]["dre_group"]
          dre_line?: Database["public"]["Enums"]["dre_line"] | null
          id?: string
          is_balance_sheet?: boolean
          kind?: Database["public"]["Enums"]["category_kind"]
          name?: string
          ordem?: number
          parent_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "categories_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          created_at: string
          id: string
          name: string
          owner_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          owner_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          owner_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      company_members: {
        Row: {
          company_id: string
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_members_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      cost_centers: {
        Row: {
          color: string | null
          company_id: string
          created_at: string
          id: string
          name: string
        }
        Insert: {
          color?: string | null
          company_id: string
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          color?: string | null
          company_id?: string
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "cost_centers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      erp_account_mappings: {
        Row: {
          category_id: string | null
          company_id: string
          created_at: string
          default_kind: string | null
          erp_code: string
          erp_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          category_id?: string | null
          company_id: string
          created_at?: string
          default_kind?: string | null
          erp_code: string
          erp_name?: string | null
          id?: string
          updated_at?: string
        }
        Update: {
          category_id?: string | null
          company_id?: string
          created_at?: string
          default_kind?: string | null
          erp_code?: string
          erp_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "erp_account_mappings_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_account_mappings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      goals: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          id: string
          kind: Database["public"]["Enums"]["goal_kind"]
          month: number
          notes: string | null
          target_cents: number
          updated_at: string
          year: number
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          kind: Database["public"]["Enums"]["goal_kind"]
          month: number
          notes?: string | null
          target_cents?: number
          updated_at?: string
          year: number
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["goal_kind"]
          month?: number
          notes?: string | null
          target_cents?: number
          updated_at?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "goals_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      import_jobs: {
        Row: {
          attempts: number
          company_id: string
          created_at: string
          created_by: string
          duplicates: number
          error: string | null
          id: string
          inserted: number
          locked_at: string | null
          max_attempts: number
          payload: Json
          processed: number
          source: string
          status: string
          total: number
          updated_at: string
        }
        Insert: {
          attempts?: number
          company_id: string
          created_at?: string
          created_by: string
          duplicates?: number
          error?: string | null
          id?: string
          inserted?: number
          locked_at?: string | null
          max_attempts?: number
          payload: Json
          processed?: number
          source?: string
          status?: string
          total?: number
          updated_at?: string
        }
        Update: {
          attempts?: number
          company_id?: string
          created_at?: string
          created_by?: string
          duplicates?: number
          error?: string | null
          id?: string
          inserted?: number
          locked_at?: string | null
          max_attempts?: number
          payload?: Json
          processed?: number
          source?: string
          status?: string
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "import_jobs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_snapshots: {
        Row: {
          company_id: string
          cost_cents: number
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
          notes: string | null
          retail_cents: number | null
          snapshot_date: string
          updated_at: string
        }
        Insert: {
          company_id: string
          cost_cents: number
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          notes?: string | null
          retail_cents?: number | null
          snapshot_date: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          cost_cents?: number
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          notes?: string | null
          retail_cents?: number | null
          snapshot_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_snapshots_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      parties: {
        Row: {
          company_id: string
          created_at: string
          document: string | null
          email: string | null
          id: string
          kind: Database["public"]["Enums"]["party_kind"]
          name: string
          phone: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          document?: string | null
          email?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["party_kind"]
          name: string
          phone?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          document?: string | null
          email?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["party_kind"]
          name?: string
          phone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "parties_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_limit_buckets: {
        Row: {
          key: string
          last_refill: string
          tokens: number
          updated_at: string
        }
        Insert: {
          key: string
          last_refill?: string
          tokens: number
          updated_at?: string
        }
        Update: {
          key?: string
          last_refill?: string
          tokens?: number
          updated_at?: string
        }
        Relationships: []
      }
      sales: {
        Row: {
          company_id: string
          cost_cents: number
          created_at: string
          deleted_at: string | null
          id: string
          imported_at: string
          items_qty: number
          net_amount_cents: number
          period_end: string
          period_start: string
          returns_cents: number
          sales_qty: number
          seller_code: string | null
          seller_name: string
          source_file: string | null
          updated_at: string
        }
        Insert: {
          company_id: string
          cost_cents?: number
          created_at?: string
          deleted_at?: string | null
          id?: string
          imported_at?: string
          items_qty?: number
          net_amount_cents?: number
          period_end: string
          period_start: string
          returns_cents?: number
          sales_qty?: number
          seller_code?: string | null
          seller_name: string
          source_file?: string | null
          updated_at?: string
        }
        Update: {
          company_id?: string
          cost_cents?: number
          created_at?: string
          deleted_at?: string | null
          id?: string
          imported_at?: string
          items_qty?: number
          net_amount_cents?: number
          period_end?: string
          period_start?: string
          returns_cents?: number
          sales_qty?: number
          seller_code?: string | null
          seller_name?: string
          source_file?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      transactions: {
        Row: {
          amount_cents: number
          bank_account_id: string | null
          category_id: string | null
          company_id: string
          competencia: string
          cost_center_id: string | null
          created_at: string
          created_by: string | null
          date: string
          deleted_at: string | null
          description: string
          fingerprint: string | null
          id: string
          kind: Database["public"]["Enums"]["tx_kind"]
          notes: string | null
          paid_at: string | null
          party_id: string | null
          payment_method: Database["public"]["Enums"]["payment_method"] | null
          status: Database["public"]["Enums"]["tx_status"]
          updated_at: string
        }
        Insert: {
          amount_cents: number
          bank_account_id?: string | null
          category_id?: string | null
          company_id: string
          competencia?: string
          cost_center_id?: string | null
          created_at?: string
          created_by?: string | null
          date: string
          deleted_at?: string | null
          description: string
          fingerprint?: string | null
          id?: string
          kind: Database["public"]["Enums"]["tx_kind"]
          notes?: string | null
          paid_at?: string | null
          party_id?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          status?: Database["public"]["Enums"]["tx_status"]
          updated_at?: string
        }
        Update: {
          amount_cents?: number
          bank_account_id?: string | null
          category_id?: string | null
          company_id?: string
          competencia?: string
          cost_center_id?: string | null
          created_at?: string
          created_by?: string | null
          date?: string
          deleted_at?: string | null
          description?: string
          fingerprint?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["tx_kind"]
          notes?: string | null
          paid_at?: string | null
          party_id?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          status?: Database["public"]["Enums"]["tx_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "transactions_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_cost_center_id_fkey"
            columns: ["cost_center_id"]
            isOneToOne: false
            referencedRelation: "cost_centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_party_id_fkey"
            columns: ["party_id"]
            isOneToOne: false
            referencedRelation: "parties"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      consume_rate_limit: {
        Args: {
          _capacity: number
          _cost?: number
          _key: string
          _refill_per_sec: number
        }
        Returns: boolean
      }
      has_company_role: {
        Args: {
          _company_id: string
          _roles: Database["public"]["Enums"]["app_role"][]
          _user_id: string
        }
        Returns: boolean
      }
      is_company_member: {
        Args: { _company_id: string; _user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      account_class:
        | "revenue"
        | "deduction"
        | "cogs"
        | "selling_expense"
        | "admin_expense"
        | "other_operating_expense"
        | "depreciation"
        | "financial_result"
        | "tax_on_profit"
        | "non_operating"
        | "balance_sheet"
      app_role: "owner" | "admin" | "member"
      category_kind: "revenue" | "expense"
      dre_group:
        | "revenue"
        | "cmv"
        | "supplier"
        | "freight"
        | "fixed"
        | "variable"
        | "operational"
        | "other"
      dre_line:
        | "receita_bruta"
        | "deducoes"
        | "receita_liquida"
        | "cmv"
        | "lucro_bruto"
        | "despesa_comercial"
        | "despesa_administrativa"
        | "despesa_operacional"
        | "ebitda"
        | "depreciacao"
        | "ebit"
        | "resultado_financeiro"
        | "lair"
        | "ir_csll"
        | "lucro_liquido"
        | "nao_aplicavel"
      goal_kind: "revenue" | "profit" | "expense_cap"
      party_kind: "client" | "supplier" | "both"
      payment_method: "cash" | "pix" | "boleto" | "cheque" | "card"
      tx_kind: "revenue" | "expense"
      tx_status: "pending" | "paid"
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
    Enums: {
      account_class: [
        "revenue",
        "deduction",
        "cogs",
        "selling_expense",
        "admin_expense",
        "other_operating_expense",
        "depreciation",
        "financial_result",
        "tax_on_profit",
        "non_operating",
        "balance_sheet",
      ],
      app_role: ["owner", "admin", "member"],
      category_kind: ["revenue", "expense"],
      dre_group: [
        "revenue",
        "cmv",
        "supplier",
        "freight",
        "fixed",
        "variable",
        "operational",
        "other",
      ],
      dre_line: [
        "receita_bruta",
        "deducoes",
        "receita_liquida",
        "cmv",
        "lucro_bruto",
        "despesa_comercial",
        "despesa_administrativa",
        "despesa_operacional",
        "ebitda",
        "depreciacao",
        "ebit",
        "resultado_financeiro",
        "lair",
        "ir_csll",
        "lucro_liquido",
        "nao_aplicavel",
      ],
      goal_kind: ["revenue", "profit", "expense_cap"],
      party_kind: ["client", "supplier", "both"],
      payment_method: ["cash", "pix", "boleto", "cheque", "card"],
      tx_kind: ["revenue", "expense"],
      tx_status: ["pending", "paid"],
    },
  },
} as const
