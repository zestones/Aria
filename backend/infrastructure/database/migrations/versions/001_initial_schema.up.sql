-- ============================================
-- ARIA — Initial Schema
-- ISA-95 hierarchy + TimescaleDB hypertables
-- ============================================
CREATE EXTENSION IF NOT EXISTS timescaledb;

-- ============================================
-- ISA-95 Equipment Hierarchy
-- ============================================
CREATE TABLE enterprise(
    id serial PRIMARY KEY,
    name varchar(45) NOT NULL UNIQUE,
    disable BOOLEAN NOT NULL DEFAULT FALSE,
    created_at timestamptz NOT NULL DEFAULT NOW(),
    updated_at timestamptz
);

CREATE TABLE site(
    id serial PRIMARY KEY,
    name varchar(45) NOT NULL UNIQUE,
    disable BOOLEAN NOT NULL DEFAULT FALSE,
    parentid integer NOT NULL REFERENCES enterprise(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT NOW(),
    updated_at timestamptz
);

CREATE INDEX ix_site_parentid ON site(parentid);

CREATE TABLE area (
    id serial PRIMARY KEY,
    name varchar(45) NOT NULL UNIQUE,
    disable BOOLEAN NOT NULL DEFAULT FALSE,
    parentid integer NOT NULL REFERENCES site(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT NOW(),
    updated_at timestamptz
);

CREATE INDEX ix_area_parentid ON area(parentid);

CREATE TABLE line (
    id serial PRIMARY KEY,
    name varchar(45) NOT NULL UNIQUE,
    disable BOOLEAN NOT NULL DEFAULT FALSE,
    parentid integer NOT NULL REFERENCES area(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT NOW(),
    updated_at timestamptz
);

CREATE INDEX ix_line_parentid ON line(parentid);

CREATE TABLE cell(
    id serial PRIMARY KEY,
    name varchar(45) NOT NULL UNIQUE,
    disable BOOLEAN NOT NULL DEFAULT FALSE,
    parentid integer NOT NULL REFERENCES line(id) ON DELETE CASCADE,
    ideal_cycle_time_seconds double precision,
    created_at timestamptz NOT NULL DEFAULT NOW(),
    updated_at timestamptz
);

CREATE INDEX ix_cell_parentid ON cell(parentid);

-- ============================================
-- Signal Tag
-- device_id removed — signals come from simulator directly.
-- ============================================
CREATE TABLE signal_tag(
    id serial PRIMARY KEY,
    cell_id integer NOT NULL REFERENCES cell(id) ON DELETE CASCADE,
    tag_address varchar(255) NOT NULL,
    tag_name varchar(100) NOT NULL,
    description text,
    is_active boolean NOT NULL DEFAULT TRUE,
    is_core boolean NOT NULL DEFAULT FALSE,
    created_at timestamptz NOT NULL DEFAULT NOW(),
    updated_at timestamptz,
    CONSTRAINT uq_signal_tag UNIQUE (cell_id, tag_address)
);

CREATE INDEX ix_signal_tag_cell_id ON signal_tag(cell_id);

-- ============================================
-- Reference Tables
-- ============================================
CREATE TABLE machine_status_code(
    status_code integer PRIMARY KEY,
    status_name text NOT NULL,
    is_productive boolean NOT NULL,
    status_category text NOT NULL,
    CONSTRAINT chk_status_category CHECK (status_category IN ('running', 'unplanned_stop', 'planned_stop'))
);

CREATE TABLE quality_code(
    quality_code integer PRIMARY KEY,
    quality_name text NOT NULL,
    is_conformant boolean NOT NULL
);

-- ============================================
-- PLC Mapping
-- ============================================
CREATE TABLE plc_status_label(
    id serial PRIMARY KEY,
    label_name text NOT NULL UNIQUE,
    description text,
    created_at timestamptz NOT NULL DEFAULT NOW(),
    updated_at timestamptz
);

CREATE TABLE plc_quality_label(
    id serial PRIMARY KEY,
    label_name text NOT NULL UNIQUE,
    description text,
    created_at timestamptz NOT NULL DEFAULT NOW(),
    updated_at timestamptz
);

CREATE TABLE cell_status_mapping(
    id serial PRIMARY KEY,
    cell_id integer NOT NULL REFERENCES cell(id) ON DELETE CASCADE,
    plc_raw_value integer NOT NULL,
    status_code integer NOT NULL REFERENCES machine_status_code(status_code),
    plc_status_label_id integer REFERENCES plc_status_label(id) ON DELETE SET NULL,
    description text,
    created_at timestamptz NOT NULL DEFAULT NOW(),
    updated_at timestamptz,
    CONSTRAINT uq_cell_status_mapping UNIQUE (cell_id, plc_raw_value)
);

CREATE INDEX idx_cell_status_mapping_cell ON cell_status_mapping(cell_id);

CREATE TABLE cell_quality_mapping(
    id serial PRIMARY KEY,
    cell_id integer NOT NULL REFERENCES cell(id) ON DELETE CASCADE,
    plc_raw_value integer NOT NULL,
    quality_code integer NOT NULL REFERENCES quality_code(quality_code),
    plc_quality_label_id integer REFERENCES plc_quality_label(id) ON DELETE SET NULL,
    description text,
    created_at timestamptz NOT NULL DEFAULT NOW(),
    updated_at timestamptz,
    CONSTRAINT uq_cell_quality_mapping UNIQUE (cell_id, plc_raw_value)
);

CREATE INDEX idx_cell_quality_mapping_cell ON cell_quality_mapping(cell_id);

-- ============================================
-- Process Signals
-- ============================================
CREATE TABLE signal_type(
    id serial PRIMARY KEY,
    type_name text NOT NULL UNIQUE,
    description text,
    created_at timestamptz NOT NULL DEFAULT NOW(),
    updated_at timestamptz
);

CREATE TABLE unit(
    id serial PRIMARY KEY,
    unit_name text NOT NULL UNIQUE,
    description text,
    created_at timestamptz NOT NULL DEFAULT NOW(),
    updated_at timestamptz
);

CREATE TABLE process_signal_definition(
    id serial PRIMARY KEY,
    cell_id integer NOT NULL REFERENCES cell(id) ON DELETE CASCADE,
    signal_tag_id integer NOT NULL REFERENCES signal_tag(id) ON DELETE RESTRICT,
    display_name text NOT NULL,
    unit_id integer REFERENCES unit(id) ON DELETE SET NULL,
    signal_type_id integer REFERENCES signal_type(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT NOW(),
    updated_at timestamptz,
    CONSTRAINT uq_process_signal_def_signal_tag UNIQUE (signal_tag_id)
);

CREATE INDEX idx_process_signal_def_cell ON process_signal_definition(cell_id);

CREATE INDEX idx_process_signal_def_signal_tag ON process_signal_definition(signal_tag_id);

-- ============================================
-- Event Hypertables
-- ============================================
CREATE TABLE machine_status(
    time timestamptz NOT NULL,
    cell_id integer NOT NULL REFERENCES cell(id),
    plc_status_raw integer,
    status_code integer NOT NULL REFERENCES machine_status_code(status_code),
    end_time timestamptz,
    PRIMARY KEY (time, cell_id)
);

SELECT
    create_hypertable('machine_status', 'time', if_not_exists => TRUE);

CREATE INDEX idx_machine_status_cell_time ON machine_status(cell_id, time DESC);

CREATE INDEX idx_machine_status_open ON machine_status(cell_id)
WHERE
    end_time IS NULL;

CREATE TABLE production_event(
    time timestamptz NOT NULL,
    cell_id integer NOT NULL REFERENCES cell(id),
    piece_counter bigint NOT NULL,
    plc_quality_raw integer,
    piece_quality integer NOT NULL REFERENCES quality_code(quality_code),
    status_code integer NOT NULL REFERENCES machine_status_code(status_code),
    PRIMARY KEY (time, cell_id)
);

SELECT
    create_hypertable('production_event', 'time', if_not_exists => TRUE);

CREATE INDEX idx_production_event_cell_time ON production_event(cell_id, time DESC);

CREATE INDEX idx_production_event_quality ON production_event(piece_quality);

CREATE TABLE process_signal_data(
    time timestamptz NOT NULL,
    cell_id integer NOT NULL REFERENCES cell(id),
    signal_def_id integer NOT NULL REFERENCES process_signal_definition(id) ON DELETE CASCADE,
    raw_value double precision NOT NULL,
    PRIMARY KEY (time, signal_def_id)
);

SELECT
    create_hypertable('process_signal_data', 'time', if_not_exists => TRUE);

CREATE INDEX idx_process_signal_data_def_time ON process_signal_data(signal_def_id, time DESC);

CREATE INDEX idx_process_signal_data_cell_time ON process_signal_data(cell_id, time DESC);

-- ============================================
-- Authentication
-- ============================================
CREATE TABLE users(
    id serial PRIMARY KEY,
    username varchar(50) NOT NULL UNIQUE,
    password_hash varchar(255) NOT NULL,
    email varchar(255) UNIQUE,
    full_name varchar(100),
    role VARCHAR(20) NOT NULL DEFAULT 'viewer',
    is_active boolean NOT NULL DEFAULT TRUE,
    token_version integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT NOW(),
    updated_at timestamptz,
    last_login timestamptz,
    CONSTRAINT chk_role CHECK (ROLE IN ('admin', 'operator', 'viewer'))
);

CREATE INDEX idx_users_username ON users(username);

CREATE INDEX idx_users_email ON users(email);

CREATE INDEX idx_users_is_active ON users(is_active);

