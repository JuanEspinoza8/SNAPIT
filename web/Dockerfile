FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# Imagen final: los archivos compilados servidos por nginx.
FROM nginx:1.29-alpine
# nginx reenvía /api al servidor: la API no habilita CORS (docs/api.md).
# El valor sale de la variable, por si la red o el nombre del servicio cambian.
ENV API_UPSTREAM=http://server:3000
COPY nginx.conf /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
