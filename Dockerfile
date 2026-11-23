FROM oven/bun:1.2-alpine AS base
WORKDIR /app

COPY package.json bun.lockb* ./
RUN bun install --frozen-lockfile --production || bun install --production

COPY agent/ ./agent/
COPY src/ ./src/
COPY web/ ./web/
COPY modulo/ ./modulo/
COPY demo.ts tsconfig.json ./

ENV PORT=3000
ENV NODE_ENV=production

EXPOSE 3000

CMD ["bun", "run", "src/server.ts"]