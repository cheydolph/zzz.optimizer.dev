// Bundles the real stat and scoring services for Node, with Angular and the environment stubbed.
// Output: test-harness/.build/bundle.mjs (gitignored). lib.mjs runs this automatically.
import * as esbuild from 'esbuild';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
export const BUNDLE_PATH = join(here, '.build', 'bundle.mjs');

const stubEnvironment = {
  name: 'stub-environment',
  setup(build) {
    build.onResolve({ filter: /\/environments\/environment$/ }, () => ({
      path: join(here, 'stubs', 'environment.ts'),
    }));
  },
};

export async function buildBundle() {
  await esbuild.build({
    entryPoints: [join(here, 'entry.ts')],
    outfile: BUNDLE_PATH,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'es2022',
    // Resolved from the repo's node_modules at run time, so lib.mjs and the services share one rxjs.
    external: ['rxjs'],
    alias: {
      '@angular/core': join(here, 'stubs', 'core.ts'),
      '@angular/common/http': join(here, 'stubs', 'http.ts'),
    },
    plugins: [stubEnvironment],
    // Same class semantics as the app: tsconfig.json sets experimentalDecorators, and the
    // Angular CLI forces useDefineForClassFields to false for an ES2022 target.
    tsconfigRaw: {
      compilerOptions: { experimentalDecorators: true, useDefineForClassFields: false, target: 'ES2022' },
    },
    logLevel: 'warning',
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await buildBundle();
  console.log(`bundled ${BUNDLE_PATH}`);
}
