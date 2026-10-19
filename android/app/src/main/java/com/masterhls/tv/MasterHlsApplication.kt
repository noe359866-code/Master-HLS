package com.masterhls.tv

import android.app.Application
import dagger.hilt.android.HiltAndroidApp

/**
 * Master-HLS TV: cliente Android TV del servidor Master-HLS.
 *
 * El nucleo (agregacion de addons Stremio y seleccion de variantes HLS) vive
 * en el servidor; la app Android es el shell de TV: interfaz Compose for TV y
 * reproductor Media3.
 */
@HiltAndroidApp
class MasterHlsApplication : Application()
