import { apiClient, unwrap } from "./client";
import { Role, NavigationMenu } from "../auth/role";
export interface AccessRole {
  id: string;
  organizationId: string;
  type: Role;
  name: string;
  description: string;
  permissions: string[];
  isActive: boolean;
  assignedCount?: number;
  canManage?: boolean;
  isAssignedToSelf?: boolean;
}
export interface CatalogMenu extends NavigationMenu {
  selectable: boolean;
  actions: { code: string; selectable: boolean }[];
}
export interface RolePayload {
  organizationId: string;
  type: Role;
  name: string;
  description?: string;
  permissions: string[];
}
export const rolesApi = {
  list: (organizationId: string, type?: Role) =>
    unwrap<AccessRole[]>(
      apiClient.get("/roles", { params: { organizationId, type } }),
    ),
  assignable: (organizationId: string, type: Role) =>
    unwrap<AccessRole[]>(
      apiClient.get("/roles/assignable", { params: { organizationId, type } }),
    ),
  catalog: (organizationId: string, type: Role) =>
    unwrap<CatalogMenu[]>(
      apiClient.get("/roles/catalog", { params: { organizationId, type } }),
    ),
  create: (dto: RolePayload) =>
    unwrap<AccessRole>(apiClient.post("/roles", dto)),
  update: (
    id: string,
    dto: Omit<RolePayload, "type" | "organizationId"> & { isActive: boolean },
  ) => unwrap<AccessRole>(apiClient.patch("/roles/" + id, dto)),
};
