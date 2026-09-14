# Simple Dockerfile for Code Review Challenge Platform
FROM node:18-alpine

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies
RUN npm ci --no-audit --no-fund && \
    npm cache clean --force

# Copy application code
COPY . .

# Generate Prisma client
RUN npx prisma generate

# Build Next.js application only
RUN npm run build:next

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Set environment variables
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV NEXT_PUBLIC_SOCKET_URL="http://localhost:4001"

# DATABASE_URL, DIRECT_URL, ADMIN_PASSWORD, and ADMIN_SESSION_SECRET are NOT baked into
# the image. They must be supplied at `docker run` time (-e DATABASE_URL=..., etc.) so
# every deployment gets its own database and its own secrets instead of sharing the ones
# baked into this publicly-distributed image. DIRECT_URL is required — the startup
# command below runs `prisma migrate deploy`, which needs a direct (non-pooled)
# connection. See .env.local.example.

# Switch to non-root user
USER nextjs

# Expose ports
EXPOSE 3000
EXPOSE 4001

# Use dumb-init as PID 1
ENTRYPOINT ["dumb-init", "--"]

# Apply committed migrations (no interactive prompts, no schema diffing) and start
CMD ["sh", "-c", "npx prisma migrate deploy && npm run start:prod"]
