/**
 * Pagina `/configure` del addon.
 *
 * Cuando el manifest declara `behaviorHints.configurable`, Stremio (y WuPlay y
 * Nuvio, que siguen el mismo convenio del SDK) muestran un boton «Configure»
 * que abre esta pagina en el navegador. El SDK la autogenera con
 * `landingTemplate.js`; aqui se genera una equivalente, con el aspecto de
 * Vibe Flix y pensada para usarse desde el movil o desde la propia TV.
 *
 * La pagina no envia nada al servidor: construye la URL del manifest
 * configurado (`/{config}/manifest.json`) en el navegador y ofrece el enlace de
 * instalacion (`stremio://`), que es exactamente el flujo del SDK.
 */

import { addonConfigFields, type ConfigField } from './addon-config.js';

export interface ConfigurePageOptions {
  /** Nombre del addon. */
  name: string;
  /** Descripcion. */
  description?: string;
  /** Version. */
  version?: string;
  /** Logo (URL absoluta). */
  logo?: string;
  /** Fondo (URL absoluta). */
  background?: string;
  /** URL base publica del servidor. */
  baseUrl: string;
  /** Campos de configuracion (por defecto los de Vibe Flix). */
  fields?: ConfigField[];
}

/** Escapa texto para insertarlo en HTML. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** HTML del campo segun su tipo (mismo formato que el `config` del manifest). */
function fieldHtml(field: ConfigField): string {
  const id = `field-${escapeHtml(field.key)}`;
  const label = `<label for="${id}">${escapeHtml(field.title)}</label>`;

  if (field.type === 'checkbox') {
    return `<div class="field field--check">
      <input id="${id}" type="checkbox" data-key="${escapeHtml(field.key)}" />
      ${label}
    </div>`;
  }

  if (field.type === 'select') {
    const options = (field.options ?? [])
      .map((option) => {
        const selected = option === field.default ? ' selected' : '';
        return `<option value="${escapeHtml(option)}"${selected}>${escapeHtml(option)}</option>`;
      })
      .join('');
    return `<div class="field">
      ${label}
      <select id="${id}" data-key="${escapeHtml(field.key)}">${options}</select>
    </div>`;
  }

  const inputType = field.type === 'number' || field.type === 'password' ? field.type : 'text';
  const value = field.default ? ` value="${escapeHtml(field.default)}"` : '';
  return `<div class="field">
    ${label}
    <input id="${id}" type="${inputType}" data-key="${escapeHtml(field.key)}"${value} />
  </div>`;
}

/** Genera la pagina de configuracion completa. */
export function configurePageHtml(options: ConfigurePageOptions): string {
  const fields = options.fields ?? addonConfigFields();
  const fieldsHtml = fields.map(fieldHtml).join('\n');
  // Se limpia la barra final fuera de la plantilla: dentro de un template
  // literal las barras invertidas de una expresion regular se comen y el
  // JavaScript que recibe el navegador acabaria roto.
  const base = options.baseUrl.replace(/\/+$/, '');
  const manifestUrl = `${base}/manifest.json`;

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(options.name)} — Configurar addon</title>
<meta name="color-scheme" content="dark" />
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    min-height: 100vh;
    font-family: 'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
    color: #f3f6fd;
    background: #06080f;
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding: 32px 20px 64px;
  }
  body::before {
    content: '';
    position: fixed;
    inset: -20% -10% auto -10%;
    height: 70vh;
    pointer-events: none;
    background:
      radial-gradient(50% 46% at 20% 10%, rgba(110,139,255,.22), transparent 70%),
      radial-gradient(46% 42% at 80% 4%, rgba(160,107,255,.18), transparent 72%);
    filter: blur(24px);
  }
  .card {
    position: relative;
    width: min(720px, 100%);
    background: rgba(12,16,26,.86);
    border: 1px solid rgba(255,255,255,.1);
    border-radius: 22px;
    padding: 28px 28px 24px;
    box-shadow: 0 24px 70px rgba(0,0,0,.55);
    backdrop-filter: saturate(150%) blur(18px);
  }
  header { display: flex; gap: 16px; align-items: center; margin-bottom: 6px; }
  header img { width: 56px; height: 56px; border-radius: 14px; object-fit: cover; background: #111726; }
  h1 { font-size: 22px; margin: 0; }
  .version { color: #8e99b3; font-size: 13px; }
  p.description { color: #c3cbdd; font-size: 14px; line-height: 1.55; margin: 10px 0 22px; }
  .field { margin-bottom: 14px; }
  .field label { display: block; font-size: 13px; color: #c3cbdd; margin-bottom: 6px; }
  .field input[type="text"], .field input[type="number"], .field input[type="password"], .field select {
    width: 100%;
    padding: 11px 13px;
    border-radius: 12px;
    border: 1px solid rgba(255,255,255,.14);
    background: rgba(255,255,255,.05);
    color: #f3f6fd;
    font-size: 15px;
  }
  .field--check { display: flex; align-items: center; gap: 10px; }
  .field--check label { margin: 0; }
  .field--check input { width: 18px; height: 18px; accent-color: #6e8bff; }
  .actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 22px; }
  a.button, button.button {
    display: inline-flex; align-items: center; gap: 8px;
    padding: 12px 18px; border-radius: 12px; border: 1px solid transparent;
    background: linear-gradient(135deg, #6e8bff 0%, #a06bff 52%, #35d6c4 100%);
    color: #05070d; font-weight: 700; font-size: 15px; text-decoration: none; cursor: pointer;
  }
  button.ghost {
    background: rgba(255,255,255,.07);
    border-color: rgba(255,255,255,.16);
    color: #f3f6fd; font-weight: 600;
  }
  .url {
    margin-top: 20px; padding: 12px 14px; border-radius: 12px;
    background: rgba(0,0,0,.35); border: 1px solid rgba(255,255,255,.1);
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12.5px;
    color: #9fe8dc; word-break: break-all;
  }
  .hint { color: #8e99b3; font-size: 12.5px; margin-top: 14px; line-height: 1.5; }
  :focus-visible { outline: 2px solid #6e8bff; outline-offset: 2px; }
</style>
</head>
<body>
<main class="card">
  <header>
    ${options.logo ? `<img src="${escapeHtml(options.logo)}" alt="" />` : ''}
    <div>
      <h1>${escapeHtml(options.name)}</h1>
      <span class="version">v${escapeHtml(options.version ?? '1.0.0')}</span>
    </div>
  </header>
  <p class="description">${escapeHtml(options.description ?? '')}</p>

  <form id="config-form" onsubmit="return false">
${fieldsHtml}
  </form>

  <div class="actions">
    <a class="button" id="install" href="${escapeHtml(manifestUrl)}">Instalar en Stremio</a>
    <button class="button ghost" id="copy" type="button">Copiar URL</button>
    <button class="button ghost" id="reset" type="button">Valores por defecto</button>
  </div>

  <div class="url" id="url">${escapeHtml(manifestUrl)}</div>
  <p class="hint">
    La configuracion viaja en la propia URL del addon: no se guarda nada en el
    servidor ni hace falta cuenta. Pega esa URL en Stremio, WuPlay o Nuvio
    (o pulsa «Instalar en Stremio») y el addon servira los catalogos, streams y
    subtitulos con estos ajustes.
  </p>
</main>

<script>
  const BASE = ${JSON.stringify(base)};
  const form = document.getElementById('config-form');
  const urlBox = document.getElementById('url');
  const install = document.getElementById('install');

  function readConfig() {
    const config = {};
    form.querySelectorAll('[data-key]').forEach((input) => {
      const key = input.dataset.key;
      if (input.type === 'checkbox') {
        if (input.checked) config[key] = true;
        return;
      }
      const value = String(input.value || '').trim();
      if (!value) return;
      if (key === 'maxHeight' || key === 'maxBitrateMbps') {
        const parsed = Number(value);
        if (Number.isFinite(parsed) && parsed > 0) config[key] = parsed;
        return;
      }
      config[key] = value;
    });
    return config;
  }

  function manifestUrl() {
    const config = readConfig();
    const keys = Object.keys(config);
    if (!keys.length) return BASE + '/manifest.json';
    // Convencion del SDK de Stremio: el JSON de configuracion va en la ruta.
    return BASE + '/' + encodeURIComponent(JSON.stringify(config)) + '/manifest.json';
  }

  function update() {
    const url = manifestUrl();
    urlBox.textContent = url;
    // Sin expresiones regulares: dentro de la plantilla las barras invertidas
    // se interpretan y el navegador recibiria un regex roto.
    const withoutProtocol = url.startsWith('https://') ? url.slice(8) : url.startsWith('http://') ? url.slice(7) : url;
    install.href = 'stremio://' + withoutProtocol;
  }

  form.addEventListener('input', update);
  form.addEventListener('change', update);

  document.getElementById('copy').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(urlBox.textContent);
      const button = document.getElementById('copy');
      const previous = button.textContent;
      button.textContent = 'Copiada';
      setTimeout(() => { button.textContent = previous; }, 1400);
    } catch {
      // Sin portapapeles: la URL sigue visible para copiarla a mano.
    }
  });

  document.getElementById('reset').addEventListener('click', () => {
    form.reset();
    update();
  });

  update();
</script>
</body>
</html>
`;
}
