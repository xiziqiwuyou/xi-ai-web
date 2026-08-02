FROM node:24-alpine AS build

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:24-alpine

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8787
ENV DATA_DIR=/app/data

COPY package*.json ./
RUN npm ci --omit=dev \
  && npm cache clean --force \
  && mkdir -p /app/data \
  && chown -R node:node /app
COPY --chown=node:node --from=build /app/dist ./dist
COPY --chown=node:node server ./server
COPY --chown=node:node README.md ./README.md

EXPOSE 8787
VOLUME ["/app/data"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:8787/api/ready').then((response) => { if (!response.ok) process.exit(1); return response.json(); }).then((payload) => process.exit(payload.ready ? 0 : 1)).catch(() => process.exit(1));"
USER node
CMD ["node", "server/index.mjs", "--production"]
