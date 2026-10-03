# SnapIt - diccionario de datos

Modelo relacional entregado el 19/09/2026. Grupo Full Stack F.C.

**28 tablas · 215 columnas · 46 claves foraneas · 17 tipos enumerados**

Claves: `PK` primaria · `FK` foranea · `U` valor unico · `PK,FK` parte de una clave primaria compuesta que ademas es foranea.

## IDENTIDAD Y ORGANIZACIÓN

### `usuario`

Persona registrada en el sistema: el vecino que reporta, el operador del organismo o el administrador.

| Atributo | Tipo | Clave | Nulo | Descripcion |
|---|---|---|---|---|
| `id` | `serial` | PK | no | Identificador interno. |
| `email` | `varchar(150)` | U | no | Correo con el que inicia sesión. No se puede repetir. |
| `password_hash` | `varchar(255)` |  | no | Contraseña cifrada. Nunca se guarda en texto plano. |
| `nombre` | `varchar(120)` |  | no | Nombre visible del usuario. |
| `rol` | `rol_usuario` |  | no | Vecino, operador o administrador. |
| `organismo_id` | `int` | FK | si | Organismo al que pertenece. Sólo operadores y administradores. |
| `area_id` | `int` | FK | si | Área o cuadrilla asignada. Sólo operadores. |
| `email_verificado_en` | `timestamptz` |  | si | Momento en que confirmó su correo. |
| `reputacion` | `numeric(5,2)` |  | no | Puntaje de confianza calculado con su historial de reportes. |
| `reportes_confirmados` | `int` |  | no | Contador de reportes suyos que resultaron válidos. |
| `reportes_desestimados` | `int` |  | no | Contador de reportes suyos que fueron descartados. |
| `creado_en` | `timestamptz` |  | no | Fecha de alta. |
| `actualizado_en` | `timestamptz` |  | no | Última modificación del registro. |
| `eliminado_en` | `timestamptz` |  | si | Baja lógica: si está informado, la cuenta ya no se usa. |
| `perfil_movilidad_id` | `int` | FK | si | Perfil de movilidad por defecto para calcular recorridos. |
| `notificaciones_habilitadas` | `boolean` |  | no | Interruptor general de avisos. |

### `organismo`

Municipio o ente público responsable de atender los incidentes.

| Atributo | Tipo | Clave | Nulo | Descripcion |
|---|---|---|---|---|
| `id` | `serial` | PK | no | Identificador interno. |
| `nombre` | `varchar(150)` |  | no | Nombre del organismo. |
| `descripcion` | `text` |  | si | Detalle o jurisdicción. |
| `activo` | `boolean` |  | no | Si sigue operativo dentro del sistema. |
| `creado_en` | `timestamptz` |  | no | Fecha de alta. |

### `area`

Dependencia o cuadrilla dentro del organismo a la que se deriva el trabajo.

| Atributo | Tipo | Clave | Nulo | Descripcion |
|---|---|---|---|---|
| `id` | `serial` | PK | no | Identificador interno. |
| `organismo_id` | `int` | FK | no | Organismo al que pertenece. |
| `nombre` | `varchar(120)` |  | no | Nombre del área: Bacheo, Alumbrado, Arbolado, etc. |
| `descripcion` | `text` |  | si | Detalle de lo que atiende. |
| `activa` | `boolean` |  | no | Si se le pueden seguir derivando incidentes. |
| `creado_en` | `timestamptz` |  | no | Fecha de alta. |

### `dispositivo`

Celular o navegador desde el que un usuario recibe los avisos push.

| Atributo | Tipo | Clave | Nulo | Descripcion |
|---|---|---|---|---|
| `id` | `serial` | PK | no | Identificador interno. |
| `usuario_id` | `int` | FK | no | Dueño del dispositivo. |
| `token_push` | `varchar(255)` |  | no | Identificador que entrega el servicio de notificaciones. |
| `plataforma` | `plataforma` |  | no | Android o web. |
| `ultimo_uso_en` | `timestamptz` |  | si | Último acceso desde este dispositivo. |
| `activo` | `boolean` |  | no | Si sigue habilitado para recibir avisos. |

### `token_acceso`

Código temporal para verificar el correo, recuperar la clave o sostener la sesión.

| Atributo | Tipo | Clave | Nulo | Descripcion |
|---|---|---|---|---|
| `id` | `serial` | PK | no | Identificador interno. |
| `usuario_id` | `int` | FK | no | Usuario al que pertenece. |
| `tipo` | `tipo_token` |  | no | Para qué sirve el token. |
| `token_hash` | `varchar(255)` | U | no | Valor cifrado. El original sólo lo recibe el usuario. |
| `expira_en` | `timestamptz` |  | no | Momento a partir del cual deja de servir. |
| `usado_en` | `timestamptz` |  | si | Cuándo se consumió. Evita reutilizarlo. |
| `creado_en` | `timestamptz` |  | no | Fecha de emisión. |

## CATÁLOGO CONFIGURABLE

### `categoria`

Tipo de problema que se puede reportar. El administrador la configura sin tocar el código.

| Atributo | Tipo | Clave | Nulo | Descripcion |
|---|---|---|---|---|
| `id` | `serial` | PK | no | Identificador interno. |
| `nombre` | `varchar(80)` | U | no | Nombre visible: Pozo, Vereda rota, Luminaria apagada, etc. |
| `descripcion` | `text` |  | si | Explicación para el vecino. |
| `area_id` | `int` | FK | no | Área que atiende esta categoría por defecto. |
| `tipo_vigencia_default` | `tipo_vigencia` |  | no | Si el problema suele ser permanente o temporal. |
| `dias_caducidad_default` | `int` |  | si | Días tras los cuales caduca un incidente temporal. |
| `peso_severidad_base` | `numeric(4,2)` |  | no | Peso inicial de la categoría en el cálculo de prioridad. |
| `activa` | `boolean` |  | no | Si se puede seguir eligiendo al reportar. |

### `perfil_movilidad`

Forma de desplazarse del peatón: silla de ruedas, bastón, coche de bebé o baja visión.

| Atributo | Tipo | Clave | Nulo | Descripcion |
|---|---|---|---|---|
| `id` | `serial` | PK | no | Identificador interno. |
| `nombre` | `varchar(60)` | U | no | Nombre del perfil. |
| `descripcion` | `text` |  | si | Qué dificultades tiene ese peatón. |
| `activo` | `boolean` |  | no | Si se puede elegir al calcular un recorrido. |

### `categoria_perfil`

Cuánto estorba cada tipo de problema a cada perfil de movilidad. Es lo que hace que el mismo obstáculo cambie el recorrido de una silla de ruedas y no el de un coche de bebé.

| Atributo | Tipo | Clave | Nulo | Descripcion |
|---|---|---|---|---|
| `categoria_id` | `int` | PK,FK | no | Categoría del problema. |
| `perfil_movilidad_id` | `int` | PK,FK | no | Perfil afectado. |
| `intransitable` | `boolean` |  | no | Si para ese perfil el tramo queda directamente bloqueado. |
| `factor_penalizacion` | `numeric(5,2)` |  | no | Cuánto se encarece el tramo si no queda bloqueado. |

### `parametro_sistema`

Configuración del algoritmo, editable sin volver a desplegar la aplicación.

| Atributo | Tipo | Clave | Nulo | Descripcion |
|---|---|---|---|---|
| `clave` | `varchar(80)` | PK | no | Nombre del parámetro. |
| `valor` | `varchar(200)` |  | no | Valor vigente. |
| `tipo` | `varchar(20)` |  | no | Tipo de dato del valor. |
| `descripcion` | `text` |  | si | Para qué se usa. |

## REPORTES, INCIDENTES Y EVIDENCIA

### `incidente`

Problema real en la vía pública. Es la conclusión del sistema a partir de uno o varios reportes.

| Atributo | Tipo | Clave | Nulo | Descripcion |
|---|---|---|---|---|
| `id` | `serial` | PK | no | Identificador interno. |
| `categoria_id` | `int` | FK | no | Tipo de problema. |
| `area_id` | `int` | FK | si | Área a la que está derivado. |
| `estado` | `estado_incidente` |  | no | Situación actual del incidente. |
| `severidad` | `severidad` |  | no | Gravedad consolidada. |
| `ubicacion` | `geography(Point,4326)` |  | no | Punto georreferenciado. |
| `direccion` | `varchar(250)` |  | si | Dirección aproximada en texto. |
| `tipo_vigencia` | `tipo_vigencia` |  | no | Si es permanente o temporal. |
| `vigente_hasta` | `timestamptz` |  | si | Fecha hasta la que se considera vigente. |
| `caducado_en` | `timestamptz` |  | si | Momento en que caducó por vencimiento. |
| `puntaje_prioridad` | `numeric(6,2)` |  | no | Prioridad calculada por el sistema. |
| `prioridad_manual` | `numeric(6,2)` |  | si | Prioridad forzada por un operador. |
| `motivo_prioridad_manual` | `text` |  | si | Justificación del ajuste manual. |
| `ajustada_por_id` | `int` | FK | si | Operador que ajustó la prioridad. |
| `cantidad_reportes` | `int` |  | no | Cantidad de reportes agrupados. Contador. |
| `primer_reporte_en` | `timestamptz` |  | no | Fecha del primer reporte que lo originó. |
| `resuelto_en` | `timestamptz` |  | si | Cuándo se dio por resuelto. |
| `creado_en` | `timestamptz` |  | no | Fecha de alta. |
| `actualizado_en` | `timestamptz` |  | no | Última modificación. |
| `incidente_principal_id` | `int` | FK | si | Si el operador unió este incidente dentro de otro, apunta al principal. Mientras esté informado, el incidente es un duplicado —no un reporte falso— y no se muestra en el mapa ni se trabaja por separado. |

### `reporte`

Lo que informa un vecino: una foto, una ubicación y una descripción.

| Atributo | Tipo | Clave | Nulo | Descripcion |
|---|---|---|---|---|
| `id` | `serial` | PK | no | Identificador interno. |
| `incidente_id` | `int` | FK | si | Incidente al que quedó agrupado. |
| `usuario_id` | `int` | FK | no | Vecino que lo cargó. |
| `categoria_id` | `int` | FK | no | Categoría elegida por el vecino. |
| `severidad_declarada` | `severidad` |  | no | Gravedad que declaró el vecino. |
| `descripcion` | `text` |  | si | Texto libre del vecino. |
| `ubicacion` | `geography(Point,4326)` |  | no | Punto donde se cargó el reporte. |
| `direccion` | `varchar(250)` |  | si | Dirección aproximada en texto. |
| `origen` | `origen_reporte` |  | no | Desde la app móvil o desde el sitio web. |
| `nivel_confianza` | `smallint` |  | no | Puntaje de 0 a 100 que calcula la verificación automática. |
| `estado_verificacion` | `estado_verificacion` |  | no | Verificado, pendiente de revisión o desestimado. |
| `categoria_sugerida_id` | `int` | FK | si | Categoría que propuso la IA a partir de la foto. |
| `severidad_sugerida` | `severidad` |  | si | Gravedad propuesta por la IA. |
| `sugerencia_aceptada` | `boolean` |  | si | Si el vecino aceptó la sugerencia o la corrigió. |
| `registro_ia_id` | `int` | FK | si | Llamada al modelo que generó la sugerencia. |
| `registrado_en` | `timestamptz` |  | no | Momento en que el vecino lo cargó, aunque fuera sin señal. |
| `sincronizado_en` | `timestamptz` |  | si | Momento en que llegó al servidor. |
| `creado_en` | `timestamptz` |  | no | Fecha de alta del registro. |

### `fotografia`

Evidencia gráfica. Pertenece a un reporte o a un cierre, nunca a los dos.

| Atributo | Tipo | Clave | Nulo | Descripcion |
|---|---|---|---|---|
| `id` | `serial` | PK | no | Identificador interno. |
| `reporte_id` | `int` | FK | si | Reporte al que pertenece. |
| `cierre_id` | `int` | FK | si | Cierre al que pertenece. |
| `ruta_archivo` | `varchar(300)` |  | no | Ubicación del archivo en el almacenamiento. |
| `ancho` | `int` |  | si | Ancho en píxeles. |
| `alto` | `int` |  | si | Alto en píxeles. |
| `tamano_bytes` | `int` |  | si | Peso del archivo. |
| `hash_perceptual` | `bit(64)` |  | si | Huella visual para detectar fotos repetidas. |
| `exif_latitud` | `numeric(9,6)` |  | si | Latitud grabada por la cámara. |
| `exif_longitud` | `numeric(9,6)` |  | si | Longitud grabada por la cámara. |
| `exif_tomada_en` | `timestamptz` |  | si | Fecha y hora que grabó la cámara. |
| `exif_marca` | `varchar(60)` |  | si | Marca del equipo. |
| `exif_modelo` | `varchar(60)` |  | si | Modelo del equipo. |
| `tomada_con_camara_app` | `boolean` |  | no | Si se sacó desde la app o se subió de la galería. |
| `creado_en` | `timestamptz` |  | no | Fecha de alta. |

### `senal_verificacion`

Cada indicio, a favor o en contra, que usó el sistema para decidir si confía en un reporte.

| Atributo | Tipo | Clave | Nulo | Descripcion |
|---|---|---|---|---|
| `id` | `serial` | PK | no | Identificador interno. |
| `reporte_id` | `int` | FK | no | Reporte al que corresponde. |
| `tipo` | `tipo_senal` |  | no | Qué se comprobó: EXIF, duplicado, reputación, etc. |
| `valor` | `numeric(5,2)` |  | no | Cuánto suma o resta al puntaje de confianza. |
| `detalle` | `text` |  | si | Explicación legible del resultado. |

### `confirmacion_incidente`

El “a mí también me pasa”: un vecino adhiere a un incidente ya cargado sin duplicar el reporte. La clave única (incidente, usuario) impide que la misma persona confirme dos veces.

| Atributo | Tipo | Clave | Nulo | Descripcion |
|---|---|---|---|---|
| `id` | `serial` | PK | no | Identificador interno. |
| `incidente_id` | `int` | FK | no | Incidente confirmado. |
| `usuario_id` | `int` | FK | no | Vecino que confirma. |
| `creado_en` | `timestamptz` |  | no | Cuándo confirmó. |

## GESTIÓN DEL ORGANISMO

### `movimiento_incidente`

Bitácora del incidente: todo lo que le pasó, con autor y fecha.

| Atributo | Tipo | Clave | Nulo | Descripcion |
|---|---|---|---|---|
| `id` | `serial` | PK | no | Identificador interno. |
| `incidente_id` | `int` | FK | no | Incidente afectado. |
| `usuario_id` | `int` | FK | si | Quién hizo el movimiento. |
| `tipo` | `tipo_movimiento` |  | no | Clase de movimiento: cambio de estado, derivación, fusión, etc. |
| `area_id` | `int` | FK | si | Área destino cuando el movimiento es una derivación. |
| `estado_anterior` | `estado_incidente` |  | si | Estado antes del movimiento. |
| `estado_nuevo` | `estado_incidente` |  | si | Estado después del movimiento. |
| `comentario` | `text` |  | si | Observación del operador. |
| `creado_en` | `timestamptz` |  | no | Cuándo ocurrió. |
| `incidente_relacionado_id` | `int` | FK | si | El otro incidente involucrado cuando el movimiento es una consolidación o una separación. |

### `cierre_incidente`

Acto de dar por resuelto un incidente, con la foto del después como prueba.

| Atributo | Tipo | Clave | Nulo | Descripcion |
|---|---|---|---|---|
| `id` | `serial` | PK | no | Identificador interno. |
| `incidente_id` | `int` | FK, U | no | Incidente cerrado. Único: un incidente se cierra una sola vez. |
| `usuario_id` | `int` | FK | no | Operador que firmó el cierre. |
| `distancia_metros` | `numeric(7,2)` |  | si | Distancia entre la foto de cierre y la ubicación del incidente. |
| `resultado_comparacion` | `resultado_comparacion` |  | si | Veredicto de comparar el antes con el después. |
| `detalle_comparacion` | `text` |  | si | Explicación de ese veredicto. |
| `registro_ia_id` | `int` | FK | si | Llamada al modelo que hizo la comparación. |
| `creado_en` | `timestamptz` |  | no | Fecha del cierre. |

### `factor_prioridad`

Desglose del puntaje de prioridad: explica por qué un incidente va antes que otro.

| Atributo | Tipo | Clave | Nulo | Descripcion |
|---|---|---|---|---|
| `id` | `serial` | PK | no | Identificador interno. |
| `incidente_id` | `int` | FK | no | Incidente al que corresponde. |
| `factor` | `tipo_factor` |  | no | Qué se tuvo en cuenta: severidad, evidencias, antigüedad, etc. |
| `valor` | `numeric(6,2)` |  | no | Cuántos puntos aportó ese factor. |
| `detalle` | `text` |  | si | Explicación legible del aporte. |

## SEGUIMIENTO Y AVISOS

### `zona_habitual`

Zona que un vecino marcó para enterarse de lo nuevo que aparezca ahí.

| Atributo | Tipo | Clave | Nulo | Descripcion |
|---|---|---|---|---|
| `id` | `serial` | PK | no | Identificador interno. |
| `usuario_id` | `int` | FK | no | Vecino dueño de la zona. |
| `nombre` | `varchar(80)` |  | no | Nombre que le puso el vecino: Casa, Trabajo, etc. |
| `centro` | `geography(Point,4326)` |  | no | Punto central de la zona. |
| `radio_metros` | `int` |  | no | Radio de cobertura. |
| `activa` | `boolean` |  | no | Si sigue generando avisos. |
| `creado_en` | `timestamptz` |  | no | Fecha de alta. |

### `seguimiento_incidente`

Un vecino sigue un incidente concreto aunque no lo haya reportado él, para enterarse cuando lo arreglen. Clave única (usuario, incidente).

| Atributo | Tipo | Clave | Nulo | Descripcion |
|---|---|---|---|---|
| `id` | `serial` | PK | no | Identificador interno. |
| `usuario_id` | `int` | FK | no | Vecino que sigue. |
| `incidente_id` | `int` | FK | no | Incidente seguido. |
| `creado_en` | `timestamptz` |  | no | Cuándo empezó a seguirlo. |

### `notificacion`

Aviso concreto enviado a un usuario, con el registro de si lo leyó.

| Atributo | Tipo | Clave | Nulo | Descripcion |
|---|---|---|---|---|
| `id` | `serial` | PK | no | Identificador interno. |
| `usuario_id` | `int` | FK | no | Destinatario. |
| `incidente_id` | `int` | FK | si | Incidente al que se refiere. |
| `tipo` | `tipo_notificacion` |  | no | Motivo del aviso. |
| `titulo` | `varchar(150)` |  | no | Título corto del aviso. |
| `cuerpo` | `text` |  | no | Texto del aviso. |
| `enviada_en` | `timestamptz` |  | si | Cuándo salió. |
| `leida_en` | `timestamptz` |  | si | Cuándo la abrió el usuario. |
| `creado_en` | `timestamptz` |  | no | Fecha de generación. |

### `preferencia_notificacion`

De qué categorías quiere recibir avisos cada vecino. Sin esto, el interruptor de notificaciones sería todo o nada.

| Atributo | Tipo | Clave | Nulo | Descripcion |
|---|---|---|---|---|
| `usuario_id` | `int` | PK,FK | no | Vecino. |
| `categoria_id` | `int` | PK,FK | no | Categoría de la que quiere o no quiere avisos. |
| `habilitada` | `boolean` |  | no | Si recibe avisos de esa categoría. |

## RED PEATONAL Y RUTEO

### `zona_piloto`

Polígono dentro del cual está habilitado el cálculo de recorridos accesibles.

| Atributo | Tipo | Clave | Nulo | Descripcion |
|---|---|---|---|---|
| `id` | `serial` | PK | no | Identificador interno. |
| `nombre` | `varchar(120)` |  | no | Nombre de la zona. |
| `geometria` | `geography(Polygon,4326)` |  | no | Contorno del área cubierta. |
| `activa` | `boolean` |  | no | Si el ruteo está habilitado ahí. |

### `nodo_peatonal`

Punto del grafo peatonal. En la práctica, una esquina o un cruce.

| Atributo | Tipo | Clave | Nulo | Descripcion |
|---|---|---|---|---|
| `id` | `bigserial` | PK | no | Identificador interno. |
| `osm_id` | `bigint` |  | si | Identificador del nodo en OpenStreetMap. |
| `ubicacion` | `geography(Point,4326)` |  | no | Coordenadas del nodo. |
| `tiene_semaforo_sonoro` | `boolean` |  | no | Si el cruce tiene señal audible. |
| `tiene_piso_podotactil` | `boolean` |  | no | Si tiene piso guía para personas con baja visión. |

### `tramo_peatonal`

Arista del grafo: la vereda o el cruce que une dos nodos. Es por donde se camina.

| Atributo | Tipo | Clave | Nulo | Descripcion |
|---|---|---|---|---|
| `id` | `bigserial` | PK | no | Identificador interno. |
| `nodo_origen_id` | `bigint` | FK | no | Nodo donde arranca el tramo. |
| `nodo_destino_id` | `bigint` | FK | no | Nodo donde termina el tramo. |
| `geometria` | `geography(LineString,4326)` |  | no | Traza del tramo. |
| `longitud_metros` | `numeric(9,2)` |  | no | Largo real. |
| `tipo` | `tipo_tramo` |  | no | Vereda, cruce, escalera o senda. |
| `tiene_rampa` | `boolean` |  | no | Si hay rampa en el cordón. |
| `pendiente_porcentaje` | `numeric(5,2)` |  | si | Inclinación del tramo. |
| `ancho_estimado` | `numeric(4,2)` |  | si | Ancho útil estimado. |
| `superficie` | `varchar(40)` |  | si | Material de la superficie. |
| `costo_base` | `numeric(9,2)` |  | no | Costo del tramo antes de aplicar obstáculos y perfil. |

### `incidente_tramo`

Qué obstáculo bloquea qué tramo de vereda. Es la bisagra del proyecto: sin esta relación, un reporte nunca llega a cambiar un recorrido.

| Atributo | Tipo | Clave | Nulo | Descripcion |
|---|---|---|---|---|
| `incidente_id` | `int` | PK,FK | no | Incidente que obstruye. |
| `tramo_peatonal_id` | `bigint` | PK,FK | no | Tramo obstruido. |

### `punto_interes`

Escuela, centro de salud, parada o edificio público cuya cercanía eleva la prioridad.

| Atributo | Tipo | Clave | Nulo | Descripcion |
|---|---|---|---|---|
| `id` | `serial` | PK | no | Identificador interno. |
| `tipo` | `tipo_punto_interes` |  | no | Clase de punto. |
| `nombre` | `varchar(150)` |  | no | Nombre del lugar. |
| `ubicacion` | `geography(Point,4326)` |  | no | Coordenadas. |
| `osm_id` | `bigint` |  | si | Identificador en OpenStreetMap. |

## INTELIGENCIA ARTIFICIAL

### `registro_ia`

Cada llamada a un modelo de IA, con lo que se pidió y lo que respondió.

| Atributo | Tipo | Clave | Nulo | Descripcion |
|---|---|---|---|---|
| `id` | `serial` | PK | no | Identificador interno. |
| `usuario_id` | `int` | FK | si | Quién originó la llamada. |
| `tipo` | `tipo_ia` |  | no | Para qué se usó el modelo. |
| `proveedor` | `proveedor_ia` |  | no | Ollama local o Gemini. |
| `modelo` | `varchar(80)` |  | no | Nombre del modelo utilizado. |
| `entrada` | `text` |  | si | Lo que se le envió. |
| `salida` | `jsonb` |  | si | Lo que respondió, estructurado. |
| `duracion_ms` | `int` |  | si | Cuánto tardó. |
| `exito` | `boolean` |  | no | Si la llamada terminó bien. |
| `error` | `text` |  | si | Mensaje de error si falló. |
| `creado_en` | `timestamptz` |  | no | Fecha de la llamada. |

### `informe`

Informe de estado y prioridades generado automáticamente, guardado para poder releerlo.

| Atributo | Tipo | Clave | Nulo | Descripcion |
|---|---|---|---|---|
| `id` | `serial` | PK | no | Identificador interno. |
| `usuario_id` | `int` | FK | si | Quién lo solicitó. |
| `area_id` | `int` | FK | si | Área que cubre el informe. |
| `registro_ia_id` | `int` | FK | si | Llamada al modelo que lo produjo. |
| `periodo_desde` | `date` |  | no | Inicio del período analizado. |
| `periodo_hasta` | `date` |  | no | Fin del período analizado. |
| `contenido` | `text` |  | no | Texto del informe. |
| `metricas` | `jsonb` |  | si | Números que lo respaldan. |
| `creado_en` | `timestamptz` |  | no | Fecha de generación. |

## Tipos enumerados

| Tipo | Valores |
|---|---|
| `rol_usuario` | VECINO · OPERADOR · ADMINISTRADOR |
| `estado_incidente` | REGISTRADO · VERIFICADO · DERIVADO · EN_EJECUCION · RESUELTO · DESESTIMADO |
| `severidad` | LEVE · MODERADA · GRAVE |
| `estado_verificacion` | VERIFICADO · PENDIENTE_REVISION · DESESTIMADO |
| `origen_reporte` | APP_MOVIL · SITIO_WEB |
| `tipo_vigencia` | PERMANENTE · TEMPORAL |
| `tipo_senal` | EXIF_COINCIDE · EXIF_AUSENTE · HASH_DUPLICADO · ORIGEN_APP · REPUTACION · FECHA_ANTIGUA |
| `tipo_factor` | SEVERIDAD · EVIDENCIAS · ANTIGUEDAD · CONTEXTO_URBANO · AJUSTE_MANUAL |
| `resultado_comparacion` | VALIDADO · OBSERVADO · RECHAZADO |
| `tipo_notificacion` | CAMBIO_ESTADO · NUEVO_EN_ZONA · CIERRE · VERIFICACION |
| `tipo_token` | VERIFICACION_EMAIL · RECUPERACION_CLAVE · SESION |
| `tipo_movimiento` | CAMBIO_ESTADO · DERIVACION · FUSION · SEPARACION · AJUSTE_PRIORIDAD · COMENTARIO |
| `tipo_tramo` | VEREDA · CRUCE · ESCALERA · SENDA |
| `tipo_punto_interes` | ESCUELA · CENTRO_SALUD · PARADA_TRANSPORTE · EDIFICIO_PUBLICO |
| `tipo_ia` | CLASIFICACION_IMAGEN · COMPARACION_CIERRE · INFORME · CONSULTA_NATURAL |
| `proveedor_ia` | OLLAMA · GEMINI |
| `plataforma` | ANDROID · WEB |

## Notas de modelado

1. Modelado tentativo: la estructura definitiva de nodo_peatonal y tramo_peatonal depende del formato que genere la importación de la red peatonal desde OpenStreetMap. Las columnas indicadas son una aproximación inicial; el resto del modelo no se ve afectado.
2. Toda columna de ubicación usa el tipo geography de PostGIS con SRID 4326 e índice GIST.
3. fotografia pertenece a un reporte o a un cierre: lleva una restricción CHECK que obliga a que exactamente uno de los dos campos esté informado.
4. Claves únicas compuestas: (incidente_id, usuario_id) en confirmacion_incidente y en seguimiento_incidente; (categoria_id, perfil_movilidad_id) en categoria_perfil.
5. El cálculo de recorridos se resuelve con pgRouting sobre una vista de tramo_peatonal que expone las columnas source, target, cost y reverse_cost que la extensión requiere.
6. zona_piloto, punto_interes y parametro_sistema no tienen claves foráneas de manera deliberada: las dos primeras se vinculan con el resto del modelo por consulta espacial (ST_DWithin, ST_Contains) y la tercera por clave de configuración.
7. Denormalización deliberada: incidente.cantidad_reportes y los contadores de usuario (reputacion, reportes_confirmados, reportes_desestimados) se recalculan al registrar o desestimar un reporte. Se almacenan para no recorrer toda la tabla de reportes cada vez que se ordena la bandeja de trabajo o se evalúa la confianza de un vecino.
