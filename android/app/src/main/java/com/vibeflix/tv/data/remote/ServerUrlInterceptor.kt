package com.vibeflix.tv.data.remote

import com.vibeflix.tv.data.local.ServerConfigStore
import okhttp3.HttpUrl
import okhttp3.Interceptor
import okhttp3.Response
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Interceptor de OkHttp que reescribe dinámicamente las peticiones hacia
 * la URL del servidor actualmente configurada por el usuario.
 *
 * Permite cambiar de servidor (LAN, IP pública o dominio con HTTPS) sin
 * reconstruir Retrofit ni reiniciar la app: la URL base de compilación solo
 * actúa como marcador para que Retrofit construya las rutas relativas.
 */
@Singleton
class ServerUrlInterceptor @Inject constructor(
    private val serverConfigStore: ServerConfigStore,
) : Interceptor {

    override fun intercept(chain: Interceptor.Chain): Response {
        val request = chain.request()
        val targetBase = serverConfigStore.getBaseHttpUrl()
        if (targetBase == null) return chain.proceed(request)
        val newUrl = resolveUrl(targetBase, request.url)
        return chain.proceed(request.newBuilder().url(newUrl).build())
    }

    companion object {
        /**
         * Sustituye esquema, host, puerto y (si la base tiene) prefijo de ruta,
         * conservando la ruta relativa, los parámetros y el fragmento original.
         */
        fun resolveUrl(baseHttpUrl: HttpUrl, originalUrl: HttpUrl): HttpUrl {
            val basePath = baseHttpUrl.encodedPath.trimEnd('/')
            val relativePath = originalUrl.encodedPath.removePrefix("/")
            return baseHttpUrl.newBuilder()
                .encodedPath("$basePath/$relativePath")
                .encodedQuery(originalUrl.encodedQuery)
                .encodedFragment(originalUrl.encodedFragment)
                .build()
        }
    }
}
