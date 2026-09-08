CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =========================================================
-- Usuarios internos del sistema
-- =========================================================
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username VARCHAR(100) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(30) NOT NULL CHECK (role IN ('ADMIN', 'FIELD_AGENT')),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- =========================================================
-- Apoderados / adultos responsables
-- =========================================================
CREATE TABLE IF NOT EXISTS guardians (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  rut VARCHAR(12) NOT NULL UNIQUE,

  first_name VARCHAR(120) NOT NULL,
  paternal_last_name VARCHAR(120),
  maternal_last_name VARCHAR(120),
  birth_date VARCHAR(50),

  address TEXT,
  sector VARCHAR(150),
  email VARCHAR(180),
  phone VARCHAR(50),

  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- =========================================================
-- Alumnos asociados a un apoderado
-- =========================================================
CREATE TABLE IF NOT EXISTS students (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  guardian_id UUID NOT NULL REFERENCES guardians(id) ON DELETE CASCADE,

  rut VARCHAR(12) NOT NULL UNIQUE,

  first_name VARCHAR(120) NOT NULL,
  paternal_last_name VARCHAR(120),
  maternal_last_name VARCHAR(120),

  establishment VARCHAR(250),
  educational_level VARCHAR(150),

  fibe_benefited BOOLEAN NOT NULL DEFAULT FALSE,
  automatic_renewal VARCHAR(80),
  application_status VARCHAR(120),

  application_date VARCHAR(50),
  delivery_day VARCHAR(50),
  delivery_time VARCHAR(50),
  delivery_table VARCHAR(50),

  imported_delivery_date VARCHAR(50),
  imported_delivered_by VARCHAR(150),

  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- =========================================================
-- Catálogo de tipos de beneficios
-- =========================================================
CREATE TABLE IF NOT EXISTS benefit_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(180) NOT NULL UNIQUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- =========================================================
-- Beneficios asignados a cada alumno
-- =========================================================
CREATE TABLE IF NOT EXISTS beneficiary_benefits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  guardian_id UUID NOT NULL REFERENCES guardians(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  benefit_type_id UUID NOT NULL REFERENCES benefit_types(id),

  status VARCHAR(30) NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'DELIVERED', 'CANCELLED')),

  delivered_at TIMESTAMP NULL,

  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT unique_student_benefit
    UNIQUE (student_id, benefit_type_id)
);

-- =========================================================
-- Registro histórico de entregas
-- =========================================================
CREATE TABLE IF NOT EXISTS deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  guardian_id UUID NOT NULL REFERENCES guardians(id),
  delivered_by UUID NOT NULL REFERENCES users(id),

  notes TEXT,
  delivered_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Detalle de cada beneficio incluido en una entrega
CREATE TABLE IF NOT EXISTS delivery_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  delivery_id UUID NOT NULL REFERENCES deliveries(id) ON DELETE CASCADE,
  beneficiary_benefit_id UUID NOT NULL REFERENCES beneficiary_benefits(id),

  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT unique_delivery_benefit
    UNIQUE (delivery_id, beneficiary_benefit_id)
);

-- =========================================================
-- Fotografías / evidencias de actas
-- =========================================================
CREATE TABLE IF NOT EXISTS delivery_evidences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  delivery_id UUID NOT NULL REFERENCES deliveries(id) ON DELETE CASCADE,
  guardian_id UUID NOT NULL REFERENCES guardians(id),

  logical_file_name VARCHAR(255) NOT NULL,
  storage_key VARCHAR(500) NOT NULL UNIQUE,

  mime_type VARCHAR(100) NOT NULL,
  file_size_bytes INTEGER NOT NULL,
  file_hash_sha256 VARCHAR(64) NOT NULL,

  uploaded_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- =========================================================
-- Historial de importaciones Excel
-- =========================================================
CREATE TABLE IF NOT EXISTS import_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  original_file_name VARCHAR(255) NOT NULL,
  total_rows INTEGER NOT NULL DEFAULT 0,
  imported_rows INTEGER NOT NULL DEFAULT 0,
  rejected_rows INTEGER NOT NULL DEFAULT 0,

  imported_by UUID REFERENCES users(id),

  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS import_errors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  import_batch_id UUID NOT NULL
    REFERENCES import_batches(id)
    ON DELETE CASCADE,

  row_number INTEGER NOT NULL,
  error_message TEXT NOT NULL,
  raw_data JSONB,

  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- =========================================================
-- Índices
-- =========================================================
CREATE INDEX IF NOT EXISTS idx_guardians_rut
ON guardians(rut);

CREATE INDEX IF NOT EXISTS idx_students_guardian_id
ON students(guardian_id);

CREATE INDEX IF NOT EXISTS idx_students_rut
ON students(rut);

CREATE INDEX IF NOT EXISTS idx_beneficiary_benefits_guardian
ON beneficiary_benefits(guardian_id);

CREATE INDEX IF NOT EXISTS idx_beneficiary_benefits_student
ON beneficiary_benefits(student_id);

CREATE INDEX IF NOT EXISTS idx_beneficiary_benefits_status
ON beneficiary_benefits(status);

CREATE INDEX IF NOT EXISTS idx_deliveries_date
ON deliveries(delivered_at);