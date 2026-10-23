// Stand-in for @angular/core: the harness constructs services with `new`, so decorators are no-ops.
export function Injectable(_options?: unknown) {
  return (target: unknown) => target;
}

export function Inject(_token: unknown) {
  return (_target: unknown, _key: unknown, _index: unknown) => {};
}

export const PLATFORM_ID = 'PLATFORM_ID';
