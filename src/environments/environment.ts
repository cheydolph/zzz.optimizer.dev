import { version } from '../../package.json';

export const environment = {
  production: false,
  appVersion: version,
  // Cloudflare Worker URL for Enka API proxy
  enkaProxyUrl: 'https://zzzoptimizer.southxpaw.workers.dev',
};
