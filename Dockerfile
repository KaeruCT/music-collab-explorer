FROM denoland/deno:2.0.3 AS frontend

WORKDIR /app

COPY index.html tsconfig.app.json vite.config.* ./
COPY src ./src

RUN deno run -A npm:vite build

FROM denoland/deno:2.0.3 AS backend

WORKDIR /app

# Install curl for healthcheck
USER root
RUN apt-get update && apt-get install -y wget curl && rm -rf /var/lib/apt/lists/*

COPY deno.json deno.lock ./

COPY api ./api
COPY --from=frontend /app/dist ./dist
RUN deno cache --lock=deno.lock api/main.ts

RUN addgroup --system appgroup && adduser --system --ingroup appgroup appuser
USER appuser

CMD ["deno", "task", "start"]

