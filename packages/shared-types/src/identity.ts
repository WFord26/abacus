export type Role = "owner" | "admin" | "accountant" | "viewer";

export type MembershipStatus = "active" | "pending";

export type User = {
  id: string;
  email: string;
  passwordHash?: string | null;
  emailVerified: boolean;
  name?: string | null;
  avatarUrl?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Organization = {
  id: string;
  name: string;
  slug: string;
  businessType?: string | null;
  createdAt: string;
};

export type Membership = {
  id: string;
  userId: string;
  organizationId: string;
  role: Role;
  status: MembershipStatus;
  createdAt: string;
};

export type MembershipWithOrganization = Membership & {
  organization: Organization;
};

export type AuthTokens = {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: "Bearer";
};

export type JWTPayload = {
  userId: string;
  organizationId: string;
  email: string;
  role: Role;
};
