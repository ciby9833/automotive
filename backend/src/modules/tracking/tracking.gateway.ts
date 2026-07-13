import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';

// 实时推送：运单状态变更、场地库位变更等事件通过该网关广播给前端，
// 前端按 yardId/waybillId 房间订阅，避免全量广播
@WebSocketGateway({ namespace: '/tracking', cors: { origin: '*' } })
export class TrackingGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(TrackingGateway.name);

  handleConnection(client: Socket) {
    this.logger.debug(`client connected: ${client.id}`);
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
    this.server.emit('waybill-status-changed', payload);
    if (payload.yardId) {
      this.server.to(`yard:${payload.yardId}`).emit('yard-update', payload);
    }
  }
}
