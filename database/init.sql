CREATE TABLE IF NOT EXISTS marcaciones (
    id SERIAL PRIMARY KEY,
    codigo_empleado VARCHAR(20) NOT NULL,
    nombre_empleado VARCHAR(120) NOT NULL,
    fecha DATE NOT NULL,
    hora_ingreso_programada TIME NOT NULL,
    hora_ingreso_real TIME,
    hora_salida_programada TIME NOT NULL,
    hora_salida_real TIME,
    estado VARCHAR(20) NOT NULL,
    observacion TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_marcaciones_codigo
    ON marcaciones (codigo_empleado);

CREATE INDEX IF NOT EXISTS idx_marcaciones_fecha
    ON marcaciones (fecha);
