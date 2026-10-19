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

object Routes {
    const val HOME = "home"
    const val DETAIL = "detail/{type}/{id}"
    const val PLAYER = "player/{type}/{id}?url={url}&name={name}&title={title}"

    fun detail(type: String, id: String) = "detail/$type/${java.net.URLEncoder.encode(id, "UTF-8")}"

    fun player(
        type: String,
        id: String,
        url: String,
        name: String,
        title: String,
    ): String {
        val encodedId = java.net.URLEncoder.encode(id, "UTF-8")
        val encodedUrl = java.net.URLEncoder.encode(url, "UTF-8")
        val encodedName = java.net.URLEncoder.encode(name, "UTF-8")
        val encodedTitle = java.net.URLEncoder.encode(title, "UTF-8")
        return "player/$type/$encodedId?url=$encodedUrl&name=$encodedName&title=$encodedTitle"
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
            val id = java.net.URLDecoder.decode(
                entry.arguments?.getString("id").orEmpty(),
                "UTF-8",
            )
            DetailScreen(
                type = type,
                id = id,
                onBack = { navController.popBackStack() },
                onPlay = { streamUrl, streamName, title ->
                    navController.navigate(Routes.player(type, id, streamUrl, streamName, title))
                },
            )
        }

        composable(
            route = "player/{type}/{id}?url={url}&name={name}&title={title}",
            arguments = listOf(
                navArgument("type") { type = NavType.StringType },
                navArgument("id") { type = NavType.StringType },
                navArgument("url") { type = NavType.StringType; defaultValue = "" },
                navArgument("name") { type = NavType.StringType; defaultValue = "" },
                navArgument("title") { type = NavType.StringType; defaultValue = "" },
            ),
        ) { entry ->
            PlayerScreen(
                type = entry.arguments?.getString("type") ?: "movie",
                id = java.net.URLDecoder.decode(entry.arguments?.getString("id").orEmpty(), "UTF-8"),
                url = java.net.URLDecoder.decode(entry.arguments?.getString("url").orEmpty(), "UTF-8"),
                streamName = java.net.URLDecoder.decode(
                    entry.arguments?.getString("name").orEmpty(),
                    "UTF-8",
                ),
                title = java.net.URLDecoder.decode(
                    entry.arguments?.getString("title").orEmpty(),
                    "UTF-8",
                ),
                onBack = { navController.popBackStack() },
            )
        }

        composable("addons") {
            AddonsScreen(onBack = { navController.popBackStack() })
        }
    }
}
