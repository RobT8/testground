import { createReadStream, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import {
  defineConfig,
  type Plugin,
  type PreviewServer,
  type ViteDevServer,
} from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Serve sql.js's wasm to jeep-sqlite during web development.
 *
 * jeep-sqlite backs the browser-only SQLite store and fetches the binary from
 * /assets/sql-wasm.wasm. Android uses the native plugin and never reads it, so
 * serving it from node_modules keeps ~650KB of dead weight out of the APK
 * instead of dropping it in public/.
 */
function sqlWasmPlugin(): Plugin {
  const require = createRequire(import.meta.url);
  // sql.js is pinned exactly: jeep-sqlite inlines its own copy of the sql.js
  // JS glue, and a wasm from a newer sql.js fails to link against it (1.14.x
  // aborts with a LinkError). Bump this only after checking the app still
  // boots in a browser.
  const wasmPath = require.resolve('sql.js/dist/sql-wasm.wasm');

  const serve = (server: ViteDevServer | PreviewServer) => {
    server.middlewares.use('/assets/sql-wasm.wasm', (_req, res) => {
      res.setHeader('Content-Type', 'application/wasm');
      createReadStream(wasmPath).pipe(res);
    });
  };

  return {
    name: 'kidrota:sql-wasm',
    configureServer: serve,
    configurePreviewServer: serve,
  };
}

const { version } = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf8'),
) as { version: string };

export default defineConfig({
  plugins: [react(), sqlWasmPlugin()],
  define: {
    // Settings shows this; package.json stays the single source of truth.
    __APP_VERSION__: JSON.stringify(version),
  },
});
