import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import configuration from './config/configuration';

import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { OrganizationsModule } from './modules/organizations/organizations.module';
import { YardsModule } from './modules/yards/yards.module';
import { CarriersModule } from './modules/carriers/carriers.module';
import { CustomersModule } from './modules/customers/customers.module';
import { WaybillsModule } from './modules/waybills/waybills.module';
import { OutboundModule } from './modules/outbound/outbound.module';
import { FinanceModule } from './modules/finance/finance.module';
import { TrackingModule } from './modules/tracking/tracking.module';
import { StorageModule } from './modules/storage/storage.module';
import { QueueModule } from './modules/queue/queue.module';
import { InvitationsModule } from './modules/invitations/invitations.module';
import { InboundModule } from './modules/inbound/inbound.module';
import { ScopeModule } from './common/scope/scope.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { AppReleasesModule } from './modules/app-releases/app-releases.module';
import { TransportModule } from './modules/transport/transport.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get<string>('database.host'),
        port: configService.get<number>('database.port'),
        username: configService.get<string>('database.username'),
        password: configService.get<string>('database.password'),
        database: configService.get<string>('database.database'),
        autoLoadEntities: true,
        migrations: [__dirname + '/database/migrations/*{.ts,.js}'],
        // schema 变更统一走 migration；启动只检查，不自动修改业务数据库。
        synchronize: configService.get<boolean>('database.synchronize'),
      }),
    }),
    QueueModule,
    StorageModule,
    ScopeModule,
    AuthModule,
    UsersModule,
    OrganizationsModule,
    YardsModule,
    CarriersModule,
    CustomersModule,
    WaybillsModule,
    FinanceModule,
    TrackingModule,
    InvitationsModule,
    InboundModule,
    OutboundModule,
    DashboardModule,
    AppReleasesModule,
    TransportModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
