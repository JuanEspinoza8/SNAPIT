# API de SnapIt — convenciones

## Base
- Todas las rutas empiezan con `/api`. Ejemplo: `GET /api/salud`.
- Las peticiones y respuestas son JSON (`Content-Type: application/json`), con un límite de 1 MB por cuerpo.
- Los nombres de campos van en camelCase (`baseDeDatos`, `fechaAlta`).

## Errores
Todas las respuestas de error tienen el mismo formato:

```json
{ "error": { "codigo": "RUTA_NO_ENCONTRADA", "mensaje": "No existe GET /api/xyz" } }
```

- `codigo`: identificador fijo en MAYÚSCULAS, para que los clientes decidan qué hacer.
- `mensaje`: texto en castellano que se le puede mostrar al usuario.

| Status | Cuándo |
|---|---|
| 400 | Datos inválidos o JSON mal formado (`JSON_INVALIDO`) |
| 401 | Falta autenticación o el token no es válido |
| 403 | Autenticado, pero sin permiso para la acción |
| 404 | Ruta o recurso inexistente (`RUTA_NO_ENCONTRADA`) |
| 409 | Conflicto, por ejemplo un correo ya registrado |
| 500 | Error inesperado (`ERROR_INTERNO`): nunca incluye detalles internos |

En el servidor, los errores esperados se lanzan con `throw new ErrorApp(status, codigo, mensaje)`.

## Seguimiento de peticiones
Cada respuesta incluye el encabezado `X-Request-Id`. Si el cliente manda uno, se respeta; si no, se genera. Al reportar un error, conviene pasar ese id: es el que se busca en los logs del servidor.

## Autenticación
Se define en la #6.

## Endpoints

### `GET /api/salud`
Indica si el servidor está activo y si llega a la base de datos. Siempre responde 200.

```json
{ "estado": "ok", "baseDeDatos": "ok" }
```

`baseDeDatos` vale `"error"` si la base no responde.
