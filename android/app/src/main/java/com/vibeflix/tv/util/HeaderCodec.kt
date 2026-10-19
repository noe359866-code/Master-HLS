package com.vibeflix.tv.util

import android.util.Base64
import org.json.JSONObject

/**
 * Codificacion de las cabeceras HTTP de un stream para llevarlas en la ruta
 * de navegacion.
 *
 * El protocolo Stremio permite que un addon indique cabeceras de peticion
 * (`behaviorHints.proxyHeaders.request`), necesarias para muchos CDN
 * (Referer, User-Agent, cookies). El reproductor de Android necesita
 * recibirlas, y la ruta de navegacion solo admite cadenas: por eso se
 * serializan a JSON y se codifican en base64 URL-safe.
 */
object HeaderCodec {

    /** Codifica un mapa de cabeceras (cadena vacia si no hay ninguna). */
    fun encode(headers: Map<String, String>): String {
        if (headers.isEmpty()) return ""
        val json = JSONObject().apply {
            headers.forEach { (key, value) -> put(key, value) }
        }.toString()
        return Base64.encodeToString(
            json.toByteArray(Charsets.UTF_8),
            Base64.NO_WRAP or Base64.URL_SAFE,
        )
    }

    /** Decodifica un mapa de cabeceras (mapa vacio si el valor no es valido). */
    fun decode(encoded: String?): Map<String, String> {
        if (encoded.isNullOrBlank()) return emptyMap()
        return try {
            val json = String(
                Base64.decode(encoded, Base64.NO_WRAP or Base64.URL_SAFE),
                Charsets.UTF_8,
            )
            val jsonObject = JSONObject(json)
            buildMap {
                val keys = jsonObject.keys()
                while (keys.hasNext()) {
                    val key = keys.next()
                    put(key, jsonObject.optString(key))
                }
            }
        } catch (error: Throwable) {
            emptyMap()
        }
    }
}
