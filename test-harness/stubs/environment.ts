// Stand-in for src/environments/environment.ts, so the real file (and the Enka proxy URL in it)
// never ends up in the harness bundle. versionedUrl() reads appVersion; lib.mjs strips the query.
export const environment = {
  production: false,
  appVersion: 'harness',
  // Empty: tests never reach the real Worker. enka-api.service.spec.ts sets a fake URL per test.
  enkaProxyUrl: '',
};
