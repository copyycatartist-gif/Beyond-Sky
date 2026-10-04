# Beyond Sky Micro-Credit Loan Management System

A production-grade loan management web application for Beyond Sky Micro-Credit, replacing Excel-based record keeping with a fully auditable, role-secured ledger system.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14 (App Router), TypeScript, Tailwind CSS |
| Backend | Supabase (PostgreSQL, Auth, RLS, Edge Functions) |
| Charts | Recharts |
| SMS | Arkesel (Ghana SMS gateway, swappable via interface) |
| Hosting | Vercel (frontend) + Supabase (backend) |

---

## Prerequisites

- **Node.js** v18+ and **npm** v9+
- **Supabase CLI** (`npm install -g supabase`)
- A [Supabase](https://supabase.com) project (free tier works for development)
- An [Arkesel](https://arkesel.com) account for SMS (optional for local dev)

---

## Environment Setup

1. **Clone the repository** and install dependencies:

```bash
git clone <repo-url>
cd beyond-sky
npm install
```

2. **Copy the environment template:**

```bash
cp .env.example .env.local
```

3. **Fill in `.env.local`:**

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SMS_PROVIDER=arkesel
ARKESEL_API_KEY=your-arkesel-api-key
ARKESEL_SENDER_ID=BeyondSky
```

---

## Running Migrations

Migrations live in `supabase/migrations/`. To apply them:

```bash
# Link to your Supabase project
supabase link --project-ref your-project-ref

# Run all migrations
supabase db push

# OR apply locally with Supabase CLI dev environment
supabase start
supabase db reset  # applies all migrations + seed data
```

### Migration Order

| File | Purpose |
|---|---|
| `001_extensions.sql` | Enable pgcrypto, pg_cron, moddatetime |
| `002_settings.sql` | Business-rule settings table |
| `003_users.sql` | User profiles + roles |
| `004_clients.sql` | Client KYC + account number generation |
| `005_groups.sql` | Groups + group_members (15-member cap) |
| `006_loans.sql` | Loans + loan number generation |
| `007_repayment_schedule.sql` | Repayment schedule table |
| `008_transactions.sql` | Append-only transactions ledger |
| `009_sms_log.sql` | SMS send log |
| `010_audit_log.sql` | Audit log + triggers |
| `011_ledger_views.sql` | Derived SQL views (ledger, PAR, etc.) |
| `012_rls_policies.sql` | Row-Level Security policies |
| `013_seed.sql` | Development seed data |

---

## Configuring the SMS Provider

The SMS layer is behind a `SmsProvider` interface (`src/lib/sms/types.ts`). The active provider is selected by the `SMS_PROVIDER` environment variable.

### Switching Providers

1. Create a new file in `src/lib/sms/providers/` implementing the `SmsProvider` interface.
2. Register it in `src/lib/sms/factory.ts`.
3. Update `SMS_PROVIDER` in your environment.

No other code changes are needed.

### Supported Providers

| Provider | Env value | Notes |
|---|---|---|
| Arkesel | `arkesel` | Default. Ghana SMS gateway. |
| Hubtel | `hubtel` | Stub — implement by extending the interface. |
| mNotify | `mnotify` | Stub — implement by extending the interface. |

---

## Running Tests

```bash
# Unit tests (Jest)
npm test

# Run a specific test file
npm test -- src/lib/luhn.test.ts

# Type check
npm run type-check

# Lint
npm run lint
```

### RLS Policy Tests

See `supabase/tests/rls_policies.sql` for a pgTAP test suite that verifies each role's permissions at the database layer.

Run with:

```bash
supabase test db
```

---

## Development Seed Data

After running migrations, seed data is loaded automatically (`013_seed.sql`). This creates:

- 4 test users (one per role)
- 2 groups with 5 members each
- 10 test clients in various states
- Loans in all lifecycle states (pending, active, closed, defaulted)
- Repayment transactions demonstrating FIFO application

### Test User Credentials (local dev only)

| Email | Password | Role |
|---|---|---|
| officer@test.local | TestPass123! | loan_officer |
| manager@test.local | TestPass123! | manager |
| supervisor@test.local | TestPass123! | supervisor |
| admin@test.local | TestPass123! | accountant_admin |

---

## Backup & Restore

Supabase automatically backs up your database daily on paid plans. For Pro plans, point-in-time recovery (PITR) is available.

### Manual Backup

```bash
supabase db dump -f backup_$(date +%Y%m%d).sql
```

### Restore

```bash
psql "postgresql://postgres:your-password@db.your-project.supabase.co:5432/postgres" < backup_20260101.sql
```

> ⚠️ **Known Limitation:** This application has no offline support. It requires a live internet connection to Supabase. Offline sync is noted as future work.

---

## Phase Summaries

See [PHASE_SUMMARIES.md](./PHASE_SUMMARIES.md) for a running log of what was built in each phase, assumptions made, and open questions.

---

## Architecture Notes

- **All business rules are server-enforced.** The UI reflects what the database/API allows — it does not independently enforce eligibility, group caps, loan limits, or calculations.
- **The `transactions` table is append-only.** No UPDATE or DELETE is granted to any role. Corrections use reversal rows.
- **Settings are runtime-loaded.** Interest rate, fee percentage, term length, group cap, and the defaulter threshold are read from the `settings` table at request time — never hard-coded.
- **Account numbers are generated in Postgres,** not in application code, using a Luhn check digit for validation.
