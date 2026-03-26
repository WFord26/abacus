FROM node:20-alpine

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
ENV NODE_ENV=production

RUN corepack enable

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY packages ./packages
COPY apps/api-gateway ./apps/api-gateway

RUN pnpm install --frozen-lockfile --filter @wford26/accounting-api-gateway...
RUN pnpm --filter @wford26/accounting-api-gateway build

EXPOSE 3000

CMD ["pnpm", "--filter", "@wford26/accounting-api-gateway", "exec", "tsx", "src/main.ts"]
