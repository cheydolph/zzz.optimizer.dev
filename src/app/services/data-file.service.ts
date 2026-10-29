import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { versionedUrl } from '../utils/versioned-url';

/**
 * Loads each reference JSON file under assets/data once per session and shares the parsed
 * result between the services that read it (PERF-05). Callers must treat the result as
 * read-only, since every caller gets the same object.
 */
@Injectable({
  providedIn: 'root',
})
export class DataFileService {
  private loads = new Map<string, Promise<unknown>>();

  constructor(private http: HttpClient) {}

  /**
   * Fetch a file such as 'assets/data/mindscape-stats.json'. A failed load is forgotten, so
   * the next call requests the file again instead of returning the same failure.
   */
  load<T>(path: string): Promise<T> {
    let load = this.loads.get(path);
    if (!load) {
      load = firstValueFrom(this.http.get<T>(versionedUrl(path)));
      load.catch(() => this.loads.delete(path));
      this.loads.set(path, load);
    }
    // Same unchecked assertion as http.get<T>: a path is always read with the same file shape.
    return load as Promise<T>;
  }
}
