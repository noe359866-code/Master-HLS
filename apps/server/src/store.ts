/**
 * Persistencia en un fichero JSON.
 *
 * Se evita una base de datos nativa para que el proyecto clone&run no dependa
 * de compilacion nativa: el volumen de datos (addons, perfiles, watchlists,
 * historial) es pequeño y cabe de sobra en un unico fichero JSON.
 *
 * Las escrituras son atomicas (fichero temporal + rename) para que un corte
 * de luz no deje el estado a medias.
 */

import fs from 'node:fs/promises';
import path from 'node:path';

export class JsonStore<T extends object> {
  private readonly file: string;
  private data: T;
  private writeQueue: Promise<void> = Promise.resolve();
  private dirty = false;

  constructor(file: string, initial: T) {
    this.file = file;
    this.data = initial;
  }

  get path(): string {
    return this.file;
  }

  async load(): Promise<T> {
    try {
      const raw = await fs.readFile(this.file, 'utf8');
      this.data = { ...this.data, ...(JSON.parse(raw) as T) };
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT') {
        console.warn(`[store] no se pudo leer ${this.file}:`, (error as Error).message);
      }
    }
    return this.data;
  }

  get(): T {
    return this.data;
  }

  /** Aplica una mutacion y persiste (encolando la escritura). */
  async update(mutator: (data: T) => void): Promise<T> {
    mutator(this.data);
    this.dirty = true;
    await this.flush();
    return this.data;
  }

  /** Mutacion en memoria sin persistir (para operaciones en lote). */
  mutate(mutator: (data: T) => void): T {
    mutator(this.data);
    this.dirty = true;
    return this.data;
  }

  async flush(): Promise<void> {
    if (!this.dirty) return;
    this.dirty = false;
    const snapshot = JSON.stringify(this.data, null, 2);
    this.writeQueue = this.writeQueue.then(async () => {
      await fs.mkdir(path.dirname(this.file), { recursive: true });
      const tmp = `${this.file}.tmp`;
      await fs.writeFile(tmp, snapshot, 'utf8');
      await fs.rename(tmp, this.file);
    });
    await this.writeQueue;
  }
}
