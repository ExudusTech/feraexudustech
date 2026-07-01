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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      audit_logs: {
        Row: {
          action: string
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          ip_address: string | null
          new_data: Json | null
          old_data: Json | null
          organization_id: string | null
          user_agent: string | null
          user_email: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          ip_address?: string | null
          new_data?: Json | null
          old_data?: Json | null
          organization_id?: string | null
          user_agent?: string | null
          user_email?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          ip_address?: string | null
          new_data?: Json | null
          old_data?: Json | null
          organization_id?: string | null
          user_agent?: string | null
          user_email?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      catalog_items: {
        Row: {
          catalog_id: string
          created_at: string
          custom_price: number | null
          id: string
          is_active: boolean
          organization_id: string
          product_id: string
          sort_order: number | null
        }
        Insert: {
          catalog_id: string
          created_at?: string
          custom_price?: number | null
          id?: string
          is_active?: boolean
          organization_id: string
          product_id: string
          sort_order?: number | null
        }
        Update: {
          catalog_id?: string
          created_at?: string
          custom_price?: number | null
          id?: string
          is_active?: boolean
          organization_id?: string
          product_id?: string
          sort_order?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "catalog_items_catalog_id_fkey"
            columns: ["catalog_id"]
            isOneToOne: false
            referencedRelation: "organization_catalogs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      client_visits: {
        Row: {
          client_id: string
          created_at: string
          id: string
          next_visit_date: string | null
          notes: string | null
          organization_id: string
          outcome: string | null
          subject: string | null
          updated_at: string | null
          visit_date: string
          visit_type: string
          visited_by: string
        }
        Insert: {
          client_id: string
          created_at?: string
          id?: string
          next_visit_date?: string | null
          notes?: string | null
          organization_id: string
          outcome?: string | null
          subject?: string | null
          updated_at?: string | null
          visit_date?: string
          visit_type?: string
          visited_by: string
        }
        Update: {
          client_id?: string
          created_at?: string
          id?: string
          next_visit_date?: string | null
          notes?: string | null
          organization_id?: string
          outcome?: string | null
          subject?: string | null
          updated_at?: string | null
          visit_date?: string
          visit_type?: string
          visited_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_visits_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_visits_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          address: string | null
          assigned_user_id: string | null
          city: string | null
          company: string | null
          created_at: string
          created_by: string
          document: string | null
          email: string | null
          id: string
          name: string
          notes: string | null
          organization_id: string
          phone: string | null
          state: string | null
          status: string
          updated_at: string | null
          zip_code: string | null
        }
        Insert: {
          address?: string | null
          assigned_user_id?: string | null
          city?: string | null
          company?: string | null
          created_at?: string
          created_by: string
          document?: string | null
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          organization_id: string
          phone?: string | null
          state?: string | null
          status?: string
          updated_at?: string | null
          zip_code?: string | null
        }
        Update: {
          address?: string | null
          assigned_user_id?: string | null
          city?: string | null
          company?: string | null
          created_at?: string
          created_by?: string
          document?: string | null
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          organization_id?: string
          phone?: string | null
          state?: string | null
          status?: string
          updated_at?: string | null
          zip_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clients_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      departments: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          manager_id: string | null
          name: string
          organization_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          manager_id?: string | null
          name: string
          organization_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          manager_id?: string | null
          name?: string
          organization_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "departments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      ekkoa_billing: {
        Row: {
          amount: number
          billing_type: string
          client_id: string | null
          contract_id: string | null
          created_at: string
          created_by: string
          description: string | null
          due_date: string | null
          id: string
          installation_id: string | null
          invoice_number: string | null
          notes: string | null
          organization_id: string
          paid_amount: number | null
          payment_date: string | null
          payment_method: string | null
          status: string
          title: string
          updated_at: string | null
        }
        Insert: {
          amount?: number
          billing_type?: string
          client_id?: string | null
          contract_id?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          due_date?: string | null
          id?: string
          installation_id?: string | null
          invoice_number?: string | null
          notes?: string | null
          organization_id: string
          paid_amount?: number | null
          payment_date?: string | null
          payment_method?: string | null
          status?: string
          title: string
          updated_at?: string | null
        }
        Update: {
          amount?: number
          billing_type?: string
          client_id?: string | null
          contract_id?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          due_date?: string | null
          id?: string
          installation_id?: string | null
          invoice_number?: string | null
          notes?: string | null
          organization_id?: string
          paid_amount?: number | null
          payment_date?: string | null
          payment_method?: string | null
          status?: string
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ekkoa_billing_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "ekkoa_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ekkoa_billing_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "ekkoa_contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ekkoa_billing_installation_id_fkey"
            columns: ["installation_id"]
            isOneToOne: false
            referencedRelation: "ekkoa_installations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ekkoa_billing_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      ekkoa_clients: {
        Row: {
          address: string | null
          city: string | null
          client_type: string
          company: string | null
          created_at: string
          created_by: string
          document: string | null
          email: string | null
          id: string
          name: string
          notes: string | null
          organization_id: string
          phone: string | null
          state: string | null
          status: string
          updated_at: string | null
          zip_code: string | null
        }
        Insert: {
          address?: string | null
          city?: string | null
          client_type?: string
          company?: string | null
          created_at?: string
          created_by: string
          document?: string | null
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          organization_id: string
          phone?: string | null
          state?: string | null
          status?: string
          updated_at?: string | null
          zip_code?: string | null
        }
        Update: {
          address?: string | null
          city?: string | null
          client_type?: string
          company?: string | null
          created_at?: string
          created_by?: string
          document?: string | null
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          organization_id?: string
          phone?: string | null
          state?: string | null
          status?: string
          updated_at?: string | null
          zip_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ekkoa_clients_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      ekkoa_contracts: {
        Row: {
          client_id: string | null
          contract_number: string | null
          contract_type: string
          created_at: string
          created_by: string
          description: string | null
          end_date: string | null
          id: string
          installation_id: string | null
          monthly_value: number | null
          notes: string | null
          organization_id: string
          payment_method: string | null
          payment_terms: string | null
          signed_at: string | null
          start_date: string | null
          status: string
          title: string
          total_value: number
          updated_at: string | null
        }
        Insert: {
          client_id?: string | null
          contract_number?: string | null
          contract_type?: string
          created_at?: string
          created_by: string
          description?: string | null
          end_date?: string | null
          id?: string
          installation_id?: string | null
          monthly_value?: number | null
          notes?: string | null
          organization_id: string
          payment_method?: string | null
          payment_terms?: string | null
          signed_at?: string | null
          start_date?: string | null
          status?: string
          title: string
          total_value?: number
          updated_at?: string | null
        }
        Update: {
          client_id?: string | null
          contract_number?: string | null
          contract_type?: string
          created_at?: string
          created_by?: string
          description?: string | null
          end_date?: string | null
          id?: string
          installation_id?: string | null
          monthly_value?: number | null
          notes?: string | null
          organization_id?: string
          payment_method?: string | null
          payment_terms?: string | null
          signed_at?: string | null
          start_date?: string | null
          status?: string
          title?: string
          total_value?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ekkoa_contracts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "ekkoa_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ekkoa_contracts_installation_id_fkey"
            columns: ["installation_id"]
            isOneToOne: false
            referencedRelation: "ekkoa_installations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ekkoa_contracts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      ekkoa_coverage_areas: {
        Row: {
          city: string | null
          created_at: string
          created_by: string
          description: string | null
          dia_semana: string | null
          horario_fim: string | null
          horario_inicio: string | null
          id: string
          is_active: boolean
          latitude: number | null
          longitude: number | null
          name: string
          organization_id: string
          radius_km: number | null
          state: string | null
          updated_at: string | null
          zip_code_end: string | null
          zip_code_start: string | null
        }
        Insert: {
          city?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          dia_semana?: string | null
          horario_fim?: string | null
          horario_inicio?: string | null
          id?: string
          is_active?: boolean
          latitude?: number | null
          longitude?: number | null
          name: string
          organization_id: string
          radius_km?: number | null
          state?: string | null
          updated_at?: string | null
          zip_code_end?: string | null
          zip_code_start?: string | null
        }
        Update: {
          city?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          dia_semana?: string | null
          horario_fim?: string | null
          horario_inicio?: string | null
          id?: string
          is_active?: boolean
          latitude?: number | null
          longitude?: number | null
          name?: string
          organization_id?: string
          radius_km?: number | null
          state?: string | null
          updated_at?: string | null
          zip_code_end?: string | null
          zip_code_start?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ekkoa_coverage_areas_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      ekkoa_equipment: {
        Row: {
          brand: string | null
          category: string | null
          created_at: string
          created_by: string
          description: string | null
          id: string
          model: string | null
          name: string
          notes: string | null
          organization_id: string
          power_watts: number | null
          quantity: number
          serial_number: string | null
          status: string
          unit_cost: number | null
          updated_at: string | null
        }
        Insert: {
          brand?: string | null
          category?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          model?: string | null
          name: string
          notes?: string | null
          organization_id: string
          power_watts?: number | null
          quantity?: number
          serial_number?: string | null
          status?: string
          unit_cost?: number | null
          updated_at?: string | null
        }
        Update: {
          brand?: string | null
          category?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          model?: string | null
          name?: string
          notes?: string | null
          organization_id?: string
          power_watts?: number | null
          quantity?: number
          serial_number?: string | null
          status?: string
          unit_cost?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ekkoa_equipment_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      ekkoa_fragrance_lines: {
        Row: {
          category: string | null
          created_at: string
          created_by: string
          description: string | null
          id: string
          intensity: string | null
          is_active: boolean
          name: string
          notes: string | null
          organization_id: string
          updated_at: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          intensity?: string | null
          is_active?: boolean
          name: string
          notes?: string | null
          organization_id: string
          updated_at?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          intensity?: string | null
          is_active?: boolean
          name?: string
          notes?: string | null
          organization_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ekkoa_fragrance_lines_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      ekkoa_installation_equipment: {
        Row: {
          created_at: string
          equipment_id: string
          id: string
          installation_id: string
          notes: string | null
          organization_id: string
          quantity: number
        }
        Insert: {
          created_at?: string
          equipment_id: string
          id?: string
          installation_id: string
          notes?: string | null
          organization_id: string
          quantity?: number
        }
        Update: {
          created_at?: string
          equipment_id?: string
          id?: string
          installation_id?: string
          notes?: string | null
          organization_id?: string
          quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "ekkoa_installation_equipment_equipment_id_fkey"
            columns: ["equipment_id"]
            isOneToOne: false
            referencedRelation: "ekkoa_equipment"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ekkoa_installation_equipment_installation_id_fkey"
            columns: ["installation_id"]
            isOneToOne: false
            referencedRelation: "ekkoa_installations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ekkoa_installation_equipment_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      ekkoa_installations: {
        Row: {
          address: string | null
          assigned_to: string | null
          city: string | null
          client_id: string | null
          created_at: string
          created_by: string
          description: string | null
          end_date: string | null
          id: string
          installation_type: string
          inverter_model: string | null
          latitude: number | null
          longitude: number | null
          notes: string | null
          organization_id: string
          panels_count: number | null
          power_kwp: number | null
          start_date: string | null
          state: string | null
          status: string
          title: string
          updated_at: string | null
          zip_code: string | null
        }
        Insert: {
          address?: string | null
          assigned_to?: string | null
          city?: string | null
          client_id?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          end_date?: string | null
          id?: string
          installation_type?: string
          inverter_model?: string | null
          latitude?: number | null
          longitude?: number | null
          notes?: string | null
          organization_id: string
          panels_count?: number | null
          power_kwp?: number | null
          start_date?: string | null
          state?: string | null
          status?: string
          title: string
          updated_at?: string | null
          zip_code?: string | null
        }
        Update: {
          address?: string | null
          assigned_to?: string | null
          city?: string | null
          client_id?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          end_date?: string | null
          id?: string
          installation_type?: string
          inverter_model?: string | null
          latitude?: number | null
          longitude?: number | null
          notes?: string | null
          organization_id?: string
          panels_count?: number | null
          power_kwp?: number | null
          start_date?: string | null
          state?: string | null
          status?: string
          title?: string
          updated_at?: string | null
          zip_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ekkoa_installations_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "ekkoa_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ekkoa_installations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      ekkoa_leads: {
        Row: {
          assigned_to: string | null
          client_id: string | null
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          created_at: string
          created_by: string
          description: string | null
          expected_close_date: string | null
          id: string
          notes: string | null
          organization_id: string
          source: string | null
          stage: string
          title: string
          updated_at: string | null
          value: number | null
        }
        Insert: {
          assigned_to?: string | null
          client_id?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          expected_close_date?: string | null
          id?: string
          notes?: string | null
          organization_id: string
          source?: string | null
          stage?: string
          title: string
          updated_at?: string | null
          value?: number | null
        }
        Update: {
          assigned_to?: string | null
          client_id?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          expected_close_date?: string | null
          id?: string
          notes?: string | null
          organization_id?: string
          source?: string | null
          stage?: string
          title?: string
          updated_at?: string | null
          value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ekkoa_leads_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "ekkoa_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ekkoa_leads_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      ekkoa_product_fragrance_lines: {
        Row: {
          created_at: string
          fragrance_line_id: string
          id: string
          is_active: boolean
          notes: string | null
          organization_id: string
          product_id: string
        }
        Insert: {
          created_at?: string
          fragrance_line_id: string
          id?: string
          is_active?: boolean
          notes?: string | null
          organization_id: string
          product_id: string
        }
        Update: {
          created_at?: string
          fragrance_line_id?: string
          id?: string
          is_active?: boolean
          notes?: string | null
          organization_id?: string
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ekkoa_product_fragrance_lines_fragrance_line_id_fkey"
            columns: ["fragrance_line_id"]
            isOneToOne: false
            referencedRelation: "ekkoa_fragrance_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ekkoa_product_fragrance_lines_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ekkoa_product_fragrance_lines_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      ekkoa_technical_visits: {
        Row: {
          client_id: string | null
          created_at: string
          created_by: string
          description: string | null
          duration_minutes: number | null
          findings: string | null
          id: string
          installation_id: string | null
          next_visit_date: string | null
          notes: string | null
          organization_id: string
          recommendations: string | null
          status: string
          technician_id: string | null
          updated_at: string | null
          visit_date: string
          visit_type: string
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          duration_minutes?: number | null
          findings?: string | null
          id?: string
          installation_id?: string | null
          next_visit_date?: string | null
          notes?: string | null
          organization_id: string
          recommendations?: string | null
          status?: string
          technician_id?: string | null
          updated_at?: string | null
          visit_date?: string
          visit_type?: string
        }
        Update: {
          client_id?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          duration_minutes?: number | null
          findings?: string | null
          id?: string
          installation_id?: string | null
          next_visit_date?: string | null
          notes?: string | null
          organization_id?: string
          recommendations?: string | null
          status?: string
          technician_id?: string | null
          updated_at?: string | null
          visit_date?: string
          visit_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "ekkoa_technical_visits_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "ekkoa_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ekkoa_technical_visits_installation_id_fkey"
            columns: ["installation_id"]
            isOneToOne: false
            referencedRelation: "ekkoa_installations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ekkoa_technical_visits_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_transactions: {
        Row: {
          amount: number
          category: string | null
          client_id: string | null
          contract_id: string | null
          created_at: string
          created_by: string
          description: string | null
          due_date: string | null
          id: string
          notes: string | null
          order_id: string | null
          organization_id: string
          payment_date: string | null
          payment_method_id: string | null
          reference_number: string | null
          status: string
          title: string
          transaction_type: string
          updated_at: string | null
        }
        Insert: {
          amount?: number
          category?: string | null
          client_id?: string | null
          contract_id?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          due_date?: string | null
          id?: string
          notes?: string | null
          order_id?: string | null
          organization_id: string
          payment_date?: string | null
          payment_method_id?: string | null
          reference_number?: string | null
          status?: string
          title: string
          transaction_type?: string
          updated_at?: string | null
        }
        Update: {
          amount?: number
          category?: string | null
          client_id?: string | null
          contract_id?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          due_date?: string | null
          id?: string
          notes?: string | null
          order_id?: string | null
          organization_id?: string
          payment_date?: string | null
          payment_method_id?: string | null
          reference_number?: string | null
          status?: string
          title?: string
          transaction_type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "financial_transactions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_transactions_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "ekkoa_contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_transactions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_transactions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_transactions_payment_method_id_fkey"
            columns: ["payment_method_id"]
            isOneToOne: false
            referencedRelation: "payment_methods"
            referencedColumns: ["id"]
          },
        ]
      }
      flora_interactions: {
        Row: {
          canal: Database["public"]["Enums"]["canal_origem_enum"] | null
          created_at: string | null
          id: string
          interaction_id: string
          lead_id: string | null
          organization_id: string | null
          payload: Json | null
          response: Json | null
          tool_name: string
        }
        Insert: {
          canal?: Database["public"]["Enums"]["canal_origem_enum"] | null
          created_at?: string | null
          id?: string
          interaction_id: string
          lead_id?: string | null
          organization_id?: string | null
          payload?: Json | null
          response?: Json | null
          tool_name: string
        }
        Update: {
          canal?: Database["public"]["Enums"]["canal_origem_enum"] | null
          created_at?: string | null
          id?: string
          interaction_id?: string
          lead_id?: string | null
          organization_id?: string | null
          payload?: Json | null
          response?: Json | null
          tool_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "flora_interactions_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flora_interactions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      internal_messages: {
        Row: {
          body: string
          created_at: string
          id: string
          is_internal: boolean
          message_type: string
          organization_id: string
          sender_id: string
          subject: string | null
          ticket_id: string | null
          updated_at: string | null
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          is_internal?: boolean
          message_type?: string
          organization_id: string
          sender_id: string
          subject?: string | null
          ticket_id?: string | null
          updated_at?: string | null
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          is_internal?: boolean
          message_type?: string
          organization_id?: string
          sender_id?: string
          subject?: string | null
          ticket_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "internal_messages_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "internal_messages_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_items: {
        Row: {
          category: string | null
          created_at: string
          created_by: string
          description: string | null
          geolocation: string | null
          id: string
          installation_date: string | null
          last_maintenance_date: string | null
          location: string | null
          min_quantity: number
          name: string
          organization_id: string
          photo_url: string | null
          quantity: number
          serial_number: string | null
          sku: string | null
          status: string
          unit: string
          unit_cost: number | null
          updated_at: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          geolocation?: string | null
          id?: string
          installation_date?: string | null
          last_maintenance_date?: string | null
          location?: string | null
          min_quantity?: number
          name: string
          organization_id: string
          photo_url?: string | null
          quantity?: number
          serial_number?: string | null
          sku?: string | null
          status?: string
          unit?: string
          unit_cost?: number | null
          updated_at?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          geolocation?: string | null
          id?: string
          installation_date?: string | null
          last_maintenance_date?: string | null
          location?: string | null
          min_quantity?: number
          name?: string
          organization_id?: string
          photo_url?: string | null
          quantity?: number
          serial_number?: string | null
          sku?: string | null
          status?: string
          unit?: string
          unit_cost?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          assigned_to: string | null
          canal_origem: Database["public"]["Enums"]["canal_origem_enum"] | null
          category: string | null
          client_id: string | null
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          created_at: string
          created_by: string | null
          created_by_flora: boolean | null
          description: string | null
          expected_close_date: string | null
          flora_tags: string[] | null
          fora_cobertura: boolean | null
          id: string
          instagram_handle: string | null
          interaction_id: string | null
          organization_id: string
          origem_especifica: string | null
          position: number
          precisa_humano: boolean | null
          source: string | null
          stage: Database["public"]["Enums"]["lead_stage"]
          title: string
          updated_at: string | null
          value: number | null
          zip_code: string | null
        }
        Insert: {
          assigned_to?: string | null
          canal_origem?: Database["public"]["Enums"]["canal_origem_enum"] | null
          category?: string | null
          client_id?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          created_by?: string | null
          created_by_flora?: boolean | null
          description?: string | null
          expected_close_date?: string | null
          flora_tags?: string[] | null
          fora_cobertura?: boolean | null
          id?: string
          instagram_handle?: string | null
          interaction_id?: string | null
          organization_id: string
          origem_especifica?: string | null
          position?: number
          precisa_humano?: boolean | null
          source?: string | null
          stage?: Database["public"]["Enums"]["lead_stage"]
          title: string
          updated_at?: string | null
          value?: number | null
          zip_code?: string | null
        }
        Update: {
          assigned_to?: string | null
          canal_origem?: Database["public"]["Enums"]["canal_origem_enum"] | null
          category?: string | null
          client_id?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          created_by?: string | null
          created_by_flora?: boolean | null
          description?: string | null
          expected_close_date?: string | null
          flora_tags?: string[] | null
          fora_cobertura?: boolean | null
          id?: string
          instagram_handle?: string | null
          interaction_id?: string | null
          organization_id?: string
          origem_especifica?: string | null
          position?: number
          precisa_humano?: boolean | null
          source?: string | null
          stage?: Database["public"]["Enums"]["lead_stage"]
          title?: string
          updated_at?: string | null
          value?: number | null
          zip_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leads_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      maintenance_schedule: {
        Row: {
          actual_cost: number | null
          assigned_to: string | null
          client_id: string | null
          completed_date: string | null
          created_at: string
          created_by: string
          description: string | null
          end_time: string | null
          estimated_cost: number | null
          id: string
          installation_id: string | null
          maintenance_type: string
          notes: string | null
          organization_id: string
          recurrence: string | null
          scheduled_date: string
          start_time: string | null
          status: string
          title: string
          updated_at: string | null
        }
        Insert: {
          actual_cost?: number | null
          assigned_to?: string | null
          client_id?: string | null
          completed_date?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          end_time?: string | null
          estimated_cost?: number | null
          id?: string
          installation_id?: string | null
          maintenance_type?: string
          notes?: string | null
          organization_id: string
          recurrence?: string | null
          scheduled_date: string
          start_time?: string | null
          status?: string
          title: string
          updated_at?: string | null
        }
        Update: {
          actual_cost?: number | null
          assigned_to?: string | null
          client_id?: string | null
          completed_date?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          end_time?: string | null
          estimated_cost?: number | null
          id?: string
          installation_id?: string | null
          maintenance_type?: string
          notes?: string | null
          organization_id?: string
          recurrence?: string | null
          scheduled_date?: string
          start_time?: string | null
          status?: string
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "maintenance_schedule_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_schedule_installation_id_fkey"
            columns: ["installation_id"]
            isOneToOne: false
            referencedRelation: "ekkoa_installations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_schedule_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      message_participants: {
        Row: {
          created_at: string
          id: string
          message_id: string
          organization_id: string
          read_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          message_id: string
          organization_id: string
          read_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          message_id?: string
          organization_id?: string
          read_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_participants_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "internal_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_participants_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      operational_expenses: {
        Row: {
          amount: number
          category: string
          created_at: string
          created_by: string
          department_id: string | null
          description: string | null
          due_date: string | null
          expense_date: string
          id: string
          invoice_number: string | null
          notes: string | null
          organization_id: string
          payment_date: string | null
          payment_method_id: string | null
          recurrence: string | null
          status: string
          title: string
          updated_at: string | null
          vendor: string | null
        }
        Insert: {
          amount?: number
          category?: string
          created_at?: string
          created_by: string
          department_id?: string | null
          description?: string | null
          due_date?: string | null
          expense_date?: string
          id?: string
          invoice_number?: string | null
          notes?: string | null
          organization_id: string
          payment_date?: string | null
          payment_method_id?: string | null
          recurrence?: string | null
          status?: string
          title: string
          updated_at?: string | null
          vendor?: string | null
        }
        Update: {
          amount?: number
          category?: string
          created_at?: string
          created_by?: string
          department_id?: string | null
          description?: string | null
          due_date?: string | null
          expense_date?: string
          id?: string
          invoice_number?: string | null
          notes?: string | null
          organization_id?: string
          payment_date?: string | null
          payment_method_id?: string | null
          recurrence?: string | null
          status?: string
          title?: string
          updated_at?: string | null
          vendor?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "operational_expenses_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operational_expenses_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operational_expenses_payment_method_id_fkey"
            columns: ["payment_method_id"]
            isOneToOne: false
            referencedRelation: "payment_methods"
            referencedColumns: ["id"]
          },
        ]
      }
      operations: {
        Row: {
          assigned_to: string | null
          client_id: string | null
          created_at: string
          created_by: string
          description: string | null
          end_date: string | null
          id: string
          location: string | null
          notes: string | null
          organization_id: string
          priority: string
          start_date: string | null
          status: Database["public"]["Enums"]["operation_status"]
          title: string
          updated_at: string | null
        }
        Insert: {
          assigned_to?: string | null
          client_id?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          end_date?: string | null
          id?: string
          location?: string | null
          notes?: string | null
          organization_id: string
          priority?: string
          start_date?: string | null
          status?: Database["public"]["Enums"]["operation_status"]
          title: string
          updated_at?: string | null
        }
        Update: {
          assigned_to?: string | null
          client_id?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          end_date?: string | null
          id?: string
          location?: string | null
          notes?: string | null
          organization_id?: string
          priority?: string
          start_date?: string | null
          status?: Database["public"]["Enums"]["operation_status"]
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "operations_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          client_id: string | null
          created_at: string
          created_by: string
          delivery_address: string | null
          delivery_date: string | null
          id: string
          notes: string | null
          order_number: string | null
          organization_id: string
          payment_method: string | null
          payment_status: string | null
          proposal_id: string | null
          status: string
          total_value: number
          updated_at: string | null
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          created_by: string
          delivery_address?: string | null
          delivery_date?: string | null
          id?: string
          notes?: string | null
          order_number?: string | null
          organization_id: string
          payment_method?: string | null
          payment_status?: string | null
          proposal_id?: string | null
          status?: string
          total_value?: number
          updated_at?: string | null
        }
        Update: {
          client_id?: string | null
          created_at?: string
          created_by?: string
          delivery_address?: string | null
          delivery_date?: string | null
          id?: string
          notes?: string | null
          order_number?: string | null
          organization_id?: string
          payment_method?: string | null
          payment_status?: string | null
          proposal_id?: string | null
          status?: string
          total_value?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_catalogs: {
        Row: {
          created_at: string
          created_by: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          organization_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          organization_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          organization_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organization_catalogs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          accent_color: string | null
          address: string | null
          city: string | null
          cnpj: string | null
          created_at: string
          email: string
          has_ekkoa_access: boolean
          id: string
          is_active: boolean
          logo_url: string | null
          max_users: number
          name: string
          phone: string | null
          plan: string
          primary_color: string | null
          secondary_color: string | null
          state: string | null
          trading_name: string | null
          updated_at: string | null
          website: string | null
          zip_code: string | null
        }
        Insert: {
          accent_color?: string | null
          address?: string | null
          city?: string | null
          cnpj?: string | null
          created_at?: string
          email: string
          has_ekkoa_access?: boolean
          id?: string
          is_active?: boolean
          logo_url?: string | null
          max_users?: number
          name: string
          phone?: string | null
          plan?: string
          primary_color?: string | null
          secondary_color?: string | null
          state?: string | null
          trading_name?: string | null
          updated_at?: string | null
          website?: string | null
          zip_code?: string | null
        }
        Update: {
          accent_color?: string | null
          address?: string | null
          city?: string | null
          cnpj?: string | null
          created_at?: string
          email?: string
          has_ekkoa_access?: boolean
          id?: string
          is_active?: boolean
          logo_url?: string | null
          max_users?: number
          name?: string
          phone?: string | null
          plan?: string
          primary_color?: string | null
          secondary_color?: string | null
          state?: string | null
          trading_name?: string | null
          updated_at?: string | null
          website?: string | null
          zip_code?: string | null
        }
        Relationships: []
      }
      payment_methods: {
        Row: {
          created_at: string
          created_by: string
          description: string | null
          id: string
          is_active: boolean
          method_type: string
          name: string
          organization_id: string
          sort_order: number | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          is_active?: boolean
          method_type?: string
          name: string
          organization_id: string
          sort_order?: number | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          is_active?: boolean
          method_type?: string
          name?: string
          organization_id?: string
          sort_order?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_methods_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          brand: string | null
          category: string | null
          cost: number | null
          created_at: string
          created_by: string
          description: string | null
          id: string
          image_url: string | null
          is_active: boolean
          min_stock: number
          name: string
          organization_id: string
          price: number
          sku: string | null
          specifications: Json | null
          stock: number
          unit: string
          updated_at: string | null
        }
        Insert: {
          brand?: string | null
          category?: string | null
          cost?: number | null
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          min_stock?: number
          name: string
          organization_id: string
          price?: number
          sku?: string | null
          specifications?: Json | null
          stock?: number
          unit?: string
          updated_at?: string | null
        }
        Update: {
          brand?: string | null
          category?: string | null
          cost?: number | null
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          min_stock?: number
          name?: string
          organization_id?: string
          price?: number
          sku?: string | null
          specifications?: Json | null
          stock?: number
          unit?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "products_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string
          id: string
          is_active: boolean
          is_email_verified: boolean
          name: string
          organization_id: string
          phone: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email: string
          id?: string
          is_active?: boolean
          is_email_verified?: boolean
          name: string
          organization_id: string
          phone?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string
          id?: string
          is_active?: boolean
          is_email_verified?: boolean
          name?: string
          organization_id?: string
          phone?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      proposal_items: {
        Row: {
          created_at: string
          description: string
          discount_percent: number | null
          id: string
          organization_id: string
          product_id: string | null
          proposal_id: string
          quantity: number
          sort_order: number | null
          total_price: number
          unit_price: number
        }
        Insert: {
          created_at?: string
          description: string
          discount_percent?: number | null
          id?: string
          organization_id: string
          product_id?: string | null
          proposal_id: string
          quantity?: number
          sort_order?: number | null
          total_price?: number
          unit_price?: number
        }
        Update: {
          created_at?: string
          description?: string
          discount_percent?: number | null
          id?: string
          organization_id?: string
          product_id?: string | null
          proposal_id?: string
          quantity?: number
          sort_order?: number | null
          total_price?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "proposal_items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposal_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposal_items_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
        ]
      }
      proposals: {
        Row: {
          assigned_to: string | null
          client_id: string | null
          created_at: string
          created_by: string
          description: string | null
          discount_percent: number | null
          discount_value: number | null
          final_value: number
          id: string
          notes: string | null
          organization_id: string
          status: string
          title: string
          total_value: number
          updated_at: string | null
          valid_until: string | null
        }
        Insert: {
          assigned_to?: string | null
          client_id?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          discount_percent?: number | null
          discount_value?: number | null
          final_value?: number
          id?: string
          notes?: string | null
          organization_id: string
          status?: string
          title: string
          total_value?: number
          updated_at?: string | null
          valid_until?: string | null
        }
        Update: {
          assigned_to?: string | null
          client_id?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          discount_percent?: number | null
          discount_value?: number | null
          final_value?: number
          id?: string
          notes?: string | null
          organization_id?: string
          status?: string
          title?: string
          total_value?: number
          updated_at?: string | null
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "proposals_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposals_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      saas_modules: {
        Row: {
          created_at: string
          description: string | null
          display_name: string
          icon: string | null
          id: string
          is_active: boolean
          name: string
          sort_order: number | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          display_name: string
          icon?: string | null
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          display_name?: string
          icon?: string | null
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      saas_plan_modules: {
        Row: {
          created_at: string
          id: string
          module_id: string
          plan_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          module_id: string
          plan_id: string
        }
        Update: {
          created_at?: string
          id?: string
          module_id?: string
          plan_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saas_plan_modules_module_id_fkey"
            columns: ["module_id"]
            isOneToOne: false
            referencedRelation: "saas_modules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saas_plan_modules_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "saas_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      saas_plans: {
        Row: {
          created_at: string
          description: string | null
          display_name: string
          features: Json | null
          id: string
          is_active: boolean
          max_storage_mb: number
          max_users: number
          name: string
          price_monthly: number
          price_yearly: number | null
          sort_order: number | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          display_name: string
          features?: Json | null
          id?: string
          is_active?: boolean
          max_storage_mb?: number
          max_users?: number
          name: string
          price_monthly?: number
          price_yearly?: number | null
          sort_order?: number | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          display_name?: string
          features?: Json | null
          id?: string
          is_active?: boolean
          max_storage_mb?: number
          max_users?: number
          name?: string
          price_monthly?: number
          price_yearly?: number | null
          sort_order?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      schedules: {
        Row: {
          assigned_to: string | null
          client_id: string | null
          created_at: string
          created_by: string | null
          description: string | null
          end_time: string | null
          id: string
          location: string | null
          notes: string | null
          operation_id: string | null
          organization_id: string
          schedule_type: string
          scheduled_date: string
          start_time: string | null
          status: string
          title: string
          updated_at: string | null
        }
        Insert: {
          assigned_to?: string | null
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          end_time?: string | null
          id?: string
          location?: string | null
          notes?: string | null
          operation_id?: string | null
          organization_id: string
          schedule_type?: string
          scheduled_date: string
          start_time?: string | null
          status?: string
          title: string
          updated_at?: string | null
        }
        Update: {
          assigned_to?: string | null
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          end_time?: string | null
          id?: string
          location?: string | null
          notes?: string | null
          operation_id?: string | null
          organization_id?: string
          schedule_type?: string
          scheduled_date?: string
          start_time?: string | null
          status?: string
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "schedules_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedules_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedules_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      super_admins: {
        Row: {
          created_at: string
          email: string
          id: string
          is_active: boolean
          name: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      support_tickets: {
        Row: {
          assigned_to: string | null
          category: string
          closed_at: string | null
          created_at: string
          created_by: string
          description: string | null
          id: string
          organization_id: string
          priority: string
          resolved_at: string | null
          status: string
          ticket_number: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          assigned_to?: string | null
          category?: string
          closed_at?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          organization_id: string
          priority?: string
          resolved_at?: string | null
          status?: string
          ticket_number?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          assigned_to?: string | null
          category?: string
          closed_at?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          organization_id?: string
          priority?: string
          resolved_at?: string | null
          status?: string
          ticket_number?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "support_tickets_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_user_organization_id: { Args: { _user_id: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_consultor_tecnico: { Args: { _user_id: string }; Returns: boolean }
      is_financeiro: { Args: { _user_id: string }; Returns: boolean }
      is_operacional: { Args: { _user_id: string }; Returns: boolean }
      is_privileged_user: { Args: { _user_id: string }; Returns: boolean }
      is_vendedor: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      app_role:
        | "super_admin"
        | "admin"
        | "gestor"
        | "user"
        | "visitante"
        | "financeiro"
        | "vendedor"
        | "consultor_tecnico"
        | "operacional"
      canal_origem_enum:
        | "WIDGET"
        | "WHATSAPP"
        | "MESSENGER"
        | "INSTAGRAM"
        | "TELEGRAM"
      lead_stage:
        | "novo"
        | "qualificacao"
        | "em_teste"
        | "proposta"
        | "negociacao"
        | "fechado_ganho"
        | "fechado_perdido"
        | "feedback"
        | "instalacao_definitiva"
        | "cadastramento"
      operation_status:
        | "pendente"
        | "em_andamento"
        | "concluida"
        | "cancelada"
        | "instalacao_agendada"
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
      app_role: [
        "super_admin",
        "admin",
        "gestor",
        "user",
        "visitante",
        "financeiro",
        "vendedor",
        "consultor_tecnico",
        "operacional",
      ],
      canal_origem_enum: [
        "WIDGET",
        "WHATSAPP",
        "MESSENGER",
        "INSTAGRAM",
        "TELEGRAM",
      ],
      lead_stage: [
        "novo",
        "qualificacao",
        "em_teste",
        "proposta",
        "negociacao",
        "fechado_ganho",
        "fechado_perdido",
        "feedback",
        "instalacao_definitiva",
        "cadastramento",
      ],
      operation_status: [
        "pendente",
        "em_andamento",
        "concluida",
        "cancelada",
        "instalacao_agendada",
      ],
    },
  },
} as const
