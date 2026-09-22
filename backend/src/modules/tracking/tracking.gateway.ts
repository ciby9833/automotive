import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Namespace, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { ScopeService } from '../../common/scope/scope.service';
import { Permission } from '../../common/enums/permission.enum';
import { Role } from '../../common/enums/role.enum';
import { JwtPayload } from '../auth/auth.types';

// 实时推送：运单状态变更、场地库位变更等事件通过该网关广播给前端，
// 前端按 yardId/waybillId 房间订阅，避免全量广播
@WebSocketGateway({ namespace: '/tracking', cors: { origin: '*' } })
export class TrackingGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Namespace;

  private readonly logger = new Logger(TrackingGateway.name);

  constructor(
    private readonly scopes: ScopeService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly db: DataSource,
  ) {}

  private async authenticate(client: Socket) {
    const payload = this.jwt.verify<JwtPayload>(
      client.handshake.auth?.token ?? '',
      { secret: this.config.get<string>('jwt.secret') },
    );
    const user = await this.scopes.authenticate(payload);
    if (user.preAuth || !user.permissions?.includes(Permission.WAYBILL_VIEW))
      throw new Error('Forbidden');
    return user;
  }

  async handleConnection(client: Socket) {
    try {
      await this.authenticate(client);
    } catch {
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.debug(`client disconnected: ${client.id}`);
  }

  emitWaybillStatusChanged(payload: {
    waybillId: string;
    vin: string;
    status: string;
    yardId?: string | null;
  }) {
    void this.publish(payload).catch((error: Error) =>
      this.logger.warn(error.message),
    );
  }

  private async publish(payload: {
    waybillId: string;
    vin: string;
    status: string;
    yardId?: string | null;
  }) {
    const [w] = await this.db.query(
      `SELECT w.organization_id, w.carrier_id, w.origin_yard_id,
      w.destination_yard_id, o.customer_id FROM waybills w LEFT JOIN orders o ON o.id=w.order_id WHERE w.id=$1`,
      [payload.waybillId],
    );
    if (!w) return;
    for (const client of this.server.sockets.values()) {
      try {
        // 推送同样重验当前授权，不能让已撤权的长连接继续接收数据。
        const user = await this.authenticate(client);
        const scope = await this.scopes.resolve(user);
        const allowed =
          scope.type === 'ORG'
            ? scope.orgIds.includes(w.organization_id) &&
              (scope.role !== Role.YARD_STAFF ||
                [w.origin_yard_id, w.destination_yard_id].includes(
                  scope.scopeYardId,
                ))
            : scope.type === 'CARRIER'
              ? scope.carrierId === w.carrier_id
              : scope.customerId === w.customer_id;
        if (allowed) {
          client.emit('waybill-status-changed', payload);
          if (payload.yardId) client.emit('yard-update', payload);
        }
      } catch {
        client.disconnect(true);
      }
    }
  }
}
