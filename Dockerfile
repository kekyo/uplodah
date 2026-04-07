# Stage 1: Install runtime dependencies for the prebuilt application
FROM node:20-alpine AS builder

WORKDIR /app

RUN addgroup -g 1001 -S nodejs && \
    adduser -S uplodah -u 1001 -G nodejs

COPY package*.json ./

# npm 10 on node:20-alpine rejects the current lockfile because of dev-only peer metadata.
RUN npm install -g npm@11.6.2 && \
    npm ci --omit=dev && \
    npm cache clean --force && \
    rm -rf /tmp/*

COPY dist ./dist

# Stage 2: Runtime image with only the required files
FROM node:20-alpine AS runtime

WORKDIR /app

RUN addgroup -g 1001 -S nodejs && \
    adduser -S uplodah -u 1001 -G nodejs

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist

RUN mkdir -p /storage /data && \
    chown -R uplodah:nodejs /app && \
    chown -R uplodah:nodejs /storage && \
    chown -R uplodah:nodejs /data

USER uplodah

EXPOSE 5968

#HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
#  CMD wget --no-verbose --tries=1 --spider http://localhost:5968/health || exit 1

VOLUME ["/storage", "/data"]

CMD ["node", "dist/cli.mjs", "--config-file", "/data/config.json", "--storage-dir", "/storage"]
