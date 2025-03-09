FROM denoland/deno:2.0.3 AS frontend

WORKDIR /app

COPY index.html package.json tsconfig.app.json vite.config.* ./
COPY src ./src

RUN deno run -A npm:vite build

FROM denoland/deno:2.0.3 AS backend

WORKDIR /app

COPY deno.json deno.lock package.json ./

COPY api ./api
RUN deno cache --lock=deno.lock api/main.ts

RUN addgroup --system appgroup && adduser --system --ingroup appgroup appuser
USER appuser

CMD ["deno", "task", "start"]

