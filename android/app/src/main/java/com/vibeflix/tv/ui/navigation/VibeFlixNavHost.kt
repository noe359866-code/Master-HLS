package com.vibeflix.tv.ui.navigation

import androidx.compose.runtime.Composable
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.navArgument
import com.vibeflix.tv.ui.screens.addons.AddonsScreen
import com.vibeflix.tv.ui.screens.browse.BrowseDetailScreen
import com.vibeflix.tv.ui.screens.browse.DecadesScreen
import com.vibeflix.tv.ui.screens.browse.GenresScreen
import com.vibeflix.tv.ui.screens.search.SearchScreen
import com.vibeflix.tv.ui.screens.detail.DetailScreen
import com.vibeflix.tv.ui.screens.home.HomeScreen
import com.vibeflix.tv.ui.screens.player.PlayerScreen
import com.vibeflix.tv.ui.screens.profiles.ProfilesScreen
import com.vibeflix.tv.util.HeaderCodec
import java.net.URLDecoder
import java.net.URLEncoder

object Routes {
    const val PROFILES = "profiles"
    const val HOME = "home"
    const val DETAIL = "detail/{type}/{id}"
    const val PLAYER = "player/{type}/{id}?url={url}&name={name}&title={title}&h={h}&sub={sub}"
    const val SEARCH = "search"
    const val GENRES = "genres"
    const val DECADES = "decades"
    const val GENRE = "genre/{catalog}/{name}"
    const val DECADE = "decade/{id}/{label}"

    fun detail(type: String, id: String) = "detail/$type/${encode(id)}"

    /** Ficha de un genero. */
    fun genre(catalog: String, name: String) = "genre/${encode(catalog)}/${encode(name)}"

    /** Ficha de una decada. */
    fun decade(id: String, label: String) = "decade/${encode(id)}/${encode(label)}"

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
        subtitleUrl: String = "",
    ): String {
        val encodedId = encode(id)
        val encodedUrl = encode(url)
        val encodedName = encode(name)
        val encodedTitle = encode(title)
        val encodedHeaders = encode(HeaderCodec.encode(headers))
        val encodedSubtitle = encode(subtitleUrl)
        return "player/$type/$encodedId" +
            "?url=$encodedUrl&name=$encodedName&title=$encodedTitle" +
            "&h=$encodedHeaders&sub=$encodedSubtitle"
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
fun VibeFlixNavHost(navController: NavHostController) {
    NavHost(navController = navController, startDestination = Routes.PROFILES) {
        composable(Routes.PROFILES) {
            ProfilesScreen(
                onEntered = {
                    val previous = navController.previousBackStackEntry?.destination?.route
                    navController.navigate(Routes.HOME) {
                        popUpTo(if (previous == Routes.HOME) Routes.HOME else Routes.PROFILES) {
                            inclusive = true
                        }
                    }
                },
                onBack = { navController.popBackStack() },
                canGoBack = navController.previousBackStackEntry != null,
            )
        }

        composable(Routes.HOME) {
            HomeScreen(
                onOpenProfiles = { navController.navigate(Routes.PROFILES) },
                onOpenDetail = { type, id -> navController.navigate(Routes.detail(type, id)) },
                onOpenAddons = { navController.navigate("addons") },
                onOpenSearch = { navController.navigate(Routes.SEARCH) },
                onOpenGenres = { navController.navigate(Routes.GENRES) },
                onOpenDecades = { navController.navigate(Routes.DECADES) },
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
                onPlay = { episodeId, streamUrl, streamName, title, headers, subtitleUrl ->
                    navController.navigate(
                        Routes.player(
                            type = if (episodeId == id) type else "episode",
                            id = episodeId,
                            url = streamUrl,
                            name = streamName,
                            title = title,
                            headers = headers,
                            subtitleUrl = subtitleUrl,
                        ),
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
                navArgument("sub") { type = NavType.StringType; defaultValue = "" },
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
                subtitleUrl = Routes.decode(entry.arguments?.getString("sub")),
                onBack = { navController.popBackStack() },
                onNextEpisode = { nextId, nextUrl, nextName, nextTitle ->
                    // Autoplay: se sustituye el episodio actual por el
                    // siguiente, conservando la pila de navegacion.
                    navController.navigate(
                        Routes.player("episode", nextId, nextUrl, nextName, nextTitle),
                    )
                },
            )
        }

        composable("addons") {
            AddonsScreen(onBack = { navController.popBackStack() })
        }

        // Buscador nativo con teclado en pantalla (estilo WuPlay).
        composable(Routes.SEARCH) {
            SearchScreen(
                onOpenDetail = { type, id -> navController.navigate(Routes.detail(type, id)) },
                onBack = { navController.popBackStack() },
            )
        }

        // Pantallas de generos y decadas (estilo WuPlay).
        composable(Routes.GENRES) {
            GenresScreen(
                onOpenGenre = { catalog, name ->
                    navController.navigate(Routes.genre(catalog, name))
                },
                onBack = { navController.popBackStack() },
            )
        }

        composable(Routes.DECADES) {
            DecadesScreen(
                onOpenDecade = { id, label -> navController.navigate(Routes.decade(id, label)) },
                onBack = { navController.popBackStack() },
            )
        }

        composable(
            route = Routes.GENRE,
            arguments = listOf(
                navArgument("catalog") { type = NavType.StringType },
                navArgument("name") { type = NavType.StringType; defaultValue = "" },
            ),
        ) { entry ->
            val catalog = Routes.decode(entry.arguments?.getString("catalog"))
            val name = Routes.decode(entry.arguments?.getString("name"))
            BrowseDetailScreen(
                title = name.ifBlank { "Género" },
                genre = catalog,
                onOpenDetail = { type, id -> navController.navigate(Routes.detail(type, id)) },
                onBack = { navController.popBackStack() },
            )
        }

        composable(
            route = Routes.DECADE,
            arguments = listOf(
                navArgument("id") { type = NavType.StringType },
                navArgument("label") { type = NavType.StringType; defaultValue = "" },
            ),
        ) { entry ->
            val id = Routes.decode(entry.arguments?.getString("id"))
            val label = Routes.decode(entry.arguments?.getString("label"))
            BrowseDetailScreen(
                title = label.ifBlank { "Década" },
                decade = id,
                onOpenDetail = { type, id2 -> navController.navigate(Routes.detail(type, id2)) },
                onBack = { navController.popBackStack() },
            )
        }
    }
}
