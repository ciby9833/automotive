import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 纯 A→B 运输：一台车一行明细（transport_lines），趟次（transport_trips）可跨起点/终点、跨客户拼车。
 * 不写 order_vins / 库位 / 库存；客户地点、承运商、司机、拖车全部引用既有主数据。
 * 同时移除早期原型（transport_tasks / planned_vins / actual_vins）留下的对象。
 */
export class PureTransport1789600000000 implements MigrationInterface {
  name = 'PureTransport1789600000000';

  async up(q: QueryRunner): Promise<void> {
    // ---- 早期原型（仅在开发库存在，未上线） ----
    await q.query(`
      DROP TRIGGER IF EXISTS guard_legacy_waybill ON waybill_vins;
      DROP TRIGGER IF EXISTS guard_pure_actual ON transport_actual_vins;
      DROP FUNCTION IF EXISTS guard_pure_transport_vin();
      DROP TABLE IF EXISTS transport_documents, transport_events, transport_actual_vins,
        transport_tasks, transport_planned_vins, transport_orders CASCADE;
      DELETE FROM migrations WHERE name IN ('PureTransport1789500000000','TransportTaskQuantity1789500000100');
    `);

    // ---- 主数据补充（均为可空/有默认值，不影响现有业务） ----
    await q.query(`
      ALTER TABLE customer_addresses
        ADD COLUMN kind varchar NOT NULL DEFAULT 'STORE'
        CHECK (kind IN ('STORE','FACTORY','YARD'));
      ALTER TABLE carrier_vehicles
        ADD COLUMN capacity integer CHECK (capacity IS NULL OR capacity BETWEEN 1 AND 20);
      ALTER TABLE users ADD COLUMN driver_id uuid REFERENCES drivers(id) ON DELETE SET NULL;
      CREATE UNIQUE INDEX users_driver_id_unique ON users(driver_id) WHERE driver_id IS NOT NULL;
    `);

    await q.query(`
      CREATE TABLE transport_orders (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        code varchar NOT NULL UNIQUE,
        organization_id uuid NOT NULL REFERENCES organizations(id),
        customer_id uuid NOT NULL REFERENCES customers(id),
        customer_request_no varchar NOT NULL,
        planned_pickup_date date,
        planned_delivery_date date,
        source varchar NOT NULL DEFAULT 'MANUAL' CHECK (source IN ('MANUAL','EXCEL','API')),
        remark text NOT NULL DEFAULT '',
        status varchar NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','COMPLETED','CANCELLED')),
        created_by uuid NOT NULL REFERENCES users(id),
        created_at timestamptz NOT NULL DEFAULT now(),
        completed_at timestamptz,
        UNIQUE (customer_id, customer_request_no)
      );
      CREATE INDEX transport_orders_org ON transport_orders(organization_id, created_at DESC);

      CREATE TABLE transport_trips (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        code varchar NOT NULL UNIQUE,
        organization_id uuid NOT NULL REFERENCES organizations(id),
        carrier_id uuid NOT NULL REFERENCES carriers(id),
        driver_id uuid NOT NULL REFERENCES drivers(id),
        vehicle_id uuid NOT NULL REFERENCES carrier_vehicles(id),
        tow_type varchar NOT NULL CHECK (tow_type IN ('CC','TANSYA','TOWING')),
        capacity integer NOT NULL CHECK (capacity > 0),
        status varchar NOT NULL DEFAULT 'PLANNED'
          CHECK (status IN ('PLANNED','LOADING','IN_TRANSIT','COMPLETED','CANCELLED')),
        created_by uuid NOT NULL REFERENCES users(id),
        created_at timestamptz NOT NULL DEFAULT now(),
        departed_at timestamptz,
        completed_at timestamptz,
        cancel_reason text
      );
      CREATE INDEX transport_trips_carrier ON transport_trips(carrier_id, status);
      CREATE INDEX transport_trips_org ON transport_trips(organization_id, created_at DESC);
      -- 一辆拖车 / 一个司机同一时间只跑一趟
      CREATE UNIQUE INDEX transport_trips_active_vehicle ON transport_trips(vehicle_id)
        WHERE status IN ('PLANNED','LOADING','IN_TRANSIT');
      CREATE UNIQUE INDEX transport_trips_active_driver ON transport_trips(driver_id)
        WHERE status IN ('PLANNED','LOADING','IN_TRANSIT');

      CREATE TABLE transport_lines (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        order_id uuid NOT NULL REFERENCES transport_orders(id),
        organization_id uuid NOT NULL REFERENCES organizations(id),
        customer_id uuid NOT NULL REFERENCES customers(id),
        line_no integer NOT NULL,
        vin varchar,
        origin_id uuid NOT NULL REFERENCES customer_addresses(id),
        destination_id uuid NOT NULL REFERENCES customer_addresses(id),
        vehicle_config varchar NOT NULL DEFAULT '',
        vehicle_model varchar NOT NULL DEFAULT '',
        vehicle_color varchar NOT NULL DEFAULT '',
        tow_type varchar CHECK (tow_type IN ('CC','TANSYA','TOWING')),
        carrier_id uuid REFERENCES carriers(id),
        trip_id uuid REFERENCES transport_trips(id),
        status varchar NOT NULL DEFAULT 'UNALLOCATED'
          CHECK (status IN ('UNALLOCATED','ALLOCATED','DISPATCHED','PICKED_UP','IN_TRANSIT','DELIVERED','CLOSED','CANCELLED')),
        picked_up_at timestamptz,
        picked_up_by uuid REFERENCES users(id),
        pickup_photos jsonb NOT NULL DEFAULT '[]',
        pickup_latitude double precision,
        pickup_longitude double precision,
        delivered_at timestamptz,
        delivered_by uuid REFERENCES users(id),
        delivery_photos jsonb NOT NULL DEFAULT '[]',
        end_reason text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (order_id, line_no),
        CHECK (origin_id <> destination_id),
        CHECK (status IN ('UNALLOCATED','CANCELLED') OR carrier_id IS NOT NULL),
        CHECK (status NOT IN ('DISPATCHED','PICKED_UP','IN_TRANSIT') OR trip_id IS NOT NULL),
        CHECK (status IN ('UNALLOCATED','ALLOCATED','DISPATCHED','CANCELLED') OR vin IS NOT NULL)
      );
      CREATE INDEX transport_lines_order ON transport_lines(order_id, line_no);
      CREATE INDEX transport_lines_trip ON transport_lines(trip_id);
      CREATE INDEX transport_lines_pool ON transport_lines(organization_id, status);
      CREATE INDEX transport_lines_carrier ON transport_lines(carrier_id, status);
      CREATE INDEX transport_lines_vin ON transport_lines(vin);
      -- 同一 VIN 同一时间只能有一条进行中的运输明细
      CREATE UNIQUE INDEX transport_lines_active_vin ON transport_lines(vin)
        WHERE vin IS NOT NULL AND status NOT IN ('DELIVERED','CLOSED','CANCELLED');

      CREATE TABLE transport_exceptions (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        organization_id uuid NOT NULL REFERENCES organizations(id),
        trip_id uuid NOT NULL REFERENCES transport_trips(id),
        line_id uuid REFERENCES transport_lines(id),
        vin varchar,
        type varchar NOT NULL CHECK (type IN ('UNPLANNED_VIN','DAMAGE','REFUSED','OTHER')),
        status varchar NOT NULL CHECK (status IN ('OPEN','RESOLVED','RECORDED')),
        note text NOT NULL DEFAULT '',
        photos jsonb NOT NULL DEFAULT '[]',
        resolution varchar,
        resolution_reason text,
        reported_by uuid NOT NULL REFERENCES users(id),
        reported_at timestamptz NOT NULL DEFAULT now(),
        resolved_by uuid REFERENCES users(id),
        resolved_at timestamptz
      );
      CREATE INDEX transport_exceptions_trip ON transport_exceptions(trip_id, reported_at);
      CREATE INDEX transport_exceptions_open ON transport_exceptions(organization_id, status);
      CREATE UNIQUE INDEX transport_exceptions_open_vin ON transport_exceptions(trip_id, vin)
        WHERE type = 'UNPLANNED_VIN' AND status = 'OPEN';

      -- POD：趟次内每个（起点，终点）一张或多张
      CREATE TABLE transport_documents (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        trip_id uuid NOT NULL REFERENCES transport_trips(id),
        origin_id uuid NOT NULL REFERENCES customer_addresses(id),
        destination_id uuid NOT NULL REFERENCES customer_addresses(id),
        file_key varchar NOT NULL,
        file_name varchar NOT NULL,
        mime_type varchar NOT NULL,
        uploaded_by uuid NOT NULL REFERENCES users(id),
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX transport_documents_leg ON transport_documents(trip_id, origin_id, destination_id);

      CREATE TABLE transport_events (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        organization_id uuid NOT NULL REFERENCES organizations(id),
        order_id uuid REFERENCES transport_orders(id),
        trip_id uuid REFERENCES transport_trips(id),
        line_id uuid REFERENCES transport_lines(id),
        vin varchar,
        action varchar NOT NULL,
        reason text NOT NULL DEFAULT '',
        payload jsonb NOT NULL DEFAULT '{}',
        operator_id uuid NOT NULL REFERENCES users(id),
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX transport_events_order ON transport_events(order_id, created_at);
      CREATE INDEX transport_events_trip ON transport_events(trip_id, created_at);
      CREATE INDEX transport_events_vin ON transport_events(vin, created_at);

      -- 报价：应收 = 客户+发货地+门店+拖车类型；应付 = 客户+承运商+发货地+门店或目的区域+拖车类型
      CREATE TABLE transport_tariffs (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        organization_id uuid NOT NULL REFERENCES organizations(id),
        side varchar NOT NULL CHECK (side IN ('RECEIVABLE','PAYABLE')),
        customer_id uuid NOT NULL REFERENCES customers(id),
        carrier_id uuid REFERENCES carriers(id),
        origin_id uuid NOT NULL REFERENCES customer_addresses(id),
        destination_id uuid REFERENCES customer_addresses(id),
        destination_region varchar,
        tow_type varchar NOT NULL CHECK (tow_type IN ('CC','TANSYA','TOWING')),
        price numeric(14,2) NOT NULL CHECK (price >= 0),
        currency varchar NOT NULL,
        valid_from date NOT NULL,
        valid_to date,
        remark text NOT NULL DEFAULT '',
        created_by uuid NOT NULL REFERENCES users(id),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CHECK (valid_to IS NULL OR valid_to >= valid_from),
        CHECK (side = 'PAYABLE' OR (carrier_id IS NULL AND destination_id IS NOT NULL AND destination_region IS NULL)),
        CHECK (side = 'RECEIVABLE' OR (carrier_id IS NOT NULL AND (destination_id IS NOT NULL) <> (destination_region IS NOT NULL)))
      );
      CREATE INDEX transport_tariffs_lookup ON transport_tariffs(side, customer_id, origin_id, tow_type);

      -- 费用：每条明细签收后生成一条应收、一条应付；无报价时金额 0（UNPRICED），内部可手工调整
      CREATE TABLE transport_charges (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        organization_id uuid NOT NULL REFERENCES organizations(id),
        line_id uuid NOT NULL REFERENCES transport_lines(id),
        trip_id uuid NOT NULL REFERENCES transport_trips(id),
        side varchar NOT NULL CHECK (side IN ('RECEIVABLE','PAYABLE')),
        customer_id uuid NOT NULL REFERENCES customers(id),
        carrier_id uuid REFERENCES carriers(id),
        tariff_id uuid REFERENCES transport_tariffs(id) ON DELETE SET NULL,
        amount numeric(14,2) NOT NULL DEFAULT 0 CHECK (amount >= 0),
        currency varchar NOT NULL,
        pricing varchar NOT NULL CHECK (pricing IN ('TARIFF','UNPRICED','MANUAL')),
        status varchar NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','CONFIRMED')),
        service_date date NOT NULL,
        manual_reason text,
        updated_by uuid REFERENCES users(id),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (line_id, side)
      );
      CREATE INDEX transport_charges_query ON transport_charges(organization_id, side, service_date);
      CREATE INDEX transport_charges_trip ON transport_charges(trip_id);
    `);

    // 纯运输与旧运单（waybill_vins）互斥占用同一 VIN：两边写入走同一把 advisory lock
    await q.query(`
      CREATE FUNCTION guard_transport_vin() RETURNS trigger LANGUAGE plpgsql AS $$
      DECLARE code text;
      BEGIN
        IF NEW.vin IS NULL THEN RETURN NEW; END IF;
        code := upper(trim(NEW.vin));
        PERFORM pg_advisory_xact_lock(hashtextextended(code, 84219));
        IF TG_TABLE_NAME = 'transport_lines' THEN
          IF NEW.status NOT IN ('DELIVERED','CLOSED','CANCELLED') AND EXISTS (
            SELECT 1 FROM waybill_vins v JOIN waybills w ON w.id = v.waybill_id
            WHERE upper(trim(v.vin)) = code AND w.status <> 'ARRIVED'
          ) THEN
            RAISE EXCEPTION 'VIN % is on an active yard waybill', code USING ERRCODE = '23505';
          END IF;
        ELSIF EXISTS (
          SELECT 1 FROM transport_lines
          WHERE vin = code AND status NOT IN ('DELIVERED','CLOSED','CANCELLED')
        ) THEN
          RAISE EXCEPTION 'VIN % is on an active transport line', code USING ERRCODE = '23505';
        END IF;
        RETURN NEW;
      END $$;
      CREATE TRIGGER guard_transport_line_vin BEFORE INSERT OR UPDATE OF vin, status ON transport_lines
        FOR EACH ROW EXECUTE FUNCTION guard_transport_vin();
      CREATE TRIGGER guard_waybill_vin_transport BEFORE INSERT OR UPDATE OF vin ON waybill_vins
        FOR EACH ROW EXECUTE FUNCTION guard_transport_vin();
    `);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`
      DROP TRIGGER IF EXISTS guard_waybill_vin_transport ON waybill_vins;
      DROP TRIGGER IF EXISTS guard_transport_line_vin ON transport_lines;
      DROP FUNCTION IF EXISTS guard_transport_vin();
      DROP TABLE transport_charges, transport_tariffs, transport_events, transport_documents,
        transport_exceptions, transport_lines, transport_trips, transport_orders;
      DROP INDEX IF EXISTS users_driver_id_unique;
      ALTER TABLE users DROP COLUMN driver_id;
      ALTER TABLE carrier_vehicles DROP COLUMN capacity;
      ALTER TABLE customer_addresses DROP COLUMN kind;
    `);
  }
}
