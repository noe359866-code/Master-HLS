# Probar WuPlay en un Android TV

> **Qué es este repositorio.** `Master-HLS` es un espejo del **repositorio de
> releases** de WuPlay: README, changelog, capturas y material de referencia.
> **No contiene el código de la app ni un sistema de build**, así que de aquí no
> sale ningún APK. Lo que se instala en el televisor es el APK publicado por el
> proyecto original en
> [wuplayapp/wuplay-releases](https://github.com/wuplayapp/wuplay-releases/releases).

## Estado actual

| Versión | Fecha | Estado | APK |
| --- | --- | --- | --- |
| `v0.9.3-beta` | 2026-10-05 | Beta pública, ~8.700 descargas | `wuplay-androidtv.apk` (11,6 MB) |

Aunque GitHub no la marca como *pre-release*, el propio tag dice `beta`: el
changelog de esa versión incluye funciones explícitamente experimentales
(miniaturas de vista previa, solo en inglés) y varios arreglos de bloqueo al
iniciar. **No es una versión de producción.**

Requisitos según el README del proyecto:

- **Android TV 7.0 o superior (ARM)** — no hay build para x86 ni para móvil.
- Desconocidos habilitados para el instalador que uses.
- Cuenta/perfil de WuPlay y, para reproducir, al menos un add-on de Stremio.

## Instalación

### Opción A — Downloader (la más simple, sin PC)

1. Instala **Downloader** de Google Play en el televisor
   (`com.esaba.downloader`).
2. Ábrelo y acepta el aviso de descargas de fuentes desconocidas.
3. Escribe el código **5781040**.
4. Deja que descargue y elige *Install*.
5. Al terminar, elimina el APK desde *Downloader → Files* para recuperar espacio.

### Opción B — APK directo (USB o unidad de red)

1. Descarga `wuplay-androidtv.apk` desde
   [la última release](https://github.com/wuplayapp/wuplay-releases/releases/latest/download/wuplay-androidtv.apk)
   en un PC.
2. Cópialo a un USB formateado en FAT32 y conéctalo al televisor.
3. Instala un explorador de archivos en el TV (por ejemplo *FX File Explorer*
   o el propio *Downloader*) y abre el APK.

### Opción C — ADB (para depurar)

```bash
# El televisor debe tener Depuración USB/ADB activada en Opciones de desarrollador
adb connect <IP_DEL_TV>:5555
adb install -r wuplay-androidtv.apk

# Ver la app y su paquete real
adb shell pm list packages | grep -i wu

# Logs en vivo mientras navegas (sustituye el paquete por el que salga arriba)
adb logcat -c && adb logcat | grep -iE "wuplay|AndroidRuntime|FATAL"
```

Para guardar un log útil para un reporte:

```bash
adb logcat -d -v time > wuplay-log.txt
```

No pegues el log completo en un issue: filtra las últimas 200–300 líneas y
revisa que no contenga rutas personales, tokens de add-ons ni IPs.

## Prueba de humo antes de usarlo a diario

Marca cada punto en el televisor real, no en el emulador. Si algo falla, abre un
issue con la plantilla de bug y adjunta el log.

### Arranque y perfiles
- [ ] La app abre sin quedarse en la pantalla de "Can't reach WuPlay servers".
- [ ] Puedo crear un perfil y cambiar entre dos perfiles.
- [ ] Las preferencias de idioma de audio/subtítulos se guardan por perfil.

### Add-ons y catálogos
- [ ] Instalo un add-on de Stremio desde la URL de manifiesto.
- [ ] Los catálogos aparecen en Inicio/Descubrir y puedo ocultarlos y reordenarlos.
- [ ] El configurador web abre desde el navegador del PC con la IP del TV.

### Reproducción
- [ ] Un título arranca en menos de ~10 s con red normal.
- [ ] Pausa, reanudación y seek (10 s y barra) responden con el mando.
- [ ] Con "Confirm seek with OK" activado, el seek espera confirmación y Back cancela.
- [ ] Cambio de pista de audio y de subtítulos sin cortar el vídeo.
- [ ] Un HLS con varias calidades no se queda en bucle de buffering.
- [ ] Al salir y volver a entrar, la reproducción se reanuda donde quedó.

### Sesión y sincronización
- [ ] El historial y el progreso sobreviven a cerrar la app.
- [ ] Con dos dispositivos, el progreso se sincroniza en un margen razonable.

### Estabilidad
- [ ] 30–60 minutos de reproducción continua sin cierre inesperado.
- [ ] Suspender el televisor y volver: la app no se queda en negro.

## Si algo va mal

| Síntoma | Qué hacer |
| --- | --- |
| "App not installed" | Casi siempre es ABI: el APK es ARM; un TV x86 o un emulador no sirve |
| Instalación bloqueada | *Ajustes → Seguridad → Fuentes desconocidas* para el instalador usado |
| No aparece en la fila de apps | Abre el cajón de aplicaciones del TV; algunas launchers no muestran sideloads |
| Cuelgue al iniciar | Desinstala, reinstala y revisa IPv6 en la red (corregido en 0.9.3) |
| Quiero volver atrás | Desinstala e instala la versión anterior desde la lista de releases |

Antes de abrir un issue, comprueba que el fallo ocurre **con más de un add-on**;
si solo pasa con uno, el problema es del add-on, no de WuPlay.

## Qué faltaría para hablar de "producción"

Nada de esta lista se puede resolver dentro de este repositorio:

1. **Código fuente y build reproducible** de la app (aquí no está).
2. **Firma de release** propia y un pipeline que genere el APK (no hay Gradle ni
   workflows de build en este repo).
3. **Salir de beta**: versión estable, sin funciones experimentales activadas por
   defecto.
4. **Pruebas en dispositivos reales** de la matriz de arriba en al menos 2–3
   modelos (Chromecast, Shield, Fire TV).
5. **Política de privacidad y soporte** publicadas para usuarios finales.
6. **Revisión de licencias** si se redistribuye este repo: el contenido de WuPlay
   es CC0, pero `reference/nuviotv/` es GPL-3.0 (ver `THIRD_PARTY_NOTICES.md`).

Mientras eso no exista, lo honesto es tratar `v0.9.3-beta` como **beta para
probar**, no como instalación de producción.
