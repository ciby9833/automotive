import {
  OnGatewayInit,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { OnModuleDestroy } from '@nestjs/common';
import { Namespace } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { isUUID } from 'class-validator';
import { ScopeService } from '../../common/scope/scope.service';
import { Permission } from '../../common/enums/permission.enum';
import { Role } from '../../common/enums/role.enum';
import { JwtPayload } from '../auth/auth.types';
import { Yard } from '../yards/entities/yard.entity';
import {
  OperationalChange,
  OperationalUpdatesService,
} from './operational-updates.service';

@WebSocketGateway({
  namespace: '/operational-updates',
  transports: ['websocket'],
})
export class OperationalUpdatesGateway
  implements OnGatewayInit, OnModuleDestroy
{
  @WebSocketServer() server: Namespace;
  constructor(
    private readonly updates: OperationalUpdatesService,
    private readonly scopes: ScopeService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly db: DataSource,
  ) {}

  afterInit(server: Namespace) {
    server.use(async (client, next) => {
      try {
        const { token, yardId, organizationId, view } = client.handshake.auth;
        const payload = this.jwt.verify<JwtPayload & { exp: number }>(
          token ?? '',
          { secret: this.config.get<string>('jwt.secret') },
        );
        const user = await this.scopes.authenticate(payload);
        const scope = await this.scopes.resolve(user);
        if (
          user.preAuth ||
          scope.type !== 'ORG' ||
          !user.permissions?.includes(Permission.YARD_VIEW_BOARD) ||
          !['board', 'dashboard'].includes(view)
        )
          throw new Error('Forbidden');
        if (
          organizationId &&
          (!isUUID(organizationId) || !scope.orgIds.includes(organizationId))
        )
          throw new Error('Forbidden');
        if (view === 'board' && !yardId) throw new Error('Forbidden');
        const orgIds = organizationId ? [organizationId] : scope.orgIds;
        if (yardId) {
          if (!isUUID(yardId)) throw new Error('Forbidden');
          const yard = await this.db
            .getRepository(Yard)
            .findOneBy({ id: yardId });
          if (
            !yard ||
            !orgIds.includes(yard.organizationId) ||
            (scope.role === Role.YARD_STAFF && scope.scopeYardId !== yard.id)
          )
            throw new Error('Forbidden');
          await client.join(`yard:${yard.id}`);
          await client.join(`policy:${yard.organizationId}`);
          if (view === 'dashboard') {
            await client.join(`dashboard:${yard.organizationId}`);
            // Organization users' duplicate-VIN diagnostics also compare other yards.
            // Yard staff's HTTP comparison scope is limited to their own yard.
            if (scope.role !== Role.YARD_STAFF)
              await client.join(`organization:${yard.organizationId}`);
          }
        } else if (scope.role === Role.YARD_STAFF) {
          if (!scope.scopeYardId) throw new Error('Forbidden');
          await client.join(`yard:${scope.scopeYardId}`);
          await client.join(`policy:${scope.activeOrgId}`);
          await client.join(`dashboard:${scope.activeOrgId}`);
        } else {
          for (const id of orgIds)
            await client.join([
              `organization:${id}`,
              `policy:${id}`,
              `dashboard:${id}`,
            ]);
        }
        const ttl = payload.exp * 1000 - Date.now();
        if (!Number.isFinite(ttl) || ttl <= 0) throw new Error('Expired');
        const expiry = setTimeout(
          () => client.disconnect(true),
          Math.min(ttl, 2147483647),
        );
        client.once('disconnect', () => clearTimeout(expiry));
        next();
      } catch {
        next(new Error('Forbidden'));
      }
    });
    this.updates.events.on('change', this.changed);
    this.updates.events.on('reset', this.reset);
  }
  private readonly changed = (changes: OperationalChange[]) => {
    const rooms = new Set<string>();
    for (const c of changes) {
      if (c.kind === 'dashboard') rooms.add(`dashboard:${c.organizationId}`);
      else if (c.kind === 'policy') rooms.add(`policy:${c.organizationId}`);
      else {
        rooms.add(`yard:${c.yardId}`);
        rooms.add(`organization:${c.organizationId}`);
      }
    }
    // Invalidation only: no VINs, quantities or business records on a long-lived connection.
    // The following HTTP read always revalidates current permissions and organization scope.
    if (rooms.size) this.server.to([...rooms]).emit('changed');
  };
  private readonly reset = () => this.server.emit('changed');
  onModuleDestroy() {
    this.updates.events.off('change', this.changed);
    this.updates.events.off('reset', this.reset);
  }
}
