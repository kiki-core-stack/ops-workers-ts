# Build stage
FROM oven/bun:slim AS build-stage

## Upgrade system packages
RUN apt-get update && \
    apt-get upgrade -y

## Configure build-time options and the environment
ARG NPM_CONFIG_REGISTRY
ENV NODE_ENV='production' \
    NPM_CONFIG_REGISTRY="${NPM_CONFIG_REGISTRY}"

WORKDIR /app

## Copy dependency manifests, manager configuration and install dependencies
COPY ./bun.lock ./bunfig.toml ./package.json ./
RUN --mount=id=bun-cache,target=/root/.bun/install/cache,type=cache \
    bun i --frozen-lockfile

## Copy application sources and build configuration
COPY ./.env.production.local ./.gitignore ./eslint.config.mjs ./tsconfig.json ./
COPY ./src ./src

## Validate and build the application
RUN bun run lint && \
    bun run typecheck && \
    bun run build

# Runtime stage
FROM oven/bun:slim

## Configure the runtime environment and working directory
ENV TZ='UTC'
WORKDIR /app

## Install runtime packages and configure the runtime user
RUN \
    ### Upgrade system packages and install runtime dependencies
    apt-get update && \
    apt-get upgrade -y && \
    apt-get install -y --no-install-recommends ca-certificates tini tzdata && \
    ### Configure the timezone
    ln -snf "/usr/share/zoneinfo/${TZ}" /etc/localtime && \
    echo "${TZ}" >/etc/timezone && \
    ### Clean package manager metadata
    apt-get autoremove -y --purge && \
    apt-get clean && \
    rm -rf /var/cache/apt/* /var/lib/apt/lists/* && \
    ### Create the runtime user and set application ownership
    useradd -mr -g nogroup -s /usr/sbin/nologin -u 10001 user && \
    chown 10001:nogroup /app -R

## Copy and configure the entrypoint
COPY --chmod=700 --chown=10001:nogroup ./docker-entrypoint.sh ./
USER 10001
ENTRYPOINT ["tini", "--"]
CMD ["./docker-entrypoint.sh"]

## Configure remaining runtime defaults
ENV NODE_ENV='production'

## Optionally install runtime packages that provide required executables
# Replace the placeholder package with the required package name(s) before uncommenting.
# COPY ./bunfig.toml ./
# RUN bun add example-package && \
#     rm -rf /root/.bun/install

## Copy the application output and runtime configuration
COPY --chown=10001:nogroup --from=build-stage /app/dist ./
COPY --chown=10001:nogroup ./.env.production.local ./.env
