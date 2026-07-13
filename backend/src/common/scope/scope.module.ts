import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Organization } from '../../modules/organizations/entities/organization.entity';
import { UserOrganizationMembership } from '../../modules/users/entities/user-organization-membership.entity';
import { ScopeService } from './scope.service';

// 权限作用域是横切关注点，用 @Global 让所有业务模块都能注入 ScopeService，避免每个模块自己 imports。
@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([Organization, UserOrganizationMembership]),
  ],
  providers: [ScopeService],
  exports: [ScopeService],
})
export class ScopeModule {}
