// Types for golden-core.mjs, used by the Vitest spec (src/app/services/goldens.spec.ts).
import type { Observable } from 'rxjs';

export interface GoldenServices {
  transformer: object;
  discSet: object;
  statCalc: object;
  scoring: object;
}

/** Opaque to the spec: built by prepareContext and passed back to the runners. */
export interface GoldenContext {
  readonly agents: readonly object[];
  readonly wEngines: readonly object[];
}

export const WENGINES_FILE: string;
export function readJson(path: string): unknown;

export class AssetHttp {
  constructor(srcDir: string);
  get(url: string): Observable<unknown>;
}

export function prepareContext(services: GoldenServices, srcDir: string): Promise<GoldenContext>;
export function computeSyntheticOutputs(
  ctx: GoldenContext,
  fixturesDir: string,
): { computed: Map<string, unknown>; caseCount: number; consoleCounts: Record<string, number> };
export function diffSyntheticGoldens(computed: ReadonlyMap<string, unknown>, goldensDir: string): string[];
export function computeLocalOutputs(
  ctx: GoldenContext,
  exportsDir: string,
  file: string,
  plansById: ReadonlyMap<string, unknown>,
): { outputs: Record<string, unknown>; buildCount: number };
export function readLocalPlans(exportsDir: string, exportFiles: readonly string[]): Map<string, unknown>;
export function findUnrepresentable(value: unknown): string[];
export function toGoldenForm(value: unknown): unknown;
export function compareTrees(expected: unknown, actual: unknown): string[];
export function listJsonFiles(dir: string): string[];
