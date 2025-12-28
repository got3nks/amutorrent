FROM node:18-alpine AS builder

# Build Tailwind CSS
WORKDIR /build
COPY package.json tailwind.config.js ./
COPY src ./src
COPY static ./static
RUN npm install
RUN npm run build:css

FROM node:18-alpine

# Install git (required for npm to install from GitHub)
RUN apk add --no-cache git

# Create app directory
WORKDIR /usr/src/app

# Install app dependencies
COPY server/package.json ./server/
COPY server/server.js ./server/
COPY server/database.js ./server/
COPY server/lib ./server/lib
COPY server/modules ./server/modules
RUN npm install --prefix server --omit=dev

# Copy static files
COPY static ./static/

# Copy built CSS from builder stage
COPY --from=builder /build/static/output.css ./static/output.css

# Create logs and data directories with proper permissions
RUN mkdir -p server/logs server/data && \
    chmod -R 777 server/logs server/data

# Set Docker environment variable for UI warnings
ENV RUNNING_IN_DOCKER=true

# Expose port
EXPOSE 4000

# Start the application
CMD [ "node", "server/server.js" ]