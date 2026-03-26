"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Toast,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "@wford26/ui";
import { useEffect, useMemo, useState } from "react";

import { useAuth } from "../../contexts/auth-context";
import { ApiClientError, apiClient } from "../../lib/api-client";

import type { Membership, Organization, Role, User } from "@wford26/shared-types";

type OrganizationMember = Membership & {
  user: User;
};

type ToastState = {
  description: string;
  title: string;
};

const managementRoles: Role[] = ["owner", "admin"];
const roleOptions: Role[] = ["owner", "admin", "accountant", "viewer"];

function buildMutationErrorMessage(error: unknown, fallback: string) {
  if (error instanceof ApiClientError) {
    return error.message;
  }

  return fallback;
}

function formatRoleLabel(role: Role) {
  return role[0]?.toUpperCase() + role.slice(1);
}

function formatMembershipStatus(status: Membership["status"]) {
  return status === "active" ? "Active" : "Pending";
}

function getRoleOptionsForActor(role: Role | null) {
  if (role === "owner") {
    return roleOptions;
  }

  if (role === "admin") {
    return roleOptions.filter((candidateRole) => candidateRole !== "owner");
  }

  return [];
}

function canManageMember(
  activeRole: Role | null,
  member: OrganizationMember,
  currentUserId: string | undefined
) {
  if (!activeRole || !currentUserId) {
    return false;
  }

  if (member.userId === currentUserId) {
    return false;
  }

  if (activeRole === "owner") {
    return true;
  }

  return activeRole === "admin" && member.role !== "owner";
}

export function WorkspaceSettingsPage() {
  const queryClient = useQueryClient();
  const {
    organization,
    organizations,
    refreshOrganizations,
    switchOrganization,
    updateCurrentOrganization,
    user,
  } = useAuth();
  const [organizationDraft, setOrganizationDraft] = useState({
    businessType: "",
    name: "",
  });
  const [inviteDraft, setInviteDraft] = useState<{
    email: string;
    role: Role;
  }>({
    email: "",
    role: "viewer",
  });
  const [memberToRemove, setMemberToRemove] = useState<OrganizationMember | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);

  const activeMembership = useMemo(
    () =>
      organizations.find((membership) => membership.organization.id === organization?.id) ?? null,
    [organization?.id, organizations]
  );
  const activeRole = activeMembership?.role ?? null;
  const canManageWorkspace = useMemo(
    () => (activeRole ? managementRoles.includes(activeRole) : false),
    [activeRole]
  );
  const canEditOrganization = activeRole === "owner";
  const pendingMemberships = useMemo(
    () =>
      organizations
        .filter((membership) => membership.status === "pending")
        .sort((left, right) => left.organization.name.localeCompare(right.organization.name)),
    [organizations]
  );
  const activeMemberships = useMemo(
    () => organizations.filter((membership) => membership.status === "active"),
    [organizations]
  );
  const memberRoleOptions = useMemo(() => getRoleOptionsForActor(activeRole), [activeRole]);
  const membersQueryKey = useMemo(
    () => ["workspace-members", organization?.id ?? "unknown"],
    [organization?.id]
  );

  useEffect(() => {
    setOrganizationDraft({
      businessType: organization?.businessType ?? "",
      name: organization?.name ?? "",
    });
  }, [organization?.businessType, organization?.id, organization?.name]);

  useEffect(() => {
    if (activeRole === "admin" && inviteDraft.role === "owner") {
      setInviteDraft((current) => ({
        ...current,
        role: "viewer",
      }));
    }
  }, [activeRole, inviteDraft.role]);

  const membersQuery = useQuery({
    enabled: Boolean(organization?.id) && canManageWorkspace,
    queryFn: () => apiClient<OrganizationMember[]>(`/organizations/${organization!.id}/members`),
    queryKey: membersQueryKey,
  });

  const acceptInviteMutation = useMutation({
    mutationFn: (organizationId: string) =>
      apiClient<OrganizationMember>(`/organizations/${organizationId}/accept-invite`, {
        method: "POST",
      }),
    onError: (error) => {
      setToast({
        description: buildMutationErrorMessage(error, "Unable to accept invite"),
        title: "Invite not accepted",
      });
    },
    onSuccess: async (_membership, organizationId) => {
      await refreshOrganizations();

      if (!organization && activeMemberships.length === 0) {
        await switchOrganization(organizationId);
      }

      setToast({
        description: "The workspace is now available in your organization switcher.",
        title: "Invite accepted",
      });
    },
  });

  const declineInviteMutation = useMutation({
    mutationFn: (organizationId: string) =>
      apiClient(`/organizations/${organizationId}/decline-invite`, {
        method: "POST",
      }),
    onError: (error) => {
      setToast({
        description: buildMutationErrorMessage(error, "Unable to decline invite"),
        title: "Invite not declined",
      });
    },
    onSuccess: async () => {
      await refreshOrganizations();
      setToast({
        description: "The pending workspace has been removed from your list.",
        title: "Invite declined",
      });
    },
  });

  const updateOrganizationMutation = useMutation({
    mutationFn: async (values: { businessType: string | null; name: string }) =>
      apiClient<Organization>(`/organizations/${organization!.id}`, {
        body: values,
        method: "PATCH",
      }),
    onError: (error) => {
      setToast({
        description: buildMutationErrorMessage(error, "Unable to update workspace details"),
        title: "Workspace not updated",
      });
    },
    onSuccess: async (updatedOrganization) => {
      updateCurrentOrganization(updatedOrganization);
      await refreshOrganizations();
      setToast({
        description: "The workspace profile is now in sync across the shell.",
        title: "Workspace updated",
      });
    },
  });

  const inviteMemberMutation = useMutation({
    mutationFn: async (values: { email: string; role: Role }) =>
      apiClient<OrganizationMember>(`/organizations/${organization!.id}/members/invite`, {
        body: values,
        method: "POST",
      }),
    onError: (error) => {
      setToast({
        description: buildMutationErrorMessage(error, "Unable to send invite"),
        title: "Invite not sent",
      });
    },
    onSuccess: async () => {
      setInviteDraft((current) => ({
        ...current,
        email: "",
      }));
      await queryClient.invalidateQueries({
        queryKey: membersQueryKey,
      });
      await refreshOrganizations();
      setToast({
        description: "The invite is pending and the email flow has been triggered.",
        title: "Invite sent",
      });
    },
  });

  const updateMemberRoleMutation = useMutation({
    mutationFn: async (input: { role: Role; userId: string }) =>
      apiClient<OrganizationMember>(
        `/organizations/${organization!.id}/members/${input.userId}/role`,
        {
          body: {
            role: input.role,
          },
          method: "PATCH",
        }
      ),
    onError: (error) => {
      setToast({
        description: buildMutationErrorMessage(error, "Unable to update member role"),
        title: "Role not updated",
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: membersQueryKey,
      });
      await refreshOrganizations();
      setToast({
        description: "The membership role has been updated.",
        title: "Role updated",
      });
    },
  });

  const removeMemberMutation = useMutation({
    mutationFn: async (userId: string) =>
      apiClient(`/organizations/${organization!.id}/members/${userId}`, {
        method: "DELETE",
      }),
    onError: (error) => {
      setToast({
        description: buildMutationErrorMessage(error, "Unable to remove member"),
        title: "Removal failed",
      });
    },
    onSuccess: async () => {
      setMemberToRemove(null);
      await queryClient.invalidateQueries({
        queryKey: membersQueryKey,
      });
      await refreshOrganizations();
      setToast({
        description: "The membership has been removed from this workspace.",
        title: "Member removed",
      });
    },
  });

  const ownerCount = useMemo(
    () =>
      (membersQuery.data ?? []).filter(
        (membership) => membership.role === "owner" && membership.status === "active"
      ).length,
    [membersQuery.data]
  );

  return (
    <ToastProvider>
      <div className="grid gap-4 xl:grid-cols-[1.45fr_0.9fr]">
        <div className="grid gap-4">
          <Card className="glass-panel panel-grid rise-in overflow-hidden border-0">
            <CardHeader>
              <p className="text-xs uppercase tracking-[0.26em] text-primary-600">
                Workspace admin
              </p>
              <CardTitle className="text-3xl text-neutral-900 dark:text-neutral-50">
                Memberships and invites
              </CardTitle>
              <CardDescription className="max-w-2xl text-base text-neutral-700 dark:text-neutral-300">
                Accept pending invites, bring teammates into the active workspace, and adjust access
                without leaving the shell.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {pendingMemberships.length > 0 ? (
                <div className="grid gap-3">
                  {pendingMemberships.map((membership) => (
                    <div
                      key={membership.id}
                      className="rounded-3xl border border-primary-200 bg-white/80 p-4 shadow-sm dark:border-primary-900 dark:bg-neutral-950/40"
                    >
                      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">
                              {membership.organization.name}
                            </p>
                            <Badge variant="warning">
                              {formatMembershipStatus(membership.status)}
                            </Badge>
                            <Badge variant="secondary">{formatRoleLabel(membership.role)}</Badge>
                          </div>
                          <p className="text-sm text-neutral-700 dark:text-neutral-300">
                            {membership.organization.businessType ?? "Workspace invite"} ready for{" "}
                            {user?.email ?? "your account"}.
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            disabled={
                              acceptInviteMutation.isPending || declineInviteMutation.isPending
                            }
                            onClick={async () => {
                              await acceptInviteMutation.mutateAsync(membership.organization.id);
                            }}
                          >
                            {acceptInviteMutation.isPending ? "Accepting..." : "Accept invite"}
                          </Button>
                          <Button
                            disabled={
                              acceptInviteMutation.isPending || declineInviteMutation.isPending
                            }
                            type="button"
                            variant="outline"
                            onClick={async () => {
                              await declineInviteMutation.mutateAsync(membership.organization.id);
                            }}
                          >
                            {declineInviteMutation.isPending ? "Declining..." : "Decline"}
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-3xl border border-dashed border-neutral-300 px-4 py-4 text-sm text-neutral-700 dark:border-neutral-700 dark:text-neutral-300">
                  No pending invites right now. New workspace invites will show up here as soon as
                  they land.
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="glass-panel panel-grid rise-in overflow-hidden border-0">
            <CardHeader className="space-y-2">
              <p className="text-xs uppercase tracking-[0.26em] text-primary-600">
                Active workspace
              </p>
              <CardTitle className="text-3xl text-neutral-900 dark:text-neutral-50">
                Team access
              </CardTitle>
              <CardDescription className="max-w-2xl text-base text-neutral-700 dark:text-neutral-300">
                Review current members, send new invites, and adjust roles for the active
                organization.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {!organization ? (
                <div className="rounded-3xl border border-dashed border-neutral-300 px-4 py-4 text-sm text-neutral-700 dark:border-neutral-700 dark:text-neutral-300">
                  Choose or accept a workspace first, then member management will unlock here.
                </div>
              ) : !canManageWorkspace ? (
                <div className="rounded-3xl border border-dashed border-neutral-300 px-4 py-4 text-sm text-neutral-700 dark:border-neutral-700 dark:text-neutral-300">
                  Your current role is{" "}
                  <span className="font-semibold text-neutral-900 dark:text-neutral-50">
                    {activeRole ?? "viewer"}
                  </span>
                  . Owners and admins can manage workspace memberships from this page.
                </div>
              ) : (
                <>
                  <div className="grid gap-3 rounded-3xl border border-neutral-200/70 bg-white/85 p-4 shadow-sm md:grid-cols-[minmax(0,1fr)_170px_auto] dark:border-neutral-800 dark:bg-neutral-950/35">
                    <div className="space-y-2">
                      <Label htmlFor="workspace-invite-email">Invite teammate</Label>
                      <Input
                        id="workspace-invite-email"
                        placeholder="teammate@company.com"
                        type="email"
                        value={inviteDraft.email}
                        onChange={(event) =>
                          setInviteDraft((current) => ({
                            ...current,
                            email: event.target.value,
                          }))
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="workspace-invite-role">Role</Label>
                      <Select
                        value={inviteDraft.role}
                        onValueChange={(value: Role) =>
                          setInviteDraft((current) => ({
                            ...current,
                            role: value,
                          }))
                        }
                      >
                        <SelectTrigger id="workspace-invite-role">
                          <SelectValue placeholder="Select role" />
                        </SelectTrigger>
                        <SelectContent>
                          {memberRoleOptions.map((role) => (
                            <SelectItem key={role} value={role}>
                              {formatRoleLabel(role)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-end">
                      <Button
                        className="w-full"
                        disabled={
                          inviteMemberMutation.isPending ||
                          inviteDraft.email.trim().length === 0 ||
                          memberRoleOptions.length === 0
                        }
                        onClick={async () => {
                          await inviteMemberMutation.mutateAsync({
                            email: inviteDraft.email.trim(),
                            role: inviteDraft.role,
                          });
                        }}
                      >
                        {inviteMemberMutation.isPending ? "Sending..." : "Send invite"}
                      </Button>
                    </div>
                  </div>

                  {membersQuery.isError ? (
                    <div className="rounded-3xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                      Unable to load membership details right now. Please refresh and try again.
                    </div>
                  ) : null}

                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Member</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Role</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {membersQuery.isLoading ? (
                        <TableRow>
                          <TableCell className="text-neutral-600 dark:text-neutral-300" colSpan={4}>
                            Loading workspace members...
                          </TableCell>
                        </TableRow>
                      ) : (membersQuery.data ?? []).length === 0 ? (
                        <TableRow>
                          <TableCell className="text-neutral-600 dark:text-neutral-300" colSpan={4}>
                            No members found for this workspace yet.
                          </TableCell>
                        </TableRow>
                      ) : (
                        (membersQuery.data ?? []).map((member) => {
                          const rowCanManage = canManageMember(activeRole, member, user?.id);
                          const ownerProtection =
                            member.role === "owner" &&
                            member.status === "active" &&
                            ownerCount <= 1;

                          return (
                            <TableRow key={member.id}>
                              <TableCell>
                                <div className="space-y-1">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <p className="font-semibold text-neutral-900 dark:text-neutral-50">
                                      {member.user.name ?? member.user.email}
                                    </p>
                                    {member.userId === user?.id ? (
                                      <Badge variant="secondary">You</Badge>
                                    ) : null}
                                  </div>
                                  <p className="text-sm text-neutral-600 dark:text-neutral-400">
                                    {member.user.email}
                                  </p>
                                </div>
                              </TableCell>
                              <TableCell>
                                <Badge
                                  variant={member.status === "active" ? "secondary" : "warning"}
                                >
                                  {formatMembershipStatus(member.status)}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <Select
                                  disabled={
                                    !rowCanManage ||
                                    ownerProtection ||
                                    updateMemberRoleMutation.isPending
                                  }
                                  value={member.role}
                                  onValueChange={async (value: Role) => {
                                    if (!rowCanManage || value === member.role) {
                                      return;
                                    }

                                    await updateMemberRoleMutation.mutateAsync({
                                      role: value,
                                      userId: member.userId,
                                    });
                                  }}
                                >
                                  <SelectTrigger className="w-[170px]">
                                    <SelectValue placeholder="Select role" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {memberRoleOptions.map((role) => (
                                      <SelectItem
                                        key={role}
                                        disabled={activeRole === "admin" && role === "owner"}
                                        value={role}
                                      >
                                        {formatRoleLabel(role)}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </TableCell>
                              <TableCell className="text-right">
                                {rowCanManage ? (
                                  <Button
                                    size="sm"
                                    variant="destructive"
                                    onClick={() => setMemberToRemove(member)}
                                  >
                                    Remove
                                  </Button>
                                ) : (
                                  <span className="text-xs text-neutral-500 dark:text-neutral-400">
                                    {member.userId === user?.id
                                      ? "Current session"
                                      : member.role === "owner" && activeRole === "admin"
                                        ? "Owner locked"
                                        : "Read only"}
                                  </span>
                                )}
                              </TableCell>
                            </TableRow>
                          );
                        })
                      )}
                    </TableBody>
                  </Table>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4">
          <Card className="glass-panel rise-in border-0">
            <CardHeader>
              <p className="text-xs uppercase tracking-[0.22em] text-neutral-600 dark:text-neutral-400">
                Workspace profile
              </p>
              <CardTitle className="text-xl text-neutral-900 dark:text-neutral-50">
                {organization?.name ?? "No active workspace"}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {!organization ? (
                <p className="text-sm text-neutral-700 dark:text-neutral-300">
                  Accept an invite or create a workspace first. Profile editing becomes available
                  once you have an active organization context.
                </p>
              ) : (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="workspace-name">Workspace name</Label>
                    <Input
                      id="workspace-name"
                      disabled={!canEditOrganization}
                      value={organizationDraft.name}
                      onChange={(event) =>
                        setOrganizationDraft((current) => ({
                          ...current,
                          name: event.target.value,
                        }))
                      }
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="workspace-business-type">Business type</Label>
                    <Input
                      id="workspace-business-type"
                      disabled={!canEditOrganization}
                      placeholder="Agency, consultancy, studio..."
                      value={organizationDraft.businessType}
                      onChange={(event) =>
                        setOrganizationDraft((current) => ({
                          ...current,
                          businessType: event.target.value,
                        }))
                      }
                    />
                  </div>

                  <Button
                    className="w-full"
                    disabled={
                      !canEditOrganization ||
                      updateOrganizationMutation.isPending ||
                      organizationDraft.name.trim().length === 0
                    }
                    onClick={async () => {
                      await updateOrganizationMutation.mutateAsync({
                        businessType: organizationDraft.businessType.trim() || null,
                        name: organizationDraft.name.trim(),
                      });
                    }}
                  >
                    {updateOrganizationMutation.isPending ? "Saving..." : "Save workspace"}
                  </Button>

                  {!canEditOrganization ? (
                    <p className="text-sm text-neutral-700 dark:text-neutral-300">
                      Only owners can edit workspace profile details.
                    </p>
                  ) : null}
                </>
              )}
            </CardContent>
          </Card>

          <Card className="glass-panel rise-in border-0">
            <CardHeader>
              <p className="text-xs uppercase tracking-[0.22em] text-neutral-600 dark:text-neutral-400">
                Access snapshot
              </p>
              <CardTitle className="text-xl text-neutral-900 dark:text-neutral-50">
                {activeMemberships.length} active workspace
                {activeMemberships.length === 1 ? "" : "s"}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-neutral-700 dark:text-neutral-300">
              <p>
                Current role:{" "}
                <span className="font-semibold text-neutral-900 dark:text-neutral-50">
                  {activeRole ? formatRoleLabel(activeRole) : "No active role"}
                </span>
              </p>
              <p>
                Pending invites:{" "}
                <span className="font-semibold text-neutral-900 dark:text-neutral-50">
                  {pendingMemberships.length}
                </span>
              </p>
              <p>
                {canManageWorkspace
                  ? "You can send invites, manage member roles, and keep workspace access clean from here."
                  : "You can still review invites here, but membership controls unlock only for owners and admins."}
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog
        open={Boolean(memberToRemove)}
        onOpenChange={(open) => {
          if (!open) {
            setMemberToRemove(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove member</DialogTitle>
            <DialogDescription>
              Remove {memberToRemove?.user.name ?? memberToRemove?.user.email ?? "this member"} from{" "}
              {organization?.name ?? "the active workspace"}. Owner safety checks still apply, so
              the backend will block the last active owner from being removed.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setMemberToRemove(null)}>
              Cancel
            </Button>
            <Button
              disabled={removeMemberMutation.isPending || !memberToRemove}
              variant="destructive"
              onClick={async () => {
                if (!memberToRemove) {
                  return;
                }

                await removeMemberMutation.mutateAsync(memberToRemove.userId);
              }}
            >
              {removeMemberMutation.isPending ? "Removing..." : "Remove member"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {toast ? (
        <Toast
          duration={4000}
          open={Boolean(toast)}
          onOpenChange={(open) => {
            if (!open) {
              setToast(null);
            }
          }}
        >
          <div>
            <ToastTitle>{toast.title}</ToastTitle>
            <ToastDescription>{toast.description}</ToastDescription>
          </div>
        </Toast>
      ) : null}
      <ToastViewport />
    </ToastProvider>
  );
}
