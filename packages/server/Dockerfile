# CollabText WebSocket relay server
FROM node:20-alpine AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.6.0 --activate
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY packages/crdt/package.json packages/crdt/
COPY packages/server/package.json packages/server/
COPY packages/client/package.json packages/client/
RUN pnpm install --frozen-lockfile --filter @collabtext/server...
COPY packages/crdt packages/crdt
COPY packages/server packages/server
RUN pnpm --filter @collabtext/crdt build && pnpm --filter @collabtext/server build

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080
RUN corepack enable && corepack prepare pnpm@9.6.0 --activate
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/crdt/package.json packages/crdt/
COPY packages/server/package.json packages/server/
COPY packages/client/package.json packages/client/
RUN pnpm install --frozen-lockfile --filter @collabtext/server... --prod
COPY --from=build /app/packages/crdt/dist packages/crdt/dist
COPY --from=build /app/packages/server/dist packages/server/dist
EXPOSE 8080
CMD ["node", "packages/server/dist/index.js"]
