CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE SCHEMA IF NOT EXISTS documents;

CREATE TABLE IF NOT EXISTS documents.documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  uploaded_by UUID NOT NULL,
  filename TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size_bytes BIGINT,
  s3_key TEXT NOT NULL,
  s3_bucket TEXT NOT NULL,
  checksum TEXT,
  ocr_status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS documents.transaction_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID REFERENCES documents.documents(id),
  transaction_id UUID NOT NULL,
  organization_id UUID NOT NULL,
  linked_by UUID NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
