import { success } from "../../lib/response";
import {
  sanitizeMembership,
  sanitizeMembershipWithOrganization,
  sanitizeOrganization,
  sanitizeUser,
} from "../../lib/serialize";
import { parseSchema } from "../../lib/validation";
import {
  createOrganizationBodySchema,
  inviteMemberBodySchema,
  organizationMemberParamsSchema,
  organizationParamsSchema,
  updateMeBodySchema,
  updateMemberRoleBodySchema,
  updateOrganizationBodySchema,
} from "../../schemas/identity.schema";

import type { IdentityService } from "../../services/identity.service";
import type { FastifyPluginAsync } from "fastify";

type IdentityRoutesOptions = {
  service: IdentityService;
};

const identityRoutes: FastifyPluginAsync<IdentityRoutesOptions> = async (fastify, options) => {
  fastify.get("/me", async (request) => {
    const user = await options.service.getCurrentUser(request.user!.userId);
    return success(sanitizeUser(user));
  });

  fastify.patch("/me", async (request) => {
    const body = parseSchema(updateMeBodySchema, request.body);
    const user = await options.service.updateCurrentUser(request.user!.userId, {
      ...(body.avatarUrl !== undefined ? { avatarUrl: body.avatarUrl } : {}),
      ...(body.name !== undefined ? { name: body.name } : {}),
    });
    return success(sanitizeUser(user));
  });

  fastify.post("/organizations", async (request, reply) => {
    const body = parseSchema(createOrganizationBodySchema, request.body);
    const organization = await options.service.createOrganization({
      name: body.name,
      userId: request.user!.userId,
      ...(body.businessType !== undefined ? { businessType: body.businessType } : {}),
    });

    reply.status(201);
    return success({
      membership: sanitizeMembership(organization.membership),
      organization: sanitizeOrganization(organization.organization),
    });
  });

  fastify.get("/organizations", async (request) => {
    const memberships = await options.service.listCurrentUserOrganizations(request.user!.userId);
    return success(memberships.map(sanitizeMembershipWithOrganization));
  });

  fastify.get("/organizations/:orgId", async (request) => {
    const params = parseSchema(organizationParamsSchema, request.params);
    const organization = await options.service.getOrganization(request.user!.userId, params.orgId);
    return success(sanitizeOrganization(organization));
  });

  fastify.patch("/organizations/:orgId", async (request) => {
    const params = parseSchema(organizationParamsSchema, request.params);
    const body = parseSchema(updateOrganizationBodySchema, request.body);
    const organization = await options.service.updateOrganization({
      currentUserId: request.user!.userId,
      organizationId: params.orgId,
      ...(body.businessType !== undefined ? { businessType: body.businessType } : {}),
      ...(body.name !== undefined ? { name: body.name } : {}),
    });

    return success(sanitizeOrganization(organization));
  });

  fastify.get("/organizations/:orgId/members", async (request) => {
    const params = parseSchema(organizationParamsSchema, request.params);
    const memberships = await options.service.listOrganizationMemberships(
      request.user!.userId,
      params.orgId
    );

    return success(memberships.map(sanitizeMembership));
  });

  fastify.post("/organizations/:orgId/accept-invite", async (request) => {
    const params = parseSchema(organizationParamsSchema, request.params);
    const membership = await options.service.acceptInvite(request.user!.userId, params.orgId);
    return success(sanitizeMembership(membership));
  });

  fastify.post("/organizations/:orgId/decline-invite", async (request, reply) => {
    const params = parseSchema(organizationParamsSchema, request.params);
    await options.service.declineInvite(request.user!.userId, params.orgId);
    reply.status(204);
    return reply.send();
  });

  fastify.post("/organizations/:orgId/members/invite", async (request, reply) => {
    const params = parseSchema(organizationParamsSchema, request.params);
    const body = parseSchema(inviteMemberBodySchema, request.body);
    const membership = await options.service.inviteMember({
      currentUserId: request.user!.userId,
      email: body.email,
      organizationId: params.orgId,
      role: body.role ?? "viewer",
    });

    reply.status(201);
    return success(sanitizeMembership(membership));
  });

  fastify.delete("/organizations/:orgId/members/:userId", async (request, reply) => {
    const params = parseSchema(organizationMemberParamsSchema, request.params);
    await options.service.removeMember(request.user!.userId, params.orgId, params.userId);
    reply.status(204);
    return reply.send();
  });

  fastify.patch("/organizations/:orgId/members/:userId/role", async (request) => {
    const params = parseSchema(organizationMemberParamsSchema, request.params);
    const body = parseSchema(updateMemberRoleBodySchema, request.body);
    const membership = await options.service.updateMemberRole({
      currentUserId: request.user!.userId,
      organizationId: params.orgId,
      role: body.role,
      userId: params.userId,
    });

    return success(sanitizeMembership(membership));
  });
};

export default identityRoutes;
