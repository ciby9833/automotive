import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CronJob } from 'cron';
import { DataSource } from 'typeorm';
import { EffectiveScope } from '../../common/scope/scope.types';

type PolicyRow = {
  organization_id: string;
  timezone: string;
  business_day_cutoff: string;
  snapshot_started_at: Date;
  long_stay_days: number;
  lock_timeout_hours: number;
  utilization_warning_percent: number;
  utilization_critical_percent: number;
  expected_arrival_warning_hours: number;
};

export type SnapshotStatusRow = {
  organization_id: string;
  organization_code: string;
  organization_name: string;
  timezone: string;
  business_day_cutoff: string;
  snapshot_enabled: boolean;
  business_date: string | null;
  status: 'STARTED' | 'COMPLETED' | 'FAILED' | null;
  started_at: Date | null;
  completed_at: Date | null;
  is_consistent: boolean | null;
  quality_issues: Record<string, number> | null;
  yard_count: number | null;
  slot_count: number | null;
  inventory_count: number | null;
  inbound_count: number | null;
  outbound_count: number | null;
  error_message: string | null;
};

@Injectable()
export class DailySnapshotService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(DailySnapshotService.name);
  private scheduler: CronJob | null = null;
  private captureInProgress: Promise<void> | null = null;

  constructor(
    private readonly dataSource: DataSource,
    private readonly config: ConfigService,
  ) {}

  onApplicationBootstrap(): void {
    const cronExpression = this.config.getOrThrow<string>(
      'snapshot.schedulerCron',
    );
    this.scheduler = CronJob.from({
      cronTime: cronExpression,
      timeZone: 'UTC',
      waitForCompletion: true,
      start: true,
      onTick: () =>
        void this.captureAllDue().catch((error: Error) => {
          this.logger.error(`每日快照调度失败: ${error.message}`, error.stack);
        }),
    });
    void this.captureAllDue().catch((error: Error) => {
      this.logger.error(
        `启动时补跑每日快照失败: ${error.message}`,
        error.stack,
      );
    });
  }

  async onApplicationShutdown(): Promise<void> {
    await this.scheduler?.stop();
    await this.captureInProgress;
  }

  async captureAllDue(): Promise<void> {
    if (this.captureInProgress) {
      return this.captureInProgress;
    }
    const capture = this.captureAllDueInternal();
    this.captureInProgress = capture;
    try {
      await capture;
    } finally {
      if (this.captureInProgress === capture) {
        this.captureInProgress = null;
      }
    }
  }

  private async captureAllDueInternal(): Promise<void> {
    const policies: PolicyRow[] = await this.dataSource.query(`
      SELECT
        organization_id, timezone, business_day_cutoff,
        snapshot_started_at, long_stay_days, lock_timeout_hours,
        utilization_warning_percent, utilization_critical_percent,
        expected_arrival_warning_hours
      FROM organization_operating_policies
      WHERE snapshot_enabled = true
        AND organization_id IN (SELECT id FROM organizations WHERE "isActive" = true)
      ORDER BY organization_id
    `);
    for (const policy of policies) {
      const dates = await this.getDueBusinessDates(policy);
      for (const businessDate of dates) {
        await this.captureOrganizationDay(policy, businessDate);
      }
    }
  }

  async getStatus(scope: EffectiveScope): Promise<SnapshotStatusRow[]> {
    if (scope.type !== 'ORG') return [];
    return this.dataSource.query<SnapshotStatusRow[]>(
      `
      SELECT
        o.id AS organization_id,
        o.code AS organization_code,
        o.name AS organization_name,
        p.timezone,
        p.business_day_cutoff,
        p.snapshot_enabled,
        latest.business_date,
        latest.status,
        latest.started_at,
        latest.completed_at,
        latest.is_consistent,
        latest.quality_issues,
        latest.yard_count,
        latest.slot_count,
        latest.inventory_count,
        latest.inbound_count,
        latest.outbound_count,
        latest.error_message
      FROM organizations o
      JOIN organization_operating_policies p ON p.organization_id = o.id
      LEFT JOIN LATERAL (
        SELECT run.*
        FROM daily_snapshot_runs run
        WHERE run.organization_id = o.id
        ORDER BY run.business_date DESC
        LIMIT 1
      ) latest ON true
      WHERE o.id = ANY($1::uuid[])
      ORDER BY o.name
      `,
      [scope.orgIds],
    );
  }

  private async getDueBusinessDates(policy: PolicyRow): Promise<string[]> {
    const rows: Array<{ business_date: string }> = await this.dataSource.query(
      `
      WITH calendar AS (
        SELECT
          (CURRENT_TIMESTAMP AT TIME ZONE $2) AS local_now,
          ($3::timestamptz AT TIME ZONE $2) AS local_started,
          $4::time AS cutoff
      ),
      bounds AS (
        SELECT
          CASE
            WHEN local_started::time <= cutoff THEN local_started::date
            ELSE local_started::date + 1
          END AS first_complete_date,
          CASE
            WHEN local_now::time >= cutoff THEN local_now::date - 1
            ELSE local_now::date - 2
          END AS latest_complete_date
        FROM calendar
      ),
      last_run AS (
        SELECT MAX(business_date) AS business_date
        FROM daily_snapshot_runs
        WHERE organization_id = $1
          AND status = 'COMPLETED'
      )
      SELECT day::date::text AS business_date
      FROM bounds
      CROSS JOIN last_run
      CROSS JOIN LATERAL generate_series(
        GREATEST(
          bounds.first_complete_date,
          COALESCE(last_run.business_date + 1, bounds.first_complete_date)
        ),
        bounds.latest_complete_date,
        interval '1 day'
      ) day
      ORDER BY day
      `,
      [
        policy.organization_id,
        policy.timezone,
        policy.snapshot_started_at,
        policy.business_day_cutoff,
      ],
    );
    return rows.map((row) => row.business_date);
  }

  private async captureOrganizationDay(
    policy: PolicyRow,
    businessDate: string,
  ): Promise<void> {
    const windowRows: Array<{ window_start: Date; window_end: Date }> =
      await this.dataSource.query(
        `
        SELECT
          (($1::date + $2::time) AT TIME ZONE $3) AS window_start,
          ((($1::date + 1) + $2::time) AT TIME ZONE $3) AS window_end
        `,
        [businessDate, policy.business_day_cutoff, policy.timezone],
      );
    const { window_start: windowStart, window_end: windowEnd } = windowRows[0];
    const policySnapshot = {
      timezone: policy.timezone,
      businessDayCutoff: policy.business_day_cutoff,
      longStayDays: Number(policy.long_stay_days),
      lockTimeoutHours: Number(policy.lock_timeout_hours),
      utilizationWarningPercent: Number(policy.utilization_warning_percent),
      utilizationCriticalPercent: Number(policy.utilization_critical_percent),
      expectedArrivalWarningHours: Number(
        policy.expected_arrival_warning_hours,
      ),
    };

    const inserted: Array<{ id: string }> = await this.dataSource.query(
      `
      INSERT INTO daily_snapshot_runs (
        id, organization_id, business_date, timezone, business_day_cutoff,
        window_start, window_end, policy, status, started_at
      ) VALUES (
        uuid_generate_v4(), $1, $2, $3, $4, $5, $6, $7::jsonb, 'STARTED', NOW()
      )
      ON CONFLICT (organization_id, business_date) DO UPDATE SET
        timezone = EXCLUDED.timezone,
        business_day_cutoff = EXCLUDED.business_day_cutoff,
        window_start = EXCLUDED.window_start,
        window_end = EXCLUDED.window_end,
        policy = EXCLUDED.policy,
        status = 'STARTED',
        started_at = NOW(),
        completed_at = NULL,
        error_message = NULL
      WHERE daily_snapshot_runs.status = 'FAILED'
      RETURNING id
      `,
      [
        policy.organization_id,
        businessDate,
        policy.timezone,
        policy.business_day_cutoff,
        windowStart,
        windowEnd,
        JSON.stringify(policySnapshot),
      ],
    );
    if (!inserted[0]) return;
    const runId = inserted[0].id;

    const runner = this.dataSource.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    try {
      await runner.query(
        `
        WITH latest AS (
          SELECT DISTINCT ON (yard_id)
            yard_id, event_type, state
          FROM yard_state_events
          WHERE organization_id = $1 AND occurred_at < $4
          ORDER BY yard_id, occurred_at DESC, id DESC
        )
        INSERT INTO yard_daily_snapshots (
          id, snapshot_run_id, business_date, organization_id, yard_id,
          yard_code, yard_name, yard_address, is_active,
          total_slots, used_slots, locked_slots, long_stay_slots,
          vehicles_on_site, captured_at
        )
        SELECT
          uuid_generate_v4(), $2, $3, $1, l.yard_id,
          l.state->>'code', l.state->>'name', l.state->>'address',
          COALESCE((l.state->>'isActive')::boolean, false),
          0, 0, 0, 0, 0, NOW()
        FROM latest l
        WHERE l.event_type <> 'DELETED'
        `,
        [policy.organization_id, runId, businessDate, windowEnd],
      );

      await runner.query(
        `
        WITH latest AS (
          SELECT DISTINCT ON (slot_id)
            slot_id, yard_id, event_type, state
          FROM yard_slot_state_events
          WHERE organization_id = $1
            AND occurred_at < $4
          ORDER BY slot_id, occurred_at DESC, id DESC
        )
        INSERT INTO slot_daily_snapshots (
          id, snapshot_run_id, business_date, organization_id, yard_id,
          slot_id, zone_id, zone_code, line, "row", slot_code, zone_is_active, zone_purpose,
          status, current_vin, assigned_at, is_locked, locked_at, captured_at
        )
        SELECT
          uuid_generate_v4(), $2, $3, $1, l.yard_id, l.slot_id,
          NULLIF(l.state->>'zone_id', '')::uuid,
          l.state->>'zone_code',
          NULLIF(l.state->>'line', '')::int,
          NULLIF(l.state->>'row', '')::int,
          CASE WHEN l.state->>'zone_code' IS NOT NULL
            THEN (l.state->>'zone_code') || '-' || LPAD(NULLIF(l.state->>'line', '')::int::text, 2, '0')
              || '-' || LPAD(NULLIF(l.state->>'row', '')::int::text, 2, '0')
            ELSE NULL
          END,
          (l.state->>'zone_is_active')::boolean, l.state->>'zone_purpose',
          l.state->>'status', l.state->>'current_vin',
          NULLIF(l.state->>'assigned_at', '')::timestamptz,
          COALESCE((l.state->>'is_locked')::boolean, false),
          NULLIF(l.state->>'locked_at', '')::timestamptz,
          NOW()
        FROM latest l
        WHERE l.event_type <> 'DELETED'
        `,
        [policy.organization_id, runId, businessDate, windowEnd],
      );

      await runner.query(
        `
        WITH latest AS (
          SELECT DISTINCT ON (inventory_id) inventory_id, after_state AS state
          FROM inventory_movements WHERE organization_id=$3 AND occurred_at<$4
          ORDER BY inventory_id, id DESC
        )
        INSERT INTO inventory_daily_snapshots (
          id,snapshot_run_id,business_date,organization_id,yard_id,inventory_id,position,
          slot_id,slot_code,vin,assigned_at,stay_days,order_id,order_vin_slot_id,order_code,customer_id,brand,model,color,vehicle_type)
        SELECT uuid_generate_v4(),$1,$2,$3,(l.state->>'yardId')::uuid,l.inventory_id,l.state->>'position',
          (l.state->>'slotId')::uuid,s.slot_code,l.state->>'vin',(l.state->>'enteredAt')::timestamptz,
          GREATEST(0,FLOOR(EXTRACT(EPOCH FROM ($4::timestamptz-(l.state->>'enteredAt')::timestamptz))/86400))::int,
          (l.state->'vehicle'->>'orderId')::uuid,(l.state->'vehicle'->>'slotId')::uuid,o."orderCode",o.customer_id,
          l.state->'vehicle'->>'brand',l.state->'vehicle'->>'model',l.state->'vehicle'->>'color',l.state->'vehicle'->>'vehicleType'
        FROM latest l LEFT JOIN slot_daily_snapshots s ON s.snapshot_run_id=$1 AND s.slot_id=(l.state->>'slotId')::uuid
        LEFT JOIN orders o ON o.id=(l.state->'vehicle'->>'orderId')::uuid
        WHERE l.state->>'closedAt' IS NULL`,
        [runId, businessDate, policy.organization_id, windowEnd],
      );

      await runner.query(
        `
        UPDATE yard_daily_snapshots y
        SET
          total_slots = stats.total_slots,
          usable_capacity = stats.usable_capacity,
          occupied_usable = stats.occupied_usable,
          used_slots = stats.used_slots,
          locked_slots = stats.locked_slots,
          long_stay_slots = stats.long_stay_slots,
          vehicles_on_site = stats.vehicles_on_site
        FROM (
          SELECT
            yard_id,
            COUNT(*)::int AS total_slots,
            COUNT(*) FILTER(WHERE zone_is_active AND NOT is_locked)::int AS usable_capacity,
            COUNT(*) FILTER(WHERE zone_is_active AND NOT is_locked AND status='OCCUPIED')::int AS occupied_usable,
            COUNT(*) FILTER (WHERE status = 'OCCUPIED')::int AS used_slots,
            COUNT(*) FILTER (WHERE is_locked)::int AS locked_slots,
            COUNT(*) FILTER (
              WHERE status = 'OCCUPIED'
                AND assigned_at < $2::timestamptz
                  - ($3::int * interval '1 day')
            )::int AS long_stay_slots,
            COUNT(DISTINCT current_vin) FILTER (
              WHERE status = 'OCCUPIED' AND current_vin IS NOT NULL
            )::int AS vehicles_on_site
          FROM slot_daily_snapshots
          WHERE snapshot_run_id = $1
          GROUP BY yard_id
        ) stats
        WHERE y.snapshot_run_id = $1 AND y.yard_id = stats.yard_id
        `,
        [runId, windowEnd, policy.long_stay_days],
      );

      await runner.query(
        `UPDATE yard_daily_snapshots y SET vehicles_on_site=(SELECT count(*) FROM inventory_daily_snapshots i
        WHERE i.snapshot_run_id=$1 AND i.yard_id=y.yard_id) WHERE y.snapshot_run_id=$1`,
        [runId],
      );
      await runner.query(
        `INSERT INTO vehicle_movement_daily_snapshots(
        id,snapshot_run_id,business_date,organization_id,movement_type,source_type,source_id,ledger_id,movement_kind,delta,
        occurred_at,vin,yard_id,slot_id,order_id,waybill_id)
        SELECT uuid_generate_v4(),$1,$2,$3,
          CASE WHEN m.delta>0 THEN 'INBOUND'::daily_movement_type_enum ELSE 'OUTBOUND'::daily_movement_type_enum END,
          'INVENTORY_LEDGER',NULL,m.id,m.kind,m.delta,m.occurred_at,m.vin,m.yard_id,
          (m.after_state->>'slotId')::uuid,(m.after_state->'vehicle'->>'orderId')::uuid,m.waybill_id
        FROM inventory_movements m WHERE m.organization_id=$3 AND m.occurred_at >= $4 AND m.occurred_at < $5 AND m.delta<>0`,
        [runId, businessDate, policy.organization_id, windowStart, windowEnd],
      );

      const rawQuality: unknown = await runner.query(
        `
        SELECT
          (
            SELECT COUNT(*) FROM (
              SELECT vin
              FROM inventory_daily_snapshots
              WHERE snapshot_run_id = $1
              GROUP BY vin HAVING COUNT(*) > 1
            ) duplicate
          )::int AS duplicate_vins,
          (
            SELECT COUNT(*)
            FROM inventory_daily_snapshots
            WHERE snapshot_run_id = $1
              AND (
                order_id IS NULL
                OR order_vin_slot_id IS DISTINCT FROM slot_id
              )
          )::int AS unmatched_inventory
        `,
        [runId],
      );
      const firstQuality =
        Array.isArray(rawQuality) && rawQuality.length > 0
          ? (rawQuality[0] as Record<string, unknown>)
          : {};
      const quality = {
        duplicate_vins: Number(firstQuality.duplicate_vins ?? 0),
        unmatched_inventory: Number(firstQuality.unmatched_inventory ?? 0),
      };

      await runner.query(
        `
        UPDATE daily_snapshot_runs SET
          status = 'COMPLETED',
          completed_at = NOW(),
          yard_count = (SELECT COUNT(*) FROM yard_daily_snapshots
            WHERE snapshot_run_id = $1),
          slot_count = (SELECT COUNT(*) FROM slot_daily_snapshots
            WHERE snapshot_run_id = $1),
          inventory_count = (SELECT COUNT(*) FROM inventory_daily_snapshots
            WHERE snapshot_run_id = $1),
          inbound_count = (SELECT COUNT(*) FROM vehicle_movement_daily_snapshots
            WHERE snapshot_run_id = $1 AND movement_kind = 'INBOUND'),
          outbound_count = (SELECT COUNT(*) FROM vehicle_movement_daily_snapshots
            WHERE snapshot_run_id = $1 AND movement_kind = 'DEPARTURE'),
          is_consistent = $2,
          quality_issues = $3::jsonb
        WHERE id = $1
        `,
        [
          runId,
          quality.duplicate_vins === 0 && quality.unmatched_inventory === 0,
          JSON.stringify(quality),
        ],
      );
      await runner.commitTransaction();
    } catch (error) {
      await runner.rollbackTransaction();
      await this.dataSource.query(
        `
        UPDATE daily_snapshot_runs
        SET status = 'FAILED', completed_at = NOW(), error_message = $2
        WHERE id = $1
        `,
        [runId, (error as Error).message.slice(0, 4000)],
      );
      throw error;
    } finally {
      await runner.release();
    }
  }
}
