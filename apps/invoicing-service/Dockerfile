FROM node:20-alpine

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
ENV NODE_ENV=production

RUN corepack enable

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY packages ./packages
COPY apps/invoicing-service ./apps/invoicing-service

RUN pnpm install --frozen-lockfile --filter @wford26/accounting-invoicing-service...
RUN pnpm --filter @wford26/accounting-invoicing-service prisma:generate
RUN pnpm --filter @wford26/accounting-invoicing-service build

EXPOSE 3006

CMD ["pnpm", "--filter", "@wford26/accounting-invoicing-service", "exec", "tsx", "src/main.ts"]

