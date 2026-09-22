// 外部账号和初始化种子使用模板；内部业务授权只读取机构角色。
export { defaultPermissions as permissionsForRole, effectivePermissions } from './permission-catalog';
