import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import {defineConfig, type Plugin} from 'vite';

/**
 * Production-only Content-Security-Policy. The site loads nothing but its
 * own bundle and media, plus Google Fonts; no inline scripts, no eval, no
 * third-party calls. Dev is left alone because the React refresh runtime
 * injects an inline script. If you host behind a server or CDN, send the
 * same policy as an HTTP header too (headers can also set frame-ancestors).
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: blob:",
  "media-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  'upgrade-insecure-requests',
].join('; ');

function contentSecurityPolicy(): Plugin {
  return {
    name: 'theia-csp',
    apply: 'build',
    transformIndexHtml: () => [{tag: 'meta', attrs: {'http-equiv': 'Content-Security-Policy', content: CSP}, injectTo: 'head-prepend'}],
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), contentSecurityPolicy()],
  build: {
    target: 'es2020',
    // No source maps in production: the bundle ships without the source.
    sourcemap: false,
  },
});
