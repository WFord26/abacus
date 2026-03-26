FROM node:20-alpine

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
ENV NODE_ENV=production

RUN corepack enable

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY packages ./packages
COPY apps/reporting-service ./apps/reporting-service

RUN pnpm install --frozen-lockfile --filter @wford26/accounting-reporting-service...
RUN pnpm --filter @wford26/accounting-reporting-service prisma:generate
RUN pnpm --filter @wford26/accounting-reporting-service build

EXPOSE 3003

CMD ["pnpm", "--filter", "@wford26/accounting-reporting-service", "exec", "tsx", "src/main.ts"]

