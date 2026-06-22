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
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY server ./server
COPY README.md ./README.md

EXPOSE 8787
VOLUME ["/app/data"]
CMD ["node", "server/index.mjs", "--production"]
