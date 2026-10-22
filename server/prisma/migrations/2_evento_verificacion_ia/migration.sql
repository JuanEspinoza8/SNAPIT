-- Cola de verificación con IA: el log de cada procesamiento (aprobado por el grupo).
-- El mismo cambio está en db/schema.sql: aplicar todas las migraciones tiene que dar ese esquema (lo chequea la CI).
CREATE TYPE estado_evento_ia AS ENUM ('EN_PROCESO', 'CLASIFICADO', 'PUBLICADO', 'REVISION_MANUAL', 'ERROR');

-- [INTELIGENCIA ARTIFICIAL]  Cada paso que dio la IA con cada reporte al procesar la cola de verificación: el log que ve el operador.
CREATE TABLE evento_verificacion_ia (
    id                           serial,
    proceso_id                   uuid NOT NULL,
    organismo_id                 int NOT NULL,
    usuario_id                   int,
    reporte_id                   int NOT NULL,
    estado                       estado_evento_ia NOT NULL,
    registro_ia_id               int,
    detalle                      text,
    tokens_entrada               int,
    tokens_salida                int,
    creado_en                    timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT evento_verificacion_ia_pk PRIMARY KEY (id),
    CONSTRAINT evento_verificacion_ia_organismo_id_fk FOREIGN KEY (organismo_id) REFERENCES organismo (id) ON DELETE RESTRICT,
    CONSTRAINT evento_verificacion_ia_usuario_id_fk FOREIGN KEY (usuario_id) REFERENCES usuario (id) ON DELETE SET NULL,
    CONSTRAINT evento_verificacion_ia_reporte_id_fk FOREIGN KEY (reporte_id) REFERENCES reporte (id) ON DELETE CASCADE,
    CONSTRAINT evento_verificacion_ia_registro_ia_id_fk FOREIGN KEY (registro_ia_id) REFERENCES registro_ia (id) ON DELETE SET NULL
);
COMMENT ON TABLE evento_verificacion_ia IS 'Cada paso que dio la IA con cada reporte al procesar la cola de verificación: el log que ve el operador.';
COMMENT ON COLUMN evento_verificacion_ia.id IS 'Identificador interno.';
COMMENT ON COLUMN evento_verificacion_ia.proceso_id IS 'Procesamiento de la cola al que pertenece: todos los pasos de una misma corrida comparten el valor.';
COMMENT ON COLUMN evento_verificacion_ia.organismo_id IS 'Organismo cuya cola se procesó.';
COMMENT ON COLUMN evento_verificacion_ia.usuario_id IS 'Operador que inició el procesamiento.';
COMMENT ON COLUMN evento_verificacion_ia.reporte_id IS 'Reporte procesado.';
COMMENT ON COLUMN evento_verificacion_ia.estado IS 'Paso: en proceso, clasificado, publicado, derivado a revisión manual o error.';
COMMENT ON COLUMN evento_verificacion_ia.registro_ia_id IS 'Llamada al modelo que clasificó el reporte.';
COMMENT ON COLUMN evento_verificacion_ia.detalle IS 'Explicación legible del paso.';
COMMENT ON COLUMN evento_verificacion_ia.tokens_entrada IS 'Tokens de entrada que usó la clasificación, para calcular su costo.';
COMMENT ON COLUMN evento_verificacion_ia.tokens_salida IS 'Tokens de salida que usó la clasificación, para calcular su costo.';
COMMENT ON COLUMN evento_verificacion_ia.creado_en IS 'Fecha del paso.';

CREATE INDEX evento_verificacion_ia_proceso_id_ix ON evento_verificacion_ia (proceso_id);
