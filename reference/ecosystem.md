# Ecosistema self-hosted alrededor de Radarr

Herramientas que suelen convivir con Radarr en un laboratorio doméstico. Ninguna
está incluida ni soportada por WuPlay; la tabla es solo orientativa.

| Herramienta | Para qué sirve | Lenguaje | Licencia | Repositorio |
| --- | --- | --- | --- | --- |
| [Radarr](radarr/README.md) | Gestión de biblioteca de **películas** | C# | GPL-3.0 | [Radarr/Radarr](https://github.com/Radarr/Radarr) |
| [Sonarr](https://sonarr.tv/) | Lo mismo para **series de TV** | C# | GPL-3.0 | [Sonarr/Sonarr](https://github.com/Sonarr/Sonarr) |
| [Prowlarr](https://prowlarr.com/) | Gestor y proxy de **indexers**, se conecta a Radarr/Sonarr | C# | GPL-3.0 | [Prowlarr/Prowlarr](https://github.com/Prowlarr/Prowlarr) |
| [Bazarr](https://www.bazarr.media/) | Descarga y sincroniza **subtítulos** para Radarr/Sonarr | Python | GPL-3.0 | [morpheus65535/bazarr](https://github.com/morpheus65535/bazarr) |
| [Jellyfin](https://jellyfin.org/) | **Servidor de medios** libre; sirve la biblioteca a apps de TV/móvil | C# | GPL-2.0 | [jellyfin/jellyfin](https://github.com/jellyfin/jellyfin) |
| [qBittorrent](https://www.qbittorrent.org/) | **Cliente BitTorrent** con API web | C++ | GPL-2.0 | [qbittorrent/qBittorrent](https://github.com/qbittorrent/qBittorrent) |

## Cómo se conectan

```
Prowlarr ──(indexers)──► Radarr / Sonarr ──► cliente de descarga ──► /downloads
                                   │                                    │
                                   └──── importa y renombra ────────────┘
                                                                        │
                                                                   /movies, /tv
                                                                        │
                                                                    Jellyfin
```

- **Prowlarr** centraliza los indexers y los publica a Radarr/Sonarr.
- **Radarr/Sonarr** deciden *qué* descargar y *cómo* nombrarlo.
- El **cliente de descarga** solo baja bytes.
- **Jellyfin** (o Plex/Emby) es lo que realmente reproduce el televisor.
- **Bazarr** completa subtítulos a partir de la biblioteca ya organizada.

## Dónde queda WuPlay

WuPlay es un cliente de Android TV basado en **add-ons de Stremio**. No consume
la API de Radarr ni la biblioteca de Jellyfin por sí mismo, así que no aparece en
la cadena de arriba salvo que exista un add-on puente (verifícalo antes de
asumirlo). Son ecosistemas distintos que pueden convivir en la misma red, no
integraciones.

## Antes de montar nada

- Comprueba que tu hardware aguanta varios contenedores (Radarr + cliente +
  Jellyfin suman RAM y CPU, sobre todo al transcribir o transcodificar).
- No expongas ninguno de estos paneles a Internet sin autenticación y HTTPS.
- Usa contenido propio, de dominio público o con licencia válida.
