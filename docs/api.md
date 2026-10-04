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
Las rutas las implementa la #6. La convención para los clientes:

- Las rutas que piden sesión esperan el encabezado `Authorization: Bearer <tokenAcceso>`.
- El `tokenAcceso` dura 15 minutos. Ante un 401, el cliente pide tokens nuevos **una vez** con `POST /api/auth/renovar` (`{ tokenRenovacion }`) y reintenta. Si la renovación también falla, vuelve a la pantalla de ingreso.
- 403 significa que la sesión es válida pero el rol no tiene permiso: no se renueva ni se reintenta.

## Endpoints

### `GET /api/salud`
Indica si el servidor está activo y si llega a la base de datos. Siempre responde 200.

```json
{ "estado": "ok", "baseDeDatos": "ok" }
```

`baseDeDatos` vale `"error"` si la base no responde.
