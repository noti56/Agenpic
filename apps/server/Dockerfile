# Build context is the repo root (see docker-compose.yml) so this can pull
# in workspace-linked packages like @agenpic/logger. Single-stage, full
# workspace install: this is an internal dev tool, not a size-optimized
# production deploy, and pnpm's --filter flag doesn't reliably pull
# devDependencies for a filtered package's own build step, so a plain
# full install is simpler and more reliable than trying to slim it down.
FROM node:20-alpine
WORKDIR /repo
RUN corepack enable

COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @agenpic/logger build && pnpm --filter @agenpic/server build

WORKDIR /repo/apps/server
ENV NODE_ENV=production
EXPOSE 4001
CMD ["node", "dist/index.js"]
