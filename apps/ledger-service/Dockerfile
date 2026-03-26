FROM node:20-alpine

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
ENV NODE_ENV=production

RUN corepack enable

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY packages ./packages
COPY apps/ledger-service ./apps/ledger-service

RUN pnpm install --frozen-lockfile --filter @wford26/accounting-ledger-service...
RUN pnpm --filter @wford26/accounting-ledger-service prisma:generate
RUN pnpm --filter @wford26/accounting-ledger-service build

EXPOSE 3002

CMD ["pnpm", "--filter", "@wford26/accounting-ledger-service", "exec", "tsx", "src/main.ts"]

