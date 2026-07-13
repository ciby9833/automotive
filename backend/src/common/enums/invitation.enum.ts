// 邀请码可指向"承运商"或"客户"两类外部实体；配合 inviteeRole 决定注册出来的账号身份。
export enum InvitationTargetType {
  CARRIER = 'CARRIER',
  CUSTOMER = 'CUSTOMER',
}
