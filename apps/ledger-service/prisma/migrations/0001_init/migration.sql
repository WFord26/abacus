CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE SCHEMA IF NOT EXISTS ledger;

CREATE TABLE IF NOT EXISTS ledger.accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('cash', 'credit', 'expense', 'income', 'liability', 'equity')),
  code TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ledger.categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  name TEXT NOT NULL,
  parent_id UUID REFERENCES ledger.categories(id),
  color TEXT,
  is_active BOOLEAN DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS ledger.transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  account_id UUID REFERENCES ledger.accounts(id),
  date DATE NOT NULL,
  amount NUMERIC(15, 2) NOT NULL,
  description TEXT,
  merchant_raw TEXT,
  category_id UUID REFERENCES ledger.categories(id),
  review_status TEXT DEFAULT 'unreviewed' CHECK (review_status IN ('unreviewed', 'reviewed', 'flagged')),
  import_batch_id UUID,
  is_split BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ledger.transaction_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID REFERENCES ledger.transactions(id),
  organization_id UUID NOT NULL,
  amount NUMERIC(15, 2) NOT NULL,
  category_id UUID REFERENCES ledger.categories(id),
  description TEXT
);

CREATE TABLE IF NOT EXISTS ledger.import_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  filename TEXT,
  row_count INTEGER,
  imported_count INTEGER,
  duplicate_count INTEGER,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ledger.reconciliation_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  account_id UUID REFERENCES ledger.accounts(id),
  statement_date DATE,
  statement_balance NUMERIC(15, 2),
  status TEXT DEFAULT 'in_progress',
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
