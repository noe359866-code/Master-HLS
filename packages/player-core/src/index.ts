/**
 * `@vibeflix/player-core` — nucleo del reproductor.
 *
 * Logica pura (sin DOM ni hls.js) compartida por el cliente web, el servidor
 * (conversion y limpieza de subtitulos) y, si se quiere, el shell Android:
 *
 *  - `abr.ts`            plan de arranque: nivel inicial, techo y semilla ABR
 *  - `buffer.ts`         dimensionado del buffer segun dispositivo y bitrate
 *  - `recovery.ts`       escalera de recuperacion ante errores fatales
 *  - `cues.ts`           subtitulos: WebVTT/SRT/ASS → cues, desfase, busqueda
 *  - `sdh.ts`            Clean SDH (WuPlay): hablantes, anotaciones y musica
 *  - `encoding.ts`       deteccion de codificacion (Nuvio): arabe, cirilico...
 *  - `thumbnails.ts`     sprites de previsualizacion (WuPlay v0.9.3)
 *  - `binge.ts`          `behaviorHints.bingeGroup` del protocolo Stremio
 *  - `stats.ts`          estadisticas de reproduccion
 *  - `time.ts`           reloj, hora de fin, velocidades y saltos
 *  - `keys.ts`           atajos de teclado (alineados con Stremio)
 *  - `subtitleStyle.ts`  apariencia de subtitulos y modo de video
 *  - `capabilities.ts`   capacidades reales del dispositivo
 *  - `images.ts`         tamano de poster/fondo segun el hueco
 *  - `labels.ts`         etiquetas de streams, pistas e idiomas
 */

export * from './abr.js';
export * from './buffer.js';
export * from './recovery.js';
export * from './cues.js';
export * from './sdh.js';
export * from './encoding.js';
export * from './thumbnails.js';
export * from './binge.js';
export * from './stats.js';
export * from './time.js';
export * from './keys.js';
export * from './subtitleStyle.js';
export * from './capabilities.js';
export * from './images.js';
export * from './labels.js';
