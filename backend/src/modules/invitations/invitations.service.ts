import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomBytes } from 'crypto';
import * as bcrypt from 'bcrypt';
import { Invitation } from './entities/invitation.entity';
import { InvitationTargetType } from '../../common/enums/invitation.enum';
import { Role } from '../../common/enums/role.enum';
import { Carrier } from '../carriers/entities/carrier.entity';
import { Customer } from '../customers/entities/customer.entity';
import { User } from '../users/entities/user.entity';
import { EffectiveScope } from '../../common/scope/scope.types';
import { ScopeService } from '../../common/scope/scope.service';

const DEFAULT_TTL_DAYS = 7;

// 外部账号(承运商员工/司机/客户)只能通过邀请码注册，绝不允许外部人员自由注册占坑，
// 因此本模块所有"创建 invitation"接口都要经内部账号鉴权 + org scope 校验；
// "凭 token 注册"接口是唯一开放给外部的入口。
@Injectable()
export class InvitationsService {
  constructor(
    @InjectRepository(Invitation)
    private readonly invRepo: Repository<Invitation>,
    @InjectRepository(Carrier)
    private readonly carrierRepo: Repository<Carrier>,
    @InjectRepository(Customer)
    private readonly customerRepo: Repository<Customer>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly scopeService: ScopeService,
  ) {}

  async createForCarrier(
    scope: EffectiveScope,
    carrierId: string,
    inviteeRole: Role,
    ttlDays: number | undefined,
    createdByUserId: string,
  ): Promise<Invitation> {
    if (
      inviteeRole !== Role.CARRIER_STAFF &&
      inviteeRole !== Role.CARRIER_DRIVER
    ) {
      throw new BadRequestException(
        '承运商邀请码只能生成 CARRIER_STAFF 或 CARRIER_DRIVER 角色',
      );
    }
    const carrier = await this.carrierRepo.findOne({
      where: { id: carrierId },
    });
    if (!carrier) throw new NotFoundException('供应商不存在');
    // 复用统一的机构可写校验：内部账号只能给自己 scope 内的 carrier 生成邀请
    this.scopeService.assertOrgWritable(scope, carrier.organizationId);

    return this.persistInvitation({
      targetType: InvitationTargetType.CARRIER,
      targetId: carrierId,
      inviteeRole,
      ttlDays,
      createdByUserId,
    });
  }

  async createForCustomer(
    scope: EffectiveScope,
    customerId: string,
    inviteeRole: Role,
    ttlDays: number | undefined,
    createdByUserId: string,
  ): Promise<Invitation> {
    if (inviteeRole !== Role.CUSTOMER) {
      throw new BadRequestException('客户邀请码只能生成 CUSTOMER 角色');
    }
    const customer = await this.customerRepo.findOne({
      where: { id: customerId },
    });
    if (!customer) throw new NotFoundException('客户不存在');
    this.scopeService.assertOrgWritable(scope, customer.organizationId);

    return this.persistInvitation({
      targetType: InvitationTargetType.CUSTOMER,
      targetId: customerId,
      inviteeRole,
      ttlDays,
      createdByUserId,
    });
  }

  // 公开接口：外部人员在注册页凭 token 拿到"这个邀请是给谁的"预览信息，
  // 只暴露 targetType + 目标名称，绝不暴露 targetId、createdByUserId 等内部字段
  async previewByToken(token: string): Promise<{
    targetType: InvitationTargetType;
    targetName: string;
    inviteeRole: Role;
    expiresAt: Date;
  }> {
    const inv = await this.invRepo.findOne({ where: { token } });
    this.assertUsable(inv);

    let targetName: string;
    if (inv!.targetType === InvitationTargetType.CARRIER) {
      const c = await this.carrierRepo.findOne({
        where: { id: inv!.targetId },
      });
      targetName = c?.name ?? '(已删除)';
    } else {
      const c = await this.customerRepo.findOne({
        where: { id: inv!.targetId },
      });
      targetName = c?.name ?? '(已删除)';
    }

    return {
      targetType: inv!.targetType,
      targetName,
      inviteeRole: inv!.inviteeRole,
      expiresAt: inv!.expiresAt,
    };
  }

  // 公开接口：外部人员凭 token + 表单信息注册一个 User，
  // 用事务保证"token 标记已使用"与"user 记录创建"原子性
  async registerWithToken(
    token: string,
    username: string,
    password: string,
    displayName: string,
    email: string | null,
  ): Promise<{ userId: string }> {
    return this.userRepo.manager.transaction(async (mgr) => {
      const inv = await mgr.findOne(Invitation, { where: { token } });
      this.assertUsable(inv);
      const dup = await mgr.findOne(User, { where: { username } });
      if (dup) throw new ConflictException('用户名已存在');

      const passwordHash = await bcrypt.hash(password, 10);
      const user = mgr.create(User, {
        username,
        passwordHash,
        displayName,
        role: inv!.inviteeRole,
        email: email ?? null,
        carrierId:
          inv!.targetType === InvitationTargetType.CARRIER
            ? inv!.targetId
            : null,
        customerId:
          inv!.targetType === InvitationTargetType.CUSTOMER
            ? inv!.targetId
            : null,
      });
      const saved = await mgr.save(user);

      inv!.usedByUserId = saved.id;
      inv!.usedAt = new Date();
      await mgr.save(inv!);

      return { userId: saved.id };
    });
  }

  private assertUsable(inv: Invitation | null | undefined): void {
    if (!inv) throw new NotFoundException('邀请码无效');
    if (inv.usedByUserId) {
      throw new ForbiddenException('邀请码已被使用');
    }
    if (inv.expiresAt.getTime() < Date.now()) {
      throw new ForbiddenException('邀请码已过期');
    }
  }

  private async persistInvitation(args: {
    targetType: InvitationTargetType;
    targetId: string;
    inviteeRole: Role;
    ttlDays: number | undefined;
    createdByUserId: string;
  }): Promise<Invitation> {
    const token = randomBytes(32).toString('base64url');
    const ttl = args.ttlDays ?? DEFAULT_TTL_DAYS;
    const expiresAt = new Date(Date.now() + ttl * 24 * 60 * 60 * 1000);
    const invitation = this.invRepo.create({
      token,
      targetType: args.targetType,
      targetId: args.targetId,
      inviteeRole: args.inviteeRole,
      expiresAt,
      createdByUserId: args.createdByUserId,
    });
    return this.invRepo.save(invitation);
  }
}
