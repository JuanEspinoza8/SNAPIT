# API de SnapIt — convenciones

## Base
- Todas las rutas empiezan con `/api`. Ejemplo: `GET /api/salud`.
- Las peticiones y respuestas son JSON (`Content-Type: application/json`), con un límite de 1 MB por cuerpo.
- Los nombres de campos van en camelCase (`baseDeDatos`, `fechaAlta`).
- El servidor no habilita CORS. En desarrollo, la web llama a `/api` a través del proxy de Vite; en la demo, nginx reenvía `/api` al servidor. La app no lo necesita.

## Errores
Todas las respuestas de error tienen el mismo formato:

```json
{ "error": { "codigo": "RUTA_NO_ENCONTRADA", "mensaje": "No existe GET /api/xyz" } }
```

- `codigo`: identificador fijo en MAYÚSCULAS, para que los clientes decidan qué hacer.
- `mensaje`: texto en castellano que se le puede mostrar al usuario.
- `detalles` (opcional): lista de problemas puntuales de la entrada, uno por campo. Aparece sobre todo en los 400:

```json
{
  "error": {
    "codigo": "DATOS_INVALIDOS",
    "mensaje": "Hay datos inválidos",
    "detalles": [{ "campo": "email", "mensaje": "No es un correo válido" }]
  }
}
```

| Status | Cuándo |
|---|---|
| 400 | Datos inválidos, JSON mal formado (`JSON_INVALIDO`) o un link de un correo que ya no sirve (`ENLACE_*`) |
| 401 | Falta autenticación o el token no es válido |
| 403 | Autenticado, pero sin permiso para la acción |
| 404 | Ruta o recurso inexistente (`RUTA_NO_ENCONTRADA`) |
| 409 | Conflicto, por ejemplo un correo ya registrado |
| 413 | El cuerpo supera 1 MB (`CUERPO_DEMASIADO_GRANDE`) |
| 415 | Codificación o compresión del cuerpo no soportada (`FORMATO_NO_SOPORTADO`) |
| 500 | Error inesperado (`ERROR_INTERNO`): nunca incluye detalles internos |

En el servidor, los errores esperados se lanzan con `throw new ErrorApp(status, codigo, mensaje, detalles?)`.

## Seguimiento de peticiones
Cada respuesta incluye el encabezado `X-Request-Id`. Si el cliente manda uno (de hasta 100 caracteres), se respeta; si no, o si viene vacío, se genera. Al reportar un error, conviene pasar ese id: es el que se busca en los logs del servidor.

## Autenticación
La misma cuenta sirve en la web y en la app. Hay dos tokens:

| Token | Dura | Para qué |
|---|---|---|
| `tokenAcceso` | 15 minutos | Va en cada petición: `Authorization: Bearer <tokenAcceso>`. Es un JWT con el id, el rol, el organismo y el área. |
| `tokenRenovacion` | 30 días | Solo sirve para pedir tokens nuevos con `POST /api/auth/renovar`. Se puede usar **una sola vez**: cada renovación devuelve uno nuevo que reemplaza al anterior. |

Qué hace el cliente:

- Guarda los dos tokens: la app en almacenamiento seguro y la web en `localStorage`, para que la sesión siga al recargar o al volver a abrir el navegador. Nunca en logs.
- Ante un 401 en una petición que llevaba el token, pide tokens nuevos **una vez** con `POST /api/auth/renovar`, guarda **los dos** que vuelven y reintenta. Si la renovación también falla, vuelve a la pantalla de ingreso. No hace falta mirar si el código es `TOKEN_VENCIDO` o `TOKEN_INVALIDO`: si la sesión ya no sirve, la renovación falla.
- 403 (`SIN_PERMISO`) significa que la sesión es válida pero el rol no tiene permiso: no se renueva ni se reintenta.

| Código | Status | Cuándo |
|---|---|---|
| `NO_AUTENTICADO` | 401 | Falta el encabezado `Authorization: Bearer ...` |
| `TOKEN_VENCIDO` | 401 | El `tokenAcceso` pasó los 15 minutos: hay que renovar |
| `TOKEN_INVALIDO` | 401 | Token adulterado o mal formado. En `/api/auth/yo`, también si la cuenta fue dada de baja |
| `SIN_PERMISO` | 403 | El rol no puede usar esa ruta |

El `tokenAcceso` no se controla contra la base en cada petición: una cuenta dada de baja puede seguir usando las rutas protegidas hasta que venza su token (15 minutos como máximo). Después, la renovación falla.

En el servidor, una ruta protegida se arma con los middlewares de `src/compartido/autenticacion.ts`:

```ts
router.get('/bandeja', autenticar, permitirRoles('OPERADOR', 'ADMINISTRADOR'), async (req, res) => {
  // req.usuario = { id, rol, organismoId, areaId }
});
```

## Endpoints

### `GET /api/salud`
Indica si el servidor está activo y si llega a la base de datos. Siempre responde 200.

```json
{ "estado": "ok", "baseDeDatos": "ok" }
```

`baseDeDatos` vale `"error"` si la base no responde.

### El objeto `usuario`
Lo devuelven el registro, el ingreso, la renovación, `/yo` y la administración de usuarios. Nunca incluye la clave.

```json
{ "id": 7, "email": "ana@ejemplo.com", "nombre": "Ana", "rol": "VECINO", "organismoId": null, "areaId": null }
```

`rol` es `VECINO`, `OPERADOR` o `ADMINISTRADOR`. `organismoId` viene informado en los operadores y, si se le asignó uno, en los administradores. `areaId`, solo en los operadores.

### `POST /api/auth/registro`
Crea una cuenta de vecino. Pública.

```json
{ "email": "ana@ejemplo.com", "clave": "una-clave-segura", "nombre": "Ana" }
```

- `email`: se guarda en minúsculas y sin espacios. Hasta 150 caracteres.
- `clave`: de 8 a 72 caracteres. El límite real es de 72 bytes, porque es lo que usa bcrypt: una ñ o una vocal con tilde ocupan dos, así que con esas letras entran menos.
- `nombre`: de 1 a 120 caracteres.

Responde **201** con `{ "usuario": { ... } }`. La cuenta queda **sin confirmar** y se le manda un correo con el link de confirmación (ver [Links de los correos](#links-de-los-correos)). No puede ingresar hasta confirmar.

El correo sale sin demorar la respuesta. Si no se puede enviar, el registro responde 201 igual y el error queda en el log del servidor. En ese caso, o si el link vence, el vecino puede usar «Olvidé mi clave»: al elegir una clave nueva también se confirma el correo.

| Status | Código | Cuándo |
|---|---|---|
| 400 | `DATOS_INVALIDOS` | Algún campo no cumple; `detalles` dice cuál |
| 409 | `EMAIL_EN_USO` | Ya hay una cuenta con ese correo |

### `POST /api/auth/ingreso`
Pública.

```json
{ "email": "ana@ejemplo.com", "clave": "una-clave-segura" }
```

Responde **200**:

```json
{ "tokenAcceso": "eyJ...", "tokenRenovacion": "Qm9...", "usuario": { ... } }
```

| Status | Código | Cuándo |
|---|---|---|
| 401 | `CREDENCIALES_INVALIDAS` | El correo no existe o la clave no coincide. A propósito no dice cuál de las dos. |
| 403 | `CUENTA_SIN_CONFIRMAR` | La clave es correcta pero falta confirmar el correo |
| 403 | `CUENTA_DADA_DE_BAJA` | La clave es correcta pero la cuenta fue dada de baja |

### `POST /api/auth/renovar`
Pública (el `tokenAcceso` puede estar vencido).

```json
{ "tokenRenovacion": "Qm9..." }
```

Responde **200** con lo mismo que el ingreso: `tokenAcceso`, un `tokenRenovacion` **nuevo** y `usuario`. El token enviado deja de servir.

| Status | Código | Cuándo |
|---|---|---|
| 401 | `TOKEN_RENOVACION_INVALIDO` | No existe, ya se usó, venció, se cerró con `/salir` o la cuenta fue dada de baja |

### `POST /api/auth/salir`
Pública. Cierra la sesión de este dispositivo.

```json
{ "tokenRenovacion": "Qm9..." }
```

Responde **204** sin cuerpo, aunque el token no exista. El cliente igual borra los dos tokens.

### `GET /api/auth/yo`
Requiere sesión. Responde **200** con `{ "usuario": { ... } }`, leído de la base en ese momento.

### Links de los correos
Los correos llevan un link a la web, armado con la variable `URL_WEB`:

| Correo | Link | Vence |
|---|---|---|
| Confirmación (al registrarse) | `{URL_WEB}/confirmar-correo?token=...` | 24 horas |
| Recuperación de clave | `{URL_WEB}/restablecer-clave?token=...` | 1 hora |

La web (#9) tiene que tener esas dos páginas: leen el `token` de la URL y llaman a `POST /api/auth/confirmar-correo` o `POST /api/auth/restablecer-clave`. Cada link sirve una sola vez. En la base se guarda el hash del token, no el token.

Errores de los dos endpoints que reciben un link:

| Status | Código | Cuándo |
|---|---|---|
| 400 | `ENLACE_INVALIDO` | El token no existe, es de otro tipo de link o la cuenta fue dada de baja |
| 400 | `ENLACE_USADO` | El link ya se usó |
| 400 | `ENLACE_VENCIDO` | El link venció: hay que pedir otro con «Olvidé mi clave» |

El `mensaje` explica qué hacer en cada caso, así que se le puede mostrar al usuario tal cual.

### `POST /api/auth/confirmar-correo`
Pública.

```json
{ "token": "Qm9..." }
```

Responde **204** sin cuerpo: la cuenta queda confirmada y ya puede ingresar. No abre sesión.

| Status | Código | Cuándo |
|---|---|---|
| 400 | `DATOS_INVALIDOS` | Falta el token |
| 400 | `ENLACE_*` | Ver [Links de los correos](#links-de-los-correos) |

### `POST /api/auth/recuperar-clave`
Pública.

```json
{ "email": "ana@ejemplo.com" }
```

Responde **204** sin cuerpo **siempre**, exista o no el correo. Responde antes de buscarlo, así que ni la respuesta ni lo que tarda dicen si hay una cuenta con ese correo. Si la cuenta existe y no está dada de baja, se le manda el correo con el link. Una cuenta sin confirmar también lo recibe.

Pedirlo varias veces genera varios links: el primero que se use anula los demás.

| Status | Código | Cuándo |
|---|---|---|
| 400 | `DATOS_INVALIDOS` | Falta el correo o no tiene formato de correo |

### `POST /api/auth/restablecer-clave`
Pública.

```json
{ "token": "Qm9...", "clave": "otra-clave-segura" }
```

`clave` sigue las mismas reglas que en el registro. Responde **204** sin cuerpo y, todo junto:

- Cambia la clave.
- Cierra todas las sesiones abiertas del usuario (sus `tokenRenovacion` dejan de servir) y anula los otros links pendientes.
- Confirma el correo si todavía no estaba confirmado, porque el link llegó a esa casilla.

No abre sesión: el cliente lleva al ingreso. El `tokenAcceso` que ya tenga otro dispositivo sigue sirviendo hasta que vence (15 minutos como máximo); después, la renovación falla y ese dispositivo vuelve al ingreso.

| Status | Código | Cuándo |
|---|---|---|
| 400 | `DATOS_INVALIDOS` | Falta el token o la clave no cumple. El link no se gasta: se puede volver a intentar |
| 400 | `ENLACE_*` | Ver [Links de los correos](#links-de-los-correos) |

## Catálogo
Rutas públicas: no piden sesión. Las listas cambian poco, así que los clientes pueden pedirlas una vez al abrir la pantalla.

### `GET /api/categorias`
Lo que el vecino puede elegir al reportar y los filtros del mapa. Responde **200** con las categorías **activas**, ordenadas por nombre:

```json
{
  "categorias": [
    {
      "id": 3,
      "nombre": "Cordón sin rampa",
      "descripcion": "Esquina sin rampa o con la rampa rota o bloqueada",
      "tipoVigenciaDefault": "PERMANENTE",
      "area": { "id": 2, "nombre": "Veredas" }
    }
  ]
}
```

- `tipoVigenciaDefault`: `PERMANENTE` o `TEMPORAL`, la vigencia con la que nace un incidente de esa categoría. Uno temporal (por ejemplo, una obra) vence solo a los días que fija la categoría; cuando un vecino confirma que el problema sigue, la vigencia se renueva.
- `area`: quién lo atiende. Sirve para mostrarle al vecino a dónde va su reporte.
- Una categoría desactivada deja de aparecer acá, pero los reportes que ya la usan la conservan.

### `GET /api/perfiles-movilidad`
Los perfiles para calcular recorridos accesibles. Responde **200** con los perfiles **activos**, ordenados por nombre:

```json
{ "perfiles": [{ "id": 1, "nombre": "Silla de ruedas", "descripcion": "No puede subir cordones ni pasar por superficies rotas" }] }
```

## Reportes

### `POST /api/reportes`
Un vecino carga un reporte con una foto. Requiere sesión de `VECINO` (otro rol: 403 `SIN_PERMISO`).

Va como **`multipart/form-data`**, no como JSON, porque lleva un archivo. Todos los campos se mandan como texto:

| Campo | Obligatorio | Valor |
|---|---|---|
| `foto` | sí | Archivo JPG o PNG de hasta `FOTO_MAX_MB` (10 MB por defecto). Se reconoce por el contenido, no por la extensión. |
| `categoriaId` | sí | Id de una categoría activa (`GET /api/categorias`) |
| `severidadDeclarada` | sí | `LEVE`, `MODERADA` o `GRAVE` |
| `lat` / `lon` | sí | Grados decimales: `lat` entre -90 y 90, `lon` entre -180 y 180. Ejemplo: `-38.9516` / `-68.0591` |
| `origen` | sí | `APP_MOVIL` o `SITIO_WEB` |
| `descripcion` | no | Texto libre, hasta 1000 caracteres |
| `registradoEn` | no | Cuándo lo cargó el vecino, en ISO 8601 con zona (`2026-10-06T14:30:00-03:00`). Para la app sin señal: el reporte se guarda en el celular y se manda después. Si falta, se usa el momento de llegada. No puede ser futura. |
| `tomadaConCamaraApp` | no | `true` si la foto se sacó con la cámara de la app; `false` (por defecto) si se eligió de la galería |

Responde **201**:

```json
{ "id": 15, "incidenteId": 9, "nivelConfianza": 0, "estadoVerificacion": "PENDIENTE_REVISION" }
```

- La foto se guarda **tal cual llegó**, sin recomprimir: se conserva el EXIF para la verificación (corte 50 %).
- Por ahora cada reporte abre su propio incidente en estado `REGISTRADO`. La verificación automática y la agrupación de reportes cercanos llegan en el corte 50 %; hasta entonces `nivelConfianza` es 0 y `estadoVerificacion` es `PENDIENTE_REVISION`.
- Si algo falla, no queda nada a medias: ni un reporte sin foto ni una foto suelta.

| Status | Código | Cuándo |
|---|---|---|
| 400 | `DATOS_INVALIDOS` | Falta la foto o no es JPG/PNG, pesa de más, coordenadas fuera de rango, categoría inexistente o inactiva, o cualquier otro campo inválido. `detalles` los lista todos juntos |

Ejemplo con `curl`:

```bash
curl -X POST http://localhost:3000/api/reportes \
  -H "Authorization: Bearer <tokenAcceso>" \
  -F foto=@pozo.jpg -F categoriaId=1 -F severidadDeclarada=GRAVE \
  -F lat=-38.9516 -F lon=-68.0591 -F origen=SITIO_WEB
```

### `GET /api/fotos/:id`
Pública. Devuelve el archivo de la foto con su `Content-Type` (`image/jpeg` o `image/png`), idéntico al que se subió. Se puede usar directo en un `<img src="/api/fotos/7">`. Si no existe: **404** `FOTO_NO_ENCONTRADA`.

## Administración
Todas las rutas de `/api/admin` requieren sesión de `ADMINISTRADOR`. Sin sesión responden 401; con otro rol, 403 `SIN_PERMISO`.

### `GET /api/admin/organismos`
Lo que se puede elegir al dar de alta un operador. Responde **200** con los organismos activos y, dentro de cada uno, sus áreas activas, los dos ordenados por nombre:

```json
{ "organismos": [{ "id": 1, "nombre": "Municipalidad de Neuquén", "areas": [{ "id": 3, "nombre": "Bacheo" }] }] }
```

Un organismo activo sin áreas activas viene con `"areas": []`: sirve para un administrador, no para un operador.

### `POST /api/admin/usuarios`
Da de alta un operador o un administrador. Los vecinos no se crean acá: se registran solos.

```json
{ "email": "olga@ejemplo.com", "clave": "clave-inicial-1", "nombre": "Olga", "rol": "OPERADOR", "organismoId": 1, "areaId": 3 }
```

- `email`, `clave` y `nombre`: mismas reglas que en el registro. La clave es la inicial: el administrador se la pasa al operador, que después la puede cambiar con «Olvidé mi clave».
- `rol`: `OPERADOR` o `ADMINISTRADOR`.
- `organismoId` y `areaId`: obligatorios para un `OPERADOR`. El organismo y el área tienen que existir y estar activos, y el área tiene que ser de ese organismo.
- Para un `ADMINISTRADOR`, `organismoId` es opcional y `areaId` no se manda (o va en `null`): solo los operadores tienen área.

Responde **201** con `{ "usuario": { ... } }`. El correo queda confirmado, así que la cuenta puede ingresar enseguida.

| Status | Código | Cuándo |
|---|---|---|
| 400 | `DATOS_INVALIDOS` | Algún campo no cumple, el organismo o el área no existen o están inactivos, o el área es de otro organismo. `detalles` dice cuál |
| 409 | `EMAIL_EN_USO` | Ya hay una cuenta con ese correo |

### `GET /api/admin/usuarios`
Responde **200** con `{ "usuarios": [ { ... } ] }`: todos los usuarios que no están dados de baja, de cualquier rol, ordenados por nombre. Cada uno tiene la forma del [objeto `usuario`](#el-objeto-usuario).
