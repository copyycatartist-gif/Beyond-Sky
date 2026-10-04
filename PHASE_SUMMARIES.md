# Beyond Sky Micro-Credit LMS — Implementation Phase Summaries

---

## Phase 1: Foundation (Data Model, Auth, Roles, RLS, Client & Group Management)

### What Was Built
- **Database Schema & Migrations (`001_extensions.sql` to `005_groups.sql`, `012_rls_policies.sql`, `013_seed.sql`):**
  - PostgreSQL extensions (`pgcrypto`, `moddatetime`, `unaccent`).
  - Runtime `settings` table populated with default parameters (`interest_multiplier = 1.365`, `fee_percentage = 0.05`, `max_group_size = 15`, `term_weeks = 13`, `weeks_to_defaulter_status = 2`).
  - `users` table linked to `auth.users` with 4 distinct roles (`loan_officer`, `manager`, `supervisor`, `accountant_admin`).
  - Server-side Luhn algorithm (`luhn_check_digit`, `luhn_valid`) generating immutable client account numbers (`BSM-######-C`).
  - `clients` table with comprehensive KYC, declared daily income, and guarantor fields.
  - `groups` and `group_members` tables with database-level trigger enforcing the strict 15-member cap.
  - Granular Row-Level Security (RLS) policies enforcing role boundaries at the database layer.
- **Client & Group UI Modules:**
  - Client Directory (`/clients`) with live search by name, phone, national ID, market location, and status.
  - Client Registration Form (`/clients/new`) capturing KYC, daily cashflow, and guarantor data.
  - Client Detail View (`/clients/[id]`) with active group membership, active loan summary, and historical applications.
  - Group Directory (`/groups`) with visual capacity meters (0/15 members) and creation form (`/groups/new`).
  - Interactive Group Manager (`/groups/[id]`) allowing assignment and removal of members with hard cap validation.
- **Testing:**
  - Pure TypeScript Luhn unit test suite (`src/lib/luhn.test.ts`) covering check digit generation, formatting, and edge cases.

### Assumptions Made
1. Account numbers are globally unique and sequential across the entire institution.
2. Market locations are stored as free-text strings with room for market stalls/shed numbers.

### Open Questions for Business Owner
- *Should client registration require physical photo upload or biometric capture in a future phase?*
- *Are guarantor phone numbers verified via SMS OTP at registration time?*

---

## Phase 2: Loan Core (Application, Two-Step Approval, Disbursement, Ledger, Refinancing)

### What Was Built
- **Loan Schema & Computation Triggers (`006_loans.sql`, `007_repayment_schedule.sql`):**
  - Sequential loan numbering per client (`{account_number}-L##`).
  - Runtime computation of 5% processing fee, flat 1.365x interest, total repayable, and 13 weekly installments.
  - Advisory debt-to-income eligibility calculation comparing weekly installment against weekly capacity (daily income × 7).
  - One-active-loan-per-client database constraint.
- **Two-Step Approval Workflow (`/api/loans/approve`, `LoanActions`):**
  - Loan officers submit applications in `pending` status.
  - Managers can approve or reject with a mandatory rejection reason.
- **Disbursement & Append-Only Ledger (`/api/loans/disburse`, `008_transactions.sql`):**
  - Manager authorizes disbursement with Cash or MoMo payment method.
  - Automatically generates 13-week `repayment_schedule` rows.
  - Posts immutable debit transaction for net cash disbursed and credit transaction for 5% processing fee.
  - Refinancing netting logic: automatically deducts outstanding balance of old loan from new loan proceeds, closes old loan as `refinanced`, and links records via `previous_loan_id`.
  - Sends automated SMS disbursement notice to client.

### Assumptions Made
1. Processing fee is recognized as immediate income on the day of disbursement.
2. Loans always start with a 13-week schedule with weekly installments due 7 days apart.

### Open Questions for Business Owner
- *If a client refinances, should the 5% fee be charged on the gross new principal or only on the fresh cash disbursed? (Currently implemented on gross principal as standard in microfinance).*

---

## Phase 3: Collections & Arrears Tracking

### What Was Built
- **Supervisor Collection Portal (`/repayments`, `RepaymentForm`, `/api/repayments`):**
  - Supports Cash and Mobile Money (MoMo) collections.
  - Mandatory MoMo transaction reference field for reconciliation.
  - Live FIFO payment preview simulating allocation against oldest unpaid weekly installments.
  - Postgres trigger (`apply_repayment_fifo`) executing automatic FIFO application and closing loans upon full settlement.
  - Automatic SMS payment confirmation sent to client with remaining balance.
- **Daily Escalation Job (`/api/cron/daily-loan-check`, Supabase Edge Function):**
  - Automated job flags overdue installments (`due_date < today`).
  - Tracks consecutive unpaid installments; escalates client and loan to `defaulted` after 2 consecutive misses.
  - Dispatches automated overdue warning and defaulter SMS alerts.
- **Overdue & Defaulter Directory (`/overdue`):**
  - Filterable dashboard showing overdue weeks, days delinquent, and total arrears.
  - Manual execution trigger for staff testing.

### Assumptions Made
1. Partial payments are accepted and applied FIFO to oldest unpaid installment; overpayments roll forward to subsequent weeks.
2. No discount or interest reduction is granted for early full settlement.

---

## Phase 4: Notifications & Management Reporting

### What Was Built
- **SMS Gateway Layer (`src/lib/sms/`):**
  - `SmsProvider` interface supporting swappable gateways (Arkesel Ghana REST API implemented, with fallback stub for offline testing).
  - Outgoing `sms_log` table with delivery status tracking.
  - SMS notification dashboard (`/sms`).
- **Executive Dashboard (`/dashboard`):**
  - KPI cards: Total Disbursed, Total Collected, Portfolio Outstanding, Fee Revenue, and PAR 30.
  - Recharts horizontal bar chart visualizing Portfolio At Risk (PAR 1 / 7 / 30).
  - Top Arrears alert feed and recent transactions table.
- **Financial Ledger & Reports (`/reports`):**
  - SQL view `client_ledger_summary` dynamically aggregating transactions — zero risk of ledger drift.
  - Weekly collection and recovery performance report (expected vs collected vs gap %).
- **Business Rule Settings (`/settings`, `/api/settings`):**
  - Dedicated admin interface allowing `accountant_admin` to modify interest multipliers, fees, group size caps, and defaulter thresholds at runtime.

---

## Phase 5: Data Migration, Testing & Polish

### What Was Built
- **Excel / CSV Migration Tool (`/import`, `CsvImporter`, `/api/import`):**
  - Browser-side CSV parsing with downloadable sample template.
  - Validates KYC, phone, national ID, principal, and historical balances.
  - Generates client accounts with valid Luhn checksums and creates active ledger entries.
  - Produces line-by-line error reports for manual review.
- **RLS & Ledger Integrity Tests (`supabase/tests/rls_policies.sql`):**
  - Verifies that direct UPDATE or DELETE operations on the `transactions` table are blocked.
  - Verifies database-level enforcement of the 15-member group cap.
  - Tests Luhn algorithm generation and check digit validation.
- **Responsive Mobile / Tablet Polish:**
  - Field-optimized UI layout designed for loan officers and supervisors using phones and tablets at market centers.
