# Cálculos y parámetros

Valores iniciales que carga la semilla (`npm run semilla`, en `server/`). Se guardan en la base (`parametro_sistema`, `categoria`, `categoria_perfil`), así que se pueden ajustar sin tocar código.

Si cambiás un valor en `server/src/semilla/datos.ts`, actualizalo también acá.

> **Valores de partida (05/10/2026).** No salen de mediciones: se revisan con los datos de la prueba piloto. Las fórmulas que usan estos parámetros se documentan acá con la issue de cada cálculo (verificación, reputación, agrupación, prioridad, cierre, vigencia y recorridos).

## Catálogo

**Organismo:** Municipalidad de Neuquén, con las áreas **Bacheo**, **Veredas**, **Alumbrado** y **Obras**.

### Categorías

| Categoría | Área | Vigencia | Caduca a los | Peso de severidad |
|---|---|---|---|---|
| Pozo en la calzada | Bacheo | Permanente | — | 1,50 |
| Vereda rota | Veredas | Permanente | — | 1,30 |
| Cordón sin rampa | Veredas | Permanente | — | 1,40 |
| Luminaria apagada | Alumbrado | Permanente | — | 1,00 |
| Obra que interrumpe el paso | Obras | Temporal | 30 días | 1,20 |

- **Vigencia temporal:** el incidente vence `dias_caducidad_default` días después de creado (si la categoría no los define, `vigencia.dias_default`). Cuando un vecino confirma que el problema sigue, la vigencia se renueva.
- **Peso de severidad:** cuánto pesa la categoría en el factor de severidad de la prioridad. Un peso mayor sube la prioridad de los incidentes de esa categoría.

### Perfiles de movilidad y matriz categoría × perfil

Para calcular recorridos accesibles, cada problema afecta distinto según quién camina. El número es el factor por el que se multiplica el costo del tramo; ⛔ significa que para ese perfil el tramo queda **intransitable** y el recorrido lo evita.

| | Silla de ruedas | Bastón o andador | Coche de bebé | Baja visión |
|---|---|---|---|---|
| Pozo en la calzada | 3,0 | 2,0 | 2,0 | 2,5 |
| Vereda rota | ⛔ | 2,0 | 2,5 | 2,5 |
| Cordón sin rampa | ⛔ | 1,5 | ⛔ | 1,5 |
| Luminaria apagada | 1,2 | 1,5 | 1,2 | 3,0 |
| Obra que interrumpe el paso | ⛔ | ⛔ | ⛔ | ⛔ |

## Parámetros del sistema

### Verificación automática del reporte

El nivel de confianza va de 0 a 100. Un reporte que no llega al umbral queda pendiente de revisión: el sistema nunca lo desestima solo.

| Parámetro | Tipo | Valor | Para qué |
|---|---|---|---|
| `verificacion.confianza_base` | entero | 50 | Nivel con el que arranca todo reporte, antes de sumar las señales |
| `verificacion.umbral_verificado` | entero | 60 | Desde este nivel el reporte queda verificado |
| `verificacion.distancia_exif_max_m` | entero | 100 | Distancia máxima (m) entre la ubicación EXIF de la foto y el punto enviado para considerar que coinciden |
| `verificacion.valor_exif_coincide` | decimal | 20 | Suma si la ubicación EXIF coincide |
| `verificacion.valor_exif_no_coincide` | decimal | −30 | Resta si la ubicación EXIF queda más lejos que la distancia máxima |
| `verificacion.valor_exif_ausente` | decimal | −10 | Resta si una foto subida de la galería no trae ubicación EXIF |
| `verificacion.hamming_duplicado_max` | entero | 6 | Bits distintos, como máximo, entre dos hashes perceptuales para considerar que son la misma foto |
| `verificacion.valor_hash_duplicado` | decimal | −40 | Resta si la misma foto ya se usó en otro reporte |
| `verificacion.valor_origen_app` | decimal | 15 | Suma si la foto se sacó con la cámara de la app |
| `verificacion.valor_reputacion_max` | decimal | 20 | Lo máximo que la reputación del vecino suma o resta |
| `verificacion.dias_foto_antigua` | entero | 7 | Días entre la foto y el reporte a partir de los cuales la foto se considera antigua |
| `verificacion.valor_fecha_antigua` | decimal | −20 | Resta si la foto es antigua |

### Agrupación de reportes en incidentes

El puntaje de agrupación combina la cercanía, el tiempo transcurrido y el parecido entre las fotos.

| Parámetro | Tipo | Valor | Para qué |
|---|---|---|---|
| `agrupacion.radio_m` | entero | 30 | Distancia máxima (m) entre un reporte nuevo y un incidente candidato |
| `agrupacion.ventana_dias` | entero | 30 | Antigüedad máxima (días) del último reporte de un incidente candidato |
| `agrupacion.peso_distancia` | decimal | 0,5 | Peso de la cercanía |
| `agrupacion.peso_tiempo` | decimal | 0,2 | Peso del tiempo transcurrido |
| `agrupacion.peso_foto` | decimal | 0,3 | Peso del parecido entre las fotos |
| `agrupacion.umbral` | decimal | 0,5 | Puntaje mínimo para sumarse a un incidente; si ningún candidato lo alcanza, se crea uno nuevo |

### Prioridad del incidente

| Parámetro | Tipo | Valor | Para qué |
|---|---|---|---|
| `prioridad.peso_severidad` | decimal | 40 | Peso de la gravedad del incidente |
| `prioridad.peso_evidencias` | decimal | 25 | Peso de la cantidad de vecinos que lo informaron o confirmaron |
| `prioridad.tope_evidencias` | entero | 15 | Vecinos a partir de los cuales el factor de evidencias no crece más |
| `prioridad.peso_antiguedad` | decimal | 20 | Peso de los días que lleva sin resolverse |
| `prioridad.tope_antiguedad_dias` | entero | 60 | Días a partir de los cuales el factor de antigüedad no crece más |
| `prioridad.peso_contexto` | decimal | 15 | Peso de la cercanía a un punto de interés |
| `prioridad.radio_contexto_m` | entero | 150 | Distancia máxima (m) a un punto de interés para que sume prioridad |
| `prioridad.factor_escuela` | decimal | 1,0 | Cuánto del peso de contexto suma una escuela cercana |
| `prioridad.factor_centro_salud` | decimal | 1,0 | Ídem, un centro de salud |
| `prioridad.factor_parada` | decimal | 0,6 | Ídem, una parada de transporte |
| `prioridad.factor_edificio_publico` | decimal | 0,5 | Ídem, un edificio público |

### Cierre, vigencia y recorridos

| Parámetro | Tipo | Valor | Para qué |
|---|---|---|---|
| `cierre.distancia_max_m` | entero | 50 | Distancia máxima (m) entre la foto de cierre y el incidente |
| `vigencia.dias_default` | entero | 30 | Días de vigencia de un incidente temporal cuando su categoría no los define |
| `ruteo.radio_obstruccion_m` | entero | 15 | Distancia (m) alrededor de un incidente dentro de la cual los tramos quedan afectados |
| `ruteo.distancia_max_al_nodo_m` | entero | 100 | Distancia máxima (m) para acercar el origen o el destino al nodo más cercano de la red |
| `ruteo.velocidad_m_por_min` | decimal | 50 | Velocidad al caminar, para estimar el tiempo del recorrido |
