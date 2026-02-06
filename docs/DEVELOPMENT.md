# Development Guide

This guide covers building, developing, and contributing to aMuTorrent.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Project Structure](#project-structure)
- [Development Setup](#development-setup)
- [Building](#building)
- [Architecture Overview](#architecture-overview)
- [Contributing](#contributing)

---

## Prerequisites

- **Node.js:** v18 or higher
- **npm:** v9 or higher
- **aMule:** Running instance with EC enabled (for testing)

---

## Project Structure

```
amutorrent/
├── server/                    # Backend (Node.js/Express)
│   ├── server.js              # Main entry point
│   ├── database.js            # SQLite database setup
│   ├── lib/                   # Utility libraries
│   │   ├── qbittorrent/       # qBittorrent API compatibility layer
│   │   ├── torznab/           # Torznab API handler
│   │   ├── logger.js          # Logging utility
│   │   └── ...                # Other utilities
│   ├── modules/               # Feature modules
│   │   ├── amuleManager.js    # aMule EC connection manager
│   │   ├── queuedAmuleClient.js # Queued aMule operations
│   │   ├── webSocketHandlers.js # WebSocket message handlers
│   │   ├── metricsAPI.js      # Historical metrics API
│   │   ├── historyAPI.js      # Download history API
│   │   ├── torznabAPI.js      # Torznab indexer routes
│   │   ├── qbittorrentAPI.js  # qBittorrent-compatible routes
│   │   ├── config.js          # Configuration management
│   │   └── ...                # Other modules
│   ├── middleware/            # Express middleware
│   ├── data/                  # Runtime data (SQLite, config)
│   └── logs/                  # Application logs
│
├── static/                    # Frontend (React)
│   ├── app.js                 # Application entry point
│   ├── index.html             # HTML template
│   ├── components/            # React components
│   │   ├── AppContent.js      # Main app component
│   │   ├── common/            # Shared components (Table, Icon, Button, etc.)
│   │   ├── views/             # Page views (Downloads, Search, Settings, etc.)
│   │   ├── modals/            # Modal dialogs
│   │   ├── layout/            # Layout components (Header, Sidebar, Footer)
│   │   ├── dashboard/         # Dashboard widgets
│   │   └── settings/          # Settings-specific components
│   ├── contexts/              # React contexts (Auth, Theme, WebSocket)
│   ├── hooks/                 # Custom React hooks
│   ├── utils/                 # Utility functions
│   └── dist/                  # Built JavaScript bundle
│
├── src/                       # Source files
│   └── input.css              # Tailwind CSS input
│
├── docs/                      # Documentation
├── build.mjs                  # Frontend build script (esbuild)
├── tailwind.config.js         # Tailwind configuration
├── package.json               # Frontend dependencies
└── Dockerfile                 # Docker build configuration
```

---

## Development Setup

### 1. Clone the Repository

```bash
git clone https://github.com/got3nks/amutorrent.git
cd amutorrent
```

### 2. Install Dependencies

```bash
# Install frontend dependencies
npm install

# Install server dependencies
cd server && npm install && cd ..
```

### 3. Start Development Mode

Open two terminals:

**Terminal 1 - Frontend (CSS + JS watching):**
```bash
npm run watch
```

**Terminal 2 - Server with auto-reload:**
```bash
# Run from project root (not from server directory)
npx --prefix ./server/ nodemon server/server.js
```

### 4. Access the Application

Open `http://localhost:4000` in your browser.

---

## Building

### Production Build

```bash
# Build CSS and JavaScript
npm run build

# Start server (run from project root)
node server/server.js
```

### Individual Build Commands

```bash
# Build Tailwind CSS only
npm run build:css

# Build JavaScript bundle only
npm run build:js

# Watch CSS changes
npm run watch:css

# Watch JavaScript changes
npm run watch:js
```

### Docker Build

```bash
# Build Docker image
docker build -t amutorrent .

# Run container
docker run -p 4000:4000 amutorrent
```

---

## Architecture Overview

### Backend

The server uses a modular architecture where each feature is encapsulated in its own module:

- **Express.js** serves the REST API and static files
- **WebSocket (ws)** provides real-time updates to clients
- **SQLite (better-sqlite3)** stores metrics, history, and configuration
- **amule-ec-node** handles communication with aMule via EC protocol

**Request Flow:**
1. HTTP requests → Express routes → Module handlers
2. WebSocket messages → webSocketHandlers.js → Module operations
3. Background tasks → arrManager.js, autoRefreshManager.js

### Frontend

The frontend is built with React using `createElement` syntax (no JSX) for simplicity:

```javascript
import React from 'https://esm.sh/react@18.2.0';
const { createElement: h } = React;

// Components use h() instead of JSX
const MyComponent = () => {
  return h('div', { className: 'container' },
    h('h1', null, 'Title'),
    h('p', null, 'Content')
  );
};
```

**Key Patterns:**
- **Contexts** provide global state (Auth, Theme, WebSocket, Data)
- **Hooks** encapsulate reusable logic
- **Table component** handles both desktop and mobile views with `mobileCardRender`

### Build System

The frontend build uses:
- **esbuild** for JavaScript bundling (fast, handles esm.sh imports)
- **Tailwind CSS** for styling

---

## Contributing

### Code Style

- Use ES6+ features
- Follow existing patterns in the codebase
- Use meaningful variable and function names
- Keep functions focused and small

### Component Guidelines

**React Components:**
- Use function components with hooks
- Use `createElement` syntax, not JSX
- Memoize callbacks with `useCallback` when passed as props
- Use `useMemo` for expensive computations

**Server Modules:**
- Extend `BaseModule` for consistent initialization
- Use the logger utility for consistent logging
- Handle errors gracefully and return appropriate HTTP status codes

### Testing Changes

Before submitting:
1. Test the feature manually in both desktop and mobile views
2. Verify dark mode works correctly
3. Check browser console for errors
4. Test with aMule disconnected to ensure graceful handling

### Pull Request Process

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Make your changes
4. Test thoroughly
5. Commit with descriptive messages
6. Push and create a Pull Request

---

## Useful Commands

```bash
# View server logs
tail -f server/logs/server.log

# Reset configuration (start fresh)
rm server/data/config.json

# Clear metrics database
rm server/data/metrics.db
```

---

## Debugging

### Server-side

Enable verbose logging:
```bash
DEBUG=* node server/server.js
```

Or check the log files:
```bash
tail -f server/logs/server.log
```

### Client-side

- Open browser DevTools (F12)
- Check Console for errors
- Use Network tab to inspect WebSocket messages
- React DevTools extension helps debug component state

### Common Issues

**"Cannot connect to aMule"**
- Verify aMule EC is enabled and the password is correct
- Check if the port is accessible

**"Module not found" during build**
- Run `npm install` in both root and `server/` directories

**CSS changes not appearing**
- Ensure `npm run watch:css` is running
- Check for Tailwind class typos

