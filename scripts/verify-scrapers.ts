/**
 * Verificación en vivo de los scrapers nativos.
 *
 * Las pruebas unitarias usan respuestas simuladas: demuestran el flujo, no
 * que un sitio siga sirviendo vídeo. Este script hace lo que un test offline
 * no puede: consulta el proveedor real, extrae sus fuentes y comprueba que la
 * URL responda con un playlist o un flujo de vídeo.
 *
 * Uso:
 *   npm run verify:scrapers -- --title "El viaje" --year 2024 --language es-419
 *   npm run verify:scrapers -- --provider cinehax --type movie --id tmdb:123
 *   npm run verify:scrapers -- --provider zaluknij --title "Film" --strict
 *
 * Solo úsalo con contenido que tengas derecho a reproducir. Los resultados
 * dependen de la red, del país y de los antibots de cada sitio: un fallo no
 * demuestra que el adaptador esté roto, ni un acierto que reproduzca siempre.
 */

import fs from 'node:fs/promises';
import path from 'node:path';

import {
  createGuardedFetch,
  createScrapeContext,
  DEFAULT_PROVIDERS,
  DEFAULT_USER_AGENT,
  ScraperRegistry,
  type ScrapedSource,
  type ScrapeRequest,
} from '../packages/scrapers/src/index.ts';

interface Options {
  providers: string[];
  title?: string;
  year?: number;
  type: ScrapeRequest['type'];
  id?: string;
  tmdbId?: string;
  season?: number;
  episode?: number;
  language?: string;
  json?: string;
  strict: boolean;
  timeoutMs: number;
}

interface SourceCheck {
  url: string;
  quality?: string;
  status: 'video' | 'playlist' | 'unknown' | 'unreachable';
  httpStatus?: number;
  contentType?: string;
  detail?: string;
}

interface ProviderCheck {
  provider: string;
  sources: number;
  error?: string;
  checks: SourceCheck[];
}

function help(): void {
  console.log(`Verificación en vivo de scrapers (requiere salida a Internet)

  --title <texto>        título a buscar
  --year <año>           año de estreno
  --type <tipo>          movie | series | episode | anime | dorama (por defecto movie)
  --id <id>              id Stremio/IMDb/TMDb (por defecto tt0000000)
  --tmdbId <id>          id de TMDb si se conoce
  --season <n>           temporada (series)
  --episode <n>          episodio (series)
  --language <código>    idioma del perfil (es-419, en…)
  --provider <id>        limita la prueba (repetible)
  --json <ruta>          guarda el informe JSON
  --timeout <ms>         timeout de la sonda de vídeo (por defecto 15000)
  --strict               sale con código 1 si no se verifica ningún vídeo
  --help                 muestra esta ayuda`);
}

function argsOf(argv: string[]): Options {
  const options: Options = {
    providers: [],
    type: 'movie',
    strict: false,
    timeoutMs: 15_000,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = (): string => {
      const next = argv[index + 1];
      if (next === undefined || next.startsWith('--')) throw new Error(`Falta el valor de ${flag}`);
      index += 1;
      return next;
    };
    switch (flag) {
      case '--title': options.title = value(); break;
      case '--year': options.year = Number(value()); break;
      case '--type': options.type = value() as Options['type']; break;
      case '--id': options.id = value(); break;
      case '--tmdbId': options.tmdbId = value(); break;
      case '--season': options.season = Number(value()); break;
      case '--episode': options.episode = Number(value()); break;
      case '--language': options.language = value(); break;
      case '--provider': options.providers.push(value()); break;
      case '--json': options.json = value(); break;
      case '--timeout': options.timeoutMs = Number(value()); break;
      case '--strict': options.strict = true; break;
      case '--help': case '-h': help(); process.exit(0);
      default: throw new Error(`Opción desconocida: ${flag}`);
    }
  }
  return options;
}

async function checkSource(
  source: ScrapedSource,
  timeoutMs: number,
): Promise<SourceCheck> {
  const base: SourceCheck = {
    url: source.url,
    ...(source.quality ? { quality: source.quality } : {}),
    status: 'unknown',
  };
  if (!/^https?:/i.test(source.url)) {
    return { ...base, status: 'unreachable', detail: 'no es una URL HTTP(S)' };
  }
  try {
    const guarded = createGuardedFetch();
    const response = await guarded(source.url, {
      method: 'GET',
      headers: {
        'User-Agent': DEFAULT_USER_AGENT,
        ...(source.headers ?? {}),
        Range: 'bytes=0-2047',
      },
      signal: AbortSignal.timeout(timeoutMs),
      redirect: 'follow',
    });
    const contentType = response.headers.get('content-type') ?? '';
    const result: SourceCheck = {
      ...base,
      httpStatus: response.status,
      contentType,
    };
    if (!response.ok && response.status !== 206) {
      return { ...result, status: 'unreachable', detail: `HTTP ${response.status}` };
    }
    const sample = (await response.text()).slice(0, 4_096);
    if (sample.trimStart().startsWith('#EXTM3U')) {
      return { ...result, status: 'playlist', detail: 'playlist HLS válido' };
    }
    if (contentType.startsWith('video/') || /\.(?:mp4|webm|mkv)$/i.test(new URL(source.url).pathname)) {
      return { ...result, status: 'video', detail: 'flujo de vídeo' };
    }
    return { ...result, status: 'unknown', detail: sample.slice(0, 80) };
  } catch (error) {
    return { ...base, status: 'unreachable', detail: (error as Error).message };
  }
}

async function main(): Promise<void> {
  const options = argsOf(process.argv.slice(2));
  if (!options.title && !options.id) {
    help();
    process.exitCode = 1;
    return;
  }
  const selected = options.providers.length
    ? DEFAULT_PROVIDERS.filter((provider) => options.providers.includes(provider.id))
    : DEFAULT_PROVIDERS;
  const unknown = options.providers.filter(
    (id) => !DEFAULT_PROVIDERS.some((provider) => provider.id === id),
  );
  if (unknown.length) {
    console.error(`Proveedores desconocidos: ${unknown.join(', ')}`);
    process.exitCode = 1;
    return;
  }

  const titleId = options.tmdbId ? `tmdb:${options.tmdbId}` : options.id ?? 'tt0000000';
  const request: ScrapeRequest = {
    type: options.type,
    id: options.season !== undefined && options.episode !== undefined
      ? `${titleId}:${options.season}:${options.episode}`
      : titleId,
    titleId,
    ...(options.title ? { title: options.title } : {}),
    ...(options.year ? { year: options.year } : {}),
    ...(options.tmdbId ? { tmdbId: options.tmdbId } : {}),
    ...(options.season !== undefined ? { season: options.season } : {}),
    ...(options.episode !== undefined ? { episode: options.episode } : {}),
    ...(options.language ? { language: options.language } : {}),
  };

  const registry = new ScraperRegistry({ timeoutMs: 30_000 });
  const context = createScrapeContext();
  const report: ProviderCheck[] = [];
  let verified = 0;

  for (const provider of selected) {
    process.stderr.write(`→ ${provider.id}… `);
    const result = await registry.runProvider(provider, request, context);
    const sources = result.sources.slice(0, 3);
    const checks: SourceCheck[] = [];
    for (const source of sources) {
      checks.push(await checkSource(source, options.timeoutMs));
    }
    const ok = checks.filter((check) => check.status === 'video' || check.status === 'playlist').length;
    verified += ok;
    process.stderr.write(`${checks.length} fuente(s), ${ok} reproducible(s)\n`);
    report.push({
      provider: provider.id,
      sources: result.sources.length,
      ...(result.error ? { error: result.error } : {}),
      checks,
    });
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    request,
    liveVerifiedSources: verified,
    providers: report,
  };
  console.log(JSON.stringify(summary, null, 2));

  if (options.json) {
    await fs.mkdir(path.dirname(path.resolve(options.json)), { recursive: true });
    await fs.writeFile(path.resolve(options.json), `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
    console.error(`Informe guardado en ${path.resolve(options.json)}`);
  }

  if (options.strict && verified === 0) {
    console.error('No se verificó ninguna fuente reproducible.');
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
