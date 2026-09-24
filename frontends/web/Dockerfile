# Nabz website (Next.js, standalone server). Build context = repository root:
#   docker build -f frontends/web/Dockerfile --build-arg API_ORIGIN=https://<api-host> .
ARG NODE_IMAGE=node:22-alpine

FROM ${NODE_IMAGE} AS build
WORKDIR /repo
COPY frontends/shared ./frontends/shared
COPY frontends/web/package.json frontends/web/package-lock.json ./frontends/web/
RUN cd frontends/web && npm ci --no-audit --no-fund
COPY frontends/web ./frontends/web
# API origin the site proxies /api/* to; the browser only talks to this site.
ARG API_ORIGIN
ENV API_ORIGIN=${API_ORIGIN} \
    NEXT_PUBLIC_API_BASE_URL= \
    NEXT_TELEMETRY_DISABLED=1
RUN cd frontends/web && npm run build

FROM ${NODE_IMAGE}
RUN apk upgrade --no-cache && rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 NEXT_TELEMETRY_DISABLED=1
COPY --from=build --chown=node:node /repo/frontends/web/.next/standalone ./
COPY --from=build --chown=node:node /repo/frontends/web/.next/static ./.next/static
COPY --from=build --chown=node:node /repo/frontends/web/public ./public
USER node
EXPOSE 3000
# Platforms such as App Runner set HOSTNAME to the instance name, which makes Next
# listen on that interface only and fail health checks: always bind all interfaces.
CMD ["/bin/sh", "-c", "HOSTNAME=0.0.0.0 exec node server.js"]
