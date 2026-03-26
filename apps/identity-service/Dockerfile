FROM node:20-alpine

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
ENV NODE_ENV=production

RUN corepack enable

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY packages ./packages
COPY apps/identity-service ./apps/identity-service

RUN pnpm install --frozen-lockfile --filter @wford26/accounting-identity-service...
RUN pnpm --filter @wford26/accounting-identity-service prisma:generate
RUN pnpm --filter @wford26/accounting-identity-service build

EXPOSE 3001

CMD ["pnpm", "--filter", "@wford26/accounting-identity-service", "exec", "tsx", "src/main.ts"]

