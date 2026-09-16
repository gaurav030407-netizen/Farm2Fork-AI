const configuredApiUrl = (import.meta.env.VITE_API_BASE_URL ?? '').trim();

const isNetlifyHost = typeof window !== 'undefined' && window.location.hostname.endsWith('.netlify.app');
const shouldIgnoreTunnel = isNetlifyHost && configuredApiUrl.includes('loca.lt');
const activeApiUrl = shouldIgnoreTunnel ? '' : configuredApiUrl;

const configuredApiRoot = activeApiUrl.replace(/\/+$/, '').replace(/\/api$/, '');

export const apiBaseUrl = configuredApiRoot || '';

function localNodeOrigin() {
  const url = new URL(window.location.href);
  url.port = '3000';
  return url.origin;
}

export function apiUrl(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${apiBaseUrl}${normalizedPath}`;
}

export function callsWebSocketUrl(): string {
  const configuredWsUrl = (import.meta.env.VITE_WS_BASE_URL ?? '').trim().replace(/\/+$/, '');
  if (configuredWsUrl) {
    return configuredWsUrl.endsWith('/ws/calls')
      ? configuredWsUrl
      : `${configuredWsUrl}/ws/calls`;
  }

  if (apiBaseUrl) {
    return `${apiBaseUrl.replace(/^http:/, 'ws:').replace(/^https:/, 'wss:')}/ws/calls`;
  }

  if (import.meta.env.DEV) {
    return `${localNodeOrigin().replace(/^http:/, 'ws:')}/ws/calls`;
  }

  return `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/ws/calls`;
}

export function messagesWebSocketUrl(): string {
  const configuredWsUrl = (import.meta.env.VITE_WS_BASE_URL ?? '').trim().replace(/\/+$/, '');
  const base = configuredWsUrl || (apiBaseUrl ? apiBaseUrl.replace(/^http:/, 'ws:').replace(/^https:/, 'wss:') : import.meta.env.DEV ? localNodeOrigin().replace(/^http:/, 'ws:') : '');
  if (base.endsWith('/ws/messages')) return base;
  if (base.endsWith('/ws/calls')) return `${base.slice(0, -10)}/ws/messages`;
  return `${base}/ws/messages`;
}
