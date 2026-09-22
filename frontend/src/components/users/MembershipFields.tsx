"use client";
import { useEffect, useState } from "react";
import { Alert, Form, FormInstance, Select, message } from "antd";
import { useOrganizations } from "@/lib/organization/useOrganizations";
import { Role } from "@/lib/auth/role";
import { AccessRole, rolesApi } from "@/lib/api/roles";
import { usersApi } from "@/lib/api/users";
import { useTranslation } from "@/i18n/useTranslation";

export function MembershipFields({
  form,
  canAssign,
  lockOrganization = false,
}: {
  form: FormInstance;
  canAssign: boolean;
  lockOrganization?: boolean;
}) {
  const { t } = useTranslation();
  const organizations = useOrganizations();
  const organizationId = Form.useWatch("organizationId", form);
  const type = Form.useWatch("role", form);
  const [roles, setRoles] = useState<AccessRole[]>([]);
  const [yards, setYards] = useState<
    Array<{ id: string; name: string; code: string }>
  >([]);
  const [loading, setLoading] = useState(false);
  const root =
    organizations.find((o) => o.id === organizationId)?.parentId === null;
  useEffect(() => {
    let cancelled = false;
    setRoles([]);
    if (!organizationId || !type || !canAssign) return;
    setLoading(true);
    rolesApi
      .assignable(organizationId, type)
      .then((rows) => {
        if (!cancelled) setRoles(rows);
      })
      .catch(() => {
        if (!cancelled) message.error(t("access.loadFailed"));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [organizationId, type, canAssign, t]);
  useEffect(() => {
    let cancelled = false;
    setYards([]);
    if (type !== Role.YARD_STAFF || !organizationId) return;
    usersApi
      .assignmentYards(organizationId)
      .then((rows) => {
        if (!cancelled) setYards(rows);
      })
      .catch(() => {
        if (!cancelled) message.error(t("access.loadFailed"));
      });
    return () => {
      cancelled = true;
    };
  }, [organizationId, type, t]);
  return (
    <>
      <Form.Item
        name="organizationId"
        label={t("users.organization")}
        rules={[{ required: true }]}
      >
        <Select
          disabled={lockOrganization}
          options={organizations.map((o) => ({
            value: o.id,
            label: `${o.name} (${o.code})`,
          }))}
          onChange={(id) =>
            form.setFieldsValue({
              role:
                organizations.find((o) => o.id === id)?.parentId === null
                  ? Role.HQ_ADMIN
                  : Role.ORG_ADMIN,
              roleIds: [],
              scopeYardId: null,
            })
          }
        />
      </Form.Item>
      <Form.Item
        name="role"
        label={t("access.accountScope")}
        rules={[{ required: true }]}
      >
        <Select
          disabled={!organizationId}
          options={(root
            ? [Role.HQ_ADMIN]
            : [Role.ORG_ADMIN, Role.YARD_STAFF]
          ).map((r) => ({ value: r, label: t(`access.scope.${r}`) }))}
          onChange={() =>
            form.setFieldsValue({ roleIds: [], scopeYardId: null })
          }
        />
      </Form.Item>
      {type === Role.YARD_STAFF && (
        <Form.Item
          name="scopeYardId"
          label={t("users.scopeYard")}
          rules={[{ required: true }]}
        >
          <Select
            options={yards.map((y) => ({
              value: y.id,
              label: `${y.name} (${y.code})`,
            }))}
          />
        </Form.Item>
      )}
      {canAssign ? (
        <Form.Item
          name="roleIds"
          label={t("access.assignedRoles")}
          extra={t("access.roleSelectionHint")}
        >
          <Select
            mode="multiple"
            loading={loading}
            disabled={!organizationId || !type}
            optionFilterProp="label"
            options={roles.map((r) => ({ value: r.id, label: r.name }))}
          />
        </Form.Item>
      ) : (
        <Alert type="info" showIcon title={t("access.noAssignPermission")} />
      )}
    </>
  );
}
