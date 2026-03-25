CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE SCHEMA IF NOT EXISTS identity;

CREATE TABLE IF NOT EXISTS identity.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT,
  email_verified BOOLEAN DEFAULT FALSE,
  name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS identity.organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  business_type TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS identity.memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES identity.users(id),
  organization_id UUID REFERENCES identity.organizations(id),
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'accountant', 'viewer')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'pending')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, organization_id)
);
