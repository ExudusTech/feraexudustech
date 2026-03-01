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
      clients: {
        Row: {
          address: string | null
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
      inventory_items: {
        Row: {
          category: string | null
          created_at: string
          created_by: string
          description: string | null
          id: string
          location: string | null
          min_quantity: number
          name: string
          organization_id: string
          quantity: number
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
          id?: string
          location?: string | null
          min_quantity?: number
          name: string
          organization_id: string
          quantity?: number
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
          id?: string
          location?: string | null
          min_quantity?: number
          name?: string
          organization_id?: string
          quantity?: number
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
          client_id: string | null
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          created_at: string
          created_by: string
          description: string | null
          expected_close_date: string | null
          id: string
          organization_id: string
          position: number
          source: string | null
          stage: Database["public"]["Enums"]["lead_stage"]
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
          organization_id: string
          position?: number
          source?: string | null
          stage?: Database["public"]["Enums"]["lead_stage"]
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
          organization_id?: string
          position?: number
          source?: string | null
          stage?: Database["public"]["Enums"]["lead_stage"]
          title?: string
          updated_at?: string | null
          value?: number | null
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
      schedules: {
        Row: {
          assigned_to: string | null
          client_id: string | null
          created_at: string
          created_by: string
          description: string | null
          end_time: string | null
          id: string
          location: string | null
          notes: string | null
          operation_id: string | null
          organization_id: string
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
          created_by: string
          description?: string | null
          end_time?: string | null
          id?: string
          location?: string | null
          notes?: string | null
          operation_id?: string | null
          organization_id: string
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
          created_by?: string
          description?: string | null
          end_time?: string | null
          id?: string
          location?: string | null
          notes?: string | null
          operation_id?: string | null
          organization_id?: string
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
    }
    Enums: {
      app_role:
        | "super_admin"
        | "admin"
        | "gestor"
        | "user"
        | "visitante"
        | "financeiro"
      lead_stage:
        | "novo"
        | "qualificacao"
        | "proposta"
        | "negociacao"
        | "fechado_ganho"
        | "fechado_perdido"
      operation_status: "pendente" | "em_andamento" | "concluida" | "cancelada"
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
      ],
      lead_stage: [
        "novo",
        "qualificacao",
        "proposta",
        "negociacao",
        "fechado_ganho",
        "fechado_perdido",
      ],
      operation_status: ["pendente", "em_andamento", "concluida", "cancelada"],
    },
  },
} as const
