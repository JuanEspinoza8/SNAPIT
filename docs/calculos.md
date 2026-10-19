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

Se calcula al crear cada reporte (#50, `server/src/modulos/verificacion/calculo.ts`):

```math
\text{nivel} = \min\left(100,\ \max\left(0,\ \text{confianza\_base} + \sum \text{señales}\right)\right)
```

El nivel se redondea a entero. Desde `umbral_verificado` el reporte queda `VERIFICADO`; por debajo, `PENDIENTE_REVISION`. Cada señal se guarda en `senal_verificacion` con su valor y una explicación, para que el operador vea por qué quedó así.

| Señal | Cuándo | Valor |
|---|---|---|
| `EXIF_COINCIDE` | La foto trae ubicación y está a no más de `distancia_exif_max_m` del punto (justo en el límite cuenta) | +20 |
| `EXIF_COINCIDE` (negativa) | La foto trae ubicación pero está más lejos | −30 |
| `EXIF_AUSENTE` | Foto de galería sin ubicación. Una foto de la cámara de la app sin ubicación no resta: la app puede no grabarla | −10 |
| `HASH_DUPLICADO` | La foto está a no más de `hamming_duplicado_max` bits de una foto de otro reporte, también del mismo vecino. No se calcula si alguna de las dos tiene `hamming_duplicado_max` unos o menos (ver abajo) | −40 |
| `ORIGEN_APP` | La foto se sacó con la cámara de la app (`tomadaConCamaraApp`). Desde el sitio web ese dato no puede venir en `true`: responde 400 | +15 |
| `REPUTACION` | Siempre: `valor_reputacion_max × (reputación − 50) / 50`. Reputación 0 → −20, 50 → 0, 100 → +20 | −20 a +20 |
| `FECHA_ANTIGUA` | Entre la fecha EXIF de la foto y `registradoEn` pasaron más de `dias_foto_antigua` días | −20 |

**Ejemplos** (vecino con la reputación inicial, 50):

| Caso | Cuenta | Nivel | Estado |
|---|---|---|---|
| Foto con la cámara de la app, EXIF en el punto | 50 + 20 + 15 + 0 | 85 | Verificado |
| Foto de galería sin EXIF | 50 − 10 + 0 | 40 | Pendiente de revisión |
| Foto de galería sin EXIF, vecino con reputación 100 | 50 − 10 + 20 | 60 | Verificado |
| La misma foto de otro reporte, sin EXIF | 50 − 10 − 40 + 0 | 0 | Pendiente de revisión |

El sistema **nunca desestima** un reporte por sí solo, ni con nivel 0: desestimar es siempre una decisión de un operador (#51).

**Fotos lisas u oscuras.** Una foto lisa da un hash de 64 ceros, y una muy oscura casi (ver "Límites conocidos" del hash). Un hash con `hamming_duplicado_max` unos o menos está a esa distancia de cualquier foto lisa, así que no sirve para decir que dos fotos son la misma: si la foto nueva o la guardada lo tiene, `HASH_DUPLICADO` no se calcula. Una foto lisa reutilizada no se detecta, pero una foto lisa tampoco prueba nada. Las escenas nocturnas dibujadas para probarlo tienen entre 5 y 14 unos y quedan a 12–24 bits entre sí, lejos del 6: no se confunden, y la que tiene más de 6 unos se detecta si se repite.

**Límites que hay que asumir:**

- `tomadaConCamaraApp` lo declara la app. El servidor rechaza la combinación imposible (sitio web con cámara de la app), pero no puede comprobar que una petición que dice venir de la app la haya usado de verdad.
- La búsqueda de la foto repetida se hace antes de abrir la transacción del reporte. Dos envíos simultáneos de la misma foto no se ven entre sí y ninguno resta. Es la misma carrera que aceptaba el plan para la agrupación.

### Resultado de la verificación y reputación del vecino

Cuando un reporte queda **verificado** o **desestimado**, se aplica siempre lo mismo, lo haya decidido el sistema al recibirlo o un operador al revisarlo (#51, `server/src/modulos/verificacion/resultado.ts`). Todo va en la misma transacción que el cambio del reporte:

1. **Historial del vecino.** Un verificado suma a `reportes_confirmados` y un desestimado a `reportes_desestimados`. Con los contadores nuevos se recalcula la reputación:

   ```math
   	ext{reputación} = 100 	imes rac{	ext{confirmados} + 1}{	ext{confirmados} + 	ext{desestimados} + 2}
   ```

   Se guarda con dos decimales. Sin historial da **50**, la reputación inicial. Cada confirmado la acerca a 100 y cada desestimado a 0; el +1 y el +2 hacen que un solo reporte no la lleve a un extremo. La usa la señal `REPUTACION` de los reportes siguientes del vecino.

   | Confirmados | Desestimados | Reputación |
   |---|---|---|
   | 0 | 0 | 50 |
   | 1 | 0 | 66,67 |
   | 0 | 1 | 33,33 |
   | 3 | 1 | 66,67 |
   | 9 | 0 | 90,91 |

2. **Estado del incidente** (el principal, si se unió a otro). Solo cambia uno `REGISTRADO`:
   - pasa a `VERIFICADO` con su primer reporte verificado;
   - pasa a `DESESTIMADO` cuando no le queda ningún reporte sin desestimar, contando los de los incidentes unidos.

   Desestimar un reporte de un incidente que tiene otros reportes válidos no cambia su estado, pero sí recalcula su **severidad consolidada**, porque los desestimados no cuentan (ver la agrupación).
3. **Bitácora.** Un cambio de estado queda como `CAMBIO_ESTADO`, con el estado anterior y el nuevo. Una revisión del operador queda siempre, aunque el incidente no cambie: entonces como `COMENTARIO`. El texto dice qué reporte, quién lo decidió (el operador o "automáticamente", con su nivel de confianza) y el comentario del operador.
4. **Prioridad.** Se avisa al módulo de prioridad (#61) para que recalcule el incidente.

Un reporte **pendiente** no cuenta para la reputación hasta que un operador lo revisa (`POST /api/reportes/:id/revision`). Un reporte ya verificado o desestimado no se vuelve a revisar.

### Agrupación de reportes en incidentes

El puntaje de agrupación combina la cercanía, el tiempo transcurrido y el parecido entre las fotos.

| Parámetro | Tipo | Valor | Para qué |
|---|---|---|---|
| `agrupacion.radio_m` | entero | 30 | Distancia máxima (m) entre un reporte nuevo y un incidente candidato |
| `agrupacion.ventana_dias` | entero | 30 | Antigüedad máxima (días) del último reporte de un incidente candidato |
| `agrupacion.peso_distancia` | decimal | 0,5 | Peso de la cercanía |
| `agrupacion.peso_tiempo` | decimal | 0,2 | Peso del tiempo transcurrido |
| `agrupacion.peso_foto` | decimal | 0,3 | Peso del parecido entre las fotos |
| `agrupacion.umbral` | decimal | 0,5 | Puntaje que hay que superar para sumarse a un incidente; si ningún candidato lo supera, se crea uno nuevo |
| `agrupacion.unos_minimos_hash` | entero | 16 | Unos mínimos del hash de una foto para compararla; con menos (una foto lisa u oscura), no suma parecido |

Cada reporte nuevo se suma al incidente que más se le parece, o abre uno nuevo (#53, `server/src/modulos/agrupacion/calculo.ts`).

**Candidatos:** incidentes de la **misma categoría**, a no más de `radio_m` metros, no resueltos ni desestimados, no caducados ni vencidos, no unidos a otro, y con algún reporte válido que llegó en los últimos `ventana_dias` días. "Reportes del incidente" son siempre los no desestimados del incidente y de los que se le unieron (`REPORTES_DEL_INCIDENTE`, en `incidentes/repositorio.ts`): de ahí salen el último reporte, la foto más parecida y la severidad consolidada.

**Puntaje** de cada candidato, de 0 a 1:

```math
\text{puntaje} = p_d \left(1 - \frac{d}{\text{radio}}\right) + p_t \left(1 - \frac{\Delta t}{\text{ventana}}\right) + p_f \cdot \text{similitud}
```

- `d`: distancia en metros entre el reporte y el incidente.
- `Δt`: días, en valor absoluto, entre la llegada del reporte nuevo al servidor y la del último reporte del incidente. Se mide con la llegada y no con `registradoEn`, que lo manda el celular: una fecha vieja no puede revivir un incidente que quedó fuera de la ventana.
- `similitud` = max(0, 1 − hamming/32), con `hamming` = bits distintos entre el hash perceptual de la foto nueva y el de la foto más parecida del incidente (#47). Sin hash, 0. Una foto con menos de `unos_minimos_hash` unos no se compara: dos escenas nocturnas distintas de prueba (8 unos cada una) quedan a 14 bits, que a 20 m darían 0,17 + 0,2 + 0,17 = 0,54 y se agruparían.

El reporte se suma al candidato de mayor puntaje si **supera** `umbral` (justo en el umbral no alcanza); ante un empate, al más cercano. Si ninguno lo supera, abre un incidente nuevo.

**Al sumarse**, en la misma transacción: se actualizan `reporte.incidente_id` y `cantidad_reportes`, se recalcula la **severidad consolidada** (la más declarada por los reportes del incidente; ante un empate, la más alta) y se avisa al módulo de prioridad (`incidentes/eventos.ts`).

| Caso (valores de partida) | Puntaje | Resultado |
|---|---|---|
| Mismo lugar, mismo día, otra foto | 0,5 + 0,2 + 0 = 0,7 | Se agrupa |
| A 20 m, mismo día, la misma foto | 0,17 + 0,2 + 0,3 = 0,67 | Se agrupa |
| A 20 m, mismo día, otra foto | 0,17 + 0,2 + 0 = 0,37 | Incidente nuevo |
| Mismo lugar, hace 25 días, otra foto | 0,5 + 0,03 + 0 = 0,53 | Se agrupa |
| A 30 m o más | — | No es candidato |

Dos reportes de la misma categoría que llegan a la vez se procesan de a uno (un bloqueo por categoría en la base): así el segundo ve el incidente que abrió el primero. Si algo falla en la transacción, incluido el recálculo de la prioridad, no queda nada: ni el reporte ni el cambio del incidente.

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

## Cálculos

### Datos de cada foto

Al recibir una foto (`server/src/compartido/analisisFoto.ts`) se guarda el archivo tal como llegó y se completan estas columnas de `fotografia`. Si alguno de estos datos no se puede leer, queda en null y la foto se acepta igual: solo se rechaza si no es un JPG o PNG.

| Columna | De dónde sale |
|---|---|
| `ancho`, `alto` | Encabezado de la imagen, sin girarla según el EXIF |
| `exif_latitud`, `exif_longitud` | GPS del EXIF, de grados, minutos y segundos a decimales (6 decimales, unos 10 cm). Sur y oeste son negativos. Si falta una de las dos o su hemisferio (N/S, E/O), o las dos son 0 (lo que graban algunos celulares sin señal), quedan las dos en null |
| `exif_tomada_en` | `DateTimeOriginal` del EXIF, con la zona de `OffsetTimeOriginal`. Si la cámara no grabó la zona, se toma la de Argentina (−03:00). Una fecha que no existe (un 31 de febrero) queda en null |
| `exif_marca`, `exif_modelo` | `Make` y `Model` del EXIF, recortados a 60 caracteres |
| `hash_perceptual` | dHash de 64 bits (abajo) |

### Hash perceptual

Una huella de la imagen que cambia poco si la foto se recomprime, se achica o se le ajusta el brillo, y mucho si es otra foto. Sirve para detectar fotos repetidas (verificación) y para medir el parecido entre fotos (agrupación). Es un **dHash** ("difference hash") de 64 bits, calculado en `server/src/compartido/hashPerceptual.ts`:

1. Se endereza la imagen según su orientación EXIF: la misma foto da el mismo hash aunque un celular la guarde acostada con la marca "girar 90°" y otro la guarde ya derecha.
2. Se pasa a escala de grises (las zonas transparentes de un PNG cuentan como blanco) y se reduce a **9 × 8 píxeles**, sin respetar la proporción.
3. En cada una de las 8 filas se compara cada píxel con el de su derecha: **1** si es más claro, **0** si no. Son 8 × 8 = 64 bits, que se leen de arriba hacia abajo y de izquierda a derecha.

Una foto incompleta (cortada al subirla, o a propósito) se decodifica con lo que llegó. Si quedara sin hash, alcanzaría con cortarle los últimos bytes a una foto ya usada para que no se detecte como repetida.

**Distancia entre dos fotos:** la distancia de Hamming, es decir cuántos de los 64 bits son distintos. 0 es la misma imagen; dos fotos sin relación quedan cerca de 32.

- En TypeScript: `distanciaHamming(a, b)`.
- En SQL: `bit_count(a # b)`, donde `#` es el XOR entre las dos cadenas de bits (`distanciaHammingSql`). Sirve para buscar parecidas en la base sin traer todas las fotos.

**Ejemplo con las fotos de prueba** (`server/test/fotos`):

| Comparación | Distancia |
|---|---|
| La misma foto recomprimida en JPEG al 30 % de calidad | 0–1 |
| La misma foto achicada a la mitad | 0–1 |
| La misma foto pasada a PNG | 1 |
| La misma foto acostada con la marca "girar 90°" | 0–1 |
| La misma foto sin los 2 bytes del final | 0 |
| Una calle con un pozo contra una vereda rota | 36 |

Con `verificacion.hamming_duplicado_max` = 6 queda margen de sobra para la misma foto. La agrupación usa `similitud = max(0, 1 − distancia / 32)`.

**Límites conocidos.** El dHash solo mira si la luz sube o baja de izquierda a derecha:

- En una foto con grandes zonas lisas (un cielo parejo, asfalto sin textura) dos zonas vecinas pueden quedar casi iguales, y entonces una recompresión puede dar vuelta esos bits. En las fotos reales casi no pasa (la luz y la perspectiva nunca son parejas), pero conviene revisar las distancias con las fotos de la prueba piloto antes de ajustar `hamming_duplicado_max`.
- Al revés, dos fotos lisas u oscuras distintas pueden parecer la misma. Una imagen lisa da 64 ceros, sea negra, gris o blanca. En escenas nocturnas dibujadas para probarlo (fondo casi negro con una luz chica en distintos lugares), dos escenas distintas quedaron a 8–11 bits, cerca del umbral de 6. Pasa con «Luminaria apagada», que se fotografía de noche. Qué se hace con un hash de pocos unos está en «Verificación automática del reporte» (`hamming_duplicado_max`) y en «Agrupación de reportes en incidentes» (`unos_minimos_hash`).
