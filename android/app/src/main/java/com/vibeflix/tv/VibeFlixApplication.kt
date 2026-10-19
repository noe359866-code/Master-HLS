package com.vibeflix.tv

import android.app.Application
import dagger.hilt.android.HiltAndroidApp

/**
 * Vibe Flix TV: cliente Android TV del servidor Vibe Flix.
 *
 * El nucleo (agregacion de addons Stremio y seleccion de variantes HLS) vive
 * en el servidor; la app Android es el shell de TV: interfaz Compose for TV y
 * reproductor Media3.
 */
@HiltAndroidApp
class VibeFlixApplication : Application()
