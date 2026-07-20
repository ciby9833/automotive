package com.automotive.alms.core.navigation

import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.automotive.alms.core.config.AppContainer
import com.automotive.alms.core.model.LoginMode
import com.automotive.alms.feature.auth.presentation.LoginScreen
import com.automotive.alms.feature.auth.presentation.OrgSelectScreen
import com.automotive.alms.feature.home.presentation.HomeScreen
import com.automotive.alms.feature.inbound.presentation.InboundScanScreen
import com.automotive.alms.feature.outbound.presentation.OutboundOrdersScreen
import com.automotive.alms.feature.pickup.presentation.PickupScanScreen
import com.automotive.alms.feature.waybill.presentation.WaybillListScreen
import com.automotive.alms.feature.yard.presentation.YardInventoryScreen

@Composable
fun AlmsApp(container: AppContainer) {
    val navController = rememberNavController()
    val session by container.sessionStore.state.collectAsState()

    val startRoute = when {
        session.loginResult?.mode == LoginMode.NEEDS_SELECTION -> AppRoute.OrgSelect
        session.isAuthenticated -> AppRoute.Home
        else -> AppRoute.Login
    }

    NavHost(
        navController = navController,
        startDestination = startRoute.path,
    ) {
        composable(AppRoute.Login.path) {
            LoginScreen(
                authRepository = container.authRepository,
                onNeedsOrgSelection = {
                    navController.navigate(AppRoute.OrgSelect.path) {
                        popUpTo(AppRoute.Login.path) { inclusive = true }
                    }
                },
                onLoggedIn = {
                    navController.navigate(AppRoute.Home.path) {
                        popUpTo(AppRoute.Login.path) { inclusive = true }
                    }
                },
            )
        }
        composable(AppRoute.OrgSelect.path) {
            OrgSelectScreen(
                sessionStore = container.sessionStore,
                authRepository = container.authRepository,
                onSelected = {
                    navController.navigate(AppRoute.Home.path) {
                        popUpTo(AppRoute.OrgSelect.path) { inclusive = true }
                    }
                },
            )
        }
        composable(AppRoute.Home.path) {
            HomeScreen(
                sessionStore = container.sessionStore,
                permissionManager = container.permissionManager,
                onOpenRoute = { route -> navController.navigate(route.path) },
                onLogout = {
                    container.authRepository.logoutLocal()
                    navController.navigate(AppRoute.Login.path) {
                        popUpTo(0) { inclusive = true }
                    }
                },
            )
        }
        composable(AppRoute.InboundScan.path) { InboundScanScreen() }
        composable(AppRoute.PickupScan.path) { PickupScanScreen() }
        composable(AppRoute.WaybillList.path) { WaybillListScreen() }
        composable(AppRoute.YardInventory.path) { YardInventoryScreen() }
        composable(AppRoute.OutboundOrders.path) { OutboundOrdersScreen() }
    }
}
