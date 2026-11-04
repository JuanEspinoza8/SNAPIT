-- Feed social: likes y comentarios públicos, y la baja lógica del reporte para que su autor pueda eliminarlo.
-- El mismo cambio está en db/schema.sql: aplicar todas las migraciones tiene que dar ese esquema (lo chequea la CI).

-- Baja lógica: el reporte deja de verse, pero sus fotos y sus señales de verificación quedan como constancia.
ALTER TABLE reporte ADD COLUMN eliminado_en timestamptz;
COMMENT ON COLUMN reporte.eliminado_en IS 'Baja lógica: si está informado, su autor lo eliminó y ya no se muestra.';

-- [REPORTES, INCIDENTES Y EVIDENCIA]  El «me gusta» de un usuario a un reporte. La clave única (reporte, usuario) impide dar dos.
CREATE TABLE me_gusta_reporte (
    id                           serial,
    reporte_id                   int NOT NULL,
    usuario_id                   int NOT NULL,
    creado_en                    timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT me_gusta_reporte_pk PRIMARY KEY (id),
    CONSTRAINT me_gusta_reporte_reporte_id_fk FOREIGN KEY (reporte_id) REFERENCES reporte (id) ON DELETE CASCADE,
    CONSTRAINT me_gusta_reporte_usuario_id_fk FOREIGN KEY (usuario_id) REFERENCES usuario (id) ON DELETE CASCADE,
    CONSTRAINT me_gusta_unico UNIQUE (reporte_id, usuario_id)
);
COMMENT ON TABLE me_gusta_reporte IS 'El «me gusta» de un usuario a un reporte. La clave única (reporte, usuario) impide dar dos.';
COMMENT ON COLUMN me_gusta_reporte.id IS 'Identificador interno.';
COMMENT ON COLUMN me_gusta_reporte.reporte_id IS 'Reporte que le gustó.';
COMMENT ON COLUMN me_gusta_reporte.usuario_id IS 'Usuario que dio el me gusta.';
COMMENT ON COLUMN me_gusta_reporte.creado_en IS 'Cuándo lo dio.';

-- [REPORTES, INCIDENTES Y EVIDENCIA]  Comentario público de un usuario. Pertenece a un reporte o a un incidente, nunca a los dos.
CREATE TABLE comentario (
    id                           serial,
    usuario_id                   int NOT NULL,
    reporte_id                   int,
    incidente_id                 int,
    texto                        text NOT NULL,
    creado_en                    timestamptz NOT NULL DEFAULT now(),
    editado_en                   timestamptz,
    eliminado_en                 timestamptz,
    CONSTRAINT comentario_pk PRIMARY KEY (id),
    CONSTRAINT comentario_usuario_id_fk FOREIGN KEY (usuario_id) REFERENCES usuario (id) ON DELETE RESTRICT,
    CONSTRAINT comentario_reporte_id_fk FOREIGN KEY (reporte_id) REFERENCES reporte (id) ON DELETE CASCADE,
    CONSTRAINT comentario_incidente_id_fk FOREIGN KEY (incidente_id) REFERENCES incidente (id) ON DELETE CASCADE,
    CONSTRAINT comentario_duenio_unico CHECK ((reporte_id IS NOT NULL)::int + (incidente_id IS NOT NULL)::int = 1),
    CONSTRAINT comentario_texto_largo CHECK (char_length(texto) BETWEEN 1 AND 1000)
);
COMMENT ON TABLE comentario IS 'Comentario público de un usuario. Pertenece a un reporte o a un incidente, nunca a los dos.';
COMMENT ON COLUMN comentario.id IS 'Identificador interno.';
COMMENT ON COLUMN comentario.usuario_id IS 'Autor del comentario.';
COMMENT ON COLUMN comentario.reporte_id IS 'Reporte comentado.';
COMMENT ON COLUMN comentario.incidente_id IS 'Incidente comentado.';
COMMENT ON COLUMN comentario.texto IS 'Lo que escribió, de 1 a 1000 caracteres.';
COMMENT ON COLUMN comentario.creado_en IS 'Fecha del comentario.';
COMMENT ON COLUMN comentario.editado_en IS 'Última vez que su autor lo editó.';
COMMENT ON COLUMN comentario.eliminado_en IS 'Baja lógica: lo eliminó su autor o un operador por ofensivo.';

CREATE INDEX comentario_reporte_id_ix ON comentario (reporte_id);
CREATE INDEX comentario_incidente_id_ix ON comentario (incidente_id);
