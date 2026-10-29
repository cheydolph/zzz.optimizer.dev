import type { HttpClient } from '@angular/common/http';
import { of, throwError } from 'rxjs';
import { DataFileService } from './data-file.service';

// PERF-05: one request per file for every caller, and a failed load is retried on the next call.
// Each response is a body, or an Error to fail that request with.
function httpReturning(...responses: unknown[]) {
  const urls: string[] = [];
  const http = {
    get: (url: string) => {
      urls.push(url);
      const next = responses[urls.length - 1] ?? new Error('no response');
      return next instanceof Error ? throwError(() => next) : of(next);
    },
  } as unknown as HttpClient;
  return { http, urls };
}

describe('DataFileService', () => {
  it('requests a file once and gives every caller the same result', async () => {
    const { http, urls } = httpReturning({ mindscapes: {} });
    const service = new DataFileService(http);

    const [a, b] = await Promise.all([
      service.load('assets/data/mindscape-stats.json'),
      service.load('assets/data/mindscape-stats.json'),
    ]);

    expect(urls).toHaveLength(1);
    expect(urls[0]).toMatch(/^assets\/data\/mindscape-stats\.json\?v=/);
    expect(a).toBe(b);
  });

  it('requests a file again after a failed load', async () => {
    const { http, urls } = httpReturning(new Error('offline'), { agents: {} });
    const service = new DataFileService(http);

    await expect(service.load('assets/data/agent-breakpoints.json')).rejects.toThrow('offline');
    await expect(service.load('assets/data/agent-breakpoints.json')).resolves.toEqual({ agents: {} });
    expect(urls).toHaveLength(2);
  });
});
