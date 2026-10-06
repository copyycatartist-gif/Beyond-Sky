// Auto-generated & expanded types from Supabase schema.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type UserRole = 'loan_officer' | 'manager' | 'supervisor' | 'accountant_admin'
export type ClientStatus = 'active' | 'inactive' | 'defaulted'
export type MaritalStatus = 'married' | 'unmarried' | 'abandoned' | 'divorced' | 'widow'
export type GroupStatus = 'active' | 'inactive' | 'suspended' | 'dissolved' | 'forming'
export type GroupType = 'solidarity' | 'individual' | 'cooperative'
export type GroupMemberRole = 'leader' | 'treasurer' | 'secretary' | 'member'
export type AttendanceStatus = 'present' | 'absent' | 'excused' | 'late'
export type WaitlistStatus = 'waiting' | 'promoted' | 'expired' | 'removed'
export type GroupDocumentType = 'constitution' | 'minutes' | 'photo' | 'agreement' | 'other'
export type ClientTier = 'bronze' | 'silver' | 'gold' | 'platinum'
export type LoanStatus = 'pending' | 'approved' | 'rejected' | 'active' | 'closed' | 'defaulted' | 'refinanced'
export type InstallmentStatus = 'upcoming' | 'paid' | 'partially_paid' | 'overdue' | 'defaulted'
export type TransactionType = 'disbursement' | 'repayment' | 'fee' | 'reversal'
export type TransactionDirection = 'debit' | 'credit'
export type PaymentMethod = 'cash' | 'momo'
export type SmsMessageType = 'reminder' | 'confirmation' | 'approval' | 'disbursement' | 'overdue' | 'defaulter' | 'broadcast'
export type SmsStatus = 'sent' | 'failed' | 'pending'

export interface Database {
  public: {
    Tables: {
      settings: {
        Row: {
          id: string
          key: string
          value: string
          description: string | null
          updated_by: string | null
          updated_at: string
        }
        Insert: {
          id?: string
          key: string
          value: string
          description?: string | null
          updated_by?: string | null
          updated_at?: string
        }
        Update: {
          key?: string
          value?: string
          description?: string | null
          updated_by?: string | null
        }
        Relationships: []
      }
      users: {
        Row: {
          id: string
          full_name: string
          email: string
          role: UserRole
          branch: string | null
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          full_name: string
          email: string
          role?: UserRole
          branch?: string | null
          is_active?: boolean
        }
        Update: {
          full_name?: string
          email?: string
          role?: UserRole
          branch?: string | null
          is_active?: boolean
        }
        Relationships: []
      }
      clients: {
        Row: {
          id: string
          account_number: string
          full_name: string
          phone_number: string
          national_id: string
          business_type: string
          market_location: string
          daily_business_income: number
          branch: string | null
          area: string | null
          spouse_or_father_name: string | null
          age: number | null
          date_of_birth: string | null
          monthly_income: number | null
          residential_address: string | null
          permanent_address: string | null
          business_address: string | null
          marital_status: MaritalStatus
          religion: string | null
          place_of_worship: string | null
          religious_leader_name: string | null
          religious_leader_phone: string | null
          guarantor_name: string
          guarantor_gender: string | null
          guarantor_account_number: string | null
          guarantor_phone: string
          guarantor_national_id: string
          guarantor_relationship: string
          guarantor_business: string
          guarantor_occupation: string | null
          guarantor_employer: string | null
          guarantor_dob: string | null
          guarantor_residential_address: string | null
          guarantor_religion: string | null
          guarantor_place_of_worship: string | null
          status: ClientStatus
          tier: ClientTier | null
          is_watchlisted: boolean | null
          photo_url: string | null
          archived_at: string | null
          archived_by: string | null
          date_registered: string
          created_by: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          account_number?: string
          full_name: string
          phone_number: string
          national_id: string
          business_type: string
          market_location: string
          daily_business_income: number
          branch?: string | null
          area?: string | null
          spouse_or_father_name?: string | null
          age?: number | null
          date_of_birth?: string | null
          monthly_income?: number | null
          residential_address?: string | null
          permanent_address?: string | null
          business_address?: string | null
          marital_status?: MaritalStatus
          religion?: string | null
          place_of_worship?: string | null
          religious_leader_name?: string | null
          religious_leader_phone?: string | null
          guarantor_name: string
          guarantor_gender?: string | null
          guarantor_account_number?: string | null
          guarantor_phone: string
          guarantor_national_id: string
          guarantor_relationship: string
          guarantor_business: string
          guarantor_occupation?: string | null
          guarantor_employer?: string | null
          guarantor_dob?: string | null
          guarantor_residential_address?: string | null
          guarantor_religion?: string | null
          guarantor_place_of_worship?: string | null
          status?: ClientStatus
          date_registered?: string
          created_by: string
          notes?: string | null
          tier?: ClientTier | null
          is_watchlisted?: boolean | null
          watchlist_reason?: string | null
          watchlisted_by?: string | null
          watchlisted_at?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          emergency_contact_relationship?: string | null
          last_activity_at?: string | null
          is_dormant?: boolean | null
          data_protection_consent?: boolean | null
          consent_date?: string | null
          photo_url?: string | null
          id_document_url?: string | null
          profile_completeness?: number | null
        }
        Update: {
          full_name?: string
          phone_number?: string
          national_id?: string
          business_type?: string
          market_location?: string
          daily_business_income?: number
          branch?: string | null
          area?: string | null
          spouse_or_father_name?: string | null
          age?: number | null
          date_of_birth?: string | null
          monthly_income?: number | null
          residential_address?: string | null
          permanent_address?: string | null
          business_address?: string | null
          marital_status?: MaritalStatus
          religion?: string | null
          place_of_worship?: string | null
          religious_leader_name?: string | null
          religious_leader_phone?: string | null
          guarantor_name?: string
          guarantor_gender?: string | null
          guarantor_account_number?: string | null
          guarantor_phone?: string
          guarantor_national_id?: string
          guarantor_relationship?: string
          guarantor_business?: string
          guarantor_occupation?: string | null
          guarantor_employer?: string | null
          guarantor_dob?: string | null
          guarantor_residential_address?: string | null
          guarantor_religion?: string | null
          guarantor_place_of_worship?: string | null
          status?: ClientStatus
          archived_at?: string | null
          archived_by?: string | null
          notes?: string | null
          tier?: ClientTier | null
          is_watchlisted?: boolean | null
          watchlist_reason?: string | null
          watchlisted_by?: string | null
          watchlisted_at?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          emergency_contact_relationship?: string | null
          last_activity_at?: string | null
          is_dormant?: boolean | null
          data_protection_consent?: boolean | null
          consent_date?: string | null
          photo_url?: string | null
          id_document_url?: string | null
          profile_completeness?: number | null
        }
        Relationships: []
      }
      groups: {
        Row: {
          id: string
          group_number: string
          name: string
          branch: string | null
          area: string | null
          meeting_day: string | null
          meeting_place: string | null
          max_members: number
          status: GroupStatus
          leader_id: string | null
          group_type: GroupType | null
          description: string | null
          photo_url: string | null
          formed_at: string | null
          archived_at: string | null
          archived_by: string | null
          dissolution_reason: string | null
          min_member_tenure_days: number | null
          require_guarantor_chain: boolean | null
          created_by: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          group_number?: string
          name: string
          branch?: string | null
          area?: string | null
          meeting_day?: string | null
          meeting_place?: string | null
          max_members?: number
          status?: GroupStatus
          leader_id?: string | null
          group_type?: GroupType | null
          description?: string | null
          photo_url?: string | null
          formed_at?: string | null
          min_member_tenure_days?: number | null
          require_guarantor_chain?: boolean | null
          created_by: string
        }
        Update: {
          name?: string
          branch?: string | null
          area?: string | null
          meeting_day?: string | null
          meeting_place?: string | null
          max_members?: number
          status?: GroupStatus
          leader_id?: string | null
          group_type?: GroupType | null
          description?: string | null
          photo_url?: string | null
          formed_at?: string | null
          archived_at?: string | null
          archived_by?: string | null
          dissolution_reason?: string | null
        }
        Relationships: []
      }
      group_members: {
        Row: {
          id: string
          client_id: string
          group_id: string
          date_joined: string
          date_left: string | null
          role: GroupMemberRole | null
          removal_reason: string | null
          removed_by: string | null
          attendance_count: number | null
          contributions_total: number | null
          created_at: string
        }
        Insert: {
          id?: string
          client_id: string
          group_id: string
          date_joined?: string
          date_left?: string | null
          role?: GroupMemberRole | null
          removal_reason?: string | null
          removed_by?: string | null
          attendance_count?: number | null
          contributions_total?: number | null
        }
        Update: {
          date_left?: string | null
          role?: GroupMemberRole | null
          removal_reason?: string | null
          removed_by?: string | null
          attendance_count?: number | null
          contributions_total?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "group_members_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_members_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          }
        ]
      }
      group_meetings: {
        Row: {
          id: string
          group_id: string
          meeting_date: string
          meeting_place: string | null
          agenda: string | null
          notes: string | null
          created_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          group_id: string
          meeting_date: string
          meeting_place?: string | null
          agenda?: string | null
          notes?: string | null
          created_by?: string | null
        }
        Update: {
          meeting_date?: string
          meeting_place?: string | null
          agenda?: string | null
          notes?: string | null
        }
        Relationships: []
      }
      meeting_attendance: {
        Row: {
          id: string
          meeting_id: string
          client_id: string
          status: AttendanceStatus
          notes: string | null
          recorded_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          meeting_id: string
          client_id: string
          status?: AttendanceStatus
          notes?: string | null
          recorded_by?: string | null
        }
        Update: {
          status?: AttendanceStatus
          notes?: string | null
          recorded_by?: string | null
        }
        Relationships: []
      }
      group_waitlist: {
        Row: {
          id: string
          group_id: string
          client_id: string
          priority: number | null
          date_added: string
          added_by: string | null
          notes: string | null
          status: WaitlistStatus
        }
        Insert: {
          id?: string
          group_id: string
          client_id: string
          priority?: number | null
          added_by?: string | null
          notes?: string | null
          status?: WaitlistStatus
        }
        Update: {
          priority?: number | null
          notes?: string | null
          status?: WaitlistStatus
        }
        Relationships: [
          {
            foreignKeyName: "group_waitlist_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_waitlist_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          }
        ]
      }
      group_documents: {
        Row: {
          id: string
          group_id: string
          title: string
          document_type: GroupDocumentType | null
          file_url: string
          file_size: number | null
          uploaded_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          group_id: string
          title: string
          document_type?: GroupDocumentType | null
          file_url: string
          file_size?: number | null
          uploaded_by?: string | null
        }
        Update: {
          title?: string
          document_type?: GroupDocumentType | null
          file_url?: string
          file_size?: number | null
        }
        Relationships: []
      }
      group_notes: {
        Row: {
          id: string
          group_id: string
          content: string
          created_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          group_id: string
          content: string
          created_by?: string | null
        }
        Update: {
          content?: string
        }
        Relationships: []
      }
      loans: {
        Row: {
          id: string
          loan_number: string
          client_id: string
          cycle_number: number
          previous_loan_amount: number
          principal: number
          monthly_interest_rate: number
          security_deposit_pct: number
          security_deposit_amount: number
          processing_fee_pct: number
          processing_fee_amount: number
          loan_risk_fund_pct: number
          loan_risk_fund_amount: number
          total_deductions: number
          net_disbursement_amount: number
          fee_amount: number
          interest_multiplier: number
          total_repayable: number
          weekly_installment: number
          amount_disbursed_to_client: number | null
          penal_interest_rate: number
          term_weeks: number
          agreement_town: string | null
          agreement_district: string | null
          agreement_region: string | null
          status: LoanStatus
          submitted_by: string
          approved_by: string | null
          approval_date: string | null
          rejection_reason: string | null
          disbursement_date: string | null
          previous_loan_id: string | null
          declared_weekly_income: number | null
          eligibility_ratio: number | null
          eligibility_flag: string | null
          group_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          loan_number?: string
          client_id: string
          cycle_number?: number
          previous_loan_amount?: number
          principal: number
          monthly_interest_rate?: number
          security_deposit_pct?: number
          security_deposit_amount?: number
          processing_fee_pct?: number
          processing_fee_amount?: number
          loan_risk_fund_pct?: number
          loan_risk_fund_amount?: number
          total_deductions?: number
          net_disbursement_amount?: number
          fee_amount?: number
          interest_multiplier?: number
          total_repayable?: number
          weekly_installment?: number
          term_weeks?: number
          penal_interest_rate?: number
          agreement_town?: string | null
          agreement_district?: string | null
          agreement_region?: string | null
          status?: LoanStatus
          submitted_by: string
          approved_by?: string | null
          approval_date?: string | null
          rejection_reason?: string | null
          disbursement_date?: string | null
          previous_loan_id?: string | null
          group_id?: string | null
        }
        Update: {
          status?: LoanStatus
          approved_by?: string | null
          approval_date?: string | null
          rejection_reason?: string | null
          disbursement_date?: string | null
          amount_disbursed_to_client?: number | null
          group_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "loans_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          }
        ]
      }
      repayment_schedule: {
        Row: {
          id: string
          loan_id: string
          installment_number: number
          due_date: string
          expected_amount: number
          paid_amount: number
          balance: number
          status: InstallmentStatus
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          loan_id: string
          installment_number: number
          due_date: string
          expected_amount: number
          paid_amount?: number
          status?: InstallmentStatus
        }
        Update: {
          paid_amount?: number
          status?: InstallmentStatus
        }
        Relationships: [
          {
            foreignKeyName: "repayment_schedule_loan_id_fkey"
            columns: ["loan_id"]
            isOneToOne: false
            referencedRelation: "loans"
            referencedColumns: ["id"]
          }
        ]
      }
      transactions: {
        Row: {
          id: string
          loan_id: string
          client_id: string
          type: TransactionType
          amount: number
          direction: TransactionDirection
          method: PaymentMethod
          momo_reference: string | null
          recorded_by: string
          transaction_date: string
          reversal_of: string | null
          reversal_reason: string | null
          created_at: string
        }
        Insert: {
          id?: string
          loan_id: string
          client_id: string
          type: TransactionType
          amount: number
          direction: TransactionDirection
          method?: PaymentMethod
          momo_reference?: string | null
          recorded_by: string
          transaction_date?: string
          reversal_of?: string | null
          reversal_reason?: string | null
        }
        Update: never
        Relationships: []
      }
      sms_log: {
        Row: {
          id: string
          client_id: string | null
          loan_id: string | null
          message_type: SmsMessageType
          phone: string
          message_body: string
          status: SmsStatus
          provider: string
          provider_response: Json | null
          sent_at: string
        }
        Insert: {
          id?: string
          client_id?: string | null
          loan_id?: string | null
          message_type: SmsMessageType
          phone: string
          message_body: string
          status?: SmsStatus
          provider?: string
          provider_response?: Json | null
          sent_at?: string
        }
        Update: {
          status?: SmsStatus
          provider_response?: Json | null
        }
        Relationships: []
      }
      client_notes: {
        Row: {
          id: string
          client_id: string
          note_text: string
          created_by: string
          created_at: string
        }
        Insert: {
          id?: string
          client_id: string
          note_text: string
          created_by: string
          created_at?: string
        }
        Update: {
          id?: string
          client_id?: string
          note_text?: string
          created_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_notes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_notes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ]
      }
      client_tasks: {
        Row: {
          id: string
          client_id: string
          title: string
          description: string | null
          due_date: string
          status: 'pending' | 'completed' | 'cancelled'
          assigned_to: string | null
          created_by: string
          created_at: string
          completed_at: string | null
        }
        Insert: {
          id?: string
          client_id: string
          title: string
          description?: string | null
          due_date: string
          status?: 'pending' | 'completed' | 'cancelled'
          assigned_to?: string | null
          created_by: string
          created_at?: string
          completed_at?: string | null
        }
        Update: {
          id?: string
          client_id?: string
          title?: string
          description?: string | null
          due_date?: string
          status?: 'pending' | 'completed' | 'cancelled'
          assigned_to?: string | null
          created_by?: string
          created_at?: string
          completed_at?: string | null
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          id: string
          table_name: string
          record_id: string
          action: string
          changed_by: string | null
          old_values: Json | null
          new_values: Json | null
          changes_diff: Json | null
          ip_address: string | null
          created_at: string
        }
        Insert: {
          id?: string
          table_name: string
          record_id: string
          action: string
          changed_by?: string | null
          old_values?: Json | null
          new_values?: Json | null
          changes_diff?: Json | null
          ip_address?: string | null
          created_at?: string
        }
        Update: {
          [key: string]: Json | undefined
        }
        Relationships: []
      }
    }
    Views: {
      client_ledger_summary: {
        Row: {
          client_id: string
          account_number: string
          full_name: string
          loan_id: string
          loan_number: string
          principal: number
          total_repayable: number
          weekly_installment: number
          term_weeks: number
          disbursement_date: string | null
          loan_status: LoanStatus
          total_disbursed: number
          total_fees_collected: number
          total_repaid: number
          total_reversals: number
          outstanding_balance: number
        }
        Relationships: []
      }
      portfolio_summary: {
        Row: {
          active_loans: number
          closed_loans: number
          defaulted_loans: number
          pending_approvals: number
          total_disbursed: number
          total_collected: number
          total_fees: number
          total_outstanding: number
        }
        Relationships: []
      }
      par_report: {
        Row: {
          total_outstanding: number
          par1_amount: number
          par7_amount: number
          par30_amount: number
          par1_pct: number
          par7_pct: number
          par30_pct: number
        }
        Relationships: []
      }
      overdue_clients: {
        Row: {
          client_id: string
          account_number: string
          full_name: string
          phone_number: string
          client_status: ClientStatus
          loan_id: string
          loan_number: string
          loan_status: LoanStatus
          overdue_installments: number
          total_arrears: number
          oldest_overdue_date: string
          max_days_overdue: number
          loan_officer_name: string
        }
        Relationships: []
      }
      weekly_collection_performance: {
        Row: {
          week_start: string
          loans_due: number
          expected_amount: number
          collected_amount: number
          gap: number
          collection_rate_pct: number
        }
        Relationships: []
      }
    }
    Functions: {
      get_setting_numeric: {
        Args: { p_key: string }
        Returns: number
      }
      get_setting_int: {
        Args: { p_key: string }
        Returns: number
      }
      get_setting_text: {
        Args: { p_key: string }
        Returns: string
      }
      current_user_role: {
        Args: Record<string, never>
        Returns: UserRole
      }
      user_has_role: {
        Args: { roles: UserRole[] }
        Returns: boolean
      }
      luhn_check_digit: {
        Args: { digits: string }
        Returns: number
      }
      luhn_valid: {
        Args: { full_digits: string }
        Returns: boolean
      }
    }
    Enums: {
      user_role: UserRole
      client_status: ClientStatus
      marital_status: MaritalStatus
      group_status: GroupStatus
      group_type: GroupType
      loan_status: LoanStatus
      installment_status: InstallmentStatus
      transaction_type: TransactionType
      transaction_direction: TransactionDirection
      payment_method: PaymentMethod
      sms_message_type: SmsMessageType
      sms_status: SmsStatus
    }
  }
}
