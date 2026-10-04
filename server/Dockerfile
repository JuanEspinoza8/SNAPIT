FROM node:22-slim AS base
# Prisma necesita OpenSSL para conectarse a la base.
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# Etapa de compilación: instala todo, compila y después borra lo de desarrollo.
FROM base AS build
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

# Imagen final: el código compilado, las dependencias de ejecución y las migraciones.
FROM base
ENV NODE_ENV=production
COPY --from=build /app/package.json /app/prisma.config.ts ./
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
USER node
EXPOSE 3000
# Antes de arrancar aplica las migraciones pendientes (si no hay, no hace nada).
# El exec deja a node como proceso principal, para que reciba el SIGTERM de docker stop.
CMD ["sh", "-c", "./node_modules/.bin/prisma migrate deploy && exec node dist/index.js"]
