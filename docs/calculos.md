# Cálculos y parámetros

Valores iniciales que carga la semilla (`npm run semilla`, en `server/`). Se guardan en la base (`parametro_sistema`, `categoria`, `categoria_perfil`), así que se pueden ajustar sin tocar código.

Si cambiás un valor en `server/src/semilla/datos.ts`, actualizalo también acá.

> **Propuesta inicial del grupo (05/10/2026).** Son valores razonables para arrancar, no salen de mediciones. Se revisan con los datos de la prueba piloto.

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

- **Vigencia temporal:** si el incidente no recibe reportes nuevos en `dias_caducidad_default` días, caduca solo.
- **Peso de severidad:** multiplica los puntos de severidad al calcular la prioridad (ver más abajo). Los problemas que cortan el paso a una silla de ruedas pesan más.

### Perfiles de movilidad y matriz categoría × perfil

Para calcular recorridos accesibles, cada problema afecta distinto según quién camina. El número es el factor por el que se multiplica el costo del tramo; ⛔ significa que para ese perfil el tramo queda **intransitable** y el recorrido lo evita.

| | Silla de ruedas | Bastón o andador | Coche de bebé | Baja visión |
|---|---|---|---|---|
| Pozo en la calzada | 3,0 | 2,0 | 2,0 | 2,5 |
| Vereda rota | ⛔ | 2,0 | 2,5 | 2,5 |
| Cordón sin rampa | ⛔ | 1,5 | ⛔ | 1,5 |
| Luminaria apagada | 1,2 | 1,5 | 1,2 | 3,0 |
| Obra que interrumpe el paso | ⛔ | ⛔ | ⛔ | ⛔ |

## Agrupación de reportes en incidentes

Un reporte nuevo se suma a un incidente abierto si es de la **misma categoría**, está a menos de **`agrupacion.radio_metros`** y el incidente tuvo un reporte en los últimos **`agrupacion.ventana_dias`**. Si no, crea un incidente nuevo.

| Parámetro | Valor | Qué es |
|---|---|---|
| `agrupacion.radio_metros` | 30 | Distancia máxima al incidente |
| `agrupacion.ventana_dias` | 30 | Antigüedad máxima del último reporte del incidente |

## Verificación automática del reporte

Cada reporte recibe un **puntaje de confianza de 0 a 100**. Arranca en el puntaje base y cada señal suma o resta; cada señal queda registrada en `senal_verificacion` para poder explicar el resultado.

```
puntaje = base + Σ señales        (se limita entre 0 y 100)
```

| Señal | Parámetro | Valor |
|---|---|---|
| Puntaje base | `verificacion.puntaje_base` | 50 |
| La ubicación EXIF de la foto coincide con el punto (a menos de `verificacion.exif_distancia_max_metros` = 100 m) | `verificacion.exif_coincide` | +20 |
| La foto no trae ubicación EXIF | `verificacion.exif_ausente` | −10 |
| Cargado desde la app (cámara y GPS en el momento) | `verificacion.origen_app` | +10 |
| Foto sacada hace más de `verificacion.foto_antigua_horas` (48 h) | `verificacion.foto_antigua` | −20 |
| La misma foto ya se usó en otro reporte | `verificacion.hash_duplicado` | −40 |
| Reputación del vecino: `(reputación − 50) / verificacion.reputacion_divisor` | `verificacion.reputacion_divisor` | 5 (aporta entre −10 y +10) |

| Resultado | Condición |
|---|---|
| **Verificado** | puntaje ≥ `verificacion.umbral_verificado` (70) |
| **Desestimado** | puntaje ≤ `verificacion.umbral_desestimado` (30) |
| **Pendiente de revisión** (lo decide un operador) | entre los dos umbrales |

**Ejemplo:** un vecino nuevo (reputación 50) saca la foto con la app y el EXIF coincide: 50 + 20 + 10 + 0 = **80 → verificado**. La misma foto subida desde la web, sin EXIF: 50 − 10 = **40 → pendiente de revisión**.

## Reputación del vecino

Empieza en **50** (valor por defecto de `usuario.reputacion`) y se mueve con el resultado final de sus reportes. Pesa más un reporte desestimado que uno confirmado, para que mandar reportes falsos no salga gratis.

| Parámetro | Valor |
|---|---|
| `reputacion.por_confirmado` | +2 |
| `reputacion.por_desestimado` | −5 |
| `reputacion.minima` / `reputacion.maxima` | 0 / 100 |

## Prioridad del incidente

```
prioridad = severidad × peso de la categoría
          + mín(reportes extra × por_reporte_extra, max_evidencias)
          + mín(días desde el primer reporte × por_dia, max_antiguedad)
          + contexto urbano (si hay un punto de interés cerca)
```

Cada sumando se guarda en `factor_prioridad` (SEVERIDAD, EVIDENCIAS, ANTIGUEDAD, CONTEXTO_URBANO) para mostrarle al operador por qué un incidente está arriba en la bandeja. Un operador puede forzar la prioridad con una justificación (AJUSTE_MANUAL).

| Parámetro | Valor | Qué es |
|---|---|---|
| `prioridad.severidad_leve` | 10 | Puntos de severidad LEVE |
| `prioridad.severidad_moderada` | 20 | Puntos de severidad MODERADA |
| `prioridad.severidad_grave` | 30 | Puntos de severidad GRAVE |
| `prioridad.por_reporte_extra` | 5 | Por cada reporte agrupado además del primero |
| `prioridad.max_evidencias` | 25 | Tope por reportes agrupados (5 reportes extra) |
| `prioridad.por_dia` | 1 | Por cada día sin resolver |
| `prioridad.max_antiguedad` | 20 | Tope por antigüedad (20 días) |
| `prioridad.contexto_urbano` | 15 | Si hay un hospital, escuela u otro punto de interés cerca |
| `prioridad.contexto_radio_metros` | 150 | Qué se considera "cerca" |

**Ejemplo:** un cordón sin rampa (peso 1,40) reportado como grave, con 3 reportes, hace 10 días y a 100 m de una escuela: 30 × 1,40 + 2 × 5 + 10 × 1 + 15 = **77**. El máximo posible es 30 × 1,50 + 25 + 20 + 15 = **105**.

## Reportes y avisos

| Parámetro | Valor | Qué es |
|---|---|---|
| `reporte.max_fotos` | 3 | Fotos por reporte |
| `reporte.max_mb_foto` | 5 | Tamaño máximo de cada foto, en MB |
| `avisos.radio_zona_metros` | 500 | Radio por defecto de una zona habitual nueva |
