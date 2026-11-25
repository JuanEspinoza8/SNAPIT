# Cálculos y parámetros

Valores iniciales que carga la semilla (`npm run semilla`, en `server/`). Se guardan en la base (`parametro_sistema`, `categoria`, `categoria_perfil`), así que se pueden ajustar sin tocar código.

El administrador los ajusta desde la administración (`PUT /api/admin/parametros`, #167). La semilla solo agrega los que faltan: una vez cargado, un valor no vuelve al de esta página aunque se corra de nuevo.

Si cambiás un valor en `server/src/semilla/datos.ts`, actualizalo también acá.

> **Valores de partida (05/10/2026).** No salen de mediciones: se revisan con los datos de la prueba piloto. Las fórmulas que usan estos parámetros se documentan acá con la issue de cada cálculo (verificación, reputación, agrupación, prioridad, cierre, vigencia y recorridos).

## Catálogo

**Organismo:** Municipalidad de Neuquén, con las áreas **Bacheo**, **Veredas**, **Alumbrado**, **Obras**, **Arbolado**, **Desagües**, **Higiene urbana**, **Tránsito** y **Atención general** (lo que no encaja en otra: el operador lo reclasifica).

### Categorías

| Categoría | Área | Vigencia | Caduca a los | Peso de severidad |
|---|---|---|---|---|
| Pozo en la calzada | Bacheo | Permanente | — | 1,50 |
| Vereda rota | Veredas | Permanente | — | 1,30 |
| Cordón sin rampa | Veredas | Permanente | — | 1,40 |
| Luminaria apagada | Alumbrado | Permanente | — | 1,00 |
| Obra que interrumpe el paso | Obras | Temporal | 30 días | 1,20 |
| Tapa de cámara o alcantarilla | Bacheo | Permanente | — | 1,80 |
| Desnivel o escalón en la vereda | Veredas | Permanente | — | 1,30 |
| Obstáculo en la vereda | Veredas | Temporal | 3 días | 1,10 |
| Poste dañado o cables colgando | Alumbrado | Permanente | — | 1,80 |
| Árbol o rama caída | Arbolado | Temporal | 7 días | 1,70 |
| Rama baja sobre la vereda | Arbolado | Permanente | — | 1,20 |
| Raíces que levantan la vereda | Arbolado | Permanente | — | 1,30 |
| Desagüe tapado o calle anegada | Desagües | Temporal | 7 días | 1,30 |
| Pérdida de agua | Desagües | Temporal | 15 días | 1,10 |
| Basura o escombros | Higiene urbana | Temporal | 7 días | 1,00 |
| Semáforo que no funciona | Tránsito | Temporal | 7 días | 1,60 |
| Señal de tránsito caída o faltante | Tránsito | Permanente | — | 1,10 |
| Senda peatonal despintada | Tránsito | Permanente | — | 1,00 |
| Otro problema en la vía pública | Atención general | Permanente | — | 1,00 |

- **Vigencia temporal:** el incidente vence `dias_caducidad_default` días después de creado o de que el operador le cambió la categoría (si la categoría no los define, `vigencia.dias_default`; si ese parámetro falta o no es un entero positivo, 30 días y un aviso en el log). Cuando un vecino confirma que el problema sigue, la vigencia se renueva: `vigente_hasta = max(vigente_hasta, ahora + días)`, con los mismos días. Confirmar nunca la acorta (cambiar la categoría sí puede: la vigencia nueva cuenta desde el cambio), y un permanente no cambia (#154, `vigenciaRenovada` en `server/src/modulos/incidentes/calculo.ts`). Uno resuelto, desestimado, caducado o vencido no se puede confirmar: un temporal vencido no revive.
- **Caducidad** (#155, `server/src/tareas/caducidadDiaria.ts`): todos los días a las 03:00 de Argentina, y al arrancar el servidor, se marca `caducado_en` en los temporales vencidos que no están resueltos, desestimados ni unidos a otro (`POR_CADUCAR` en `server/src/modulos/incidentes/repositorio.ts`). Un permanente nunca caduca.
  - `caducado_en` es la fecha en que venció (`vigente_hasta`), no la de la tarea. Queda un movimiento `COMENTARIO` del sistema en la bitácora («Caducó: venció su vigencia.»). El estado no cambia, no se recalcula la prioridad y no se avisa al vecino.
  - Desde que vence, el mapa, el feed, la bandeja, la agrupación, la prioridad y los recorridos ya lo dejan afuera, aunque la tarea todavía no lo haya marcado (`INCIDENTE_VISIBLE`).
  - Cada incidente va en su propia transacción, y el `UPDATE` vuelve a mirar el criterio: correrla dos veces, o dos a la vez, no duplica el movimiento. Si uno falla, se deja el error en el log con su id y se sigue con los demás.
  - Para correrla a mano: `npm run tarea:caducidad` desde `server/`, o `docker compose exec server node dist/tareas/caducarVencidos.js` en Docker. Termina con código 1 si algún incidente falló.
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
| Tapa de cámara o alcantarilla | ⛔ | ⛔ | ⛔ | ⛔ |
| Desnivel o escalón en la vereda | ⛔ | 2,0 | 2,0 | 2,0 |
| Obstáculo en la vereda | ⛔ | 1,8 | ⛔ | 2,5 |
| Poste dañado o cables colgando | 1,5 | 1,5 | 1,5 | 2,5 |
| Árbol o rama caída | ⛔ | ⛔ | ⛔ | ⛔ |
| Rama baja sobre la vereda | 1,3 | 1,5 | 1,3 | 3,0 |
| Raíces que levantan la vereda | ⛔ | 2,0 | 2,5 | 2,5 |
| Desagüe tapado o calle anegada | 2,5 | 2,0 | 2,0 | 2,0 |
| Pérdida de agua | 1,5 | 1,5 | 1,3 | 1,5 |
| Basura o escombros | 2,0 | 1,5 | 1,8 | 2,0 |
| Semáforo que no funciona | 2,0 | 2,5 | 1,5 | 3,0 |
| Señal de tránsito caída o faltante | 1,2 | 1,2 | 1,2 | 1,5 |
| Senda peatonal despintada | 1,2 | 1,3 | 1,2 | 2,0 |
| Otro problema en la vía pública | 1,2 | 1,2 | 1,2 | 1,2 |

## Parámetros del sistema

### Controles automáticos del reporte

Al recibir cada reporte se hacen tres controles sobre su foto (F04, `server/src/modulos/verificacion/calculo.ts`). **No deciden si el reporte se publica:** todo reporte llega `PENDIENTE_REVISION` y lo publica la verificación con IA (ver "Cola de verificación con IA") o un operador. Los controles son los datos con los que deciden.

| Parámetro | Tipo | Valor | Para qué |
|---|---|---|---|
| `verificacion.distancia_exif_max_m` | entero | 100 | Distancia máxima (m) entre la ubicación EXIF de la foto y el punto enviado para considerar que la foto se sacó en el lugar |
| `verificacion.hamming_duplicado_max` | entero | 6 | Bits distintos, como máximo, entre dos hashes perceptuales para considerar que son la misma foto |
| `verificacion.dias_foto_antigua` | entero | 7 | Días entre la foto y el reporte a partir de los cuales la foto se considera vieja |

Cada control queda en `senal_verificacion` como una señal, con una explicación para el operador. El valor dice cómo salió: **1** si se cumple, **−1** si no y **0** si la foto no trae con qué hacerlo.

| Control | Señal | 1 | −1 | 0 |
|---|---|---|---|---|
| Ubicación | `EXIF_COINCIDE` o `EXIF_AUSENTE` | La ubicación EXIF está a no más de `distancia_exif_max_m` del punto (justo en el límite cuenta) | Está más lejos (`EXIF_COINCIDE` negativa) | La foto no trae ubicación (`EXIF_AUSENTE`) |
| Antigüedad | `FECHA_ANTIGUA` | Entre la fecha EXIF y `registradoEn` pasaron hasta `dias_foto_antigua` días | Pasaron más | La foto no trae fecha |
| Foto repetida | `HASH_DUPLICADO` | No hay otra foto a no más de `hamming_duplicado_max` bits | La misma foto ya se usó en otro reporte, también del mismo vecino | La foto es lisa u oscura y no se puede comparar (ver abajo) |

El **nivel de confianza** (`nivel_confianza`) es el porcentaje de controles que se cumplen, redondeado: 100, 67, 33 o 0. Es un resumen para el operador; no decide nada.

| Caso | Ubicación | Antigüedad | Repetida | Nivel |
|---|---|---|---|---|
| Foto con GPS en el punto, del mismo día | 1 | 1 | 1 | 100 |
| Foto sin EXIF (por ejemplo, reenviada por WhatsApp) | 0 | 0 | 1 | 33 |
| Foto con GPS lejos del punto, vieja y repetida | −1 | −1 | −1 | 0 |

**Solo la ubicación prueba algo:** que la foto se sacó en el lugar. La antigüedad y la foto repetida sirven para descartar. Por eso la IA publica sola únicamente si la ubicación coincide y no hay ningún control en contra, o si la foto no trae ubicación pero muestra el mismo problema que un reporte ya verificado del incidente (corroborado, fila 7 de la tabla de decisión).

La reputación del vecino y si la foto se sacó con la cámara de la app ya no cuentan: los tipos `ORIGEN_APP` y `REPUTACION` siguen en el enum `tipo_senal` (modelo congelado), pero no se generan más. La reputación se sigue calculando (ver abajo) y el operador la ve al revisar. Los parámetros del puntaje anterior (`confianza_base`, `umbral_verificado` y los `valor_*`) y `demo.revision_manual` ya no existen: la semilla los borra.

**Fotos lisas u oscuras.** Una foto lisa da un hash de 64 ceros, y una muy oscura casi (ver "Límites conocidos" del hash). Un hash con `hamming_duplicado_max` unos o menos está a esa distancia de cualquier foto lisa, así que no sirve para decir que dos fotos son la misma: si la foto nueva lo tiene, `HASH_DUPLICADO` queda en 0, y una guardada así no se usa para comparar. Una foto lisa reutilizada no se detecta, pero una foto lisa tampoco prueba nada. Las escenas nocturnas dibujadas para probarlo tienen entre 5 y 14 unos y quedan a 12–24 bits entre sí, lejos del 6: no se confunden, y la que tiene más de 6 unos se detecta si se repite.

**Límites que hay que asumir:**

- El EXIF lo puede editar quien sube la foto: la ubicación y la fecha prueban algo, no todo.
- `tomadaConCamaraApp` se sigue guardando y el servidor rechaza la combinación imposible (sitio web con cámara de la app), pero ya no cuenta para la verificación.
- La búsqueda de la foto repetida se hace antes de abrir la transacción del reporte. Dos envíos simultáneos de la misma foto no se ven entre sí y los dos quedan como nuevos. Es la misma carrera que aceptaba el plan para la agrupación.

### Resultado de la verificación y reputación del vecino

Cuando un reporte queda **verificado** o **desestimado**, se aplica siempre lo mismo, lo haya decidido la IA o un operador (#51, `server/src/modulos/verificacion/resultado.ts`). Todo va en la misma transacción que el cambio del reporte:

1. **Historial del vecino.** Un verificado suma a `reportes_confirmados` y un desestimado a `reportes_desestimados`. Con los contadores nuevos se recalcula la reputación:

   ```math
   \text{reputación} = 100 \times \frac{\text{confirmados} + 1}{\text{confirmados} + \text{desestimados} + 2}
   ```

   Se guarda con dos decimales. Sin historial da **50**, la reputación inicial. Cada confirmado la acerca a 100 y cada desestimado a 0; el +1 y el +2 hacen que un solo reporte no la lleve a un extremo. El operador la ve al revisar sus reportes.

   | Confirmados | Desestimados | Reputación |
   |---|---|---|
   | 0 | 0 | 50 |
   | 1 | 0 | 66,67 |
   | 0 | 1 | 33,33 |
   | 3 | 1 | 66,67 |
   | 9 | 0 | 90,91 |

2. **Estado del incidente** (el principal, si se unió a otro). Sale de sus reportes, contando los de los incidentes unidos, con la regla de "Estado del incidente según sus reportes" (más abajo):
   - pasa de `REGISTRADO` a `VERIFICADO` con su primer reporte verificado;
   - pasa a `DESESTIMADO` cuando no le queda ningún reporte sin desestimar.

   Desestimar un reporte de un incidente que tiene otros reportes válidos no cambia su estado, pero sí recalcula su **severidad consolidada**, porque los desestimados no cuentan (ver la agrupación).

   **Cantidad de reportes.** `cantidad_reportes` cuenta solo los reportes no desestimados, propios y de los unidos (decisión del 21/10). Un desestimado se resta del incidente del reporte y, si se unió a otro, también del principal.
3. **Bitácora.** Un cambio de estado queda como `CAMBIO_ESTADO`, con el estado anterior y el nuevo. Una revisión del operador queda siempre, aunque el incidente no cambie: entonces como `COMENTARIO`. El texto dice qué reporte, quién lo decidió (el operador o la IA) y el comentario del operador.
4. **Prioridad.** Se avisa al módulo de prioridad (#61) para que recalcule el incidente.
5. **Agradecimiento.** Si quedó verificado, SnapIt comenta en el reporte «¡Gracias por tu reporte! Ya está publicado. Le corresponde al área de X.», con el área que le corresponde: la del incidente si un operador lo derivó, o la de su categoría. Sale siempre que un reporte se publica, lo haya decidido la IA o un operador. El área es solo informativa: el incidente no cambia de estado ni de área (derivar es el `DERIVACION` del operador), por eso el texto no dice que se derivó. El autor es el usuario de SnapIt (`sistema@snapit.invalid`, `server/src/compartido/usuarioSistema.ts`), que crea la semilla también en producción y con el que nadie puede iniciar sesión: su clave es aleatoria. Si todavía no existe, el reporte se publica igual, sin el comentario.

Un reporte **pendiente** no cuenta para la reputación hasta que lo publica la IA o lo revisa un operador (`POST /api/reportes/:id/revision`). Un reporte ya verificado o desestimado no se vuelve a revisar.

**Incidente cerrado.** Si el incidente que manda está `RESUELTO` o `DESESTIMADO`, sus pendientes ya no se revisan: no aparecen en `GET /api/reportes/pendientes`, no entran en la cola de la IA y revisarlos da 409 `INCIDENTE_CERRADO`. Siguen `PENDIENTE_REVISION`: desestimar el incidente no toca sus reportes ni la reputación (decisión del 22/10), y revisarlos después tampoco. El vecino ve el estado del incidente en "Mis reportes".

**Revisar mientras se une.** Antes de aplicar el resultado se bloquean el incidente del reporte y el que manda. Si mientras se esperaba el bloqueo terminó una unión, el que manda cambió: por eso, después de bloquear, se vuelve a leer y se bloquea el nuevo, hasta que no cambie. Así el resultado siempre se aplica sobre el principal vigente.

### Cola de verificación con IA

Todo reporte llega pendiente (ver "Controles automáticos del reporte"). El operador procesa los pendientes de su organismo con la IA cuando aprieta "Procesar con IA" (`POST /api/ia/procesar-cola`, `server/src/modulos/ia/cola.ts`), de a uno por vez.

**1. La IA mira la foto** (`server/src/modulos/ia/verificarFoto.ts`). Si el reporte se sumó a un incidente que ya tiene un reporte verificado, se le manda también la foto de ese reporte como referencia. No se le dice qué eligió el vecino, para que no se deje llevar. Responde:

| Campo | Qué dice |
|---|---|
| `esProblemaViaPublica` | Si la foto muestra un problema en el espacio público. `false` para una mascota, una persona posando, un interior, una captura de pantalla, un meme o algo sin relación con la calle |
| `categoriaId`, `severidad` | Qué problema ve y qué tan grave es, con la misma lista y el mismo criterio que la sugerencia al vecino (F06). `null` si no es un problema de la vía pública |
| `mismoProblema` | Si la foto muestra el mismo problema que la de referencia. `null` si no había referencia |
| `datosPersonales` | Si se ve una cara reconocible o una patente legible |
| `explicacion` | Una o dos oraciones para el operador |

Sin referencia se pide esfuerzo `low`; con referencia, `medium`, porque comparar dos fotos es más difícil. La respuesta se valida al recibirla: una categoría que no está en la lista, o un problema sin categoría, cuenta como una respuesta inválida y queda como `ERROR`.

**2. Se decide** con lo que dijo la IA y los controles automáticos (`decidirVerificacion`, en `server/src/modulos/verificacion/calculo.ts`). La IA dice qué muestra la foto; dónde se sacó lo dicen los controles. Se mira en este orden y vale lo primero que se cumple:

| # | Situación | Resultado |
|---|---|---|
| 1 | La foto no muestra un problema de la vía pública | **Desestimar sugerido**: queda en los desestimados pendientes, para que un operador lo confirme |
| 2 | La IA ve otra categoría u otra gravedad que la que eligió el vecino | Revisión manual |
| 3 | Se ve una cara o una patente | Revisión manual, para revisar la foto antes de publicarla |
| 4 | La foto ya se usó en otro reporte, o es vieja | Revisión manual |
| 5 | La foto se sacó lejos del punto | Revisión manual |
| 6 | La foto se sacó en el punto | **Publicado** |
| 7 | La foto no trae ubicación, pero es el mismo problema que el reporte verificado del incidente | **Publicado** (corroborado) |
| 8 | La foto no trae ubicación y no hay referencia, o no es el mismo problema | Revisión manual |

**La IA nunca desestima.** Un "desestimar sugerido" sigue `PENDIENTE_REVISION`: no toca la reputación del vecino, no le avisa nada y no cambia el incidente hasta que un operador lo confirma. Se reconoce porque su último paso en el log es `REVISION_MANUAL` y la respuesta de la IA que lleva dice `esProblemaViaPublica: false`. Así no hace falta ningún estado nuevo en el modelo.

Esos reportes forman los **desestimados pendientes** (`GET /api/reportes/desestimados-pendientes`, `MARCADO_PARA_DESESTIMAR` en `server/src/modulos/incidentes/repositorio.ts`). Salen de la lista de pendientes comunes y, mientras esperan, **no se ven en público**: su foto no se sirve sin sesión, no aparecen en la ficha, el feed ni lo social, y su incidente desaparece del mapa si todos sus reportes válidos están marcados (uno sin reportes sí se ve). El operador rescata uno verificándolo, o los confirma todos juntos (`POST /api/reportes/desestimados-pendientes/confirmacion`), que los desestima como una revisión.

**Límite conocido:** para saber si un reporte está marcado se busca su último paso en `evento_verificacion_ia`, que no tiene índice por `reporte_id`. Con pocos procesamientos no se nota; si el log crece mucho, conviene agregar ese índice (es un cambio del modelo: se acuerda con el grupo).

**Publicado** queda `VERIFICADO` con el mismo resultado que una aprobación manual (reputación, incidente, bitácora y prioridad), y en la bitácora figura que lo publicó la IA y cómo se probó el lugar: la ubicación de la foto o el reporte verificado que la corrobora.

**3. Qué entra a la cola.** Los pendientes del organismo en incidentes abiertos que **la IA todavía no miró**: un reporte con un paso `CLASIFICADO` no vuelve a entrar, porque lo que queda es de una persona y volver a consultar costaría lo mismo para la misma respuesta. Si la consulta falló (`ERROR`), sí vuelve a entrar en el próximo procesamiento.

La lista se toma al arrancar. Antes de consultar cada reporte se mira si sigue pendiente y si su incidente sigue abierto. Si no, queda `REVISION_MANUAL` sin consultar a la IA, así que no gasta tokens. En el resumen cuenta en `derivados`, como el que un operador revisó mientras la IA lo procesaba: lo decidió una persona. Si la IA falla o un operador lo revisó mientras tanto, queda como está: la IA nunca pisa una decisión de una persona.

**Resumen** de cada procesamiento: `publicados`, `derivados` (revisión manual), `desestimados` (desestimar sugerido) y `errores`, además del tiempo medio y el costo. Si el vecino había aceptado la sugerencia de la IA al cargar el reporte (F06), el log lo aclara y el resumen cuenta aparte los publicados así (`publicadosConSugerencia`).

Cada paso queda en `evento_verificacion_ia`, con los tokens que usó la consulta. Con el precio del modelo (`server/src/modulos/ia/costos.ts`) da el costo de cada procesamiento.

**Límite del costo:** solo suman las consultas que salieron bien. Una respuesta que no es JSON, que se cortó por largo o que no tiene la forma pedida gastó tokens igual, pero queda como `ERROR` sin el uso, así que el costo real puede ser algo mayor.

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

**Reportes eliminados por su autor** (`reporte.eliminado_en`, `DELETE /api/reportes/:id`, #150): para el cálculo cuentan **como un desestimado**. Se restan de `cantidad_reportes` (del incidente y del principal, si se unió a otro), dejan de pesar en la severidad consolidada y en el estado del incidente (`estadoSegunReportes`), y se recalcula la prioridad. Para **agrupar siguen contando**, como antes: un reporte nuevo en el mismo lugar se suma a ese incidente. La **reputación no cambia**: eliminar no es un error del vecino. Un pendiente eliminado sale de la revisión y de la cola de la IA. No se muestran en ningún lado (ficha, feed, lo social, Mis reportes y la foto sin sesión). No se puede eliminar el único reporte visible de un incidente (sin contar sus unidos): quedaría vacío. Un reporte marcado para desestimar no cuenta como visible. Si igual queda sin nada que mostrar (se eliminó uno y después la IA marcó el que quedaba), el incidente deja de verse en el mapa. Uno ya desestimado se puede eliminar, pero no cambia nada del cálculo. Una confirmación de «Sigue estando» de quien eliminó su reporte suma evidencia, como la de cualquier otro vecino.

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

**Límite conocido: «Otro problema en la vía pública».** La agrupación da por hecho que la misma categoría es el mismo tipo de problema, y en la de último recurso no lo es. Dos problemas distintos de esa categoría, cerca y con pocos días de diferencia, se agrupan aunque las fotos no se parezcan: a 5 m y con un día, 0,42 + 0,19 + 0 = 0,61. El operador saca el reporte a un incidente nuevo (separar, #55).

Dos reportes de la misma categoría que llegan a la vez se procesan de a uno (un bloqueo por categoría en la base): así el segundo ve el incidente que abrió el primero. Si algo falla en la transacción, incluido el recálculo de la prioridad, no queda nada: ni el reporte ni el cambio del incidente. Unir, deshacer una unión y separar un reporte toman el mismo bloqueo.

### Estado del incidente según sus reportes

Una sola regla decide el estado de un incidente `REGISTRADO` o `VERIFICADO` a partir de sus reportes válidos (no desestimados, propios y de los unidos), en `estadoSegunReportes` (`agrupacion/calculo.ts`, decisión del 21/10):

| Reportes válidos | Verificados | Estado |
|---|---|---|
| Ninguno | — | `DESESTIMADO` |
| Alguno | Ninguno | `REGISTRADO` («En revisión» en el mapa) |
| Alguno | Alguno | `VERIFICADO` |

Desde `DERIVADO` el estado no cambia por los reportes: el organismo ya lo está trabajando. La excepción es que no le quede ningún reporte válido (se quitaron o desestimaron todos): entonces pasa a `DESESTIMADO`. `EN_EJECUCION` lo maneja el operador; `RESUELTO` y `DESESTIMADO` son finales.

**Derivación automática.** Cuando un reporte se verifica (lo apruebe un operador, la IA al procesar la cola o el sistema al recibirlo) y el incidente queda `VERIFICADO`, en la misma transacción se deriva al área de su categoría: pasa a `DERIVADO` con esa área. En la bitácora quedan dos movimientos, el `CAMBIO_ESTADO` a `VERIFICADO` y la `DERIVACION`, y los vecinos reciben un solo aviso, con el estado final. Si el área de la categoría está dada de baja, el incidente queda `VERIFICADO` y lo deriva el operador. Separar o deshacer una unión no deriva: el incidente que queda `VERIFICADO` lo deriva el operador desde la bandeja.

El comentario de SnapIt en el reporte verificado dice qué pasó: «se derivó al área de X», «lo está atendiendo el área de X» (si el incidente ya estaba derivado o en ejecución) o «le corresponde al área de X» (si no se pudo derivar).

Se aplica:
- **Al verificar o desestimar un reporte** (arriba).
- **Al deshacer una unión**, a los dos incidentes. Mientras estuvieron unidos, los reportes del duplicado se revisaron sobre el principal; al separarlos, cada uno toma el estado de sus propios reportes. Por ejemplo, si se desestimó el único reporte del duplicado, vuelve como `DESESTIMADO`; si el principal estaba `VERIFICADO` solo por un reporte del duplicado, vuelve a `REGISTRADO`. Lo mismo con la **severidad**: el duplicado vuelve con la que dicen sus reportes no desestimados. Si tenía uno GRAVE y uno LEVE (GRAVE por el empate) y se desestimó el GRAVE mientras estaba unido, vuelve LEVE.
- **Al separar un reporte**, al original y al nuevo. El nuevo nace `REGISTRADO` y pasa a `VERIFICADO` si el reporte estaba verificado; el original vuelve a `REGISTRADO` si se le fue el único verificado.

Cada cambio queda en la bitácora como `CAMBIO_ESTADO` del sistema (sin usuario).

**Unir.** No se une un duplicado más avanzado que el principal (`REGISTRADO` < `VERIFICADO` < `DERIVADO` < `EN_EJECUCION`): el principal no cambia de estado al unir, así que el problema saldría de la bandeja. Hay que unir al revés.

**Límite: el ajuste manual del duplicado.** Unir no toca la `prioridad_manual` del duplicado: mientras está unido no se ve, porque no está en la bandeja, pero al deshacer la unión vuelve con el ajuste que tenía.

**Separar.** No se separa el único reporte propio no desestimado de un incidente (los de los unidos no cuentan: al deshacer la unión se van). El nuevo toma la vigencia de su categoría desde que llegó el reporte. Si el original estaba en el punto del reporte separado (el que lo creó), pasa al punto y la dirección del reporte válido propio que llegó primero.

### Transiciones de estado del incidente

Qué cambios de estado se permiten y por qué vía, según el diagrama de estados del plan. Lo decide `transicionValida(desde, hacia, via)` (`server/src/modulos/incidentes/calculo.ts`, #65), una función pura que no mira la base. La vía es quién hace el cambio:

- **operador:** una acción sobre el incidente (derivar, pasar a ejecución, desestimar).
- **reportes:** la regla de estado según los reportes (arriba), al revisar un reporte, unir, deshacer una unión o separar.
- **cierre:** el cierre con la foto del después (corte 75 %).

| Desde | Hacia | Vía | Cuándo |
|---|---|---|---|
| `REGISTRADO` | `VERIFICADO` | reportes | Se verifica su primer reporte |
| `VERIFICADO` | `REGISTRADO` | reportes | Se le separa o se le desune el único reporte verificado |
| `REGISTRADO` o `VERIFICADO` | `DESESTIMADO` | reportes | Ya no le queda ningún reporte sin desestimar |
| `REGISTRADO` o `VERIFICADO` | `DESESTIMADO` | operador | Lo desestima con un motivo |
| `VERIFICADO` | `DERIVADO` | reportes | Se verifica un reporte: se deriva al área de su categoría |
| `VERIFICADO` | `DERIVADO` | operador | Lo deriva a un área |
| `DERIVADO` | `DERIVADO` | operador | Lo re-deriva a otra área |
| `DERIVADO` | `EN_EJECUCION` | operador | Registra que empezó el trabajo |
| `DERIVADO` | `DESESTIMADO` | reportes | Ya no le queda ningún reporte sin desestimar |
| `DERIVADO` o `EN_EJECUCION` | `DESESTIMADO` | operador | Lo desestima con un motivo |
| `EN_EJECUCION` | `RESUELTO` | cierre | El cierre da `VALIDADO`, o se confirma uno `OBSERVADO` |

Cualquier otra combinación es inválida. En particular:
- `RESUELTO` y `DESESTIMADO` no salen de su estado.
- A `RESUELTO` solo se llega por el cierre.
- El operador no verifica ni vuelve a `REGISTRADO` un incidente a mano: eso sale de sus reportes.
- Para pasar a `EN_EJECUCION` primero hay que derivar, y desde `EN_EJECUCION` ya no se deriva.

Además de la transición, el operador no trabaja un incidente unido a otro (se trabaja el principal) ni uno caducado. Desestimar un incidente no cambia sus reportes ni la reputación de los vecinos: reporte e incidente son cosas distintas. Cada cambio deja un movimiento en la bitácora y avisa a la prioridad (`avisarCambioIncidente`).

**Cambiar la categoría** (#66) no es un cambio de estado. Queda como un `COMENTARIO` («Categoría cambiada de X a Y»), porque no hay un tipo de movimiento propio, y recalcula la prioridad: el peso de la categoría entra en la severidad. Si el incidente todavía no se derivó, pasa al área de la categoría nueva. La categoría de cada reporte, la que eligió el vecino, no cambia. Desde el cambio, los reportes nuevos de la categoría nueva se pueden sumar al incidente y los de la vieja no.

La vigencia también sigue a la categoría nueva, contada desde el cambio: si es temporal, el incidente vence a los días de la nueva (aunque antes venciera en otra fecha); si es permanente, deja de vencer. Así, un incidente reclasificado no desaparece en la fecha que le correspondía a la categoría equivocada.

### Prioridad del incidente

| Parámetro | Tipo | Valor | Para qué |
|---|---|---|---|
| `prioridad.peso_severidad` | decimal | 40 | Peso de la gravedad del incidente |
| `prioridad.peso_evidencias` | decimal | 25 | Peso de la cantidad de vecinos que lo informaron o confirmaron |
| `prioridad.tope_evidencias` | entero | 15 | Reportes y confirmaciones a partir de los cuales el factor de evidencias no crece más |
| `prioridad.peso_antiguedad` | decimal | 20 | Peso de los días que lleva sin resolverse |
| `prioridad.tope_antiguedad_dias` | entero | 60 | Días a partir de los cuales el factor de antigüedad no crece más |
| `prioridad.peso_contexto` | decimal | 15 | Peso de la cercanía a un punto de interés |
| `prioridad.radio_contexto_m` | entero | 150 | Distancia máxima (m) a un punto de interés para que sume prioridad |
| `prioridad.factor_escuela` | decimal | 1,0 | Cuánto del peso de contexto suma una escuela cercana |
| `prioridad.factor_centro_salud` | decimal | 1,0 | Ídem, un centro de salud |
| `prioridad.factor_parada` | decimal | 0,6 | Ídem, una parada de transporte |
| `prioridad.factor_edificio_publico` | decimal | 0,5 | Ídem, un edificio público |

Cada incidente tiene un **puntaje** que lo ordena en la bandeja y un **desglose** que explica de dónde sale, para justificar el orden ante el organismo (#61, `server/src/modulos/prioridad/calculo.ts`). El puntaje es la suma de cuatro factores:

```math
\text{puntaje} = \text{severidad} + \text{evidencias} + \text{antigüedad} + \text{contexto}
```

| Factor | Cuenta | De dónde sale cada dato |
|---|---|---|
| `SEVERIDAD` | `peso_severidad × nivel / 3 × peso de la categoría` | `nivel`: 1 si es leve, 2 si es moderada y 3 si es grave (la severidad consolidada del incidente). El peso de la categoría es `categoria.peso_severidad_base` |
| `EVIDENCIAS` | `peso_evidencias × min(1, ln(1 + n) / ln(1 + tope_evidencias))` | `n` = reportes no desestimados (`cantidad_reportes`, con los de los incidentes unidos) + vecinos distintos que lo confirmaron (también en los unidos) sin tener un reporte que ya cuenta |
| `ANTIGUEDAD` | `peso_antiguedad × min(1, días / tope_antiguedad_dias)` | `días`: días completos desde `primer_reporte_en` |
| `CONTEXTO_URBANO` | `peso_contexto × factor del punto` | El punto de interés a no más de `radio_contexto_m` con el mayor `factor_*` de su tipo; ante un empate, el más cercano. Sin ninguno, 0 |

- **Evidencias con logaritmo:** los primeros reportes y confirmaciones dicen mucho y los siguientes cada vez menos. Con un reporte suma un cuarto del peso (ln 2 / ln 16), con cinco casi dos tercios, y desde `tope_evidencias` el peso entero.
- **Cada vecino confirma una vez** (#154): la confirmación de quien ya tiene un reporte no desestimado en el incidente o en uno de sus unidos renueva la vigencia pero no suma evidencia, porque ese vecino ya cuenta por su reporte. Se mira en cada recálculo: si después le desestiman el reporte, pasa a contar su confirmación. Límite conocido: un vecino con dos reportes válidos en el mismo incidente suma 2, porque los reportes salen de `cantidad_reportes`.
- **Días completos:** 10 días y medio cuentan como 10. Así el número del texto coincide con la cuenta, y el valor cambia una vez por día.
- **Un solo punto de interés:** cuenta el más relevante, no la suma. Diez paradas juntas no valen más que una escuela. Para eso alcanza con buscar el más cercano de cada tipo (`ST_DWithin` sobre el índice GIST de `punto_interes`).

Cada factor guarda un texto que se entiende sin conocer la fórmula. Los números van con un decimal; en `factor_prioridad.valor` quedan con dos:

| Caso | Texto |
|---|---|
| Severidad | «Gravedad grave en Pozo en la calzada, una categoría que pesa ×1,5: +60» |
| Evidencias | «Lo reportaron 3 veces y lo confirmaron 2 vecinos: +16,2» |
| Evidencias en el tope | «Lo reportaron 12 veces y lo confirmaron 3 vecinos (con 15 o más ya suma el máximo): +25» |
| Antigüedad | «Lleva 10 días sin resolverse: +3,3» |
| Antigüedad del primer día | «Lleva menos de un día sin resolverse: +0» |
| Antigüedad en el tope | «Lleva 75 días sin resolverse (con 60 o más ya suma el máximo): +20» |
| Punto de interés | «A 80 m de Escuela N° 123 (escuela): +15» |
| Parada con su código | «A 40 m de N-2935 (parada de colectivo): +9» |
| Lugar sin nombre en OSM | «A 100 m de un edificio público: +7,5» |
| Sin puntos cerca | «Sin escuelas, centros de salud, paradas ni edificios públicos a menos de 150 m: +0» |
| Ajuste manual | «Ajuste manual de Juan Pérez (obra programada): −5,3» |

**Ejemplo completo**, con los valores de partida: un pozo en la calzada (peso 1,5) de gravedad grave, con 3 reportes válidos y 2 vecinos que lo confirmaron, que lleva 10 días, a 80 m de una escuela y a 20 m de una parada.

| Factor | Cuenta | Valor |
|---|---|---|
| Severidad | 40 × 3/3 × 1,5 | 60 |
| Evidencias | n = 3 + 2 = 5: 25 × ln 6 / ln 16 = 25 × 0,6462 | 16,16 |
| Antigüedad | 20 × 10/60 | 3,33 |
| Contexto urbano | La escuela (1,0) gana a la parada (0,6), aunque está más lejos: 15 × 1,0 | 15 |
| **Puntaje** | | **94,49** |

**Ajuste manual** (lo fija un operador, #62). Si el incidente tiene `prioridad_manual`, el desglose suma `AJUSTE_MANUAL` = `prioridad_manual − puntaje calculado`, con el motivo y quién lo fijó. `puntaje_prioridad` sigue guardando el calculado, y la bandeja ordena por `coalesce(prioridad_manual, puntaje_prioridad)` (`PRIORIDAD_EFECTIVA` en `prioridad/repositorio.ts`). Así, al quitar el ajuste, se vuelve al calculado sin tocar el puntaje. El valor va de 0 a 9999,99, el motivo es obligatorio y solo se ajustan incidentes en la bandeja (`VERIFICADO`, `DERIVADO` o `EN_EJECUCION`). Fijarlo y quitarlo dejan un movimiento `AJUSTE_PRIORIDAD` y recalculan el desglose.

**Máximo:** `puntaje_prioridad` y `factor_prioridad.valor` son `numeric(6,2)`, así que cada factor y el puntaje se recortan a 9999,99. Con los valores de partida el máximo es 40 × peso de la categoría + 60: 120 para un pozo, y 4059,6 con el peso más alto que admite `categoria.peso_severidad_base` (99,99). Solo se llega al tope con pesos fuera de escala, y entonces la suma del desglose puede pasar el puntaje.

**Cuándo se recalcula:** en la misma transacción que el cambio, cada vez que un reporte se suma al incidente, un reporte se verifica o se desestima, se une o se deshace una unión, se separa un reporte, un vecino confirma que sigue, y cuando el operador lo deriva, lo pasa a ejecución o le cambia la categoría (`alCambiarIncidente` en `incidentes/eventos.ts`). Se guarda `puntaje_prioridad` y se **reemplazan** las filas de `factor_prioridad` del incidente: es el único borrado del sistema, porque son datos derivados y la tabla no tiene fecha (decisión del 01/10). Si el recálculo falla, no queda nada del cambio. Un incidente resuelto o desestimado no se recalcula: su desglose queda como estaba al cerrarse.

**Recálculo diario** (#63, `server/src/tareas/prioridadDiaria.ts`): la antigüedad crece con los días aunque nadie toque el incidente, así que todos los días a las 03:00 de Argentina se recalculan los incidentes abiertos. Son los que no están resueltos ni desestimados, ni unidos a otro, ni caducados o vencidos: los demás no están en la bandeja, y un unido se recalcula solo si se deshace la unión. También corre al arrancar el servidor, por si estaba apagado a esa hora.

- Cada incidente va en su propia transacción y bloqueado (`FOR UPDATE`): si uno falla, se deja el error en el log con su id y se sigue con los demás. Sin el bloqueo, un reporte que se suma a la vez también reemplazaría el desglose, y podrían quedar las filas duplicadas.
- Un incidente que se cerró, se unió o caducó entre que se armó la lista y le tocó el turno se saltea.
- Al terminar deja en el log cuántos recalculó, cuántos salteó, cuántos fallaron y cuánto tardó.
- Como corre una vez por día, la antigüedad puede quedar hasta un día atrasada. Lo mismo pasa con un cambio de pesos en `parametro_sistema`, de peso de una categoría o de puntos de interés importados: se ve en todos los incidentes recién en el recálculo siguiente.
- Para correrlo a mano: `npm run tarea:prioridad` desde `server/`, o `docker compose exec server node dist/tareas/recalcularPrioridad.js` en Docker. Termina con código 1 si algún incidente falló.

**Límite conocido:** `primer_reporte_en` sale del `registradoEn` del primer reporte, que manda el celular sin límite hacia atrás, porque el modo sin conexión carga reportes de días anteriores. Un reporte con una fecha vieja lleva la antigüedad al máximo, como mucho +20.

### Cierre, vigencia y recorridos

| Parámetro | Tipo | Valor | Para qué |
|---|---|---|---|
| `cierre.distancia_max_m` | entero | 50 | Distancia máxima (m) entre la foto de cierre y el incidente |
| `vigencia.dias_default` | entero | 30 | Días de vigencia de un incidente temporal cuando su categoría no los define |
| `ruteo.radio_obstruccion_m` | entero | 15 | Distancia (m) alrededor de un incidente dentro de la cual los tramos quedan afectados |
| `ruteo.distancia_max_al_nodo_m` | entero | 100 | Distancia máxima (m) para acercar el origen o el destino al nodo más cercano de la red |
| `ruteo.velocidad_m_por_min` | decimal | 50 | Velocidad al caminar, para estimar el tiempo del recorrido |
| `ruteo.pendiente_max_porcentaje` | decimal | 8 | Pendiente (%) desde la que un tramo cuenta como empinado, subiendo o bajando |
| `ruteo.ancho_min_m` | decimal | 0,9 | Ancho (m) por debajo del cual un tramo cuenta como angosto |
| `ruteo.<regla>.perfil_<id>` | factor | según la tabla | Cuánto pesa cada atributo del tramo para cada perfil: 24 claves, en «Atributos del tramo por perfil» |

## Cálculos

### Datos de cada foto

Al recibir una foto (`server/src/compartido/analisisFoto.ts`) se aceptan **JPG, PNG, WebP, AVIF y HEIC/HEIF** (la del iPhone), reconocidos por el contenido. Se leen del original el EXIF y el hash perceptual, y se completan estas columnas de `fotografia`. Si alguno de estos datos no se puede leer, queda en null y la foto se acepta igual: solo se rechaza si no es una imagen de esos formatos.

**Lo que se guarda no es el original:** se gira según el EXIF, se achica a 1920 px del lado mayor (sin agrandar las chicas) y se pasa a **WebP con calidad 80, sin metadatos**. Una foto de celular de 8 MB queda en unos 200 a 400 KB, y la foto pública ya no lleva la ubicación exacta ni el modelo del teléfono (esos datos quedan en la base). `sharp` no trae el decodificador HEVC (por patentes): el HEIC se decodifica antes con libheif (`heic-decode`, en WebAssembly).

Las fotos guardadas antes de este cambio se pasan a WebP con `npm run fotos:comprimir` (con `-- --probar`, solo cuenta cuánto se ahorraría): guarda la WebP, actualiza la ruta, las medidas y el tamaño, y recién después borra el original. El EXIF y el hash ya están en la fila y no cambian.

| Columna | De dónde sale |
|---|---|
| `ancho`, `alto` | Las de la foto guardada (la WebP, ya girada y achicada) |
| `tamano_bytes` | El tamaño de la foto guardada |
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

### Zona piloto

Los recorridos (F11) se calculan solo dentro de la zona piloto (#99). El polígono está en `db/datos/zona-piloto.geojson` y lo carga la semilla en `zona_piloto`. El sector lo eligió el grupo el 27/10/2026.

**Dónde.** Un rectángulo de unos 650 × 800 m (0,51 km²) alrededor del Hospital Bouquet Roldán. Toma el sur del barrio Bouquet Roldán y el oeste de La Sirena, a los dos lados de la Ruta 22 (Av. Mosconi).

| Lado | Calle |
|---|---|
| Norte | Bulevar 12 de Septiembre, con sus dos manos |
| Sur | Fray Luis Beltrán |
| Oeste | Cornelio Saavedra |
| Este | Catamarca y, al sur de la ruta, Cacique Purrán |

El contorno pasa 20 m por fuera del eje de esas calles, para que las calles del borde y sus esquinas queden adentro.

**Por qué ese sector.**

- Tiene lo que pide la #99: el hospital de área, las Escuelas Especiales N° 6 y N° 7, las Escuelas Primarias N° 16 y N° 132 y 17 paradas de colectivo (puntos de interés de OSM).
- El hospital y las escuelas especiales son destinos de personas con movilidad reducida: es donde un recorrido accesible tiene más sentido.
- Es barrio residencial, con más chances de obstáculos reales que el centro.
- Cruza la Ruta 22: el hospital y las escuelas especiales quedan de un lado y las primarias del otro. Así la demo puede mostrar el cruce de una ruta, uno de los obstáculos más grandes para quien camina. El barrio Bouquet Roldán solo, como lo dibuja OSM, es una franja de 400 m entre la ruta y 12 de Septiembre y no llega a las primarias.
- Se puede recorrer a pie para el relevamiento (#101): son unas 37 manzanas de una hectárea. En OSM quedan 20 espacios entre calles, porque el hospital, las escuelas especiales y Desarrollo Social ocupan una supermanzana de 13,6 ha entre Saavedra y Gobernador Anaya.

**Cómo quedó la red** (importación del 27/10/2026): 216 nodos y 273 tramos, 249 veredas y 24 cruces. 20 tramos tienen rampa; no hay ningún semáforo sonoro ni piso podotáctil mapeado. El 90 % de los nodos forma un solo componente que llega a los dos lados de la ruta: del hospital a la Escuela Primaria N° 132 hay un recorrido de 478 m. Quedaban 5 pedazos sueltos para revisar en el relevamiento: uno de 17 tramos sobre el borde este y cuatro tramos aislados. Con las correcciones del relevamiento (#101) la red queda en un solo pedazo; lo controla un test con los datos reales (`relevamiento-calculo.test.ts`).

### Red peatonal

`npm run importar:red` arma el grafo sobre el que se calculan los recorridos (F11) con los caminos de OpenStreetMap que tocan las zonas piloto activas (#100, `server/src/modulos/red/redPeatonal.ts` y `repositorio.ts`).

**Qué caminos entran.** En Neuquén casi no hay veredas mapeadas aparte (92 en toda la ciudad, en julio de 2026), así que la calle se usa como aproximación de sus dos veredas.

| `highway` | Cómo se usa |
|---|---|
| `footway`, `pedestrian`, `path`, `steps`, `track` | Caminos para peatones: sus etiquetas describen lo que pisa el peatón |
| `cycleway` | Solo si dice `foot=yes`, `designated` o `permissive` |
| `living_street`, `residential`, `unclassified`, `tertiary`, `secondary`, `primary`, `service` | La calle como aproximación de la vereda |

Las autopistas y las rutas (`motorway`, `trunk`) no se piden. De lo que llega se descarta, y el script dice qué y por qué:

- `foot=no`.
- `access=private` o `access=no`, salvo que diga `foot=yes`, `designated` o `permissive`.
- `service=parking_aisle`, `driveway` o `drive-through` (estacionamientos y entradas de garage).
- Una calle con `sidewalk=separate` o `sidewalk:both=separate`: sus veredas ya están dibujadas como caminos. Si la calle quedara, un recorrido podría esquivar por ella un obstáculo de la vereda real.

**Cómo se arma el grafo.**

1. Cada camino se corta en sus extremos y en los nodos que comparte con otro camino (las esquinas). Un nodo que no comparte con nadie queda dentro de la traza del tramo.
2. Un tramo que vuelve a su nodo de partida (una plaza dibujada por su contorno, una rotonda) se parte en dos en el nodo del medio: la base no acepta tramos con el mismo nodo en los dos extremos.
3. Se cargan los tramos que tocan alguna zona piloto activa (`ST_Intersects`), enteros aunque salgan un poco del polígono, y los nodos de sus extremos. Los que quedan del todo afuera se cuentan y no se cargan.
4. Para el peatón todo es de doble mano: `red_peatonal` da el mismo costo a la ida y a la vuelta, así que no se mira `oneway`.

**De etiquetas de OSM a columnas.**

| Columna | De dónde sale |
|---|---|
| `nodo_peatonal.osm_id` | El id del nodo en OSM |
| `tiene_semaforo_sonoro` | `traffic_signals:sound` = `yes`, `walk` o `locate` |
| `tiene_piso_podotactil` | `tactile_paving` = `yes`, `contrasted` o `primitive` |
| `tramo_peatonal.tipo` | `ESCALERA` si `highway=steps`; `CRUCE` si `footway`, `path` o `cycleway` = `crossing` (solo en caminos, no en calles); `SENDA` si `highway=path` o `track`; si no, `VEREDA` |
| `tiene_rampa` | `kerb=lowered` o `flush`, en el camino o en cualquiera de sus nodos: el cordón casi siempre se marca en un nodo, con `barrier=kerb`. Las calles peatonales y de convivencia (`highway=pedestrian` o `living_street`) van siempre con rampa: se caminan a nivel, sin cordón que bajar, así que para el perfil «con rampa» quiere decir «se pasa sin escalón» (decisión del 04/11). Los `footway` que no son cruces siguen la regla del cordón: queda para decidir en grupo |
| `pendiente_porcentaje` | `incline` en %: `8%`, `-5 %` o `8` (sin unidad se toma como %). En grados (`4°`) se pasa a %. `up`, `down` o un rango no dicen cuánto: null. El signo va en el sentido del tramo, del origen al destino |
| `ancho_estimado` | `width` en metros (`1.5`, `1,5 m`, `150 cm`). En una calle, null: es el ancho de la calzada |
| `superficie` | `surface` tal como está en OSM (`concrete`, `paving_stones`…), hasta 40 caracteres. En una calle, null: es la de la calzada |
| `longitud_metros` | `ST_Length` sobre `geography`: metros sobre el elipsoide, con 2 decimales |
| `costo_base` | La longitud. Los atributos del tramo pesan después, según el perfil («Atributos del tramo por perfil», abajo) |

Un valor que no entra en su columna (por ejemplo, una pendiente de más de 999,99 %) queda en null.

**Recarga.** Cada corrida reemplaza toda la red en una sola transacción (`TRUNCATE ... RESTART IDENTITY`): si algo falla, queda la anterior, y con la misma respuesta los id salen iguales. Como `factor_prioridad`, es un dato derivado que se reemplaza en vez de acumularse: la red es una copia de OSM, no algo que cargue una persona. La recarga vacía `incidente_tramo` y, en la misma transacción, vuelve a vincular todos los incidentes con la red nueva («Vínculo entre incidentes y tramos», abajo).

**Componentes conexos.** Al terminar se cuentan con `pgr_connectedComponents`. Si hay más de uno, desde un pedazo no se llega a los otros: el script muestra un nodo de cada uno, con su link a OSM, para revisarlo en el relevamiento (#101).

### Relevamiento de la zona piloto

OSM no trae las rampas, los escalones ni el estado de las veredas de la zona. El relevamiento (#101) los anota en `db/datos/relevamiento-zona-piloto.json` y `npm run importar:red` los aplica en cada importación, antes de cargar la red (`server/src/modulos/red/relevamiento.ts`): la red llega a la base ya corregida, en la misma transacción. Si el archivo tiene un error, la importación se corta antes de tocar nada y dice qué está mal.

**Cómo se relevó.** De forma remota, con Google Street View, en noviembre de 2026: 55 esquinas, 78 cuadras y 11 puntos donde OSM podía estar mal. Cada fila dice la fecha de la imagen que se miró (de 2014 a 2025). El archivo guarda lo que se vio, con las opciones de la planilla; la traducción a columnas está en el código.

**Cómo se ubica cada dato en la red.**

- Una esquina, por los nodos de OSM de la intersección: uno, o dos o cuatro en un bulevar.
- Una cuadra, por los tramos de la misma calle (el nombre en OSM) cuyo punto medio cae entre sus dos esquinas y a menos de 20 m de la recta que las une. Los 20 m alcanzan para las dos manos de un bulevar, que quedan a unos 10 m del centro de la esquina.
- Lo que no se encuentra (porque OSM cambió) no frena la importación: el script lo lista para revisarlo.

**De la planilla a columnas.** Lo que no se vio ("no se ve") deja el valor de OSM.

| Columna | Regla |
|---|---|
| `tiene_rampa` de los tramos de una cuadra | true si alguna de sus dos veredas tiene rampa en sus dos puntas; false si ninguna. Cuentan como rampa "sí" y "no corresponde" (en esa punta no se cruza); no cuentan "no" ni "sí, pero mal" (rota, empinada o tapada). Un lado sin vereda ("no hay vereda", "cantero / no aplica") no cuenta |
| `superficie` | En el vocabulario de OSM: hormigón `concrete`, baldosa `paving_stones`, adoquín `sett`, tierra `dirt`, ripio `gravel`, pasto `grass`. Una mixta queda `paved` si una silla de ruedas pasa por algún lado y `unpaved` si no |
| `ancho_estimado` | El ancho anotado, en metros |
| `tiene_piso_podotactil` de los nodos de una esquina | "sí" true, "no" false |

Qué punta de cada esquina toca cada vereda:

| Vereda | Esquina del oeste o del sur | Esquina del este o del norte |
|---|---|---|
| N | NE | NO |
| S | SE | SO |
| O | NO | SO |
| E | NE | SE |

**Lo que se anota pero no cambia columnas, y por qué.**

- ¿Pasa una silla de ruedas? No hay columna para eso. Queda en el archivo y decide dos cosas: la superficie de una cuadra mixta y si una unión del relevamiento tiene rampa. Cómo pesa cada atributo para cada perfil está en «Atributos del tramo por perfil».
- Escalones o desniveles: un escalón entre dos frentes no hace de la cuadra una escalera (`ESCALERA` es para `highway=steps`). Queda en el archivo, sin columna ni regla.
- Pendiente fuerte: la planilla dice sí o no y la columna pide un porcentaje.
- Semáforo sonoro: no se puede escuchar en Street View. Queda el de OSM.

**Puntos revisados.** Los caminos que no son públicos salen de la red: la vereda interna de la escuela especial que entra por Gobernador Anaya (P-01), dos pedazos de vereda de un edificio sobre Lastra (P-07) y la calle de servicio del corralón al oeste de Saavedra (P-08). Se agregan dos uniones en línea recta entre nodos de OSM que en la realidad se conectan caminando: la plaza de Catamarca con la esquina de Andacollo (P-06) e Intendente Carro, que en OSM está cortada entre Eva Duarte y Gobernador Anaya (P-10). Si OSM ya tiene la unión, no se duplica. Una unión no tiene cordón: va con rampa si el punto dice que pasa una silla (las dos dicen que sí).

### Vínculo entre incidentes y tramos

Un incidente cambia los recorridos (F11) a través de `incidente_tramo`, los tramos que obstruye (#103, `server/src/modulos/red/repositorio.ts`). Cuánto le estorba a cada perfil lo dice después `categoria_perfil` (la matriz de arriba).

**Regla.** Un incidente obstruye los tramos que pasan a no más de `ruteo.radio_obstruccion_m` metros de su punto, si el punto está dentro de una zona piloto activa (`ST_Covers`). Es la distancia más corta entre el punto y la traza del tramo, en metros sobre el elipsoide (`ST_DWithin` sobre `geography`, con el índice GIST de `tramo_peatonal`).

- En una esquina, el punto toca el nodo: vincula todos los tramos que llegan a ella.
- En la mitad de una cuadra vincula solo esa cuadra. Como la calle hace de vereda, un obstáculo sobre cualquiera de las dos veredas queda a unos 5 a 10 m del eje: entra con 15 m.
- Fuera de la zona no vincula nada, aunque tenga un tramo al lado: los tramos que cruzan el borde se cargan enteros, pero el recorrido se calcula solo adentro.
- No mira la categoría ni el estado. El recorrido cuenta solo los incidentes vigentes (no resueltos, no desestimados, no caducados ni unidos a otro), así que uno resuelto puede conservar sus vínculos.

| Caso, con 15 m | Tramos vinculados |
|---|---|
| En una esquina a la que llegan cuatro cuadras | Las cuatro |
| En la mitad de una cuadra | Esa cuadra |
| A 14 m del eje de la calle | Esa cuadra |
| A 16 m del eje de la calle más cercana | Ninguno |
| A 10 m de una esquina | Todas las cuadras de esa esquina |
| Fuera de la zona piloto | Ninguno |

**Cuándo se calcula.** En la misma transacción que el cambio, así un incidente nunca existe sin sus vínculos:

- Al crear un incidente: cuando un reporte no se suma a ninguno (#53) y cuando se separa un reporte (#55).
- Cuando un incidente cambia de punto: al separar un reporte, si el original estaba en el punto del que se fue, pasa a otro punto y se vuelven a calcular los suyos.

Un reporte que se suma a un incidente no lo mueve, así que no le cambia los vínculos. Unir tampoco: el duplicado conserva los suyos, y el recorrido no lo cuenta mientras esté unido.

**Recálculo.** Los vínculos salen del punto del incidente, de la red, de las zonas y del radio. Por eso se borran y se arman de nuevo en vez de acumularse, como `factor_prioridad` y la red (decisión del 27/10). Recalcular todos usa la misma consulta que al crear cada uno y no depende del estado, así que da los mismos vínculos que había.

- `npm run importar:red` vuelve a vincular todos los incidentes en la misma transacción que reemplaza la red: los recorridos nunca ven la red nueva sin sus incidentes. Con la misma respuesta de OSM, los tramos conservan sus id y los vínculos quedan iguales.
- `npm run vincular:incidentes` los recalcula sin tocar la red: después de cambiar `ruteo.radio_obstruccion_m` o una zona piloto, o para los incidentes cargados antes de la #103.
- Los dos dicen al terminar cuántos incidentes obstruyen cuántos tramos y cuántos vínculos había antes.

**Límite conocido.** Un incidente a menos de 15 m de una esquina vincula todas las cuadras que llegan a ella, no solo la suya. Si para un perfil es intransitable (una vereda rota para una silla de ruedas), le bloquea la esquina entera.

### Atributos del tramo por perfil

Además de los incidentes, cada tramo tiene atributos propios que le estorban distinto a cada perfil: el tipo, la rampa, la pendiente, la superficie, el ancho y, en sus extremos, el semáforo sonoro y el piso podotáctil. Cómo pesan lo decidió el grupo el 02/11/2026 (#102), después de ver qué hay en la zona con la red importada y el relevamiento. Se aplican en el costo del recorrido (#104).

**Regla.** Cada atributo multiplica el costo del tramo por un factor según el perfil, o lo vuelve intransitable (⛔). Los factores de un tramo se multiplican entre sí y con los de sus incidentes vigentes:

> costo = `costo_base` × (producto de los factores de sus atributos) × (producto de los `factor_penalizacion` de sus incidentes)

Si un atributo o un incidente lo bloquea para ese perfil, el recorrido no pasa por ese tramo. «—» es que no le cambia el costo.

| Atributo del tramo | Silla de ruedas | Bastón o andador | Coche de bebé | Baja visión |
|---|---|---|---|---|
| Escalera (`tipo = ESCALERA`) | ⛔ | 2,0 | ⛔ | 1,5 |
| Sin rampa (`tiene_rampa = false`) | 3,0 | 1,5 | 2,0 | 1,5 |
| Pendiente de más de 8 %, subiendo o bajando | 3,0 | 1,5 | 1,5 | — |
| Superficie sin pavimentar | 2,0 | 1,5 | 1,5 | 1,2 |
| Ancho de menos de 0,9 m | ⛔ | — | ⛔ | — |
| Cruce sin semáforo sonoro ni piso podotáctil en sus extremos | — | — | — | 1,5 |

- **Superficie sin pavimentar:** `unpaved`, `dirt`, `earth`, `ground`, `gravel`, `fine_gravel`, `grass`, `sand` y `mud`, de OSM. El relevamiento usa `dirt`, `gravel`, `grass` y `unpaved`.
- Un dato que falta (pendiente, ancho o superficie en null) no aplica ninguna regla. La rampa no puede faltar: la columna es `NOT NULL DEFAULT false`.
- Los factores, los bloqueos y los dos umbrales (8 % y 0,9 m) van en `parametro_sistema`, como los del resto de los cálculos: el administrador los ajusta sin tocar el código (F16). Un perfil nuevo no tiene reglas hasta que se le cargan.
- **Claves** (#104): una por regla y por perfil, `ruteo.<regla>.perfil_<id>`, de tipo `factor`. El valor es un número mayor que 0 o `intransitable`, como en la matriz de incidentes; «—» se guarda como `1.0`, para que el administrador vea la regla y la pueda activar. Va el id del perfil y no su nombre, así la regla sigue valiendo si se lo renombra. La semilla carga las 24 con los valores de la tabla. Un valor que no es ni un número mayor que 0 ni `intransitable` no se aplica y queda un aviso en el log.

| Regla | `<regla>` |
|---|---|
| Escalera | `escalera` |
| Sin rampa | `sin_rampa` |
| Pendiente de más de `ruteo.pendiente_max_porcentaje` | `pendiente` |
| Superficie sin pavimentar | `sin_pavimentar` |
| Ancho de menos de `ruteo.ancho_min_m` | `angosto` |
| Cruce sin semáforo sonoro ni piso podotáctil | `cruce_sin_senal` |
- Son valores de partida, como los de la matriz de incidentes: se revisan con los datos de la prueba piloto.

**Por qué «sin rampa» encarece y no bloquea.** El incidente «Cordón sin rampa» sí bloquea a la silla, porque alguien lo vio. El atributo no puede: `tiene_rampa = false` junta las cuadras sin rampa con las que nadie relevó, porque la columna no tiene «sin dato». En la red de la zona, si las cuadras sin rampa fueran intransitables para la silla, la red quedaría partida en 11 pedazos y el más grande tendría 38 de los 208 nodos: casi cualquier recorrido daría «No hay un recorrido transitable». Con ×3, la silla prefiere las cuadras con rampa confirmada y sigue llegando.

**Qué hay en la zona** (la red del 27/10 con el relevamiento, 271 tramos):

| Regla | Tramos que toca hoy |
|---|---|
| Escalera | 0 |
| Sin rampa | 166 (105 tienen rampa, contando las calles peatonales y de convivencia y las uniones del relevamiento) |
| Pendiente de más de 8 % | 0: ningún tramo tiene pendiente. OSM no la trae y el relevamiento solo anotó «sí» o «no» |
| Superficie sin pavimentar | 16 (8 `dirt` y 8 `unpaved`) |
| Ancho de menos de 0,9 m | 0: 106 tramos tienen ancho, de 1 a 3 m |
| Cruce sin semáforo sonoro ni piso podotáctil | Los 24 cruces. Hay 9 semáforos y ninguno es sonoro; los 3 nodos con piso podotáctil no son extremos de un cruce |

Hoy pesan sobre todo la rampa y la superficie. Las otras reglas se prueban con los tests: todas en los del cálculo (`recorridos-calculo.test.ts`) y la escalera y la rampa también en los del recorrido, sobre una grilla de prueba («Recorrido accesible», abajo). Empiezan a pesar en cuanto se releve más o OSM sume esos datos.

**Lo que no se usa.** Lo que el relevamiento anotó sin columna: los escalones entre frentes y la pendiente fuerte, que es «sí» o «no», sin porcentaje. Si pasa una silla de ruedas tampoco tiene columna, pero no queda afuera: decide la superficie de las cuadras «mixta» y la rampa de las uniones («Relevamiento de la zona piloto»). Los criterios de quienes relevaron no coinciden del todo: falta revisarlos en grupo.

**Límite conocido.** Como la calle hace de vereda, casi todos los cruces de calle quedan dentro de un tramo `VEREDA`: la regla del semáforo sonoro alcanza solo a los 24 cruces dibujados en OSM.

**Alternativas descartadas.**

- No usar los atributos, y que el recorrido cambie solo por los incidentes: el grupo decidió que la app los tiene que tener en cuenta. Si no, el relevamiento no cambiaría ningún costo.
- Reglas fijas en el código: el administrador no podría ajustarlas, que es lo que pide F16, y habría que reconocer cada perfil por su nombre.
- Bloquear a la silla y al coche en las cuadras sin rampa: con el dato que falta, deja la red en pedazos (arriba).
- Usar para los tramos sin rampa la fila de «Cordón sin rampa» de la matriz de incidentes: tiene el mismo bloqueo, y no hay categorías para la escalera, la pendiente ni el semáforo.
- Una issue aparte para aplicarlos: el costo del recorrido se arma en #104, así que van ahí y se prueban con el recorrido real.

### Recorrido accesible

`GET /api/recorridos` (#104, `server/src/modulos/recorridos/`) busca el camino a pie más conveniente entre dos puntos para un perfil de movilidad. La fórmula del costo de cada tramo es una función pura (`costoDelTramo`, en `calculo.ts`) y el camino lo busca pgRouting.

**Pasos.**

1. **Zona.** El origen y el destino tienen que estar dentro de alguna zona piloto activa (`ST_Covers`). Si no: 422 `FUERA_DE_ZONA`, que dice cuál de los dos quedó afuera.
2. **Esquina más cercana.** Cada punto se acerca al nodo de la red más cercano (`<->` sobre el índice GIST), a no más de `ruteo.distancia_max_al_nodo_m` metros. Si no hay ninguno: 422 `SIN_RED_CERCA`. Si los dos caen en el mismo nodo: 422 `MISMO_PUNTO`.
3. **Costo de cada tramo para el perfil.** Para cada tramo de `red_peatonal`:

   > costo = `costo_base` × (factores de sus atributos para el perfil) × (`factor_penalizacion` de sus incidentes vigentes para el perfil)

   Si un atributo o un incidente es intransitable para el perfil, el costo es −1 y pgRouting no pasa por ese tramo. Los atributos son los de «Atributos del tramo por perfil», arriba. Los incidentes son los de `incidente_tramo` («Vínculo entre incidentes y tramos»), con el efecto de su categoría en `categoria_perfil`.
4. **Camino.** `pgr_dijkstra` busca el de menor costo entre los dos nodos. Los costos van a una tabla temporal de la transacción: así la consulta que recibe pgRouting es un texto fijo y ningún dato se arma dentro de ella. Si no hay camino: 422 «No hay un recorrido transitable».
5. **Respuesta.** La traza se arma uniendo los tramos en el orden en que se caminan; si un tramo se recorre del destino al origen, se da vuelta. La distancia es la suma de `longitud_metros`, en metros enteros: el costo decide el camino, pero lo que se camina son metros. El tiempo es esa distancia sobre `ruteo.velocidad_m_por_min`, redondeado hacia arriba.

**Qué incidentes cuentan.** Los que se ven en el mapa (no desestimados, no caducados, no unidos a otro y, si son temporales, con la vigencia sin vencer aunque la tarea diaria todavía no los haya marcado) que además no estén resueltos. Uno pendiente de revisión (`REGISTRADO`) cuenta: el obstáculo puede estar ahí, y es más seguro esquivarlo. Un incidente de una categoría que no tiene fila en `categoria_perfil` para el perfil no le cambia el costo.

**Ejemplo, en la grilla de los tests** (`server/test/recorridos.test.ts`): cuadras de unos 100 m, todas con rampa, y una vereda rota en la cuadra 10 ─ 20.

```
02 ── 12 ── 22
│     │     │
01 ── 11 ── 21
│     │     │
00 ── 10 ── 20
```

| Perfil, de 00 a 20 | Costo por 10 ─ 20 | Costo dando la vuelta | Recorrido |
|---|---|---|---|
| Silla de ruedas | ⛔ (vereda rota) | 400 | Da la vuelta por la fila 1: 400 m |
| Coche de bebé | 100 + 100 × 2,5 = 350 | 400 | Sigue derecho: 200 m |

Con una escalera en 01 ─ 02, la silla da la vuelta (⛔) y el bastón sigue por la escalera (100 + 100 × 2 = 300, menos que 400). Con las dos cuadras de la columna 2 sin rampa, de 20 a 22 la silla prefiere las cuadras con rampa (100 × 3 + 100 × 3 = 600 contra 400) y el bastón no (150 + 150 = 300). Si todas las cuadras son sin rampa, la silla igual llega por la más corta: sin rampa encarece, no bloquea.

**Límites conocidos.**

- La traza va de esquina a esquina: el tramo entre el punto elegido y la esquina más cercana (hasta 100 m) no se dibuja ni se suma.
- El punto se acerca al nodo más cercano aunque sea la punta suelta de un camino que termina sin tocar otro (OSM tiene 7 a menos de 15 m de otro nodo, casi todas sendas que terminan contra una calle). Desde ahí el recorrido puede dar un rodeo hasta la esquina conectada. Las que se confirmen en el relevamiento se unen con `conectarNodos`, como P-06 y P-10 («Relevamiento de la zona piloto»).
- Un incidente a menos de 15 m de una esquina obstruye todas las cuadras que llegan a ella («Vínculo entre incidentes y tramos»): si es intransitable para el perfil, le cierra la esquina entera.
- Cada pedido lee la red entera de la base (273 tramos en la zona piloto). Alcanza para la zona; para toda la ciudad (A01) habría que filtrar por cercanía.

### Cierre del incidente

Un incidente en `EN_EJECUCION` se cierra con una foto del después (F09). El sistema compara esa foto con las del antes y decide el resultado (`server/src/modulos/cierre/calculo.ts`).

**Comparación con la IA.** `compararCierre(usuarioId, fotosAntes, fotoDespues)` (`server/src/modulos/ia/compararCierre.ts`) le manda al modelo las fotos del antes (como mucho 4, las primeras: las de los reportes que lo originaron) y la del después, y le pide:

- `veredicto`: `RESUELTO`, `NO_RESUELTO` o `NO_CONCLUYENTE`.
- `explicacion`: una o dos oraciones con lo que ve.

El intento queda en `registro_ia` con `tipo = COMPARACION_CIERRE`. Si la IA no responde, el cierre se decide sin veredicto (ver abajo). La IA **no** decide el resultado final: solo dice si le parece resuelto.

**Decisión.** `decidirCierre(distancia, veredicto, parametros)` combina la distancia entre la foto del después y el punto del incidente con el veredicto. La primera regla que se cumple decide:

| Orden | Condición | Resultado |
|---|---|---|
| 1 | La foto del después no trae GPS (`distancia = null`) | `OBSERVADO` |
| 2 | `distancia > cierre.distancia_max_m` | `RECHAZADO` |
| 3 | La IA no respondió (`veredicto = null`) | `OBSERVADO` |
| 4 | `veredicto = RESUELTO` | `VALIDADO` |
| 5 | `veredicto = NO_RESUELTO` | `RECHAZADO` |
| 6 | `veredicto = NO_CONCLUYENTE` | `OBSERVADO` |

La distancia justo en el límite **no** rechaza: se rechaza solo si es mayor que `cierre.distancia_max_m`. El valor de partida es 50 m (arriba, «Cierre, vigencia y recorridos»).

`VALIDADO`, `OBSERVADO` y `RECHAZADO` son el enum `ResultadoComparacion` que se guarda en `cierre_incidente.resultado_comparacion`. El endpoint que registra el cierre es la #108; esta parte solo calcula el resultado.

**Explicación.** `explicarCierre(resultado, datos, parametros)` arma el texto de `cierre_incidente.detalle_comparacion`: por qué quedó así (sin GPS, la distancia y el máximo, por qué no se pudo comparar, o lo que concluyó la IA con su explicación). Repite el orden de `decidirCierre` (decisión del 08/11); un test recorre las combinaciones de distancia y veredicto y comprueba que el texto coincida con el resultado. La distancia se muestra en metros enteros, redondeada para arriba: una foto a 50,01 m dice «51 m», así un cierre rechazado nunca dice estar dentro del máximo.
