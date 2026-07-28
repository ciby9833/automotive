import { Injectable } from '@nestjs/common';
import { DataSource, In } from 'typeorm';
import { EffectiveScope } from '../../common/scope/scope.types';
import { ScopeService } from '../../common/scope/scope.service';
import { OrderStatus } from '../../common/enums/order-status.enum';
import { OrderVinArrivalStatus } from '../../common/enums/order-vin-status.enum';
import { TransportType } from '../../common/enums/order-type.enum';
import { Role } from '../../common/enums/role.enum';
import { Yard } from '../yards/entities/yard.entity';
import { YardSlot, YardSlotStatus } from '../yards/entities/yard-slot.entity';
import { Order } from '../orders/entities/order.entity';

type Metric = {
  value: number;
  previous: number | null;
  changePercent: number | null;
};

type DashboardQuery = {
  organizationId?: string;
  yardId?: string;
  timezone?: string;
};

type OperatingPolicyRow = {
  organization_id: string;
  timezone: string;
  business_day_cutoff: string;
  long_stay_days: number;
  lock_timeout_hours: number;
  utilization_warning_percent: number;
  utilization_critical_percent: number;
  expected_arrival_warning_hours: number;
};

type DataQualitySlot = {
  organizationId: string;
  organizationCode: string;
  organizationName: string;
  yardId: string;
  yardCode: string;
  yardName: string;
  slotId: string;
  slotCode: string;
  status: string;
  assignedAt: string | null;
  isLocked: boolean;
};

@Injectable()
export class DashboardService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly scopeService: ScopeService,
  ) {}

  async getDashboard(
    scope: EffectiveScope,
    query: DashboardQuery,
  ): Promise<Record<string, unknown>> {
    if (scope.type !== 'ORG') {
      return {
        generatedAt: new Date().toISOString(),
        metrics: {},
        yards: [],
        slots: [],
        alerts: [],
      };
    }

    const timezone = this.normalizeTimezone(query.timezone);
    const yardRepo = this.dataSource.getRepository(Yard);
    const yardQb = yardRepo
      .createQueryBuilder('yard')
      .leftJoinAndSelect('yard.organization', 'organization')
      .where('yard.isActive = true')
      .orderBy('organization.name', 'ASC')
      .addOrderBy('yard.name', 'ASC');
    this.scopeService.applyScopeToQuery(yardQb, 'yard', scope, {
      yardIdCols: ['id'],
    });
    const allAccessibleYards = await yardQb.getMany();
    const availableYards = query.organizationId
      ? scope.orgIds.includes(query.organizationId)
        ? allAccessibleYards.filter(
            (yard) => yard.organizationId === query.organizationId,
          )
        : []
      : allAccessibleYards;
    let yards = availableYards;

    if (query.yardId) {
      if (!yards.some((yard) => yard.id === query.yardId)) {
        // 区分“无此场地”与“越权场地”的信息会泄露资源存在性，统一返回空范围。
        yards = [];
      } else {
        yards = yards.filter((yard) => yard.id === query.yardId);
      }
    }

    const yardIds = yards.map((yard) => yard.id);
    if (yardIds.length === 0) {
      return this.emptyDashboard(timezone);
    }

    const policies: OperatingPolicyRow[] = await this.dataSource.query(
      `
      SELECT
        organization_id, timezone, business_day_cutoff, long_stay_days,
        lock_timeout_hours, utilization_warning_percent,
        utilization_critical_percent, expected_arrival_warning_hours
      FROM organization_operating_policies
      WHERE organization_id = ANY($1::uuid[])
      `,
      [Array.from(new Set(yards.map((yard) => yard.organizationId)))],
    );
    const policyByOrg = new Map(
      policies.map((policy) => [policy.organization_id, policy]),
    );

    const slotRepo = this.dataSource.getRepository(YardSlot);
    const allSlots = await slotRepo.find({
      where: { yardId: In(yardIds) },
      order: { code: 'ASC' },
    });
    const selectedYardId = query.yardId ?? yards[0].id;
    const selectedSlots = allSlots.filter(
      (slot) => slot.yardId === selectedYardId,
    );

    const totalSlots = allSlots.length;
    const usedSlots = allSlots.filter(
      (slot) => slot.status === YardSlotStatus.OCCUPIED,
    ).length;
    const vehiclesOnSite = new Set(
      allSlots
        .filter(
          (slot) =>
            slot.status === YardSlotStatus.OCCUPIED && Boolean(slot.currentVin),
        )
        .map((slot) => slot.currentVin),
    ).size;

    const previous = await this.getPreviousMonthSnapshot(
      query.yardId || (scope.role === Role.YARD_STAFF && scope.scopeYardId)
        ? { yardIds }
        : {
            organizationIds: Array.from(
              new Set(yards.map((yard) => yard.organizationId)),
            ),
          },
    );
    const activity = await this.getDailyActivity(yardIds);
    const selectedOrganizationIds = new Set(
      yards.map((yard) => yard.organizationId),
    );
    const alerts = await this.getAlerts(
      yards,
      allSlots,
      policyByOrg,
      availableYards.filter((yard) =>
        selectedOrganizationIds.has(yard.organizationId),
      ),
    );
    const selectedPolicy = policyByOrg.get(
      yards.find((yard) => yard.id === selectedYardId)?.organizationId ?? '',
    );

    return {
      generatedAt: new Date().toISOString(),
      timezone,
      thresholds: {
        utilizationPercent: selectedPolicy
          ? Number(selectedPolicy.utilization_warning_percent)
          : null,
        lockTimeoutHours: selectedPolicy?.lock_timeout_hours ?? null,
        longStayDays: selectedPolicy?.long_stay_days ?? null,
      },
      metrics: {
        yards: this.metric(yards.length, previous?.yards ?? null),
        totalSlots: this.metric(totalSlots, previous?.totalSlots ?? null),
        usedSlots: this.metric(usedSlots, previous?.usedSlots ?? null),
        utilization: this.metric(
          totalSlots === 0 ? 0 : (usedSlots / totalSlots) * 100,
          previous?.utilization ?? null,
        ),
        vehiclesOnSite: this.metric(
          vehiclesOnSite,
          previous?.vehiclesOnSite ?? null,
        ),
        inboundToday: this.metric(
          activity.inboundToday,
          activity.inboundYesterday,
        ),
        outboundToday: this.metric(
          activity.outboundToday,
          activity.outboundYesterday,
        ),
      },
      comparison: {
        monthBaselineDate: previous?.snapshotDate ?? null,
        dailyBaseline: 'yesterday',
      },
      organizations: Array.from(
        new Map(
          allAccessibleYards.map((yard) => [
            yard.organizationId,
            {
              id: yard.organizationId,
              code: yard.organization?.code ?? '',
              name: yard.organization?.name ?? '',
            },
          ]),
        ).values(),
      ),
      yards: availableYards.map((yard) => ({
        id: yard.id,
        organizationId: yard.organizationId,
        organizationName: yard.organization?.name ?? '',
        code: yard.code,
        name: yard.name,
        address: yard.address,
      })),
      selectedYardId,
      slots: selectedSlots.map((slot) => ({
        id: slot.id,
        yardId: slot.yardId,
        code: slot.code,
        row: slot.row,
        slotNo: slot.slotNo,
        status: this.slotVisualStatus(
          slot,
          policyByOrg.get(
            yards.find((yard) => yard.id === slot.yardId)?.organizationId ?? '',
          )?.long_stay_days,
        ),
        currentVin: slot.currentVin,
        assignedAt: slot.assignedAt,
        stayDays: slot.assignedAt
          ? Math.max(
              0,
              Math.floor(
                (Date.now() - slot.assignedAt.getTime()) / (24 * 3600 * 1000),
              ),
            )
          : 0,
        isLocked: slot.isLocked,
        lockedAt: slot.lockedAt,
      })),
      alerts,
    };
  }

  private normalizeTimezone(value?: string): string {
    const timezone = value || 'UTC';
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format();
      return timezone;
    } catch {
      return 'UTC';
    }
  }

  private metric(value: number, previous: number | null): Metric {
    const normalized = Number(value.toFixed(1));
    if (previous === null) {
      return { value: normalized, previous: null, changePercent: null };
    }
    const changePercent =
      previous === 0
        ? normalized === 0
          ? 0
          : null
        : Number((((normalized - previous) / previous) * 100).toFixed(1));
    return {
      value: normalized,
      previous: Number(previous.toFixed(1)),
      changePercent,
    };
  }

  private async getPreviousMonthSnapshot(filter: {
    yardIds?: string[];
    organizationIds?: string[];
  }) {
    const rows: Array<{
      snapshot_date: string;
      yards: string;
      total_slots: string;
      used_slots: string;
      vehicles_on_site: string;
    }> = await this.dataSource.query(
      `
      WITH eligible AS (
        SELECT s.business_date
        FROM yard_daily_snapshots s
        JOIN daily_snapshot_runs run ON run.id = s.snapshot_run_id
        WHERE s.business_date >= date_trunc('month', CURRENT_DATE) - interval '1 month'
          AND s.business_date < date_trunc('month', CURRENT_DATE)
          AND run.status = 'COMPLETED'
          AND run.is_consistent = true
          AND (
            ($1::uuid[] IS NOT NULL AND s.yard_id = ANY($1::uuid[]))
            OR
            ($2::uuid[] IS NOT NULL AND s.organization_id = ANY($2::uuid[]))
          )
        GROUP BY s.business_date
        HAVING COUNT(DISTINCT CASE
          WHEN $1::uuid[] IS NOT NULL THEN s.yard_id
          ELSE s.organization_id
        END) = $3
      ),
      baseline AS (
        SELECT MAX(business_date) AS snapshot_date FROM eligible
      )
      SELECT
        b.snapshot_date,
        COUNT(*) FILTER (WHERE s.is_active)::text AS yards,
        COALESCE(SUM(s.total_slots), 0)::text AS total_slots,
        COALESCE(SUM(s.used_slots), 0)::text AS used_slots,
        (
          SELECT COUNT(DISTINCT inventory.vin)::text
          FROM inventory_daily_snapshots inventory
          JOIN daily_snapshot_runs inventory_run
            ON inventory_run.id = inventory.snapshot_run_id
          WHERE inventory.business_date = b.snapshot_date
            AND inventory_run.status = 'COMPLETED'
            AND inventory_run.is_consistent = true
            AND (
              ($1::uuid[] IS NOT NULL AND inventory.yard_id = ANY($1::uuid[]))
              OR
              (
                $2::uuid[] IS NOT NULL
                AND inventory.organization_id = ANY($2::uuid[])
              )
            )
        ) AS vehicles_on_site
      FROM baseline b
      JOIN yard_daily_snapshots s ON s.business_date = b.snapshot_date
      WHERE (
        $1::uuid[] IS NOT NULL
        AND s.yard_id = ANY($1::uuid[])
      ) OR (
        $2::uuid[] IS NOT NULL
        AND s.organization_id = ANY($2::uuid[])
      )
      GROUP BY b.snapshot_date
      `,
      [
        filter.yardIds ?? null,
        filter.organizationIds ?? null,
        filter.yardIds?.length ?? filter.organizationIds?.length ?? 0,
      ],
    );
    if (!rows[0]) return null;
    const totalSlots = Number(rows[0].total_slots);
    const usedSlots = Number(rows[0].used_slots);
    return {
      snapshotDate: rows[0].snapshot_date,
      yards: Number(rows[0].yards),
      totalSlots,
      usedSlots,
      vehiclesOnSite: Number(rows[0].vehicles_on_site),
      utilization: totalSlots === 0 ? 0 : (usedSlots / totalSlots) * 100,
    };
  }

  private async getDailyActivity(yardIds: string[]) {
    const inboundResult: Array<{ today: string; yesterday: string }> =
      await this.dataSource.query(
        `
        WITH boundaries AS (
          SELECT
            p.organization_id,
            (
              (
                CASE
                  WHEN (CURRENT_TIMESTAMP AT TIME ZONE p.timezone)::time
                    >= p.business_day_cutoff
                  THEN (CURRENT_TIMESTAMP AT TIME ZONE p.timezone)::date
                  ELSE (CURRENT_TIMESTAMP AT TIME ZONE p.timezone)::date - 1
                END
                + p.business_day_cutoff
              ) AT TIME ZONE p.timezone
            ) AS today_start
          FROM organization_operating_policies p
        ),
        scoped AS (
          SELECT COALESCE(log.event_at, log.created_at) occurred_at,
            COALESCE(log.yard_id, slot.yard_id, orders.destination_yard_id) yard_id,
            COALESCE(yard.organization_id, orders.organization_id) organization_id
          FROM operation_logs log
          LEFT JOIN yard_slots slot ON slot.id = log.slot_id
          LEFT JOIN orders ON orders.id = log.order_id
          LEFT JOIN yards yard ON yard.id =
            COALESCE(log.yard_id, slot.yard_id, orders.destination_yard_id)
          WHERE log.operation_type IN ('INBOUND_SCAN', 'INBOUND_UNEXPECTED')
        )
        SELECT
          COUNT(*) FILTER (
            WHERE scoped.occurred_at >= boundaries.today_start
          )::text AS today,
          COUNT(*) FILTER (
            WHERE scoped.occurred_at >= boundaries.today_start - interval '1 day'
              AND scoped.occurred_at < boundaries.today_start
          )::text AS yesterday
        FROM scoped
        JOIN boundaries USING (organization_id)
        WHERE scoped.yard_id = ANY($1::uuid[])
        `,
        [yardIds],
      );

    const outboundResult: Array<{ today: string; yesterday: string }> =
      await this.dataSource.query(
        `
        WITH boundaries AS (
          SELECT
            p.organization_id,
            (
              (
                CASE
                  WHEN (CURRENT_TIMESTAMP AT TIME ZONE p.timezone)::time
                    >= p.business_day_cutoff
                  THEN (CURRENT_TIMESTAMP AT TIME ZONE p.timezone)::date
                  ELSE (CURRENT_TIMESTAMP AT TIME ZONE p.timezone)::date - 1
                END
                + p.business_day_cutoff
              ) AT TIME ZONE p.timezone
            ) AS today_start
          FROM organization_operating_policies p
        )
        SELECT
          COUNT(*) FILTER (
            WHERE log.created_at >= boundaries.today_start
          )::text AS today,
          COUNT(*) FILTER (
            WHERE log.created_at >= boundaries.today_start - interval '1 day'
              AND log.created_at < boundaries.today_start
          )::text AS yesterday
        FROM waybill_status_logs log
        JOIN waybills waybill ON waybill.id = log.waybill_id
        JOIN boundaries ON boundaries.organization_id = waybill.organization_id
        WHERE log.action = 'DELIVERY_DEPARTURE'
          AND COALESCE(log.yard_id, waybill.origin_yard_id) = ANY($1::uuid[])
        `,
        [yardIds],
      );
    const inboundRows = inboundResult[0];
    const outboundRows = outboundResult[0];

    return {
      inboundToday: Number(inboundRows?.today ?? 0),
      inboundYesterday: Number(inboundRows?.yesterday ?? 0),
      outboundToday: Number(outboundRows?.today ?? 0),
      outboundYesterday: Number(outboundRows?.yesterday ?? 0),
    };
  }

  private async getAlerts(
    yards: Yard[],
    slots: YardSlot[],
    policyByOrg: Map<string, OperatingPolicyRow>,
    dataQualityScopeYards: Yard[],
  ) {
    const alerts = await this.getDataQualityAlerts(
      yards,
      dataQualityScopeYards,
    );
    const yardById = new Map(yards.map((yard) => [yard.id, yard]));
    const slotsByYard = new Map<string, YardSlot[]>();
    for (const slot of slots) {
      slotsByYard.set(slot.yardId, [
        ...(slotsByYard.get(slot.yardId) ?? []),
        slot,
      ]);
    }

    for (const yard of yards) {
      const policy = policyByOrg.get(yard.organizationId);
      if (!policy) continue;
      const yardSlots = slotsByYard.get(yard.id) ?? [];
      const used = yardSlots.filter(
        (slot) => slot.status === YardSlotStatus.OCCUPIED,
      ).length;
      const rate = yardSlots.length === 0 ? 0 : (used / yardSlots.length) * 100;
      if (rate >= Number(policy.utilization_warning_percent)) {
        alerts.push({
          id: `utilization-${yard.id}`,
          type: 'UTILIZATION',
          severity:
            rate >= Number(policy.utilization_critical_percent)
              ? 'critical'
              : 'warning',
          yardId: yard.id,
          yardName: yard.name,
          title: '库位使用率预警',
          detail: `${rate.toFixed(1)}% · ${used}/${yardSlots.length} 个库位`,
          occurredAt: new Date().toISOString(),
        });
      }
    }

    for (const slot of slots) {
      if (!slot.isLocked) continue;
      const yard = yardById.get(slot.yardId);
      const policy = yard ? policyByOrg.get(yard.organizationId) : undefined;
      if (!policy) continue;
      const lockedAt = slot.lockedAt ?? slot.updatedAt;
      const hours = (Date.now() - lockedAt.getTime()) / 3600000;
      if (hours >= policy.lock_timeout_hours) {
        alerts.push({
          id: `locked-${slot.id}`,
          type: 'LOCK_TIMEOUT',
          severity: 'critical',
          yardId: slot.yardId,
          yardName: yardById.get(slot.yardId)?.name ?? '',
          slotCode: slot.code,
          title: '库位锁定超时',
          detail: `${slot.code} · 已锁定 ${Math.floor(hours)} 小时`,
          occurredAt: lockedAt.toISOString(),
        });
      }
    }

    const longStayByYard = new Map<string, { count: number; oldest: number }>();
    for (const slot of slots) {
      if (
        slot.status !== YardSlotStatus.OCCUPIED ||
        !slot.currentVin ||
        !slot.assignedAt
      ) {
        continue;
      }
      const days = Math.floor(
        (Date.now() - slot.assignedAt.getTime()) / (24 * 3600 * 1000),
      );
      const yard = yardById.get(slot.yardId);
      const policy = yard ? policyByOrg.get(yard.organizationId) : undefined;
      if (!policy || days <= policy.long_stay_days) continue;
      const current = longStayByYard.get(slot.yardId) ?? {
        count: 0,
        oldest: 0,
      };
      longStayByYard.set(slot.yardId, {
        count: current.count + 1,
        oldest: Math.max(current.oldest, days),
      });
    }
    for (const [yardId, value] of longStayByYard) {
      const yard = yardById.get(yardId);
      const policy = yard ? policyByOrg.get(yard.organizationId) : undefined;
      if (!policy) continue;
      alerts.push({
        id: `overstay-${yardId}`,
        type: 'OVERSTAY',
        severity:
          value.oldest >= policy.long_stay_days * 2 ? 'critical' : 'warning',
        yardId,
        yardName: yardById.get(yardId)?.name ?? '',
        title: '车辆超期滞留',
        detail: `${value.count} 台超过 ${policy.long_stay_days} 天 · 最长 ${value.oldest} 天`,
        occurredAt: new Date().toISOString(),
      });
    }

    const expectedRows: Array<{
      id: string;
      orderCode: string;
      expectedArrivalDate: string;
      destinationYardId: string;
      expectedCount: string;
    }> = await this.dataSource
      .getRepository(Order)
      .createQueryBuilder('orders')
      .innerJoin('orders.vins', 'vin', 'vin.arrivalStatus = :arrivalStatus', {
        arrivalStatus: OrderVinArrivalStatus.EXPECTED,
      })
      .innerJoin(
        'organization_operating_policies',
        'policy',
        'policy.organization_id = orders.organizationId',
      )
      .select('orders.id', 'id')
      .addSelect('orders.orderCode', 'orderCode')
      .addSelect('orders.expectedArrivalDate', 'expectedArrivalDate')
      .addSelect('orders.destinationYardId', 'destinationYardId')
      .addSelect('COUNT(vin.id)', 'expectedCount')
      .where('orders.destinationYardId IN (:...yardIds)', {
        yardIds: yards.map((yard) => yard.id),
      })
      .andWhere('orders.transportType = :transportType', {
        transportType: TransportType.TRANSFER,
      })
      .andWhere('orders.status = :status', { status: OrderStatus.ACTIVE })
      .andWhere('orders.expectedArrivalDate IS NOT NULL')
      .andWhere(
        `orders.expectedArrivalDate <=
          (
            (CURRENT_TIMESTAMP AT TIME ZONE policy.timezone)
            + policy.expected_arrival_warning_hours * interval '1 hour'
          )::date`,
      )
      .groupBy('orders.id')
      .addGroupBy('orders.orderCode')
      .addGroupBy('orders.expectedArrivalDate')
      .addGroupBy('orders.destinationYardId')
      .orderBy('orders.expectedArrivalDate', 'ASC')
      .limit(10)
      .getRawMany();

    for (const row of expectedRows) {
      alerts.push({
        id: `expected-${row.id}`,
        type: 'EXPECTED_ARRIVAL',
        severity: 'info',
        yardId: row.destinationYardId,
        yardName: yardById.get(row.destinationYardId)?.name ?? '',
        title: '预计到货预警',
        detail: `${row.orderCode} · ${row.expectedArrivalDate} · ${row.expectedCount} 台`,
        occurredAt: `${row.expectedArrivalDate}T00:00:00.000Z`,
      });
    }

    const priority = { critical: 0, warning: 1, info: 2 };
    const dataQualityAlerts = alerts.filter((alert) =>
      String(alert.type).startsWith('DATA_QUALITY_'),
    );
    const operationalAlerts = alerts
      .filter((alert) => !String(alert.type).startsWith('DATA_QUALITY_'))
      .sort(
        (a, b) =>
          priority[a.severity as keyof typeof priority] -
          priority[b.severity as keyof typeof priority],
      )
      .slice(0, 30);
    return [...dataQualityAlerts, ...operationalAlerts].sort(
      (a, b) =>
        priority[a.severity as keyof typeof priority] -
        priority[b.severity as keyof typeof priority],
    );
  }

  private async getDataQualityAlerts(
    selectedYards: Yard[],
    comparisonYards: Yard[],
  ): Promise<Array<Record<string, unknown>>> {
    const selectedYardIds = selectedYards.map((yard) => yard.id);
    const comparisonYardIds = comparisonYards.map((yard) => yard.id);
    const duplicateRows: Array<{
      vin: string;
      occurred_at: Date;
      slots: DataQualitySlot[];
      related_order_vins: Array<Record<string, unknown>>;
    }> = await this.dataSource.query(
      `
      SELECT
        slot."currentVin" AS vin,
        MIN(COALESCE(slot.assigned_at, slot.updated_at)) AS occurred_at,
        jsonb_agg(
          jsonb_build_object(
            'organizationId', organization.id,
            'organizationCode', organization.code,
            'organizationName', organization.name,
            'yardId', yard.id,
            'yardCode', yard.code,
            'yardName', yard.name,
            'slotId', slot.id,
            'slotCode', slot.code,
            'status', slot.status,
            'assignedAt', slot.assigned_at,
            'isLocked', slot."isLocked"
          )
          ORDER BY organization.code, yard.code, slot.code
        ) AS slots,
        COALESCE(
          (
            SELECT jsonb_agg(
              jsonb_build_object(
                'orderVinId', related_vin.id,
                'orderId', related_order.id,
                'orderCode', related_order."orderCode",
                'transportType', related_order."transportType",
                'orderStatus', related_order.status,
                'arrivalStatus', related_vin.arrival_status,
                'linkedSlotId', related_vin.slot_id,
                'linkedSlotCode', related_slot.code,
                'linkedYardId', related_yard.id,
                'linkedYardCode', related_yard.code,
                'linkedYardName', related_yard.name,
                'updatedAt', related_vin.updated_at
              )
              ORDER BY related_vin.updated_at DESC, related_vin.id DESC
            )
            FROM order_vins related_vin
            JOIN orders related_order ON related_order.id = related_vin.order_id
            LEFT JOIN yard_slots related_slot ON related_slot.id = related_vin.slot_id
            LEFT JOIN yards related_yard ON related_yard.id = related_slot.yard_id
            WHERE related_vin.vin = slot."currentVin"
              AND related_order.organization_id IN (
                SELECT scoped_yard.organization_id
                FROM yard_slots scoped_slot
                JOIN yards scoped_yard ON scoped_yard.id = scoped_slot.yard_id
                WHERE scoped_slot.yard_id = ANY($2::uuid[])
                  AND scoped_slot.status = 'OCCUPIED'
                  AND scoped_slot."currentVin" = slot."currentVin"
              )
          ),
          '[]'::jsonb
        ) AS related_order_vins
      FROM yard_slots slot
      JOIN yards yard ON yard.id = slot.yard_id
      JOIN organizations organization ON organization.id = yard.organization_id
      WHERE slot.yard_id = ANY($2::uuid[])
        AND slot.status = 'OCCUPIED'
        AND slot."currentVin" IS NOT NULL
      GROUP BY slot."currentVin"
      HAVING COUNT(*) > 1
        AND BOOL_OR(slot.yard_id = ANY($1::uuid[]))
      ORDER BY slot."currentVin"
      `,
      [selectedYardIds, comparisonYardIds],
    );

    const unmatchedRows: Array<{
      vin: string;
      occurred_at: Date;
      organization_id: string;
      organization_code: string;
      organization_name: string;
      yard_id: string;
      yard_code: string;
      yard_name: string;
      slot_id: string;
      slot_code: string;
      assigned_at: Date | null;
      is_locked: boolean;
      effective_order_vin_id: string | null;
      effective_order_id: string | null;
      effective_order_code: string | null;
      effective_arrival_status: string | null;
      linked_slot_id: string | null;
      linked_slot_code: string | null;
      linked_yard_id: string | null;
      linked_yard_code: string | null;
      linked_yard_name: string | null;
      related_order_vins: Array<Record<string, unknown>>;
    }> = await this.dataSource.query(
      `
      SELECT
        slot."currentVin" AS vin,
        COALESCE(slot.assigned_at, slot.updated_at) AS occurred_at,
        organization.id AS organization_id,
        organization.code AS organization_code,
        organization.name AS organization_name,
        yard.id AS yard_id,
        yard.code AS yard_code,
        yard.name AS yard_name,
        slot.id AS slot_id,
        slot.code AS slot_code,
        slot.assigned_at,
        slot."isLocked" AS is_locked,
        effective.id AS effective_order_vin_id,
        effective.order_id AS effective_order_id,
        effective_order."orderCode" AS effective_order_code,
        effective.arrival_status AS effective_arrival_status,
        effective.slot_id AS linked_slot_id,
        linked_slot.code AS linked_slot_code,
        linked_yard.id AS linked_yard_id,
        linked_yard.code AS linked_yard_code,
        linked_yard.name AS linked_yard_name,
        COALESCE(related.records, '[]'::jsonb) AS related_order_vins
      FROM yard_slots slot
      JOIN yards yard ON yard.id = slot.yard_id
      JOIN organizations organization ON organization.id = yard.organization_id
      LEFT JOIN LATERAL (
        SELECT order_vin.*
        FROM order_vins order_vin
        JOIN orders candidate_order ON candidate_order.id = order_vin.order_id
        WHERE order_vin.vin = slot."currentVin"
          AND candidate_order.organization_id = yard.organization_id
        ORDER BY order_vin.updated_at DESC, order_vin.id DESC
        LIMIT 1
      ) effective ON true
      LEFT JOIN orders effective_order ON effective_order.id = effective.order_id
      LEFT JOIN yard_slots linked_slot ON linked_slot.id = effective.slot_id
      LEFT JOIN yards linked_yard ON linked_yard.id = linked_slot.yard_id
      LEFT JOIN LATERAL (
        SELECT jsonb_agg(
          jsonb_build_object(
            'orderVinId', order_vin.id,
            'orderId', candidate_order.id,
            'orderCode', candidate_order."orderCode",
            'transportType', candidate_order."transportType",
            'orderStatus', candidate_order.status,
            'arrivalStatus', order_vin.arrival_status,
            'linkedSlotId', order_vin.slot_id,
            'linkedSlotCode', candidate_slot.code,
            'linkedYardId', candidate_yard.id,
            'linkedYardCode', candidate_yard.code,
            'linkedYardName', candidate_yard.name,
            'updatedAt', order_vin.updated_at
          )
          ORDER BY order_vin.updated_at DESC, order_vin.id DESC
        ) AS records
        FROM order_vins order_vin
        JOIN orders candidate_order ON candidate_order.id = order_vin.order_id
        LEFT JOIN yard_slots candidate_slot ON candidate_slot.id = order_vin.slot_id
        LEFT JOIN yards candidate_yard ON candidate_yard.id = candidate_slot.yard_id
        WHERE order_vin.vin = slot."currentVin"
          AND candidate_order.organization_id = yard.organization_id
      ) related ON true
      WHERE slot.yard_id = ANY($1::uuid[])
        AND slot.status = 'OCCUPIED'
        AND slot."currentVin" IS NOT NULL
        AND (
          effective.id IS NULL
          OR effective.slot_id IS DISTINCT FROM slot.id
        )
      ORDER BY organization.code, yard.code, slot.code
      `,
      [selectedYardIds],
    );

    const duplicateAlerts = duplicateRows.map((row) => {
      const locations = row.slots
        .map((slot) => `${String(slot.yardCode)} / ${String(slot.slotCode)}`)
        .join('、');
      return {
        id: `data-duplicate-vin-${row.vin}`,
        type: 'DATA_QUALITY_DUPLICATE_VIN',
        severity: 'critical',
        yardId: row.slots[0]?.yardId ?? '',
        yardName: row.slots
          .map((slot) => String(slot.yardName))
          .filter((name, index, names) => names.indexOf(name) === index)
          .join('、'),
        title: 'VIN 同时占用多个库位',
        detail: `${row.vin} · ${row.slots.length} 个库位：${locations}`,
        occurredAt: row.occurred_at.toISOString(),
        diagnostics: {
          issueCode: 'DUPLICATE_OCCUPIED_VIN',
          vin: row.vin,
          currentSlots: row.slots,
          relatedOrderVins: row.related_order_vins,
        },
      };
    });

    const unmatchedAlerts = unmatchedRows.map((row) => ({
      id: `data-inventory-link-${row.slot_id}`,
      type: 'DATA_QUALITY_INVENTORY_LINK',
      severity: 'critical',
      yardId: row.yard_id,
      yardName: row.yard_name,
      slotCode: row.slot_code,
      title: row.effective_order_vin_id
        ? '库存库位与 VIN 业务关联不一致'
        : '库存 VIN 缺少业务关联',
      detail: row.effective_order_vin_id
        ? `${row.vin} · 当前 ${row.yard_code}/${row.slot_code}，业务记录关联 ${row.linked_yard_code ?? '未知场地'}/${row.linked_slot_code ?? '未关联库位'}`
        : `${row.vin} · ${row.yard_code}/${row.slot_code} 未找到本机构 VIN 业务记录`,
      occurredAt: row.occurred_at.toISOString(),
      diagnostics: {
        issueCode: row.effective_order_vin_id
          ? 'INVENTORY_SLOT_LINK_MISMATCH'
          : 'MISSING_ORDER_VIN_LINK',
        vin: row.vin,
        organization: {
          id: row.organization_id,
          code: row.organization_code,
          name: row.organization_name,
        },
        currentSlots: [
          {
            organizationId: row.organization_id,
            organizationCode: row.organization_code,
            organizationName: row.organization_name,
            yardId: row.yard_id,
            yardCode: row.yard_code,
            yardName: row.yard_name,
            slotId: row.slot_id,
            slotCode: row.slot_code,
            status: 'OCCUPIED',
            assignedAt: row.assigned_at,
            isLocked: row.is_locked,
          },
        ],
        effectiveOrderVin: row.effective_order_vin_id
          ? {
              orderVinId: row.effective_order_vin_id,
              orderId: row.effective_order_id,
              orderCode: row.effective_order_code,
              arrivalStatus: row.effective_arrival_status,
              linkedSlotId: row.linked_slot_id,
              linkedSlotCode: row.linked_slot_code,
              linkedYardId: row.linked_yard_id,
              linkedYardCode: row.linked_yard_code,
              linkedYardName: row.linked_yard_name,
            }
          : null,
        relatedOrderVins: row.related_order_vins,
      },
    }));

    return [...duplicateAlerts, ...unmatchedAlerts];
  }

  private slotVisualStatus(
    slot: YardSlot,
    longStayDays?: number,
  ): 'VACANT' | 'OCCUPIED' | 'LONG_STAY' | 'LOCKED' {
    if (slot.isLocked) return 'LOCKED';
    if (slot.status === YardSlotStatus.VACANT) return 'VACANT';
    if (
      longStayDays !== undefined &&
      slot.assignedAt &&
      Date.now() - slot.assignedAt.getTime() > longStayDays * 24 * 3600 * 1000
    ) {
      return 'LONG_STAY';
    }
    return 'OCCUPIED';
  }

  private emptyDashboard(timezone: string) {
    const zero = this.metric(0, null);
    return {
      generatedAt: new Date().toISOString(),
      timezone,
      thresholds: {
        utilizationPercent: null,
        lockTimeoutHours: null,
        longStayDays: null,
      },
      metrics: {
        yards: zero,
        totalSlots: zero,
        usedSlots: zero,
        utilization: zero,
        vehiclesOnSite: zero,
        inboundToday: zero,
        outboundToday: zero,
      },
      comparison: { monthBaselineDate: null, dailyBaseline: 'yesterday' },
      organizations: [],
      yards: [],
      selectedYardId: null,
      slots: [],
      alerts: [],
    };
  }
}
