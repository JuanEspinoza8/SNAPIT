# SnapIt
Reportes ciudadanos sobre la vía pública con verificación, priorización de incidentes y recorridos peatonales accesibles. Trabajo Final — TUDW, FaI UNCo 2026.

## Estructura

| Carpeta   | Contenido                                                       |
|-----------|-----------------------------------------------------------------|
| `server/` | API (Express + TypeScript + Prisma)                             |
| `web/`    | Panel web (React + Tailwind)                                    |
| `mobile/` | App (Flutter)                                                   |
| `db/`     | `schema.sql` y `DICCIONARIO.md` de la entrega del 19/09 (congelados) |
| `docs/`   | Documentación del proyecto                                      |

## Levantar la base de datos

Requisitos: [Docker Desktop](https://www.docker.com/products/docker-desktop/).

1. Copiar las variables de entorno:
   ```bash
   cp .env.example .env
   ```
   Completar `JWT_SECRET`, que viene vacío: el comando para generarlo está en el mismo archivo. Sin ese valor, `docker compose` no levanta ni la base.

   Si cambiás la clave, el usuario, la base o el puerto, cambialos también en `DATABASE_URL` y `TEST_DATABASE_URL`, que los repiten. La clave se fija la primera vez que se crea la base: si ya la levantaste, cambiarla en `.env` no alcanza y hay que empezar de cero con `docker compose down -v` (se borran los datos).
2. Levantar la base:
   ```bash
   docker compose up -d db
   ```
3. Esperar a que figure `(healthy)`:
   ```bash
   docker compose ps
   ```
4. Verificar PostGIS y pgRouting. La imagen los trae instalados, pero las extensiones las activa la migración inicial (`npx prisma migrate deploy` o el contenedor del servidor al arrancar, ver [Servidor](#servidor-server)). Después de correrla:
   ```bash
   docker compose exec db psql -U snapit -d snapit -c "SELECT postgis_version(), pgr_version();"
   ```
   Para probar la base sola, antes de la migración, se pueden activar a mano:
   ```bash
   docker compose exec db psql -U snapit -d snapit -c "CREATE EXTENSION IF NOT EXISTS postgis; CREATE EXTENSION IF NOT EXISTS pgrouting;"
   ```
   Los comandos usan el usuario y la base de `.env.example`; si los cambiaste, reemplazalos.

La base usa la imagen `pgrouting/pgrouting:16-3.5-3.8` (PostgreSQL 16 + PostGIS 3.5 + pgRouting 3.8) y guarda los datos en el volumen `db_data`. Solo acepta conexiones desde la misma PC. Para borrarla y empezar de cero: `docker compose down -v`.

## Servidor (`server/`)

Requisitos: Node 22 (ver `.nvmrc`) y la base levantada.

```bash
cd server
npm install                 # también genera el cliente de Prisma
npx prisma migrate deploy   # crea las tablas en la base de desarrollo
npm run semilla             # catálogo, parámetros y usuarios de prueba
npm run dev                 # http://localhost:3000/api/salud
```

La semilla se puede correr las veces que haga falta: no duplica nada y vuelve a dejar los valores de [`docs/calculos.md`](docs/calculos.md), aunque se hayan cambiado a mano. Toma la base de `DATABASE_URL`.

Usuarios de prueba, todos con la misma clave, que la semilla muestra al terminar. Con `NODE_ENV=production` no se cargan: se cargan solo el catálogo y los parámetros.

| Rol | Correo |
|---|---|
| Administrador | `admin@snapit.test` |
| Operador de Bacheo | `bacheo@snapit.test` |
| Operadora de Veredas | `veredas@snapit.test` |
| Vecinos | `vecino1@snapit.test`, `vecino2@snapit.test`, `vecino3@snapit.test` |

> **Nunca uses `prisma migrate dev` ni `prisma db push`.** El modelo está congelado y la única migración es `0_init`, que es `db/schema.sql` tal cual. `schema.prisma` no puede expresar los índices GIST ni los nombres de las restricciones, así que esos comandos generan una migración que borra los índices espaciales y renombra las claves del modelo entregado. Para aplicar migraciones, solo `prisma migrate deploy`.

| Script | Qué hace |
|---|---|
| `npm run dev` | Servidor con recarga automática |
| `npm run semilla` | Carga o restaura el catálogo, los parámetros y los usuarios de prueba (estos, fuera de producción) |
| `npm test` | Tests con Vitest contra la base `snapit_test` (se crea sola) |
| `npm run lint` | ESLint |
| `npm run format` | Formatea con Prettier |
| `npm run build` / `npm start` | Compila a `dist/` y lo ejecuta |

Para levantar el servidor en Docker junto con la base: `docker compose up -d --build`. Al arrancar, el contenedor aplica las migraciones pendientes, así que no hace falta Node en la PC. El contenedor y `npm run dev` usan el mismo puerto: si uno está levantado, el otro no arranca y avisa que el puerto está ocupado.

La semilla también se corre dentro del contenedor. Como corre con `NODE_ENV=production`, carga el catálogo y los parámetros sin los usuarios de prueba; para sumarlos en desarrollo, agregá `-e NODE_ENV=development`:

```bash
docker compose exec server node dist/semilla/index.js
docker compose exec -e NODE_ENV=development server node dist/semilla/index.js
```

### Correos en desarrollo

Los correos de confirmación y de recuperación de clave van a [Mailpit](https://mailpit.axllent.org/), que los atrapa sin mandarlos a ninguna casilla real. Se levanta solo con `docker compose up -d --build`; para usarlo con `npm run dev`:

```bash
docker compose up -d mailpit
```

Los correos se ven en http://localhost:8025. Si tu `.env` es anterior a la #7, copiale el bloque «Correos» de `.env.example`: sin esas variables el servidor no arranca y `docker compose` no levanta.

### Estructura

```
src/
  config/        env (validado con zod) y logger
  compartido/    prisma, errores, correo y middlewares comunes
  semilla/       datos iniciales (npm run semilla)
  modulos/
    <modulo>/
      rutas.ts        endpoints y validación de la entrada
      controlador.ts  traduce la petición HTTP a llamadas al servicio
      servicio.ts     reglas de negocio
      repositorio.ts  acceso a la base (Prisma / SQL)
      calculo.ts      funciones puras (puntajes, distancias), fáciles de testear
```

Cada módulo crea solo los archivos que necesita. Las convenciones de la API están en [`docs/api.md`](docs/api.md).

## Panel web (`web/`)

Requisitos: Node 22 (ver `.nvmrc`). En desarrollo la web llama a `/api` y el proxy de Vite la lleva al servidor, así que este tiene que estar levantado también.

```bash
cd web
npm install
npm run dev                 # http://localhost:5173
```

El servidor no habilita CORS (ver [`docs/api.md`](docs/api.md)): la web siempre habla con la API por el mismo origen, en desarrollo a través del proxy de Vite y en la demo a través de nginx.

| Script | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo con recarga automática |
| `npm test` | Tests con Vitest y Testing Library |
| `npm run lint` | ESLint |
| `npm run format` | Formatea con Prettier |
| `npm run build` | Compila a `dist/` |

### Variables

Van en `web/.env` (no se versiona). La única pantalla de esta base es la de salud, que consume `GET /api/salud` real o simulada según la variable:

| Variable | Qué hace |
|---|---|
| `VITE_API_URL` | URL de la API, terminada en `/api`. Por defecto `/api`, que en desarrollo usa el proxy de Vite y en la demo nginx. |
| `VITE_MSW=1` | Simula la API con MSW (`src/compartido/red/mocks`) mientras el servidor no tenga los endpoints. Sin la variable, se llama al servidor real. Solo funciona con `npm run dev`: el build de producción la ignora. |

El worker de MSW (`public/mockServiceWorker.js`) está versionado. Si se actualiza MSW, se regenera con `npx msw init public`.

### Docker

```bash
docker build -t snapit-web ./web
```

La imagen final es nginx: sirve `dist/` y reenvía `/api` al servidor (por defecto `http://server:3000`; se cambia con `API_UPSTREAM` al correr el contenedor). Si el servidor no está, la web arranca igual y `/api` responde 502 hasta que aparezca.

### Estructura

```
src/
  config/        URL de la API y modo de simulación
  compartido/
    componentes/ layout con encabezado y pie, rutas y aviso de error
    red/         cliente (token, renovación de la sesión ante un 401, errores), contexto y mocks de MSW
    tema/        colores, tipografía y tamaños de texto del sistema de diseño (Tailwind v4)
  funcionalidades/
    <funcionalidad>/ pantallas y hooks de cada funcionalidad
```

## App (`mobile/`)

Requisitos: Flutter 3.44 o más nuevo (Dart 3.12) con el SDK de Android, y un emulador o un celular con depuración USB. El servidor tiene que estar levantado.

```bash
cd mobile
flutter pub get
flutter run                 # en el emulador, contra http://10.0.2.2:3000/api
```

La URL de la API se pasa al compilar, sin tocar código:

```bash
flutter run --dart-define=API_URL=http://192.168.0.10:3000/api
```

- Por defecto es `http://10.0.2.2:3000/api`: `10.0.2.2` es la PC vista desde el emulador de Android.
- En un celular conectado a la misma red va la IP de la PC. Si no responde, revisá que el firewall de Windows deje pasar el puerto 3000.
- Termina en `/api`, igual que `VITE_API_URL`.

| Comando | Qué hace |
|---|---|
| `flutter analyze` | Lint con `flutter_lints` |
| `flutter test` | Tests |
| `dart format lib test` | Formatea |

### Estructura

```
lib/
  config/            URL de la API (--dart-define)
  compartido/
    tema/            colores, textos y espaciado del sistema de diseño
    rutas/           go_router
    red/             cliente dio, token y renovación de la sesión, errores de la API
    sesion/          tokens en almacenamiento seguro, usuario y estado de la sesión
    errores/         aviso y recuadro con el mensaje del error
    formato/         fechas para mostrar y para la API
    mapa/            fondo de OpenStreetMap que usan todos los mapas
  funcionalidades/
    cuenta/          arranque, ingreso, registro y «Olvidé mi clave»
    principal/       pantalla con el menú según el rol
    mapa/            mapa público: agrupación, filtros, ficha y ubicación
    reportar/        cargar un reporte: borrador, foto, punto y envío
    <funcionalidad>/ pantallas, providers y repositorios de cada funcionalidad
```

### Sesión

- Al abrir, si hay una sesión guardada, la app pide `GET /auth/yo` y entra directo; si el acceso venció, el interceptor lo renueva antes. Si la renovación se rechaza, va al ingreso. Sin conexión, muestra el aviso y un botón para reintentar, sin pedir la clave.
- Si la renovación se rechaza mientras se usa la app, vuelve sola al ingreso.
- Confirmar el correo y elegir una clave nueva se hacen desde el enlace del correo, en la web. Hasta que la web tenga esas páginas (#9), para probar la app se confirma a mano con el token del enlace que llega a Mailpit (http://localhost:8025):
  ```bash
  curl -X POST http://localhost:3000/api/auth/confirmar-correo -H "Content-Type: application/json" -d '{"token":"<token del enlace>"}'
  ```

### Mapa

- Se ve sin sesión, con «Ver el mapa sin ingresar» desde el ingreso. Con sesión está en la pantalla principal.
- Usa `flutter_map` con las teselas de OpenStreetMap, así que necesita internet además del servidor.
- Al abrirlo pide la ubicación; Android deja elegir entre precisa y aproximada. Si se da el permiso se centra ahí (con la aproximada, Android la corre hasta un par de kilómetros); si no, en Neuquén. En el emulador, la ubicación se simula desde *Extended controls → Location*.

### Reportar

- Solo para vecinos, en la pestaña «Reportar». La foto se saca con la app de cámara del teléfono (SnapIt no pide el permiso de cámara) o se elige de la galería, y se manda el archivo original, sin achicar ni recomprimir, para conservar el EXIF.
- La ubicación es una lectura nueva del GPS, nunca la última conocida. Sin permiso o con la ubicación apagada no se puede enviar, y la pantalla dice qué hacer. «Mover el punto» abre un mapa donde el punto es el centro: se arrastra el mapa, no el pin.
- Lo cargado vive en un borrador (`reporteEnCursoProvider`) que se manda con `RepositorioReportes`. Si el envío falla, sigue en pantalla y el reintento manda la misma fecha de registro. Al salir de la cuenta, se descarta.
- En el emulador, la cámara muestra una escena virtual y la ubicación se fija en *Extended controls → Location* (o con `adb emu geo fix <lon> <lat>`).

### Gestión de estado: Riverpod

Elegimos Riverpod en lugar de Provider porque sus providers no dependen del árbol de widgets: el cliente HTTP, la sesión y las rutas se leen sin `BuildContext`, y en los tests cualquier pieza se reemplaza con `overrides`. Se usa sin generación de código. Riverpod reintenta por su cuenta los providers que fallan; en la app eso está apagado (`retry` en `main.dart`) para que el error se muestre y el usuario decida si reintentar.

## Cómo trabajamos

Ramas, commits y pull requests: ver [`CONTRIBUTING.md`](CONTRIBUTING.md).
