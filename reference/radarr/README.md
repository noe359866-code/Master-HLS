# Radarr

[Radarr](https://radarr.video/) es un **gestor de biblioteca de películas** para
usuarios de Usenet y BitTorrent: vigila feeds RSS, busca releases en indexers, se
los pasa a un cliente de descarga (qBittorrent, SABnzbd, Transmission…), importa
y renombra los archivos, y puede mejorar la calidad de lo que ya tienes.

- Repositorio: <https://github.com/Radarr/Radarr> (rama `develop`, C#/.NET)
- Última versión estable al momento de escribir esto: `v6.4.4.10685` (2026-09-16)
- Licencia: **GPL-3.0**
- Documentación: <https://wiki.servarr.com/radarr>

## Qué es y qué no es

| Es | No es |
| --- | --- |
| Un backend de automatización que corre en un servidor/NAS/Docker | Un reproductor |
| Un organizador de archivos que ya tienes o descargas | Un servicio de streaming |
| Un cliente de la API de indexers y clientes de descarga | Un servidor de medios (eso es Jellyfin/Plex/Emby) |
| Una app web en el puerto `7878` | Una app de Android TV |

Radarr **no sirve vídeo**. Solo mueve y organiza archivos; para verlos necesitas
un servidor de medios o un reproductor que apunte a la carpeta.

## Cómo encaja (y cómo no) con WuPlay

WuPlay reproduce contenido a través de **add-ons de Stremio**; Radarr no expone
un catálogo de Stremio ni habla ese protocolo, así que **no hay integración
directa** entre ambos. Añadir una integración real requeriría el código de
WuPlay (que no está en este repositorio, solo los releases) y un cliente de la
API v3 de Radarr.

Lo que sí puedes hacer es combinarlos en el mismo laboratorio:

```
Radarr  →  organiza /movies  →  Jellyfin  →  app de TV (Jellyfin/Plex)
   │
   └─ indexers + cliente de descarga (qBittorrent, SABnzbd…)
```

WuPlay quedaría al margen de esa cadena, salvo que exista un add-on de Stremio
que publique tu biblioteca local. No des por hecho que existe: verifícalo antes
de montar nada.

## Puesta en marcha rápida (Docker)

El `docker-compose.yml` de este directorio sigue la imagen oficial de
[linuxserver/radarr](https://docs.linuxserver.io/images/docker-radarr/):

```bash
docker compose up -d
# interfaz web: http://<ip-del-servidor>:7878
```

Antes de arrancar:

1. Ajusta `PUID`/`PGID` a tu usuario (`id -u`, `id -g`).
2. Cambia `TZ` si no estás en `America/Managua`.
3. Apunta `/movies` y `/downloads` a rutas reales del host.
4. Usa **el mismo sistema de archivos** para descargas y biblioteca si quieres
   hardlinks y movimientos atómicos en lugar de copiar y borrar.
5. En la UI: *Settings → Media Management* define la carpeta raíz; *Settings →
   Indexers* y *Settings → Download Clients* conectan el resto.

## API

La API actual es **v3**, en `http://<host>:7878/api/v3`. La clave está en
*Settings → General → Security → API Key* y se envía en la cabecera `X-Api-Key`.

```bash
export RADARR_URL="http://localhost:7878"
export RADARR_API_KEY="tu_api_key"

# Estado del servidor y versión
curl -s -H "X-Api-Key: $RADARR_API_KEY" "$RADARR_URL/api/v3/system/status"

# Películas en la biblioteca
curl -s -H "X-Api-Key: $RADARR_API_KEY" "$RADARR_URL/api/v3/movie"

# Perfiles de calidad y comandos disponibles
curl -s -H "X-Api-Key: $RADARR_API_KEY" "$RADARR_URL/api/v3/qualityprofile"
curl -s -H "X-Api-Key: $RADARR_API_KEY" "$RADARR_URL/api/v3/command"
```

Documentación completa: <https://wiki.servarr.com/radarr/api-docs>.

## Seguridad

- **No expongas el puerto 7878 directamente a Internet.** Radarr no está pensado
  para ello; usa VPN (WireGuard/Tailscale) o un reverse proxy con autenticación
  y HTTPS.
- La API key da control total: trátala como una contraseña y no la subas al
  repositorio.
- Ejecuta el contenedor con un usuario sin privilegios (`PUID`/`PGID`), no como
  root.

## Nota legal

Radarr es software legal y de código abierto. Lo que descargues con él es
responsabilidad tuya: úsalo con contenido propio, de dominio público o con
licencia válida. Este repositorio solo documenta la herramienta; no incluye
código de Radarr ni enlaces a contenido.
