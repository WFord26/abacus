# Abacus API Schema

Public API documentation for Abacus endpoints exposed through the API gateway.

**Versioning:** All documented endpoints use the `/api/v1` path.  
**Format:** [Keep a Changelog](https://keepachangelog.com/) style — updated when endpoints are added, modified, or deprecated.  
**Purpose:** Source of truth for the current public API surface, used for development and code review. Service sections below describe which internal service owns each route, but all client traffic should go through the gateway.

---

## Overview

### Authentication

Most endpoints require a Bearer token in the `Authorization` header:

```
Authorization: Bearer <JWT_TOKEN>
```

Public auth exceptions:

- `POST /api/v1/auth/register`
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/refresh`
- `POST /api/v1/auth/logout`

Refresh-token behavior:

- Refresh tokens are stored in an `httpOnly` cookie named `abacus_refresh_token`
- `POST /api/v1/auth/refresh`, `POST /api/v1/auth/logout`, and `POST /api/v1/auth/switch-organization` rely on that cookie

The JWT currently contains claims:

- `organizationId`: UUID of the organization
- `userId`: UUID of the authenticated user
- `email`: Email address of the user
- `role`: One of `owner`, `admin`, `accountant`, `viewer`

### Base URLs

- **Development**: `http://localhost:3000`
- **Production**: `https://api.abacus.app`

### Route Prefix

All public API routes are exposed under:

```text
/api/v1
```

### Response Format

All endpoints return JSON responses in this format:

**Success (2xx):**

```json
{
  "data": {
    ...response payload...
  }
}
```

**Error (4xx, 5xx):**

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message",
    "statusCode": 400
  }
}
```

### Common Status Codes

- `200 OK`: Successful GET request
- `201 Created`: Successful POST request (resource created)
- `204 No Content`: Successful DELETE or update with no response body
- `400 Bad Request`: Request validation failed
- `401 Unauthorized`: Missing or invalid authentication token
- `403 Forbidden`: Authenticated user lacks permission for this resource
- `404 Not Found`: Resource does not exist
- `409 Conflict`: Request conflicts with existing resource state
- `503 Service Unavailable`: Upstream service is unavailable or not configured
- `500 Internal Server Error`: Unexpected server error

---

## API Endpoints by Service

### Identity Service

**Public base**: `/api/v1`

#### POST /api/v1/auth/register

Register a new user, create a personal organization, and return an authenticated session.

**Authentication**: Not required

**Request**:

```typescript
{
  email: string;
  name: string;
  password: string;
}
```

**Response: 201 Created**:

```typescript
{
  data: {
    organization: {
      id: string
      name: string
      slug: string
      businessType: string | null
      createdAt: string (ISO 8601)
    }
    tokens: {
      accessToken: string
      refreshToken: string
      expiresIn: number
      tokenType: 'Bearer'
    }
    user: {
      id: string
      email: string
      emailVerified: boolean
      name: string | null
      avatarUrl: string | null
      createdAt: string (ISO 8601)
      updatedAt: string (ISO 8601)
    }
  }
}
```

**Error Responses**:

- `400 Bad Request`: Invalid email, weak password, or missing fields
- `409 Conflict`: Email already registered

---

#### POST /api/v1/auth/login

Authenticate a user and return an authenticated session for their first active organization membership.

**Authentication**: Not required

**Request**:

```typescript
{
  email: string;
  password: string;
}
```

**Response: 200 OK**:

```typescript
{
  data: {
    organization: {
      id: string
      name: string
      slug: string
      businessType: string | null
      createdAt: string (ISO 8601)
    }
    tokens: {
      accessToken: string
      refreshToken: string
      expiresIn: number
      tokenType: 'Bearer'
    }
    user: {
      id: string
      email: string
      emailVerified: boolean
      name: string | null
      avatarUrl: string | null
      createdAt: string (ISO 8601)
      updatedAt: string (ISO 8601)
    }
  }
}
```

**Error Responses**:

- `400 Bad Request`: Missing email or password
- `401 Unauthorized`: Invalid credentials
- `403 Forbidden`: User has no active organization membership

---

#### POST /api/v1/auth/refresh

Refresh an expired access token using the `abacus_refresh_token` cookie. Refresh tokens are rotated on every successful call.

**Authentication**: Not required

**Request body**: none

**Response: 200 OK**:

```typescript
{
  data: {
    tokens: {
      accessToken: string;
      refreshToken: string;
      expiresIn: number;
      tokenType: "Bearer";
    }
  }
}
```

**Error Responses**:

- `401 Unauthorized`: Invalid or expired refresh token

---

#### POST /api/v1/auth/switch-organization

Rotate the refresh token and issue a new access token for a different active organization membership.

**Authentication**: Required

**Request**:

```typescript
{
  organizationId: string(UUID);
}
```

**Response: 200 OK**:

```typescript
{
  data: {
    organization: {
      id: string
      name: string
      slug: string
      businessType: string | null
      createdAt: string (ISO 8601)
    }
    tokens: {
      accessToken: string
      refreshToken: string
      expiresIn: number
      tokenType: 'Bearer'
    }
    user: {
      id: string
      email: string
      emailVerified: boolean
      name: string | null
      avatarUrl: string | null
      createdAt: string (ISO 8601)
      updatedAt: string (ISO 8601)
    }
  }
}
```

**Error Responses**:

- `401 Unauthorized`: Missing or invalid access token
- `403 Forbidden`: Membership is missing or not active for the selected organization
- `404 Not Found`: User or organization does not exist

---

#### POST /api/v1/auth/logout

Revoke the current refresh token and clear the `abacus_refresh_token` cookie.

**Authentication**: Not required

**Request body**: none

**Response: 200 OK**:

```typescript
{
  data: {
    loggedOut: true;
  }
}
```

---

#### GET /api/v1/me

Return the current authenticated user.

**Authentication**: Required

**Response: 200 OK**:

```typescript
{
  data: {
    id: string
    email: string
    emailVerified: boolean
    name: string | null
    avatarUrl: string | null
    createdAt: string (ISO 8601)
    updatedAt: string (ISO 8601)
  }
}
```

---

#### PATCH /api/v1/me

Update the current user's profile fields.

**Authentication**: Required

**Request**:

```typescript
{
  name?: string | null
  avatarUrl?: string | null
}
```

**Response: 200 OK**:

```typescript
{
  data: {
    id: string
    email: string
    emailVerified: boolean
    name: string | null
    avatarUrl: string | null
    createdAt: string (ISO 8601)
    updatedAt: string (ISO 8601)
  }
}
```

**Error Responses**:

- `400 Bad Request`: Validation error
- `401 Unauthorized`: Missing or invalid token

---

#### POST /api/v1/organizations

Create an organization and add the current user as its `owner`.

**Authentication**: Required

**Request**:

```typescript
{
  name: string
  businessType?: string | null
}
```

**Response: 201 Created**:

```typescript
{
  data: {
    membership: {
      id: string
      userId: string
      organizationId: string
      role: 'owner' | 'admin' | 'accountant' | 'viewer'
      status: 'active' | 'pending'
      createdAt: string (ISO 8601)
      user: {
        id: string
        email: string
        emailVerified: boolean
        name: string | null
        avatarUrl: string | null
        createdAt: string (ISO 8601)
        updatedAt: string (ISO 8601)
      }
    }
    organization: {
      id: string
      name: string
      slug: string
      businessType: string | null
      createdAt: string (ISO 8601)
    }
  }
}
```

---

#### GET /api/v1/organizations

List all organizations the current user belongs to, including pending invites.

**Authentication**: Required

**Response: 200 OK**:

```typescript
{
  data: {
    id: string
    userId: string
    organizationId: string
    role: 'owner' | 'admin' | 'accountant' | 'viewer'
    status: 'active' | 'pending'
    createdAt: string (ISO 8601)
    organization: {
      id: string
      name: string
      slug: string
      businessType: string | null
      createdAt: string (ISO 8601)
    }
  }[]
}
```

---

#### GET /api/v1/organizations/:orgId

Return organization details for an active member of that organization.

**Authentication**: Required

**Response: 200 OK**:

```typescript
{
  data: {
    id: string
    name: string
    slug: string
    businessType: string | null
    createdAt: string (ISO 8601)
  }
}
```

---

#### PATCH /api/v1/organizations/:orgId

Update organization metadata. Owner only.

**Authentication**: Required

**Request**:

```typescript
{
  name?: string
  businessType?: string | null
}
```

**Response: 200 OK**:

```typescript
{
  data: {
    id: string
    name: string
    slug: string
    businessType: string | null
    createdAt: string (ISO 8601)
  }
}
```

**Error Responses**:

- `401 Unauthorized`: Missing or invalid token
- `403 Forbidden`: Only organization owners may update org metadata
- `404 Not Found`: Organization not found

---

#### GET /api/v1/organizations/:orgId/members

List organization memberships. `owner` and `admin` only.

**Authentication**: Required

**Response: 200 OK**:

```typescript
{
  data: {
    id: string
    userId: string
    organizationId: string
    role: 'owner' | 'admin' | 'accountant' | 'viewer'
    status: 'active' | 'pending'
    createdAt: string (ISO 8601)
    user: {
      id: string
      email: string
      emailVerified: boolean
      name: string | null
      avatarUrl: string | null
      createdAt: string (ISO 8601)
      updatedAt: string (ISO 8601)
    }
  }[]
}
```

**Error Responses**:

- `401 Unauthorized`: Missing or invalid token
- `403 Forbidden`: Only owners or admins may view membership details

---

#### POST /api/v1/organizations/:orgId/accept-invite

Accept a pending invite for the authenticated user.

**Authentication**: Required

**Request body**: none

**Response: 200 OK**:

```typescript
{
  data: {
    id: string
    userId: string
    organizationId: string
    role: 'owner' | 'admin' | 'accountant' | 'viewer'
    status: 'active' | 'pending'
    createdAt: string (ISO 8601)
    user: {
      id: string
      email: string
      emailVerified: boolean
      name: string | null
      avatarUrl: string | null
      createdAt: string (ISO 8601)
      updatedAt: string (ISO 8601)
    }
  }
}
```

**Error Responses**:

- `401 Unauthorized`: Missing or invalid token
- `403 Forbidden`: Invite does not belong to the authenticated user
- `404 Not Found`: Membership not found
- `409 Conflict`: Invite is no longer pending

---

#### POST /api/v1/organizations/:orgId/decline-invite

Decline a pending invite for the authenticated user.

**Authentication**: Required

**Request body**: none

**Response: 204 No Content**

**Error Responses**:

- `401 Unauthorized`: Missing or invalid token
- `403 Forbidden`: Invite does not belong to the authenticated user
- `404 Not Found`: Membership not found
- `409 Conflict`: Invite is no longer pending

---

#### POST /api/v1/organizations/:orgId/members/invite

Create a pending membership invite. `owner` and `admin` may invite, but `admin` cannot invite an `owner`.

**Authentication**: Required

**Request**:

```typescript
{
  email: string
  role?: 'owner' | 'admin' | 'accountant' | 'viewer'
}
```

**Response: 201 Created**:

```typescript
{
  data: {
    id: string
    userId: string
    organizationId: string
    role: 'owner' | 'admin' | 'accountant' | 'viewer'
    status: 'active' | 'pending'
    createdAt: string (ISO 8601)
    user: {
      id: string
      email: string
      emailVerified: boolean
      name: string | null
      avatarUrl: string | null
      createdAt: string (ISO 8601)
      updatedAt: string (ISO 8601)
    }
  }
}
```

**Error Responses**:

- `401 Unauthorized`: Missing or invalid token
- `403 Forbidden`: Caller lacks permission for the requested role
- `409 Conflict`: Membership already exists for that email

---

#### DELETE /api/v1/organizations/:orgId/members/:userId

Remove a membership. `owner` and `admin` may remove members, but `admin` cannot remove an `owner`.

**Authentication**: Required

**Response: 204 No Content**

**Error Responses**:

- `401 Unauthorized`: Missing or invalid token
- `403 Forbidden`: Caller lacks permission
- `404 Not Found`: Membership not found
- `409 Conflict`: Organization would be left without an active owner

---

#### PATCH /api/v1/organizations/:orgId/members/:userId/role

Change a member role. `owner` and `admin` may manage roles, but `admin` cannot assign or manage `owner`.

**Authentication**: Required

**Request**:

```typescript
{
  role: "owner" | "admin" | "accountant" | "viewer";
}
```

**Response: 200 OK**:

```typescript
{
  data: {
    id: string
    userId: string
    organizationId: string
    role: 'owner' | 'admin' | 'accountant' | 'viewer'
    status: 'active' | 'pending'
    createdAt: string (ISO 8601)
    user: {
      id: string
      email: string
      emailVerified: boolean
      name: string | null
      avatarUrl: string | null
      createdAt: string (ISO 8601)
      updatedAt: string (ISO 8601)
    }
  }
}
```

**Error Responses**:

- `401 Unauthorized`: Missing or invalid token
- `403 Forbidden`: Caller lacks permission
- `404 Not Found`: Membership not found
- `409 Conflict`: Organization would be left without an active owner

---

### Ledger Service

**Public base**: `/api/v1`

#### POST /api/v1/accounts

Create a new account for the authenticated organization.

**Authentication**: Required

**Request**:

```typescript
{
  name: string (max 100 chars)
  accountType: 'checking' | 'savings' | 'credit' | 'other'
  currency: string (3-letter code, e.g., 'USD')
  initialBalance?: number
}
```

**Response: 201 Created**:

```typescript
{
  data: {
    id: string (UUID)
    organizationId: string (UUID)
    name: string
    accountType: 'checking' | 'savings' | 'credit' | 'other'
    currency: string
    balance: number
    createdAt: string (ISO 8601)
    updatedAt: string (ISO 8601)
  }
}
```

**Error Responses**:

- `400 Bad Request`: Validation error (invalid currency code, empty name, etc.)
- `401 Unauthorized`: Missing or invalid token
- `500 Internal Server Error`: Unexpected server error

---

#### GET /api/v1/accounts

List all accounts for the authenticated organization.

**Authentication**: Required

**Query Parameters**:

- `limit` (optional): Number of results (default: 50, max: 500)
- `offset` (optional): Pagination offset (default: 0)

**Response: 200 OK**:

```typescript
{
  data: Account[],
  pagination: {
    total: number
    limit: number
    offset: number
  }
}
```

**Error Responses**:

- `401 Unauthorized`: Missing or invalid token

---

#### GET /api/v1/accounts/:accountId

Retrieve a specific account by ID.

**Authentication**: Required

**Path Parameters**:

- `accountId` (required): UUID of the account

**Response: 200 OK**:

```typescript
{
  data: {
    id: string (UUID)
    organizationId: string (UUID)
    name: string
    accountType: 'checking' | 'savings' | 'credit' | 'other'
    currency: string
    balance: number
    createdAt: string (ISO 8601)
    updatedAt: string (ISO 8601)
  }
}
```

**Error Responses**:

- `401 Unauthorized`: Missing or invalid token
- `404 Not Found`: Account does not exist or does not belong to user's organization

---

#### POST /api/v1/transactions

Create a new transaction in an account.

**Authentication**: Required

**Request**:

```typescript
{
  accountId: string (UUID)
  date: string (YYYY-MM-DD format)
  amount: number (non-zero decimal)
  description?: string (max 500 chars)
  category?: string (UUID, optional)
}
```

**Response: 201 Created**:

```typescript
{
  data: {
    id: string (UUID)
    organizationId: string (UUID)
    accountId: string (UUID)
    date: string (ISO 8601)
    amount: number
    description: string | null
    category: string (UUID) | null
    reviewStatus: 'unreviewed' | 'approved' | 'rejected'
    createdAt: string (ISO 8601)
    updatedAt: string (ISO 8601)
  }
}
```

**Error Responses**:

- `400 Bad Request`: Validation error (invalid date format, zero amount, missing required fields)
- `401 Unauthorized`: Missing or invalid token
- `404 Not Found`: Account does not exist or does not belong to user's organization
- `409 Conflict`: Transaction date is before account creation or conflicts with business rules

---

#### GET /api/v1/transactions

List transactions with optional filtering.

**Authentication**: Required

**Query Parameters**:

- `accountId` (required): UUID of the account to filter by
- `dateFrom` (optional): Start date (YYYY-MM-DD)
- `dateTo` (optional): End date (YYYY-MM-DD)
- `limit` (optional): Number of results (default: 50, max: 500)
- `offset` (optional): Pagination offset (default: 0)

**Response: 200 OK**:

```typescript
{
  data: Transaction[],
  pagination: {
    total: number
    limit: number
    offset: number
  }
}
```

**Error Responses**:

- `400 Bad Request`: Invalid date format or query parameters
- `401 Unauthorized`: Missing or invalid token

---

#### PATCH /api/v1/transactions/:transactionId

Update a transaction's review status or details.

**Authentication**: Required

**Path Parameters**:

- `transactionId` (required): UUID of the transaction

**Request**:

```typescript
{
  description?: string (max 500 chars)
  category?: string (UUID) | null
  reviewStatus?: 'approved' | 'rejected'
}
```

**Response: 200 OK**:

```typescript
{
  data: {
    id: string (UUID)
    organizationId: string (UUID)
    accountId: string (UUID)
    date: string (ISO 8601)
    amount: number
    description: string | null
    category: string (UUID) | null
    reviewStatus: 'unreviewed' | 'approved' | 'rejected'
    createdAt: string (ISO 8601)
    updatedAt: string (ISO 8601)
  }
}
```

**Error Responses**:

- `400 Bad Request`: Validation error
- `401 Unauthorized`: Missing or invalid token
- `404 Not Found`: Transaction does not exist
- `403 Forbidden`: Transaction belongs to a different organization

---

### Documents Service

**Public base**: `/api/v1`

#### GET /api/v1/documents/upload-url

Generate a pre-signed URL for uploading a document.

**Authentication**: Required

**Query Parameters**:

- `fileName` (required): Name of the file to upload
- `contentType` (required): MIME type (e.g., 'application/pdf')
- `documentType` (optional): Category of document ('receipt', 'invoice', 'statement', 'other')

**Response: 200 OK**:

```typescript
{
  data: {
    uploadUrl: string (SAS URL with 15-minute expiration)
    documentId: string (UUID)
    blobKey: string
    expiresIn: number (seconds, typically 900)
  }
}
```

**Error Responses**:

- `400 Bad Request`: Missing or invalid fileName/contentType
- `401 Unauthorized`: Missing or invalid token

---

#### GET /api/v1/documents

List all documents for the authenticated organization.

**Authentication**: Required

**Query Parameters**:

- `limit` (optional): Number of results (default: 50, max: 500)
- `offset` (optional): Pagination offset (default: 0)
- `documentType` (optional): Filter by type ('receipt', 'invoice', 'statement', 'other')

**Response: 200 OK**:

```typescript
{
  data: Document[],
  pagination: {
    total: number
    limit: number
    offset: number
  }
}
```

---

#### GET /api/v1/documents/:documentId/download-url

Generate a pre-signed download URL for a document.

**Authentication**: Required

**Path Parameters**:

- `documentId` (required): UUID of the document

**Response: 200 OK**:

```typescript
{
  data: {
    downloadUrl: string (SAS URL with 5-minute expiration)
    expiresIn: number (seconds, typically 300)
  }
}
```

**Error Responses**:

- `401 Unauthorized`: Missing or invalid token
- `404 Not Found`: Document does not exist
- `403 Forbidden`: Document belongs to a different organization

---

### Reporting Service

**Public base**: `/api/v1`

#### GET /api/v1/reports/summary

Get a financial summary report for the organization.

**Authentication**: Required

**Query Parameters**:

- `dateFrom` (required): Start date (YYYY-MM-DD)
- `dateTo` (required): End date (YYYY-MM-DD)

**Response: 200 OK**:

```typescript
{
  data: {
    period: {
      from: string (ISO 8601)
      to: string (ISO 8601)
    }
    accounts: {
      id: string (UUID)
      name: string
      balance: number
      currency: string
    }[]
    totalIncome: number
    totalExpenses: number
    netCashFlow: number
    transactionCount: number
  }
}
```

**Error Responses**:

- `400 Bad Request`: Invalid or missing date parameters
- `401 Unauthorized`: Missing or invalid token

---

## Changelog

### [Unreleased]

- Updated the documented public API prefix to `/api/v1` via the gateway
- Synced the identity section with the implemented auth, profile, organization, membership, and org-switching endpoints

### [2026.03.25]

- Initial v1 API documentation for ledger-service, identity-service, documents-service, and reporting-service
- API documentation format established for future endpoint additions

---

## Notes for Developers

- All timestamps are in ISO 8601 format (UTC)
- All monetary amounts are decimal numbers (not cents)
- Organization-scoped queries automatically filter by the authenticated user's organization
- Login is rate-limited in identity-service and the gateway applies a global request limit
- SAS URLs for document upload/download have short expiration windows (15 min upload, 5 min download)
