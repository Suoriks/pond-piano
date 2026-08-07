'use strict';

const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const APP_FILES = new Map([
  ['/index.html', 'index.html'],
  ['/pond.css', 'pond.css'],
  ['/pond-music.js', 'pond-music.js'],
  ['/pond-gesture.js', 'pond-gesture.js'],
  ['/pond-score.js', 'pond-score.js'],
  ['/pond-waves.js', 'pond-waves.js'],
  ['/pond-master.js', 'pond-master.js'],
  ['/pond-audio-lifecycle.js', 'pond-audio-lifecycle.js'],
  ['/pond.js', 'pond.js'],
  ['/sw.js', 'sw.js'],
  ['/manifest.webmanifest', 'manifest.webmanifest'],
  ['/assets/icon-192.png', 'assets/icon-192.png'],
  ['/assets/icon-512.png', 'assets/icon-512.png'],
  ['/assets/icon-maskable-512.png', 'assets/icon-maskable-512.png'],
  ['/assets/apple-touch-icon.png', 'assets/apple-touch-icon.png']
]);

const MIME_TYPES = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.webmanifest', 'application/manifest+json; charset=utf-8']
]);

const SECURITY_HEADERS = Object.freeze({
  'Cache-Control': 'no-store',
  'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; manifest-src 'self'; connect-src 'self'; worker-src 'self'; media-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; frame-src 'none'",
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Permissions-Policy': 'accelerometer=(), autoplay=(self), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY'
});

function reply(response, statusCode, body, extraHeaders = {}) {
  const payload = Buffer.from(body);
  response.writeHead(statusCode, {
    ...SECURITY_HEADERS,
    'Content-Type': 'text/plain; charset=utf-8',
    'Content-Length': payload.length,
    ...extraHeaders
  });
  response.end(payload);
}

function requestedPath(rawTarget) {
  if (typeof rawTarget !== 'string' || !rawTarget.startsWith('/') || rawTarget.startsWith('//')) {
    return { error: 400 };
  }

  const rawPath = rawTarget.split(/[?#]/, 1)[0];
  if (/%2f|%5c/i.test(rawPath)) return { error: 403 };

  let decoded;
  try {
    decoded = decodeURIComponent(rawPath);
  } catch {
    return { error: 400 };
  }

  if (decoded.includes('\0') || decoded.includes('\\')) return { error: 403 };
  if (decoded.split('/').some(segment => segment === '.' || segment === '..')) return { error: 403 };

  return { pathname: decoded === '/' ? '/index.html' : decoded };
}

function createStaticServer(rootDirectory) {
  const root = path.resolve(rootDirectory);
  const server = http.createServer((request, response) => {
    const address = server.address();
    const expectedHost = address && typeof address === 'object' ? `127.0.0.1:${address.port}` : null;
    if (!expectedHost || request.headers.host !== expectedHost) {
      reply(response, 421, 'Misdirected Request\n');
      return;
    }

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      reply(response, 405, 'Method Not Allowed\n', { Allow: 'GET, HEAD' });
      return;
    }

    const parsed = requestedPath(request.url);
    if (parsed.error) {
      reply(response, parsed.error, parsed.error === 403 ? 'Forbidden\n' : 'Bad Request\n');
      return;
    }

    const relativeFile = APP_FILES.get(parsed.pathname);
    if (!relativeFile) {
      reply(response, 404, 'Not Found\n');
      return;
    }

    const filePath = path.resolve(root, relativeFile);
    if (filePath !== root && !filePath.startsWith(`${root}${path.sep}`)) {
      reply(response, 403, 'Forbidden\n');
      return;
    }

    fs.readFile(filePath, (error, contents) => {
      if (error) {
        reply(response, error.code === 'ENOENT' ? 404 : 500, error.code === 'ENOENT' ? 'Not Found\n' : 'Internal Server Error\n');
        return;
      }

      response.writeHead(200, {
        ...SECURITY_HEADERS,
        'Content-Type': MIME_TYPES.get(path.extname(filePath)) || 'application/octet-stream',
        'Content-Length': contents.length,
        ...(parsed.pathname === '/sw.js' ? { 'Service-Worker-Allowed': '/' } : {})
      });
      response.end(request.method === 'HEAD' ? undefined : contents);
    });
  });

  server.on('clientError', (_error, socket) => {
    socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
  });

  return server;
}

function listenOnLoopback(server) {
  return new Promise((resolve, reject) => {
    const onError = error => {
      server.off('listening', onListening);
      reject(error);
    };
    const onListening = () => {
      server.off('error', onError);
      const address = server.address();
      resolve(`http://127.0.0.1:${address.port}`);
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen({ host: '127.0.0.1', port: 0, exclusive: true });
  });
}

function closeServer(server) {
  if (!server || !server.listening) return Promise.resolve();
  server.closeIdleConnections?.();
  server.closeAllConnections?.();
  return new Promise(resolve => server.close(() => resolve()));
}

module.exports = {
  APP_FILES,
  SECURITY_HEADERS,
  closeServer,
  createStaticServer,
  listenOnLoopback,
  requestedPath
};
