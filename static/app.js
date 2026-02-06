/**
 * aMuTorrent - Main Application Entry Point
 *
 * Minimal bootstrap that sets up React with context providers
 */

import React from 'https://esm.sh/react@18.2.0';
import ReactDOM from 'https://esm.sh/react-dom@18.2.0/client';
import { AppProviders } from './contexts/AppProviders.js';
import { AppContent } from './components/AppContent.js';

const { createElement: h } = React;

// Mount the app
const root = ReactDOM.createRoot(document.getElementById('app'));
root.render(
  h(AppProviders, null,
    h(AppContent)
  )
);
