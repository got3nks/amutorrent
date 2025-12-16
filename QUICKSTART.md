# Quick Start Guide

Get up and running with aMule Web Controller in under 3 minutes!

## 🚀 Fastest Setup (Docker)

### Prerequisites
- Docker and Docker Compose installed
- aMule with EC enabled

### Steps

1. **Pull the image**
```bash
docker pull g0t3nks/amule-web-controller:latest
```

2. **Create a `docker-compose.yml` file**
```yaml
version: '3.8'

services:
  amule-web:
    image: g0t3nks/amule-web-controller:latest
    user: "1000:1000"
    container_name: amule-web-controller
    ports:
      - "${PORT:-4000}:${PORT:-4000}"
    environment:
      - NODE_ENV=${NODE_ENV:-production}
      - PORT=${PORT:-4000}
      - AMULE_HOST=${AMULE_HOST:-host.docker.internal}
      - AMULE_PORT=${AMULE_PORT:-4712}
      - AMULE_PASSWORD=${AMULE_PASSWORD:-admin}
    extra_hosts:
      - "host.docker.internal:host-gateway"
    volumes:
      - ./logs:/usr/src/app/server/logs
      - ./data:/usr/src/app/server/data
    restart: unless-stopped
```

3. **Create a `.env` file** (optional, for easier configuration)
```env
PORT=4000
AMULE_HOST=host.docker.internal  # Use this for aMule running on host
AMULE_PORT=4712
AMULE_PASSWORD=your_ec_password
```

4. **Start the container**
```bash
docker-compose up -d
```
5. **Access**
The web app will be up and running at: http://localhost:4000

Done! 🎉

## 🔧 Native Setup (No Docker)

**Prerequisites:** Node.js 18+, npm, git

```bash
git clone https://github.com/got3nks/amule-web-controller.git
cd amule-web-controller

# Install server dependencies (requires git)
cd server && npm install && cd ..

# Build frontend
npm install && npm run build:css

# Set environment
export AMULE_HOST=127.0.0.1
export AMULE_PORT=4712
export AMULE_PASSWORD=your_password
export PORT=4000

# Start
node server/server.js
```

Access at http://localhost:4000

## ❓ Troubleshooting

- Read the full [README.md](README.md)
