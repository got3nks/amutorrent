FROM node:22-alpine AS builder

# Build frontend (Tailwind CSS + JS bundle)
WORKDIR /build
COPY package.json tailwind.config.js build.mjs ./
COPY src ./src
COPY static ./static
RUN npm install
RUN npm run build

FROM node:22-alpine

# Install runtime dependencies + Apprise
RUN apk add --no-cache git bash curl python3 py3-pip jq && \
    pip3 install --no-cache-dir --break-system-packages apprise

# Create app directory
WORKDIR /usr/src/app

# Install app dependencies (only re-runs when package.json changes)
# Build tools needed for better-sqlite3 native addon, removed after
COPY server/package.json ./server/
RUN apk add --no-cache --virtual .build-deps make g++ python3 && \
    npm install --prefix server --omit=dev && \
    apk del .build-deps

# Copy server source code (changes here don't invalidate npm install cache)
COPY server/server.js ./server/
COPY server/database.js ./server/
COPY server/lib ./server/lib
COPY server/middleware ./server/middleware
COPY server/modules ./server/modules

# Copy static assets (HTML, images, icons, manifest - no source JS)
COPY static/index.html ./static/
COPY static/*.png static/*.ico static/*.svg static/site.webmanifest ./static/
COPY static/service-icons ./static/service-icons
COPY static/flags ./static/flags

# Copy built assets from builder stage (CSS + JS bundle)
COPY --from=builder /build/static/output.css ./static/output.css
COPY --from=builder /build/static/dist ./static/dist

# Copy changelog for version info
COPY CHANGELOG.md ./

# Copy user scripts directory (custom event scripts)
COPY scripts ./scripts

# Create logs and data directories with proper permissions
# Make user scripts executable
RUN mkdir -p server/logs server/data && \
    chmod -R 777 server/logs server/data && \
    chmod +x scripts/*.sh

# Set Docker environment variable for UI warnings
ENV RUNNING_IN_DOCKER=true

# Expose port
EXPOSE 4000

# Start the application
# Set NODE_INSPECT=true to enable remote debugging on port 9229
CMD [ "sh", "-c", "if [ \"$NODE_INSPECT\" = 'true' ]; then exec node --inspect=0.0.0.0:9229 server/server.js; else exec node server/server.js; fi" ]