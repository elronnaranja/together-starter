# Together: one small Bun server with a SQLite file on a volume mounted at /data.
FROM oven/bun:1.4.4
WORKDIR /app
COPY . .
RUN bun scripts/build.mjs && bun scripts/build-railway.mjs
ENV DATA_DIR=/data
CMD ["bun", "dist/server.ts"]
