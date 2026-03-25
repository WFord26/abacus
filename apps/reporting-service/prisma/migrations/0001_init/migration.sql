CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE SCHEMA IF NOT EXISTS reporting;

CREATE TABLE IF NOT EXISTS reporting.metric_aggregates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  metric_key TEXT NOT NULL,
  period TEXT NOT NULL,
  value NUMERIC(15, 2),
  metadata JSONB,
  computed_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (organization_id, metric_key, period)
);

CREATE TABLE IF NOT EXISTS reporting.report_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  report_type TEXT NOT NULL,
  period TEXT NOT NULL,
  data JSONB NOT NULL,
  generated_at TIMESTAMPTZ DEFAULT NOW()
);
