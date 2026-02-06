/**
 * Frontend Build Script
 *
 * Bundles all frontend JavaScript into a single file using esbuild.
 * Maps esm.sh imports to local npm packages for offline capability.
 *
 * Usage:
 *   npm run build        - Production build (minified)
 *   npm run build:watch  - Development mode with file watching
 */

import * as esbuild from 'esbuild';
import { existsSync, mkdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const staticDir = path.join(__dirname, 'static');
const distDir = path.join(staticDir, 'dist');

// Ensure dist directory exists
if (!existsSync(distDir)) {
  mkdirSync(distDir, { recursive: true });
}

// Check for watch mode and profiling mode
const isWatch = process.argv.includes('--watch');
const isProfiling = process.argv.includes('--profile');

// Plugin to rewrite esm.sh imports to npm packages
const esmShPlugin = {
  name: 'esm-sh-rewrite',
  setup(build) {
    // Intercept esm.sh URLs and redirect to npm packages
    build.onResolve({ filter: /^https:\/\/esm\.sh\// }, (args) => {
      const url = args.path;

      try {
        // Map esm.sh URLs to npm packages using require.resolve
        if (url === 'https://esm.sh/react@18.2.0') {
          return { path: require.resolve('react') };
        }
        if (url === 'https://esm.sh/react-dom@18.2.0') {
          return { path: require.resolve('react-dom') };
        }
        if (url === 'https://esm.sh/react-dom@18.2.0/client') {
          return { path: require.resolve('react-dom/client') };
        }
      } catch (e) {
        console.error(`[esbuild] Failed to resolve package for: ${url}`, e.message);
      }

      // Fallback: mark as external (will still load from CDN)
      console.warn(`[esbuild] Unknown esm.sh import: ${url}`);
      return { path: url, external: true };
    });
  }
};

// esbuild configuration
const buildOptions = {
  entryPoints: [path.join(staticDir, 'app.js')],
  bundle: true,
  outfile: path.join(distDir, 'app.bundle.js'),
  format: 'esm',
  target: ['es2020', 'chrome80', 'firefox80', 'safari14'],

  // Use plugin to rewrite esm.sh imports
  plugins: [esmShPlugin],

  // Production optimizations (disable minification for watch and profiling)
  minify: !isWatch && !isProfiling,
  sourcemap: true,

  // Tree shaking
  treeShaking: true,

  // Define production mode for React (use development for watch or profiling)
  define: {
    'process.env.NODE_ENV': (isWatch || isProfiling) ? '"development"' : '"production"'
  },

  // Log level
  logLevel: 'info',
};

async function build() {
  try {
    if (isWatch) {
      // Watch mode for development
      const ctx = await esbuild.context(buildOptions);
      await ctx.watch();
      console.log('\n[esbuild] Watching for changes...\n');
    } else {
      // Single build for production
      await esbuild.build(buildOptions);

      // Report bundle size
      const fs = await import('fs');
      const stats = fs.statSync(buildOptions.outfile);
      const sizeKB = (stats.size / 1024).toFixed(2);
      console.log(`\n[esbuild] Bundle created: ${sizeKB} KB\n`);
    }
  } catch (error) {
    console.error('[esbuild] Build failed:', error);
    process.exit(1);
  }
}

build();
