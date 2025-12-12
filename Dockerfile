# Multi-stage build for optimized production image

# Stage 1: Build stage
FROM node:22-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies (including dev dependencies for build)
RUN npm ci

# Copy application code
COPY . .

# Build frontend assets
RUN cd client && npm ci && npm run build:optimize && cd ..

# Remove dev dependencies
RUN npm prune --production

# Stage 2: Production stage
FROM node:22-alpine

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Set working directory
WORKDIR /app

# Copy built application from builder
COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nodejs:nodejs /app/client/dist ./client/dist
COPY --from=builder --chown=nodejs:nodejs /app/package*.json ./
COPY --from=builder --chown=nodejs:nodejs /app/ecosystem.config.js ./
COPY --from=builder --chown=nodejs:nodejs /app/server.js ./
COPY --from=builder --chown=nodejs:nodejs /app/config ./config
COPY --from=builder --chown=nodejs:nodejs /app/models ./models
COPY --from=builder --chown=nodejs:nodejs /app/routes ./routes
COPY --from=builder --chown=nodejs:nodejs /app/middleware ./middleware
COPY --from=builder --chown=nodejs:nodejs /app/utils ./utils
COPY --from=builder --chown=nodejs:nodejs /app/controllers ./controllers
COPY --from=builder --chown=nodejs:nodejs /app/services ./services
COPY --from=builder --chown=nodejs:nodejs /app/constants ./constants

# Create directories for uploads and logs
RUN mkdir -p uploads logs && \
    chown -R nodejs:nodejs uploads logs

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 5000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:5000/api/v1/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start application with direct node (recommended for containerized environments like Render)
# PM2 is designed for VPS/bare metal, not PaaS containers
CMD ["node", "--max-old-space-size=512", "server.js"]
