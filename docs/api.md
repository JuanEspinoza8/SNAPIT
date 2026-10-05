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
| 400 | Datos inválidos o JSON mal formado (`JSON_INVALIDO`) |
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

- Guarda los dos tokens: la app en almacenamiento seguro, la web en memoria o `sessionStorage`. Nunca en logs.
- Ante un 401 con `TOKEN_VENCIDO`, pide tokens nuevos **una vez** con `POST /api/auth/renovar`, guarda **los dos** que vuelven y reintenta. Si la renovación también falla, vuelve a la pantalla de ingreso.
- Ante cualquier otro 401 (`NO_AUTENTICADO`, `TOKEN_INVALIDO`), vuelve a la pantalla de ingreso.
- 403 (`SIN_PERMISO`) significa que la sesión es válida pero el rol no tiene permiso: no se renueva ni se reintenta.

| Código | Status | Cuándo |
|---|---|---|
| `NO_AUTENTICADO` | 401 | Falta el encabezado `Authorization: Bearer ...` |
| `TOKEN_VENCIDO` | 401 | El `tokenAcceso` pasó los 15 minutos: hay que renovar |
| `TOKEN_INVALIDO` | 401 | Token adulterado, mal formado o de una cuenta dada de baja |
| `SIN_PERMISO` | 403 | El rol no puede usar esa ruta |

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
Lo devuelven el registro, el ingreso, la renovación y `/yo`. Nunca incluye la clave.

```json
{ "id": 7, "email": "ana@ejemplo.com", "nombre": "Ana", "rol": "VECINO", "organismoId": null, "areaId": null }
```

`rol` es `VECINO`, `OPERADOR` o `ADMINISTRADOR`. `organismoId` y `areaId` solo vienen informados en operadores y administradores.

### `POST /api/auth/registro`
Crea una cuenta de vecino. Pública.

```json
{ "email": "ana@ejemplo.com", "clave": "una-clave-segura", "nombre": "Ana" }
```

- `email`: se guarda en minúsculas y sin espacios. Hasta 150 caracteres.
- `clave`: de 8 a 72 caracteres.
- `nombre`: de 1 a 120 caracteres.

Responde **201** con `{ "usuario": { ... } }`. La cuenta queda **sin confirmar**: no puede ingresar hasta confirmar el correo (#7). Mientras la #7 no esté, en desarrollo el token de confirmación aparece en la consola del servidor.

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
