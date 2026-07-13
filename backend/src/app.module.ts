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
        // 生产/预发环境不使用 synchronize，schema 变更统一走 src/database/migrations
        // （npm run migration:generate / migration:run），本地开发可用 DB_SYNCHRONIZE=true 提速
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
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
