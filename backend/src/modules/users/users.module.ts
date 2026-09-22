import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { UserOrganizationMembership } from './entities/user-organization-membership.entity';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { AccessRole } from './entities/access-role.entity';
import { AccessRolesService } from './access-roles.service';
import { AccessRolesController } from './access-roles.controller';

@Module({
  imports: [TypeOrmModule.forFeature([User, UserOrganizationMembership, AccessRole])],
  controllers: [UsersController, AccessRolesController],
  providers: [UsersService, AccessRolesService],
  exports: [UsersService],
})
export class UsersModule {}
