-- SnapIt - esquema de base de datos
-- Grupo Full Stack F.C. | Trabajo Final de Carrera | UNCo - Facultad de Informatica
--
-- Generado desde el modelo relacional entregado el 19/09. El modelo esta congelado:
-- no agregues ni renombres tablas o columnas sin acordarlo con el grupo.
--
-- 28 tablas | 215 columnas | 46 claves foraneas | 17 tipos enumerados

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgrouting;

-- ==========================================================================
-- TIPOS ENUMERADOS
-- ==========================================================================

CREATE TYPE rol_usuario AS ENUM ('VECINO', 'OPERADOR', 'ADMINISTRADOR');
CREATE TYPE estado_incidente AS ENUM ('REGISTRADO', 'VERIFICADO', 'DERIVADO', 'EN_EJECUCION', 'RESUELTO', 'DESESTIMADO');
CREATE TYPE severidad AS ENUM ('LEVE', 'MODERADA', 'GRAVE');
CREATE TYPE estado_verificacion AS ENUM ('VERIFICADO', 'PENDIENTE_REVISION', 'DESESTIMADO');
CREATE TYPE origen_reporte AS ENUM ('APP_MOVIL', 'SITIO_WEB');
CREATE TYPE tipo_vigencia AS ENUM ('PERMANENTE', 'TEMPORAL');
CREATE TYPE tipo_senal AS ENUM ('EXIF_COINCIDE', 'EXIF_AUSENTE', 'HASH_DUPLICADO', 'ORIGEN_APP', 'REPUTACION', 'FECHA_ANTIGUA');
CREATE TYPE tipo_factor AS ENUM ('SEVERIDAD', 'EVIDENCIAS', 'ANTIGUEDAD', 'CONTEXTO_URBANO', 'AJUSTE_MANUAL');
CREATE TYPE resultado_comparacion AS ENUM ('VALIDADO', 'OBSERVADO', 'RECHAZADO');
CREATE TYPE tipo_notificacion AS ENUM ('CAMBIO_ESTADO', 'NUEVO_EN_ZONA', 'CIERRE', 'VERIFICACION');
CREATE TYPE tipo_token AS ENUM ('VERIFICACION_EMAIL', 'RECUPERACION_CLAVE', 'SESION');
CREATE TYPE tipo_movimiento AS ENUM ('CAMBIO_ESTADO', 'DERIVACION', 'FUSION', 'SEPARACION', 'AJUSTE_PRIORIDAD', 'COMENTARIO');
CREATE TYPE tipo_tramo AS ENUM ('VEREDA', 'CRUCE', 'ESCALERA', 'SENDA');
CREATE TYPE tipo_punto_interes AS ENUM ('ESCUELA', 'CENTRO_SALUD', 'PARADA_TRANSPORTE', 'EDIFICIO_PUBLICO');
CREATE TYPE tipo_ia AS ENUM ('CLASIFICACION_IMAGEN', 'COMPARACION_CIERRE', 'INFORME', 'CONSULTA_NATURAL');
CREATE TYPE proveedor_ia AS ENUM ('OLLAMA', 'GEMINI');
CREATE TYPE plataforma AS ENUM ('ANDROID', 'WEB');

-- ==========================================================================
-- TABLAS
-- Orden de creacion topologico: cada tabla aparece despues
-- de aquellas a las que referencia.
-- ==========================================================================

-- [IDENTIDAD Y ORGANIZACIÓN]  Municipio o ente público responsable de atender los incidentes.
CREATE TABLE organismo (
    id                           serial,
    nombre                       varchar(150) NOT NULL,
    descripcion                  text,
    activo                       boolean NOT NULL DEFAULT true,
    creado_en                    timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT organismo_pk PRIMARY KEY (id)
);
COMMENT ON TABLE organismo IS 'Municipio o ente público responsable de atender los incidentes.';
COMMENT ON COLUMN organismo.id IS 'Identificador interno.';
COMMENT ON COLUMN organismo.nombre IS 'Nombre del organismo.';
COMMENT ON COLUMN organismo.descripcion IS 'Detalle o jurisdicción.';
COMMENT ON COLUMN organismo.activo IS 'Si sigue operativo dentro del sistema.';
COMMENT ON COLUMN organismo.creado_en IS 'Fecha de alta.';

-- [IDENTIDAD Y ORGANIZACIÓN]  Dependencia o cuadrilla dentro del organismo a la que se deriva el trabajo.
CREATE TABLE area (
    id                           serial,
    organismo_id                 int NOT NULL,
    nombre                       varchar(120) NOT NULL,
    descripcion                  text,
    activa                       boolean NOT NULL DEFAULT true,
    creado_en                    timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT area_pk PRIMARY KEY (id),
    CONSTRAINT area_organismo_id_fk FOREIGN KEY (organismo_id) REFERENCES organismo (id) ON DELETE RESTRICT
);
COMMENT ON TABLE area IS 'Dependencia o cuadrilla dentro del organismo a la que se deriva el trabajo.';
COMMENT ON COLUMN area.id IS 'Identificador interno.';
COMMENT ON COLUMN area.organismo_id IS 'Organismo al que pertenece.';
COMMENT ON COLUMN area.nombre IS 'Nombre del área: Bacheo, Alumbrado, Arbolado, etc.';
COMMENT ON COLUMN area.descripcion IS 'Detalle de lo que atiende.';
COMMENT ON COLUMN area.activa IS 'Si se le pueden seguir derivando incidentes.';
COMMENT ON COLUMN area.creado_en IS 'Fecha de alta.';

-- [CATÁLOGO CONFIGURABLE]  Tipo de problema que se puede reportar. El administrador la configura sin tocar el código.
CREATE TABLE categoria (
    id                           serial,
    nombre                       varchar(80) NOT NULL,
    descripcion                  text,
    area_id                      int NOT NULL,
    tipo_vigencia_default        tipo_vigencia NOT NULL DEFAULT 'PERMANENTE',
    dias_caducidad_default       int,
    peso_severidad_base          numeric(4,2) NOT NULL DEFAULT 1.00,
    activa                       boolean NOT NULL DEFAULT true,
    CONSTRAINT categoria_pk PRIMARY KEY (id),
    CONSTRAINT categoria_area_id_fk FOREIGN KEY (area_id) REFERENCES area (id) ON DELETE RESTRICT,
    CONSTRAINT categoria_nombre_key UNIQUE (nombre)
);
COMMENT ON TABLE categoria IS 'Tipo de problema que se puede reportar. El administrador la configura sin tocar el código.';
COMMENT ON COLUMN categoria.id IS 'Identificador interno.';
COMMENT ON COLUMN categoria.nombre IS 'Nombre visible: Pozo, Vereda rota, Luminaria apagada, etc.';
COMMENT ON COLUMN categoria.descripcion IS 'Explicación para el vecino.';
COMMENT ON COLUMN categoria.area_id IS 'Área que atiende esta categoría por defecto.';
COMMENT ON COLUMN categoria.tipo_vigencia_default IS 'Si el problema suele ser permanente o temporal.';
COMMENT ON COLUMN categoria.dias_caducidad_default IS 'Días tras los cuales caduca un incidente temporal.';
COMMENT ON COLUMN categoria.peso_severidad_base IS 'Peso inicial de la categoría en el cálculo de prioridad.';
COMMENT ON COLUMN categoria.activa IS 'Si se puede seguir eligiendo al reportar.';

-- [CATÁLOGO CONFIGURABLE]  Forma de desplazarse del peatón: silla de ruedas, bastón, coche de bebé o baja visión.
CREATE TABLE perfil_movilidad (
    id                           serial,
    nombre                       varchar(60) NOT NULL,
    descripcion                  text,
    activo                       boolean NOT NULL DEFAULT true,
    CONSTRAINT perfil_movilidad_pk PRIMARY KEY (id),
    CONSTRAINT perfil_movilidad_nombre_key UNIQUE (nombre)
);
COMMENT ON TABLE perfil_movilidad IS 'Forma de desplazarse del peatón: silla de ruedas, bastón, coche de bebé o baja visión.';
COMMENT ON COLUMN perfil_movilidad.id IS 'Identificador interno.';
COMMENT ON COLUMN perfil_movilidad.nombre IS 'Nombre del perfil.';
COMMENT ON COLUMN perfil_movilidad.descripcion IS 'Qué dificultades tiene ese peatón.';
COMMENT ON COLUMN perfil_movilidad.activo IS 'Si se puede elegir al calcular un recorrido.';

-- [CATÁLOGO CONFIGURABLE]  Cuánto estorba cada tipo de problema a cada perfil de movilidad. Es lo que hace que el mismo obstáculo cambie el recorrido de una silla de ruedas y no el de un coche de bebé.
CREATE TABLE categoria_perfil (
    categoria_id                 int,
    perfil_movilidad_id          int,
    intransitable                boolean NOT NULL DEFAULT false,
    factor_penalizacion          numeric(5,2) NOT NULL DEFAULT 1.00,
    CONSTRAINT categoria_perfil_pk PRIMARY KEY (categoria_id, perfil_movilidad_id),
    CONSTRAINT categoria_perfil_categoria_id_fk FOREIGN KEY (categoria_id) REFERENCES categoria (id) ON DELETE RESTRICT,
    CONSTRAINT categoria_perfil_perfil_movilidad_id_fk FOREIGN KEY (perfil_movilidad_id) REFERENCES perfil_movilidad (id) ON DELETE RESTRICT
);
COMMENT ON TABLE categoria_perfil IS 'Cuánto estorba cada tipo de problema a cada perfil de movilidad. Es lo que hace que el mismo obstáculo cambie el recorrido de una silla de ruedas y no el de un coche de bebé.';
COMMENT ON COLUMN categoria_perfil.categoria_id IS 'Categoría del problema.';
COMMENT ON COLUMN categoria_perfil.perfil_movilidad_id IS 'Perfil afectado.';
COMMENT ON COLUMN categoria_perfil.intransitable IS 'Si para ese perfil el tramo queda directamente bloqueado.';
COMMENT ON COLUMN categoria_perfil.factor_penalizacion IS 'Cuánto se encarece el tramo si no queda bloqueado.';

-- [CATÁLOGO CONFIGURABLE]  Configuración del algoritmo, editable sin volver a desplegar la aplicación.
CREATE TABLE parametro_sistema (
    clave                        varchar(80),
    valor                        varchar(200) NOT NULL,
    tipo                         varchar(20) NOT NULL,
    descripcion                  text,
    CONSTRAINT parametro_sistema_pk PRIMARY KEY (clave)
);
COMMENT ON TABLE parametro_sistema IS 'Configuración del algoritmo, editable sin volver a desplegar la aplicación.';
COMMENT ON COLUMN parametro_sistema.clave IS 'Nombre del parámetro.';
COMMENT ON COLUMN parametro_sistema.valor IS 'Valor vigente.';
COMMENT ON COLUMN parametro_sistema.tipo IS 'Tipo de dato del valor.';
COMMENT ON COLUMN parametro_sistema.descripcion IS 'Para qué se usa.';

-- [RED PEATONAL Y RUTEO]  Polígono dentro del cual está habilitado el cálculo de recorridos accesibles.
CREATE TABLE zona_piloto (
    id                           serial,
    nombre                       varchar(120) NOT NULL,
    geometria                    geography(Polygon,4326) NOT NULL,
    activa                       boolean NOT NULL DEFAULT true,
    CONSTRAINT zona_piloto_pk PRIMARY KEY (id)
);
COMMENT ON TABLE zona_piloto IS 'Polígono dentro del cual está habilitado el cálculo de recorridos accesibles.';
COMMENT ON COLUMN zona_piloto.id IS 'Identificador interno.';
COMMENT ON COLUMN zona_piloto.nombre IS 'Nombre de la zona.';
COMMENT ON COLUMN zona_piloto.geometria IS 'Contorno del área cubierta.';
COMMENT ON COLUMN zona_piloto.activa IS 'Si el ruteo está habilitado ahí.';

-- [RED PEATONAL Y RUTEO]  Punto del grafo peatonal. En la práctica, una esquina o un cruce.
CREATE TABLE nodo_peatonal (
    id                           bigserial,
    osm_id                       bigint,
    ubicacion                    geography(Point,4326) NOT NULL,
    tiene_semaforo_sonoro        boolean NOT NULL DEFAULT false,
    tiene_piso_podotactil        boolean NOT NULL DEFAULT false,
    CONSTRAINT nodo_peatonal_pk PRIMARY KEY (id),
    CONSTRAINT nodo_peatonal_osm_key UNIQUE (osm_id)
);
COMMENT ON TABLE nodo_peatonal IS 'Punto del grafo peatonal. En la práctica, una esquina o un cruce.';
COMMENT ON COLUMN nodo_peatonal.id IS 'Identificador interno.';
COMMENT ON COLUMN nodo_peatonal.osm_id IS 'Identificador del nodo en OpenStreetMap.';
COMMENT ON COLUMN nodo_peatonal.ubicacion IS 'Coordenadas del nodo.';
COMMENT ON COLUMN nodo_peatonal.tiene_semaforo_sonoro IS 'Si el cruce tiene señal audible.';
COMMENT ON COLUMN nodo_peatonal.tiene_piso_podotactil IS 'Si tiene piso guía para personas con baja visión.';

-- [RED PEATONAL Y RUTEO]  Arista del grafo: la vereda o el cruce que une dos nodos. Es por donde se camina.
CREATE TABLE tramo_peatonal (
    id                           bigserial,
    nodo_origen_id               bigint NOT NULL,
    nodo_destino_id              bigint NOT NULL,
    geometria                    geography(LineString,4326) NOT NULL,
    longitud_metros              numeric(9,2) NOT NULL,
    tipo                         tipo_tramo NOT NULL,
    tiene_rampa                  boolean NOT NULL DEFAULT false,
    pendiente_porcentaje         numeric(5,2),
    ancho_estimado               numeric(4,2),
    superficie                   varchar(40),
    costo_base                   numeric(9,2) NOT NULL,
    CONSTRAINT tramo_peatonal_pk PRIMARY KEY (id),
    CONSTRAINT tramo_peatonal_nodo_origen_id_fk FOREIGN KEY (nodo_origen_id) REFERENCES nodo_peatonal (id) ON DELETE RESTRICT,
    CONSTRAINT tramo_peatonal_nodo_destino_id_fk FOREIGN KEY (nodo_destino_id) REFERENCES nodo_peatonal (id) ON DELETE RESTRICT,
    CONSTRAINT tramo_nodos_distintos CHECK (nodo_origen_id <> nodo_destino_id)
);
COMMENT ON TABLE tramo_peatonal IS 'Arista del grafo: la vereda o el cruce que une dos nodos. Es por donde se camina.';
COMMENT ON COLUMN tramo_peatonal.id IS 'Identificador interno.';
COMMENT ON COLUMN tramo_peatonal.nodo_origen_id IS 'Nodo donde arranca el tramo.';
COMMENT ON COLUMN tramo_peatonal.nodo_destino_id IS 'Nodo donde termina el tramo.';
COMMENT ON COLUMN tramo_peatonal.geometria IS 'Traza del tramo.';
COMMENT ON COLUMN tramo_peatonal.longitud_metros IS 'Largo real.';
COMMENT ON COLUMN tramo_peatonal.tipo IS 'Vereda, cruce, escalera o senda.';
COMMENT ON COLUMN tramo_peatonal.tiene_rampa IS 'Si hay rampa en el cordón.';
COMMENT ON COLUMN tramo_peatonal.pendiente_porcentaje IS 'Inclinación del tramo.';
COMMENT ON COLUMN tramo_peatonal.ancho_estimado IS 'Ancho útil estimado.';
COMMENT ON COLUMN tramo_peatonal.superficie IS 'Material de la superficie.';
COMMENT ON COLUMN tramo_peatonal.costo_base IS 'Costo del tramo antes de aplicar obstáculos y perfil.';

-- [RED PEATONAL Y RUTEO]  Escuela, centro de salud, parada o edificio público cuya cercanía eleva la prioridad.
CREATE TABLE punto_interes (
    id                           serial,
    tipo                         tipo_punto_interes NOT NULL,
    nombre                       varchar(150) NOT NULL,
    ubicacion                    geography(Point,4326) NOT NULL,
    osm_id                       bigint,
    CONSTRAINT punto_interes_pk PRIMARY KEY (id),
    CONSTRAINT punto_interes_osm_key UNIQUE (osm_id)
);
COMMENT ON TABLE punto_interes IS 'Escuela, centro de salud, parada o edificio público cuya cercanía eleva la prioridad.';
COMMENT ON COLUMN punto_interes.id IS 'Identificador interno.';
COMMENT ON COLUMN punto_interes.tipo IS 'Clase de punto.';
COMMENT ON COLUMN punto_interes.nombre IS 'Nombre del lugar.';
COMMENT ON COLUMN punto_interes.ubicacion IS 'Coordenadas.';
COMMENT ON COLUMN punto_interes.osm_id IS 'Identificador en OpenStreetMap.';

-- [IDENTIDAD Y ORGANIZACIÓN]  Persona registrada en el sistema: el vecino que reporta, el operador del organismo o el administrador.
CREATE TABLE usuario (
    id                           serial,
    email                        varchar(150) NOT NULL,
    password_hash                varchar(255) NOT NULL,
    nombre                       varchar(120) NOT NULL,
    rol                          rol_usuario NOT NULL DEFAULT 'VECINO',
    organismo_id                 int,
    area_id                      int,
    email_verificado_en          timestamptz,
    reputacion                   numeric(5,2) NOT NULL DEFAULT 50.00,
    reportes_confirmados         int NOT NULL DEFAULT 0,
    reportes_desestimados        int NOT NULL DEFAULT 0,
    creado_en                    timestamptz NOT NULL DEFAULT now(),
    actualizado_en               timestamptz NOT NULL DEFAULT now(),
    eliminado_en                 timestamptz,
    perfil_movilidad_id          int,
    notificaciones_habilitadas   boolean NOT NULL DEFAULT true,
    CONSTRAINT usuario_pk PRIMARY KEY (id),
    CONSTRAINT usuario_organismo_id_fk FOREIGN KEY (organismo_id) REFERENCES organismo (id) ON DELETE RESTRICT,
    CONSTRAINT usuario_area_id_fk FOREIGN KEY (area_id) REFERENCES area (id) ON DELETE RESTRICT,
    CONSTRAINT usuario_perfil_movilidad_id_fk FOREIGN KEY (perfil_movilidad_id) REFERENCES perfil_movilidad (id) ON DELETE RESTRICT,
    CONSTRAINT usuario_email_key UNIQUE (email),
    CONSTRAINT usuario_reputacion_rango CHECK (reputacion BETWEEN 0 AND 100)
);
COMMENT ON TABLE usuario IS 'Persona registrada en el sistema: el vecino que reporta, el operador del organismo o el administrador.';
COMMENT ON COLUMN usuario.id IS 'Identificador interno.';
COMMENT ON COLUMN usuario.email IS 'Correo con el que inicia sesión. No se puede repetir.';
COMMENT ON COLUMN usuario.password_hash IS 'Contraseña cifrada. Nunca se guarda en texto plano.';
COMMENT ON COLUMN usuario.nombre IS 'Nombre visible del usuario.';
COMMENT ON COLUMN usuario.rol IS 'Vecino, operador o administrador.';
COMMENT ON COLUMN usuario.organismo_id IS 'Organismo al que pertenece. Sólo operadores y administradores.';
COMMENT ON COLUMN usuario.area_id IS 'Área o cuadrilla asignada. Sólo operadores.';
COMMENT ON COLUMN usuario.email_verificado_en IS 'Momento en que confirmó su correo.';
COMMENT ON COLUMN usuario.reputacion IS 'Puntaje de confianza calculado con su historial de reportes.';
COMMENT ON COLUMN usuario.reportes_confirmados IS 'Contador de reportes suyos que resultaron válidos.';
COMMENT ON COLUMN usuario.reportes_desestimados IS 'Contador de reportes suyos que fueron descartados.';
COMMENT ON COLUMN usuario.creado_en IS 'Fecha de alta.';
COMMENT ON COLUMN usuario.actualizado_en IS 'Última modificación del registro.';
COMMENT ON COLUMN usuario.eliminado_en IS 'Baja lógica: si está informado, la cuenta ya no se usa.';
COMMENT ON COLUMN usuario.perfil_movilidad_id IS 'Perfil de movilidad por defecto para calcular recorridos.';
COMMENT ON COLUMN usuario.notificaciones_habilitadas IS 'Interruptor general de avisos.';

-- [IDENTIDAD Y ORGANIZACIÓN]  Celular o navegador desde el que un usuario recibe los avisos push.
CREATE TABLE dispositivo (
    id                           serial,
    usuario_id                   int NOT NULL,
    token_push                   varchar(255) NOT NULL,
    plataforma                   plataforma NOT NULL,
    ultimo_uso_en                timestamptz,
    activo                       boolean NOT NULL DEFAULT true,
    CONSTRAINT dispositivo_pk PRIMARY KEY (id),
    CONSTRAINT dispositivo_usuario_id_fk FOREIGN KEY (usuario_id) REFERENCES usuario (id) ON DELETE CASCADE
);
COMMENT ON TABLE dispositivo IS 'Celular o navegador desde el que un usuario recibe los avisos push.';
COMMENT ON COLUMN dispositivo.id IS 'Identificador interno.';
COMMENT ON COLUMN dispositivo.usuario_id IS 'Dueño del dispositivo.';
COMMENT ON COLUMN dispositivo.token_push IS 'Identificador que entrega el servicio de notificaciones.';
COMMENT ON COLUMN dispositivo.plataforma IS 'Android o web.';
COMMENT ON COLUMN dispositivo.ultimo_uso_en IS 'Último acceso desde este dispositivo.';
COMMENT ON COLUMN dispositivo.activo IS 'Si sigue habilitado para recibir avisos.';

-- [REPORTES, INCIDENTES Y EVIDENCIA]  Problema real en la vía pública. Es la conclusión del sistema a partir de uno o varios reportes.
CREATE TABLE incidente (
    id                           serial,
    categoria_id                 int NOT NULL,
    area_id                      int,
    estado                       estado_incidente NOT NULL DEFAULT 'REGISTRADO',
    severidad                    severidad NOT NULL DEFAULT 'MODERADA',
    ubicacion                    geography(Point,4326) NOT NULL,
    direccion                    varchar(250),
    tipo_vigencia                tipo_vigencia NOT NULL DEFAULT 'PERMANENTE',
    vigente_hasta                timestamptz,
    caducado_en                  timestamptz,
    puntaje_prioridad            numeric(6,2) NOT NULL DEFAULT 0,
    prioridad_manual             numeric(6,2),
    motivo_prioridad_manual      text,
    ajustada_por_id              int,
    cantidad_reportes            int NOT NULL DEFAULT 0,
    primer_reporte_en            timestamptz NOT NULL DEFAULT now(),
    resuelto_en                  timestamptz,
    creado_en                    timestamptz NOT NULL DEFAULT now(),
    actualizado_en               timestamptz NOT NULL DEFAULT now(),
    incidente_principal_id       int,
    CONSTRAINT incidente_pk PRIMARY KEY (id),
    CONSTRAINT incidente_categoria_id_fk FOREIGN KEY (categoria_id) REFERENCES categoria (id) ON DELETE RESTRICT,
    CONSTRAINT incidente_area_id_fk FOREIGN KEY (area_id) REFERENCES area (id) ON DELETE RESTRICT,
    CONSTRAINT incidente_ajustada_por_id_fk FOREIGN KEY (ajustada_por_id) REFERENCES usuario (id) ON DELETE SET NULL,
    CONSTRAINT incidente_incidente_principal_id_fk FOREIGN KEY (incidente_principal_id) REFERENCES incidente (id) ON DELETE SET NULL,
    CONSTRAINT incidente_temporal_con_vencimiento CHECK (tipo_vigencia <> 'TEMPORAL' OR vigente_hasta IS NOT NULL),
    CONSTRAINT incidente_prioridad_manual_justificada CHECK (prioridad_manual IS NULL OR motivo_prioridad_manual IS NOT NULL),
    CONSTRAINT incidente_no_se_une_a_si_mismo CHECK (incidente_principal_id IS NULL OR incidente_principal_id <> id)
);
COMMENT ON TABLE incidente IS 'Problema real en la vía pública. Es la conclusión del sistema a partir de uno o varios reportes.';
COMMENT ON COLUMN incidente.id IS 'Identificador interno.';
COMMENT ON COLUMN incidente.categoria_id IS 'Tipo de problema.';
COMMENT ON COLUMN incidente.area_id IS 'Área a la que está derivado.';
COMMENT ON COLUMN incidente.estado IS 'Situación actual del incidente.';
COMMENT ON COLUMN incidente.severidad IS 'Gravedad consolidada.';
COMMENT ON COLUMN incidente.ubicacion IS 'Punto georreferenciado.';
COMMENT ON COLUMN incidente.direccion IS 'Dirección aproximada en texto.';
COMMENT ON COLUMN incidente.tipo_vigencia IS 'Si es permanente o temporal.';
COMMENT ON COLUMN incidente.vigente_hasta IS 'Fecha hasta la que se considera vigente.';
COMMENT ON COLUMN incidente.caducado_en IS 'Momento en que caducó por vencimiento.';
COMMENT ON COLUMN incidente.puntaje_prioridad IS 'Prioridad calculada por el sistema.';
COMMENT ON COLUMN incidente.prioridad_manual IS 'Prioridad forzada por un operador.';
COMMENT ON COLUMN incidente.motivo_prioridad_manual IS 'Justificación del ajuste manual.';
COMMENT ON COLUMN incidente.ajustada_por_id IS 'Operador que ajustó la prioridad.';
COMMENT ON COLUMN incidente.cantidad_reportes IS 'Cantidad de reportes agrupados. Contador.';
COMMENT ON COLUMN incidente.primer_reporte_en IS 'Fecha del primer reporte que lo originó.';
COMMENT ON COLUMN incidente.resuelto_en IS 'Cuándo se dio por resuelto.';
COMMENT ON COLUMN incidente.creado_en IS 'Fecha de alta.';
COMMENT ON COLUMN incidente.actualizado_en IS 'Última modificación.';
COMMENT ON COLUMN incidente.incidente_principal_id IS 'Si el operador unió este incidente dentro de otro, apunta al principal. Mientras esté informado, el incidente es un duplicado —no un reporte falso— y no se muestra en el mapa ni se trabaja por separado.';

-- [REPORTES, INCIDENTES Y EVIDENCIA]  El “a mí también me pasa”: un vecino adhiere a un incidente ya cargado sin duplicar el reporte. La clave única (incidente, usuario) impide que la misma persona confirme dos veces.
CREATE TABLE confirmacion_incidente (
    id                           serial,
    incidente_id                 int NOT NULL,
    usuario_id                   int NOT NULL,
    creado_en                    timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT confirmacion_incidente_pk PRIMARY KEY (id),
    CONSTRAINT confirmacion_incidente_incidente_id_fk FOREIGN KEY (incidente_id) REFERENCES incidente (id) ON DELETE CASCADE,
    CONSTRAINT confirmacion_incidente_usuario_id_fk FOREIGN KEY (usuario_id) REFERENCES usuario (id) ON DELETE CASCADE,
    CONSTRAINT confirmacion_unica UNIQUE (incidente_id, usuario_id)
);
COMMENT ON TABLE confirmacion_incidente IS 'El “a mí también me pasa”: un vecino adhiere a un incidente ya cargado sin duplicar el reporte. La clave única (incidente, usuario) impide que la misma persona confirme dos veces.';
COMMENT ON COLUMN confirmacion_incidente.id IS 'Identificador interno.';
COMMENT ON COLUMN confirmacion_incidente.incidente_id IS 'Incidente confirmado.';
COMMENT ON COLUMN confirmacion_incidente.usuario_id IS 'Vecino que confirma.';
COMMENT ON COLUMN confirmacion_incidente.creado_en IS 'Cuándo confirmó.';

-- [GESTIÓN DEL ORGANISMO]  Bitácora del incidente: todo lo que le pasó, con autor y fecha.
CREATE TABLE movimiento_incidente (
    id                           serial,
    incidente_id                 int NOT NULL,
    usuario_id                   int,
    tipo                         tipo_movimiento NOT NULL,
    area_id                      int,
    estado_anterior              estado_incidente,
    estado_nuevo                 estado_incidente,
    comentario                   text,
    creado_en                    timestamptz NOT NULL DEFAULT now(),
    incidente_relacionado_id     int,
    CONSTRAINT movimiento_incidente_pk PRIMARY KEY (id),
    CONSTRAINT movimiento_incidente_incidente_id_fk FOREIGN KEY (incidente_id) REFERENCES incidente (id) ON DELETE CASCADE,
    CONSTRAINT movimiento_incidente_usuario_id_fk FOREIGN KEY (usuario_id) REFERENCES usuario (id) ON DELETE SET NULL,
    CONSTRAINT movimiento_incidente_area_id_fk FOREIGN KEY (area_id) REFERENCES area (id) ON DELETE RESTRICT,
    CONSTRAINT movimiento_incidente_incidente_relacionado_id_fk FOREIGN KEY (incidente_relacionado_id) REFERENCES incidente (id) ON DELETE SET NULL
);
COMMENT ON TABLE movimiento_incidente IS 'Bitácora del incidente: todo lo que le pasó, con autor y fecha.';
COMMENT ON COLUMN movimiento_incidente.id IS 'Identificador interno.';
COMMENT ON COLUMN movimiento_incidente.incidente_id IS 'Incidente afectado.';
COMMENT ON COLUMN movimiento_incidente.usuario_id IS 'Quién hizo el movimiento.';
COMMENT ON COLUMN movimiento_incidente.tipo IS 'Clase de movimiento: cambio de estado, derivación, fusión, etc.';
COMMENT ON COLUMN movimiento_incidente.area_id IS 'Área destino cuando el movimiento es una derivación.';
COMMENT ON COLUMN movimiento_incidente.estado_anterior IS 'Estado antes del movimiento.';
COMMENT ON COLUMN movimiento_incidente.estado_nuevo IS 'Estado después del movimiento.';
COMMENT ON COLUMN movimiento_incidente.comentario IS 'Observación del operador.';
COMMENT ON COLUMN movimiento_incidente.creado_en IS 'Cuándo ocurrió.';
COMMENT ON COLUMN movimiento_incidente.incidente_relacionado_id IS 'El otro incidente involucrado cuando el movimiento es una consolidación o una separación.';

-- [GESTIÓN DEL ORGANISMO]  Desglose del puntaje de prioridad: explica por qué un incidente va antes que otro.
CREATE TABLE factor_prioridad (
    id                           serial,
    incidente_id                 int NOT NULL,
    factor                       tipo_factor NOT NULL,
    valor                        numeric(6,2) NOT NULL,
    detalle                      text,
    CONSTRAINT factor_prioridad_pk PRIMARY KEY (id),
    CONSTRAINT factor_prioridad_incidente_id_fk FOREIGN KEY (incidente_id) REFERENCES incidente (id) ON DELETE CASCADE
);
COMMENT ON TABLE factor_prioridad IS 'Desglose del puntaje de prioridad: explica por qué un incidente va antes que otro.';
COMMENT ON COLUMN factor_prioridad.id IS 'Identificador interno.';
COMMENT ON COLUMN factor_prioridad.incidente_id IS 'Incidente al que corresponde.';
COMMENT ON COLUMN factor_prioridad.factor IS 'Qué se tuvo en cuenta: severidad, evidencias, antigüedad, etc.';
COMMENT ON COLUMN factor_prioridad.valor IS 'Cuántos puntos aportó ese factor.';
COMMENT ON COLUMN factor_prioridad.detalle IS 'Explicación legible del aporte.';

-- [SEGUIMIENTO Y AVISOS]  Zona que un vecino marcó para enterarse de lo nuevo que aparezca ahí.
CREATE TABLE zona_habitual (
    id                           serial,
    usuario_id                   int NOT NULL,
    nombre                       varchar(80) NOT NULL,
    centro                       geography(Point,4326) NOT NULL,
    radio_metros                 int NOT NULL,
    activa                       boolean NOT NULL DEFAULT true,
    creado_en                    timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT zona_habitual_pk PRIMARY KEY (id),
    CONSTRAINT zona_habitual_usuario_id_fk FOREIGN KEY (usuario_id) REFERENCES usuario (id) ON DELETE CASCADE,
    CONSTRAINT zona_habitual_radio_positivo CHECK (radio_metros > 0)
);
COMMENT ON TABLE zona_habitual IS 'Zona que un vecino marcó para enterarse de lo nuevo que aparezca ahí.';
COMMENT ON COLUMN zona_habitual.id IS 'Identificador interno.';
COMMENT ON COLUMN zona_habitual.usuario_id IS 'Vecino dueño de la zona.';
COMMENT ON COLUMN zona_habitual.nombre IS 'Nombre que le puso el vecino: Casa, Trabajo, etc.';
COMMENT ON COLUMN zona_habitual.centro IS 'Punto central de la zona.';
COMMENT ON COLUMN zona_habitual.radio_metros IS 'Radio de cobertura.';
COMMENT ON COLUMN zona_habitual.activa IS 'Si sigue generando avisos.';
COMMENT ON COLUMN zona_habitual.creado_en IS 'Fecha de alta.';

-- [SEGUIMIENTO Y AVISOS]  Un vecino sigue un incidente concreto aunque no lo haya reportado él, para enterarse cuando lo arreglen. Clave única (usuario, incidente).
CREATE TABLE seguimiento_incidente (
    id                           serial,
    usuario_id                   int NOT NULL,
    incidente_id                 int NOT NULL,
    creado_en                    timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT seguimiento_incidente_pk PRIMARY KEY (id),
    CONSTRAINT seguimiento_incidente_usuario_id_fk FOREIGN KEY (usuario_id) REFERENCES usuario (id) ON DELETE CASCADE,
    CONSTRAINT seguimiento_incidente_incidente_id_fk FOREIGN KEY (incidente_id) REFERENCES incidente (id) ON DELETE CASCADE,
    CONSTRAINT seguimiento_unico UNIQUE (usuario_id, incidente_id)
);
COMMENT ON TABLE seguimiento_incidente IS 'Un vecino sigue un incidente concreto aunque no lo haya reportado él, para enterarse cuando lo arreglen. Clave única (usuario, incidente).';
COMMENT ON COLUMN seguimiento_incidente.id IS 'Identificador interno.';
COMMENT ON COLUMN seguimiento_incidente.usuario_id IS 'Vecino que sigue.';
COMMENT ON COLUMN seguimiento_incidente.incidente_id IS 'Incidente seguido.';
COMMENT ON COLUMN seguimiento_incidente.creado_en IS 'Cuándo empezó a seguirlo.';

-- [SEGUIMIENTO Y AVISOS]  Aviso concreto enviado a un usuario, con el registro de si lo leyó.
CREATE TABLE notificacion (
    id                           serial,
    usuario_id                   int NOT NULL,
    incidente_id                 int,
    tipo                         tipo_notificacion NOT NULL,
    titulo                       varchar(150) NOT NULL,
    cuerpo                       text NOT NULL,
    enviada_en                   timestamptz,
    leida_en                     timestamptz,
    creado_en                    timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT notificacion_pk PRIMARY KEY (id),
    CONSTRAINT notificacion_usuario_id_fk FOREIGN KEY (usuario_id) REFERENCES usuario (id) ON DELETE CASCADE,
    CONSTRAINT notificacion_incidente_id_fk FOREIGN KEY (incidente_id) REFERENCES incidente (id) ON DELETE CASCADE
);
COMMENT ON TABLE notificacion IS 'Aviso concreto enviado a un usuario, con el registro de si lo leyó.';
COMMENT ON COLUMN notificacion.id IS 'Identificador interno.';
COMMENT ON COLUMN notificacion.usuario_id IS 'Destinatario.';
COMMENT ON COLUMN notificacion.incidente_id IS 'Incidente al que se refiere.';
COMMENT ON COLUMN notificacion.tipo IS 'Motivo del aviso.';
COMMENT ON COLUMN notificacion.titulo IS 'Título corto del aviso.';
COMMENT ON COLUMN notificacion.cuerpo IS 'Texto del aviso.';
COMMENT ON COLUMN notificacion.enviada_en IS 'Cuándo salió.';
COMMENT ON COLUMN notificacion.leida_en IS 'Cuándo la abrió el usuario.';
COMMENT ON COLUMN notificacion.creado_en IS 'Fecha de generación.';

-- [IDENTIDAD Y ORGANIZACIÓN]  Código temporal para verificar el correo, recuperar la clave o sostener la sesión.
CREATE TABLE token_acceso (
    id                           serial,
    usuario_id                   int NOT NULL,
    tipo                         tipo_token NOT NULL,
    token_hash                   varchar(255) NOT NULL,
    expira_en                    timestamptz NOT NULL,
    usado_en                     timestamptz,
    creado_en                    timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT token_acceso_pk PRIMARY KEY (id),
    CONSTRAINT token_acceso_usuario_id_fk FOREIGN KEY (usuario_id) REFERENCES usuario (id) ON DELETE CASCADE,
    CONSTRAINT token_acceso_hash_key UNIQUE (token_hash)
);
COMMENT ON TABLE token_acceso IS 'Código temporal para verificar el correo, recuperar la clave o sostener la sesión.';
COMMENT ON COLUMN token_acceso.id IS 'Identificador interno.';
COMMENT ON COLUMN token_acceso.usuario_id IS 'Usuario al que pertenece.';
COMMENT ON COLUMN token_acceso.tipo IS 'Para qué sirve el token.';
COMMENT ON COLUMN token_acceso.token_hash IS 'Valor cifrado. El original sólo lo recibe el usuario.';
COMMENT ON COLUMN token_acceso.expira_en IS 'Momento a partir del cual deja de servir.';
COMMENT ON COLUMN token_acceso.usado_en IS 'Cuándo se consumió. Evita reutilizarlo.';
COMMENT ON COLUMN token_acceso.creado_en IS 'Fecha de emisión.';

-- [SEGUIMIENTO Y AVISOS]  De qué categorías quiere recibir avisos cada vecino. Sin esto, el interruptor de notificaciones sería todo o nada.
CREATE TABLE preferencia_notificacion (
    usuario_id                   int,
    categoria_id                 int,
    habilitada                   boolean NOT NULL DEFAULT true,
    CONSTRAINT preferencia_notificacion_pk PRIMARY KEY (usuario_id, categoria_id),
    CONSTRAINT preferencia_notificacion_usuario_id_fk FOREIGN KEY (usuario_id) REFERENCES usuario (id) ON DELETE CASCADE,
    CONSTRAINT preferencia_notificacion_categoria_id_fk FOREIGN KEY (categoria_id) REFERENCES categoria (id) ON DELETE CASCADE
);
COMMENT ON TABLE preferencia_notificacion IS 'De qué categorías quiere recibir avisos cada vecino. Sin esto, el interruptor de notificaciones sería todo o nada.';
COMMENT ON COLUMN preferencia_notificacion.usuario_id IS 'Vecino.';
COMMENT ON COLUMN preferencia_notificacion.categoria_id IS 'Categoría de la que quiere o no quiere avisos.';
COMMENT ON COLUMN preferencia_notificacion.habilitada IS 'Si recibe avisos de esa categoría.';

-- [RED PEATONAL Y RUTEO]  Qué obstáculo bloquea qué tramo de vereda. Es la bisagra del proyecto: sin esta relación, un reporte nunca llega a cambiar un recorrido.
CREATE TABLE incidente_tramo (
    incidente_id                 int,
    tramo_peatonal_id            bigint,
    CONSTRAINT incidente_tramo_pk PRIMARY KEY (incidente_id, tramo_peatonal_id),
    CONSTRAINT incidente_tramo_incidente_id_fk FOREIGN KEY (incidente_id) REFERENCES incidente (id) ON DELETE CASCADE,
    CONSTRAINT incidente_tramo_tramo_peatonal_id_fk FOREIGN KEY (tramo_peatonal_id) REFERENCES tramo_peatonal (id) ON DELETE CASCADE
);
COMMENT ON TABLE incidente_tramo IS 'Qué obstáculo bloquea qué tramo de vereda. Es la bisagra del proyecto: sin esta relación, un reporte nunca llega a cambiar un recorrido.';
COMMENT ON COLUMN incidente_tramo.incidente_id IS 'Incidente que obstruye.';
COMMENT ON COLUMN incidente_tramo.tramo_peatonal_id IS 'Tramo obstruido.';

-- [INTELIGENCIA ARTIFICIAL]  Cada llamada a un modelo de IA, con lo que se pidió y lo que respondió.
CREATE TABLE registro_ia (
    id                           serial,
    usuario_id                   int,
    tipo                         tipo_ia NOT NULL,
    proveedor                    proveedor_ia NOT NULL,
    modelo                       varchar(80) NOT NULL,
    entrada                      text,
    salida                       jsonb,
    duracion_ms                  int,
    exito                        boolean NOT NULL DEFAULT true,
    error                        text,
    creado_en                    timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT registro_ia_pk PRIMARY KEY (id),
    CONSTRAINT registro_ia_usuario_id_fk FOREIGN KEY (usuario_id) REFERENCES usuario (id) ON DELETE SET NULL
);
COMMENT ON TABLE registro_ia IS 'Cada llamada a un modelo de IA, con lo que se pidió y lo que respondió.';
COMMENT ON COLUMN registro_ia.id IS 'Identificador interno.';
COMMENT ON COLUMN registro_ia.usuario_id IS 'Quién originó la llamada.';
COMMENT ON COLUMN registro_ia.tipo IS 'Para qué se usó el modelo.';
COMMENT ON COLUMN registro_ia.proveedor IS 'Ollama local o Gemini.';
COMMENT ON COLUMN registro_ia.modelo IS 'Nombre del modelo utilizado.';
COMMENT ON COLUMN registro_ia.entrada IS 'Lo que se le envió.';
COMMENT ON COLUMN registro_ia.salida IS 'Lo que respondió, estructurado.';
COMMENT ON COLUMN registro_ia.duracion_ms IS 'Cuánto tardó.';
COMMENT ON COLUMN registro_ia.exito IS 'Si la llamada terminó bien.';
COMMENT ON COLUMN registro_ia.error IS 'Mensaje de error si falló.';
COMMENT ON COLUMN registro_ia.creado_en IS 'Fecha de la llamada.';

-- [INTELIGENCIA ARTIFICIAL]  Informe de estado y prioridades generado automáticamente, guardado para poder releerlo.
CREATE TABLE informe (
    id                           serial,
    usuario_id                   int,
    area_id                      int,
    registro_ia_id               int,
    periodo_desde                date NOT NULL,
    periodo_hasta                date NOT NULL,
    contenido                    text NOT NULL,
    metricas                     jsonb,
    creado_en                    timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT informe_pk PRIMARY KEY (id),
    CONSTRAINT informe_usuario_id_fk FOREIGN KEY (usuario_id) REFERENCES usuario (id) ON DELETE SET NULL,
    CONSTRAINT informe_area_id_fk FOREIGN KEY (area_id) REFERENCES area (id) ON DELETE RESTRICT,
    CONSTRAINT informe_registro_ia_id_fk FOREIGN KEY (registro_ia_id) REFERENCES registro_ia (id) ON DELETE SET NULL
);
COMMENT ON TABLE informe IS 'Informe de estado y prioridades generado automáticamente, guardado para poder releerlo.';
COMMENT ON COLUMN informe.id IS 'Identificador interno.';
COMMENT ON COLUMN informe.usuario_id IS 'Quién lo solicitó.';
COMMENT ON COLUMN informe.area_id IS 'Área que cubre el informe.';
COMMENT ON COLUMN informe.registro_ia_id IS 'Llamada al modelo que lo produjo.';
COMMENT ON COLUMN informe.periodo_desde IS 'Inicio del período analizado.';
COMMENT ON COLUMN informe.periodo_hasta IS 'Fin del período analizado.';
COMMENT ON COLUMN informe.contenido IS 'Texto del informe.';
COMMENT ON COLUMN informe.metricas IS 'Números que lo respaldan.';
COMMENT ON COLUMN informe.creado_en IS 'Fecha de generación.';

-- [REPORTES, INCIDENTES Y EVIDENCIA]  Lo que informa un vecino: una foto, una ubicación y una descripción.
CREATE TABLE reporte (
    id                           serial,
    incidente_id                 int,
    usuario_id                   int NOT NULL,
    categoria_id                 int NOT NULL,
    severidad_declarada          severidad NOT NULL,
    descripcion                  text,
    ubicacion                    geography(Point,4326) NOT NULL,
    direccion                    varchar(250),
    origen                       origen_reporte NOT NULL,
    nivel_confianza              smallint NOT NULL DEFAULT 0,
    estado_verificacion          estado_verificacion NOT NULL DEFAULT 'PENDIENTE_REVISION',
    categoria_sugerida_id        int,
    severidad_sugerida           severidad,
    sugerencia_aceptada          boolean,
    registro_ia_id               int,
    registrado_en                timestamptz NOT NULL DEFAULT now(),
    sincronizado_en              timestamptz,
    creado_en                    timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT reporte_pk PRIMARY KEY (id),
    CONSTRAINT reporte_incidente_id_fk FOREIGN KEY (incidente_id) REFERENCES incidente (id) ON DELETE SET NULL,
    CONSTRAINT reporte_usuario_id_fk FOREIGN KEY (usuario_id) REFERENCES usuario (id) ON DELETE RESTRICT,
    CONSTRAINT reporte_categoria_id_fk FOREIGN KEY (categoria_id) REFERENCES categoria (id) ON DELETE RESTRICT,
    CONSTRAINT reporte_categoria_sugerida_id_fk FOREIGN KEY (categoria_sugerida_id) REFERENCES categoria (id) ON DELETE SET NULL,
    CONSTRAINT reporte_registro_ia_id_fk FOREIGN KEY (registro_ia_id) REFERENCES registro_ia (id) ON DELETE SET NULL,
    CONSTRAINT reporte_confianza_rango CHECK (nivel_confianza BETWEEN 0 AND 100)
);
COMMENT ON TABLE reporte IS 'Lo que informa un vecino: una foto, una ubicación y una descripción.';
COMMENT ON COLUMN reporte.id IS 'Identificador interno.';
COMMENT ON COLUMN reporte.incidente_id IS 'Incidente al que quedó agrupado.';
COMMENT ON COLUMN reporte.usuario_id IS 'Vecino que lo cargó.';
COMMENT ON COLUMN reporte.categoria_id IS 'Categoría elegida por el vecino.';
COMMENT ON COLUMN reporte.severidad_declarada IS 'Gravedad que declaró el vecino.';
COMMENT ON COLUMN reporte.descripcion IS 'Texto libre del vecino.';
COMMENT ON COLUMN reporte.ubicacion IS 'Punto donde se cargó el reporte.';
COMMENT ON COLUMN reporte.direccion IS 'Dirección aproximada en texto.';
COMMENT ON COLUMN reporte.origen IS 'Desde la app móvil o desde el sitio web.';
COMMENT ON COLUMN reporte.nivel_confianza IS 'Puntaje de 0 a 100 que calcula la verificación automática.';
COMMENT ON COLUMN reporte.estado_verificacion IS 'Verificado, pendiente de revisión o desestimado.';
COMMENT ON COLUMN reporte.categoria_sugerida_id IS 'Categoría que propuso la IA a partir de la foto.';
COMMENT ON COLUMN reporte.severidad_sugerida IS 'Gravedad propuesta por la IA.';
COMMENT ON COLUMN reporte.sugerencia_aceptada IS 'Si el vecino aceptó la sugerencia o la corrigió.';
COMMENT ON COLUMN reporte.registro_ia_id IS 'Llamada al modelo que generó la sugerencia.';
COMMENT ON COLUMN reporte.registrado_en IS 'Momento en que el vecino lo cargó, aunque fuera sin señal.';
COMMENT ON COLUMN reporte.sincronizado_en IS 'Momento en que llegó al servidor.';
COMMENT ON COLUMN reporte.creado_en IS 'Fecha de alta del registro.';

-- [REPORTES, INCIDENTES Y EVIDENCIA]  Cada indicio, a favor o en contra, que usó el sistema para decidir si confía en un reporte.
CREATE TABLE senal_verificacion (
    id                           serial,
    reporte_id                   int NOT NULL,
    tipo                         tipo_senal NOT NULL,
    valor                        numeric(5,2) NOT NULL,
    detalle                      text,
    CONSTRAINT senal_verificacion_pk PRIMARY KEY (id),
    CONSTRAINT senal_verificacion_reporte_id_fk FOREIGN KEY (reporte_id) REFERENCES reporte (id) ON DELETE CASCADE
);
COMMENT ON TABLE senal_verificacion IS 'Cada indicio, a favor o en contra, que usó el sistema para decidir si confía en un reporte.';
COMMENT ON COLUMN senal_verificacion.id IS 'Identificador interno.';
COMMENT ON COLUMN senal_verificacion.reporte_id IS 'Reporte al que corresponde.';
COMMENT ON COLUMN senal_verificacion.tipo IS 'Qué se comprobó: EXIF, duplicado, reputación, etc.';
COMMENT ON COLUMN senal_verificacion.valor IS 'Cuánto suma o resta al puntaje de confianza.';
COMMENT ON COLUMN senal_verificacion.detalle IS 'Explicación legible del resultado.';

-- [GESTIÓN DEL ORGANISMO]  Acto de dar por resuelto un incidente, con la foto del después como prueba.
CREATE TABLE cierre_incidente (
    id                           serial,
    incidente_id                 int NOT NULL,
    usuario_id                   int NOT NULL,
    distancia_metros             numeric(7,2),
    resultado_comparacion        resultado_comparacion,
    detalle_comparacion          text,
    registro_ia_id               int,
    creado_en                    timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT cierre_incidente_pk PRIMARY KEY (id),
    CONSTRAINT cierre_incidente_incidente_id_fk FOREIGN KEY (incidente_id) REFERENCES incidente (id) ON DELETE CASCADE,
    CONSTRAINT cierre_incidente_usuario_id_fk FOREIGN KEY (usuario_id) REFERENCES usuario (id) ON DELETE RESTRICT,
    CONSTRAINT cierre_incidente_registro_ia_id_fk FOREIGN KEY (registro_ia_id) REFERENCES registro_ia (id) ON DELETE SET NULL,
    CONSTRAINT cierre_incidente_incidente_key UNIQUE (incidente_id)
);
COMMENT ON TABLE cierre_incidente IS 'Acto de dar por resuelto un incidente, con la foto del después como prueba.';
COMMENT ON COLUMN cierre_incidente.id IS 'Identificador interno.';
COMMENT ON COLUMN cierre_incidente.incidente_id IS 'Incidente cerrado. Único: un incidente se cierra una sola vez.';
COMMENT ON COLUMN cierre_incidente.usuario_id IS 'Operador que firmó el cierre.';
COMMENT ON COLUMN cierre_incidente.distancia_metros IS 'Distancia entre la foto de cierre y la ubicación del incidente.';
COMMENT ON COLUMN cierre_incidente.resultado_comparacion IS 'Veredicto de comparar el antes con el después.';
COMMENT ON COLUMN cierre_incidente.detalle_comparacion IS 'Explicación de ese veredicto.';
COMMENT ON COLUMN cierre_incidente.registro_ia_id IS 'Llamada al modelo que hizo la comparación.';
COMMENT ON COLUMN cierre_incidente.creado_en IS 'Fecha del cierre.';

-- [REPORTES, INCIDENTES Y EVIDENCIA]  Evidencia gráfica. Pertenece a un reporte o a un cierre, nunca a los dos.
CREATE TABLE fotografia (
    id                           serial,
    reporte_id                   int,
    cierre_id                    int,
    ruta_archivo                 varchar(300) NOT NULL,
    ancho                        int,
    alto                         int,
    tamano_bytes                 int,
    hash_perceptual              bit(64),
    exif_latitud                 numeric(9,6),
    exif_longitud                numeric(9,6),
    exif_tomada_en               timestamptz,
    exif_marca                   varchar(60),
    exif_modelo                  varchar(60),
    tomada_con_camara_app        boolean NOT NULL DEFAULT false,
    creado_en                    timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT fotografia_pk PRIMARY KEY (id),
    CONSTRAINT fotografia_reporte_id_fk FOREIGN KEY (reporte_id) REFERENCES reporte (id) ON DELETE CASCADE,
    CONSTRAINT fotografia_cierre_id_fk FOREIGN KEY (cierre_id) REFERENCES cierre_incidente (id) ON DELETE CASCADE,
    CONSTRAINT fotografia_duenio_unico CHECK ((reporte_id IS NOT NULL)::int + (cierre_id IS NOT NULL)::int = 1)
);
COMMENT ON TABLE fotografia IS 'Evidencia gráfica. Pertenece a un reporte o a un cierre, nunca a los dos.';
COMMENT ON COLUMN fotografia.id IS 'Identificador interno.';
COMMENT ON COLUMN fotografia.reporte_id IS 'Reporte al que pertenece.';
COMMENT ON COLUMN fotografia.cierre_id IS 'Cierre al que pertenece.';
COMMENT ON COLUMN fotografia.ruta_archivo IS 'Ubicación del archivo en el almacenamiento.';
COMMENT ON COLUMN fotografia.ancho IS 'Ancho en píxeles.';
COMMENT ON COLUMN fotografia.alto IS 'Alto en píxeles.';
COMMENT ON COLUMN fotografia.tamano_bytes IS 'Peso del archivo.';
COMMENT ON COLUMN fotografia.hash_perceptual IS 'Huella visual para detectar fotos repetidas.';
COMMENT ON COLUMN fotografia.exif_latitud IS 'Latitud grabada por la cámara.';
COMMENT ON COLUMN fotografia.exif_longitud IS 'Longitud grabada por la cámara.';
COMMENT ON COLUMN fotografia.exif_tomada_en IS 'Fecha y hora que grabó la cámara.';
COMMENT ON COLUMN fotografia.exif_marca IS 'Marca del equipo.';
COMMENT ON COLUMN fotografia.exif_modelo IS 'Modelo del equipo.';
COMMENT ON COLUMN fotografia.tomada_con_camara_app IS 'Si se sacó desde la app o se subió de la galería.';
COMMENT ON COLUMN fotografia.creado_en IS 'Fecha de alta.';

-- ==========================================================================
-- INDICES
-- ==========================================================================

CREATE INDEX incidente_ubicacion_gix ON incidente USING GIST (ubicacion);
CREATE INDEX reporte_ubicacion_gix ON reporte USING GIST (ubicacion);
CREATE INDEX zona_habitual_centro_gix ON zona_habitual USING GIST (centro);
CREATE INDEX zona_piloto_geometria_gix ON zona_piloto USING GIST (geometria);
CREATE INDEX nodo_peatonal_ubicacion_gix ON nodo_peatonal USING GIST (ubicacion);
CREATE INDEX tramo_peatonal_geometria_gix ON tramo_peatonal USING GIST (geometria);
CREATE INDEX punto_interes_ubicacion_gix ON punto_interes USING GIST (ubicacion);
CREATE INDEX incidente_estado_ix ON incidente (estado);
CREATE INDEX incidente_area_id_ix ON incidente (area_id);
CREATE INDEX incidente_categoria_id_ix ON incidente (categoria_id);
CREATE INDEX incidente_puntaje_prioridad_ix ON incidente (puntaje_prioridad);
CREATE INDEX reporte_incidente_id_ix ON reporte (incidente_id);
CREATE INDEX reporte_usuario_id_ix ON reporte (usuario_id);
CREATE INDEX fotografia_hash_perceptual_ix ON fotografia (hash_perceptual);
CREATE INDEX movimiento_incidente_incidente_id_ix ON movimiento_incidente (incidente_id);
CREATE INDEX notificacion_usuario_id_ix ON notificacion (usuario_id);
CREATE INDEX incidente_tramo_tramo_peatonal_id_ix ON incidente_tramo (tramo_peatonal_id);
CREATE INDEX registro_ia_creado_en_ix ON registro_ia (creado_en);

-- ==========================================================================
-- VISTA PARA pgRouting
-- ==========================================================================
-- pgr_dijkstra necesita las columnas source, target, cost y reverse_cost.
-- El costo final lo calcula la aplicacion segun el perfil de movilidad del usuario;
-- esta vista expone solo el costo base de la red.
CREATE OR REPLACE VIEW red_peatonal AS
SELECT id,
       nodo_origen_id  AS source,
       nodo_destino_id AS target,
       costo_base      AS cost,
       costo_base      AS reverse_cost
FROM   tramo_peatonal;
