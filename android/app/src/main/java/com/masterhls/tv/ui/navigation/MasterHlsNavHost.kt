package com.masterhls.tv.ui.navigation

import androidx.compose.runtime.Composable
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.navArgument
import com.masterhls.tv.ui.screens.addons.AddonsScreen
import com.masterhls.tv.ui.screens.detail.DetailScreen
import com.masterhls.tv.ui.screens.home.HomeScreen
import com.masterhls.tv.ui.screens.player.PlayerScreen
import com.masterhls.tv.util.HeaderCodec
import java.net.URLDecoder
import java.net.URLEncoder

object Routes {
    const val HOME = "home"
    const val DETAIL = "detail/{type}/{id}"
    const val PLAYER = "player/{type}/{id}?url={url}&name={name}&title={title}&h={h}"

    fun detail(type: String, id: String) = "detail/$type/${encode(id)}"

    /**
     * Ruta del reproductor.
     *
     * Las cabeceras HTTP del stream viajan en `h` (JSON en base64) para que el
     * reproductor pueda replicar las peticiones que exige el CDN.
     */
    fun player(
        type: String,
        id: String,
        url: String,
        name: String,
        title: String,
        headers: Map<String, String> = emptyMap(),
    ): String {
        val encodedId = encode(id)
        val encodedUrl = encode(url)
        val encodedName = encode(name)
        val encodedTitle = encode(title)
        val encodedHeaders = encode(HeaderCodec.encode(headers))
        return "player/$type/$encodedId" +
            "?url=$encodedUrl&name=$encodedName&title=$encodedTitle&h=$encodedHeaders"
    }

    /**
     * Codifica un valor de la ruta.
     *
     * `URLEncoder` convierte los espacios en `+`, que al decodificar se
     * confundirian con un signo mas literal, asi que se convierten en `%20`.
     */
    private fun encode(value: String): String =
        URLEncoder.encode(value, "UTF-8").replace("+", "%20")

    /**
     * Decodifica un valor de la ruta.
     *
     * El `+` se protege antes de decodificar para no perder los signos mas
     * literales de las URLs firmadas de los CDN.
     */
    fun decode(value: String?): String {
        val raw = value.orEmpty()
        if (raw.isEmpty()) return raw
        return runCatching { URLDecoder.decode(raw.replace("+", "%2B"), "UTF-8") }
            .getOrDefault(raw)
    }
}

@Composable
fun MasterHlsNavHost(navController: NavHostController) {
    NavHost(navController = navController, startDestination = Routes.HOME) {
        composable(Routes.HOME) {
            HomeScreen(
                onOpenDetail = { type, id -> navController.navigate(Routes.detail(type, id)) },
                onOpenAddons = { navController.navigate("addons") },
            )
        }

        composable(
            route = Routes.DETAIL,
            arguments = listOf(
                navArgument("type") { type = NavType.StringType },
                navArgument("id") { type = NavType.StringType },
            ),
        ) { entry ->
            val type = entry.arguments?.getString("type") ?: "movie"
            val id = Routes.decode(entry.arguments?.getString("id"))
            DetailScreen(
                type = type,
                id = id,
                onBack = { navController.popBackStack() },
                onPlay = { streamUrl, streamName, title, headers ->
                    navController.navigate(
                        Routes.player(type, id, streamUrl, streamName, title, headers),
                    )
                },
            )
        }

        composable(
            route = Routes.PLAYER,
            arguments = listOf(
                navArgument("type") { type = NavType.StringType },
                navArgument("id") { type = NavType.StringType },
                navArgument("url") { type = NavType.StringType; defaultValue = "" },
                navArgument("name") { type = NavType.StringType; defaultValue = "" },
                navArgument("title") { type = NavType.StringType; defaultValue = "" },
                navArgument("h") { type = NavType.StringType; defaultValue = "" },
            ),
        ) { entry ->
            val headers = HeaderCodec.decode(Routes.decode(entry.arguments?.getString("h")))
            PlayerScreen(
                type = entry.arguments?.getString("type") ?: "movie",
                id = Routes.decode(entry.arguments?.getString("id")),
                url = Routes.decode(entry.arguments?.getString("url")),
                streamName = Routes.decode(entry.arguments?.getString("name")),
                title = Routes.decode(entry.arguments?.getString("title")),
                headers = headers,
                onBack = { navController.popBackStack() },
            )
        }

        composable("addons") {
            AddonsScreen(onBack = { navController.popBackStack() })
        }
    }
}
