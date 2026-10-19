/**
 * Fuente de addons.
 *
 * Tanto un "addon de red" (un manifest publico) como un "addon integrado"
 * (metadata embebida en el propio servidor) exponen la misma superficie, de
 * modo que el agregador no distingue entre ellos y el fan-out, la cache y la
 * fusion de respuestas funcionan igual.
 */

import type {
  AddonCatalogRequest,
  AddonManifest,
  AddonMetaRequest,
  AddonStreamRequest,
  AddonSubtitleRequest,
  CatalogResponse,
  MetaResponse,
  StreamResponse,
  SubtitleResponse,
} from './types.js';

export interface AddonSource {
  /** Id del manifest (clave en el registro). */
  readonly id: string;
  /** URL del manifest. */
  readonly manifestUrl: string;
  /** true si el addon viene embebido en el servidor (metadata integrada). */
  readonly builtin: boolean;
  /** Manifest en cache, si ya se ha descargado. */
  readonly cachedManifest?: AddonManifest;

  getManifest(options?: { force?: boolean }): Promise<AddonManifest>;
  catalog(request: AddonCatalogRequest): Promise<CatalogResponse>;
  meta(request: AddonMetaRequest): Promise<MetaResponse>;
  streams(request: AddonStreamRequest): Promise<StreamResponse>;
  subtitles(request: AddonSubtitleRequest): Promise<SubtitleResponse>;
  invalidateResourceCache(): void;
}
