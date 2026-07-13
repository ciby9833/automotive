import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WaybillStatusLog } from './entities/waybill-status-log.entity';

@Injectable()
export class TrackingService {
  constructor(
    @InjectRepository(WaybillStatusLog)
    private readonly logsRepository: Repository<WaybillStatusLog>,
  ) {}

  async appendLog(data: Partial<WaybillStatusLog>): Promise<WaybillStatusLog> {
    const log = this.logsRepository.create(data);
    return this.logsRepository.save(log);
  }

  async findByVin(vin: string): Promise<WaybillStatusLog[]> {
    const logs = await this.logsRepository.find({
      where: { vin },
      order: { createdAt: 'ASC' },
      relations: ['yard', 'operator'],
    });
    if (logs.length === 0) {
      throw new NotFoundException('未找到该VIN的轨迹记录');
    }
    return logs;
  }
}
