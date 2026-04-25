-- ============================================
-- ARIA — Reference Seed Data
-- ============================================
-- Machine status codes
INSERT INTO machine_status_code(status_code, status_name, is_productive, status_category)
VALUES
    (0, 'STOP', FALSE, 'planned_stop'),
(1, 'RUN', TRUE, 'running'),
(2, 'FAULT', FALSE, 'unplanned_stop'),
(3, 'PAUSE', FALSE, 'planned_stop'),
(4, 'MAINTENANCE', FALSE, 'planned_stop'),
(5, 'CHANGEOVER', FALSE, 'planned_stop')
ON CONFLICT
    DO NOTHING;

-- Quality codes — expanded set so the Quality Pareto chart on the
-- Equipment page renders with meaningful reject-reason buckets instead
-- of a single GOOD vs BAD split. All non-conformant codes share
-- is_conformant=FALSE; KPI / OEE math treats them identically.
INSERT INTO quality_code(quality_code, quality_name, is_conformant)
VALUES
    (0, 'GOOD', TRUE),
(1, 'OUT_OF_SPEC', FALSE),
(2, 'LOW_FILL', FALSE),
(3, 'CAP_DEFECT', FALSE),
(4, 'LABEL_DEFECT', FALSE),
(5, 'BOTTLE_DAMAGE', FALSE)
ON CONFLICT
    DO NOTHING;

-- Signal Types
INSERT INTO signal_type(type_name, description)
VALUES
    ('temperature', 'Temperature measurements'),
('pressure', 'Pressure measurements'),
('speed', 'Rotational speed / velocity'),
('force', 'Force / load measurements'),
('torque', 'Rotational torque measurements'),
('cycle_time', 'Production cycle duration'),
('score', 'Quality / inspection score'),
('flow', 'Volumetric flow rate'),
('voltage', 'Electrical voltage'),
('current', 'Electrical current'),
('power', 'Electrical / mechanical power'),
('level', 'Liquid / material level'),
('vibration', 'Vibration / acceleration measurements')
ON CONFLICT (type_name)
    DO NOTHING;

-- Engineering Units
INSERT INTO unit(unit_name, description)
VALUES
    ('°C', 'Celsius'),
('°F', 'Fahrenheit'),
('bar', 'Pressure'),
('psi', 'Pressure'),
('Pa', 'Pascal'),
('rpm', 'Speed'),
('m/s', 'Velocity'),
('L/min', 'Flow'),
('m³/h', 'Flow'),
('V', 'Voltage'),
('A', 'Current'),
('W', 'Power'),
('kW', 'Power'),
('mm/s', 'Vibration'),
('Nm', 'Torque'),
('%', 'Percentage'),
('kN', 'Force'),
('ms', 'Millisecond'),
('m', 'Meter')
ON CONFLICT
    DO NOTHING;

-- Default Users
-- Admin (admin / admin123)
INSERT INTO users(username, password_hash, email, full_name, ROLE, is_active)
    VALUES ('admin', 'pbkdf2:sha256:600000$llgf8p2pqT0FlbAS$18a6f3cdcda5e1bd871b97e068c8638164e2b62a39394e592c8bc558675bcf48', 'admin@aria.local', 'System Administrator', 'admin', TRUE)
ON CONFLICT (username)
    DO NOTHING;

-- Operator (operator / operator123)
INSERT INTO users(username, password_hash, email, full_name, ROLE, is_active)
    VALUES ('operator', 'pbkdf2:sha256:600000$TANQL7qKlkqEFJJW$5ee0b03851087f2ab96a7b54f44699e6f328eff584af30080accdbee7f622c59', 'operator@aria.local', 'Production Operator', 'operator', TRUE)
ON CONFLICT (username)
    DO NOTHING;

-- Viewer (viewer / viewer123)
INSERT INTO users(username, password_hash, email, full_name, ROLE, is_active)
    VALUES ('viewer', 'pbkdf2:sha256:600000$1f5oW7GpcKs74gHP$5478e11a89e8a352ddd3ad6a3d0dd8388fa8b95a4980f9f23d6ddb6cf65ad1ea', 'viewer@aria.local', 'Guest Viewer', 'viewer', TRUE)
ON CONFLICT (username)
    DO NOTHING;

