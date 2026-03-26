FROM node:20-alpine

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN corepack enable

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY packages ./packages
COPY apps/web ./apps/web

RUN pnpm install --frozen-lockfile --filter @wford26/accounting-web...
RUN pnpm --filter @wford26/accounting-web build

EXPOSE 3007

CMD ["pnpm", "--filter", "@wford26/accounting-web", "exec", "next", "start", "--hostname", "0.0.0.0", "--port", "3007"]
