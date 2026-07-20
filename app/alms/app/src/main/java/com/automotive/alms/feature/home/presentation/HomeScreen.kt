package com.automotive.alms.feature.home.presentation

import androidx.annotation.StringRes
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Assignment
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Inventory
import androidx.compose.material.icons.filled.LocalShipping
import androidx.compose.material.icons.filled.QrCodeScanner
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Warehouse
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.automotive.alms.R
import com.automotive.alms.core.auth.SessionStore
import com.automotive.alms.core.model.Role
import com.automotive.alms.core.navigation.AppRoute
import com.automotive.alms.core.permission.PermissionManager
import com.automotive.alms.core.ui.ActionModuleCard
import com.automotive.alms.core.ui.AppBackground
import com.automotive.alms.core.ui.Dimens
import com.automotive.alms.core.ui.HeaderPanel
import com.automotive.alms.core.ui.StatusPill
import com.automotive.alms.feature.home.model.HomeAction
import com.automotive.alms.feature.home.model.HomeActions

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HomeScreen(
    sessionStore: SessionStore,
    permissionManager: PermissionManager,
    onLogout: () -> Unit,
) {
    val session by sessionStore.state.collectAsState()
    val user = session.loginResult?.user
    val actions = HomeActions.all.filter { permissionManager.has(it.requiredPermission) }
    val bottomTabs = remember(actions) {
        listOf(MainTab.Home) + actions.take(4).map {
            MainTab.Feature(
                route = it.route,
                labelRes = it.titleRes,
                icon = iconFor(it.route),
            )
        }
    }
    var selectedRoute by rememberSaveable { mutableStateOf(AppRoute.Home.path) }
    val selectedTab = bottomTabs.firstOrNull { it.route.path == selectedRoute } ?: MainTab.Home

    AppBackground {
        Scaffold(
            containerColor = Color.Transparent,
            topBar = {
                TopAppBar(
                    title = {
                        Text(
                            text = stringResource(R.string.home_title),
                            style = MaterialTheme.typography.titleLarge,
                        )
                    },
                    actions = {
                        AvatarMenu(
                            name = user?.displayName.orEmpty(),
                            role = user?.role,
                            onLogout = onLogout,
                        )
                    },
                    colors = TopAppBarDefaults.topAppBarColors(containerColor = Color.Transparent),
                )
            },
            bottomBar = {
                NavigationBar(containerColor = MaterialTheme.colorScheme.surface) {
                    bottomTabs.forEach { tab ->
                        NavigationBarItem(
                            selected = selectedTab.route == tab.route,
                            onClick = { selectedRoute = tab.route.path },
                            icon = { Icon(tab.icon, contentDescription = null) },
                            label = { Text(stringResource(tab.labelRes)) },
                        )
                    }
                }
            },
        ) { padding ->
            when (val tab = selectedTab) {
                MainTab.Home -> HomeDashboard(
                    padding = padding,
                    userName = user?.displayName.orEmpty(),
                    role = user?.role,
                    actions = actions,
                    availableTabRoutes = bottomTabs.map { it.route.path }.toSet(),
                    onSelectRoute = { route -> selectedRoute = route.path },
                )

                is MainTab.Feature -> FeaturePlaceholder(
                    padding = padding,
                    route = tab.route,
                )
            }
        }
    }
}

@Composable
private fun HomeDashboard(
    padding: PaddingValues,
    userName: String,
    role: Role?,
    actions: List<HomeAction>,
    availableTabRoutes: Set<String>,
    onSelectRoute: (AppRoute) -> Unit,
) {
    LazyVerticalGrid(
        columns = GridCells.Adaptive(minSize = 156.dp),
        modifier = Modifier
            .fillMaxSize()
            .padding(padding)
            .padding(horizontal = Dimens.PagePadding),
        verticalArrangement = Arrangement.spacedBy(10.dp),
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        item(span = { GridItemSpan(maxLineSpan) }) {
            Column(modifier = Modifier.padding(top = 10.dp, bottom = 12.dp)) {
                HeaderPanel(
                    title = userName.ifBlank { stringResource(R.string.app_name) },
                    subtitle = roleLabel(role),
                    modifier = Modifier.fillMaxWidth(),
                )
                Row(modifier = Modifier.padding(top = 12.dp)) {
                    StatusPill(text = stringResource(R.string.available_modules, actions.size))
                }
                Text(
                    text = stringResource(R.string.quick_actions),
                    modifier = Modifier.padding(top = 22.dp, bottom = 10.dp),
                    style = MaterialTheme.typography.titleLarge,
                )
            }
        }

        if (actions.isEmpty()) {
            item(span = { GridItemSpan(maxLineSpan) }) {
                Text(
                    text = stringResource(R.string.empty_modules),
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }

        items(actions) { action ->
            ActionModuleCard(
                title = stringResource(action.titleRes),
                subtitle = stringResource(action.subtitleRes),
                icon = iconFor(action.route),
                accent = accentFor(action.route),
                onClick = {
                    if (availableTabRoutes.contains(action.route.path)) {
                        onSelectRoute(action.route)
                    }
                },
            )
        }
    }
}

@Composable
private fun FeaturePlaceholder(
    padding: PaddingValues,
    route: AppRoute,
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(padding)
            .padding(Dimens.PagePadding),
    ) {
        Text(
            text = stringResource(titleFor(route)),
            style = MaterialTheme.typography.headlineSmall,
        )
        Text(
            text = stringResource(subtitleFor(route)),
            modifier = Modifier.padding(top = 8.dp),
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        StatusPill(
            text = stringResource(R.string.placeholder_pending),
            modifier = Modifier.padding(top = 18.dp),
            color = accentFor(route),
        )
    }
}

@Composable
private fun AvatarMenu(
    name: String,
    role: Role?,
    onLogout: () -> Unit,
) {
    var expanded by remember { mutableStateOf(false) }
    Box(modifier = Modifier.padding(end = 12.dp)) {
        Box(
            modifier = Modifier
                .size(38.dp)
                .clip(CircleShape)
                .background(MaterialTheme.colorScheme.primary)
                .clickable { expanded = true },
            contentAlignment = Alignment.Center,
        ) {
            Text(
                text = avatarText(name),
                color = MaterialTheme.colorScheme.onPrimary,
                fontWeight = FontWeight.SemiBold,
            )
        }
        DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
            DropdownMenuItem(
                text = {
                    Column {
                        Text(name.ifBlank { stringResource(R.string.app_name) })
                        Text(
                            roleLabel(role),
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            style = MaterialTheme.typography.bodyMedium,
                        )
                    }
                },
                onClick = { expanded = false },
            )
            DropdownMenuItem(
                leadingIcon = { Icon(Icons.Filled.Settings, contentDescription = null) },
                text = { Text(stringResource(R.string.menu_settings)) },
                onClick = { expanded = false },
            )
            DropdownMenuItem(
                text = { Text(stringResource(R.string.menu_logout)) },
                onClick = {
                    expanded = false
                    onLogout()
                },
            )
        }
    }
}

@Composable
private fun roleLabel(role: Role?): String {
    return when (role) {
        Role.HQ_ADMIN -> stringResource(R.string.role_hq_admin)
        Role.ORG_ADMIN -> stringResource(R.string.role_org_admin)
        Role.YARD_STAFF -> stringResource(R.string.role_yard_staff)
        Role.CUSTOMER -> stringResource(R.string.role_customer)
        Role.CARRIER_STAFF -> stringResource(R.string.role_carrier_staff)
        Role.CARRIER_DRIVER -> stringResource(R.string.role_carrier_driver)
        null -> stringResource(R.string.role_unknown)
    }
}

private fun avatarText(name: String): String {
    return name.trim().takeIf { it.isNotEmpty() }?.take(1)?.uppercase() ?: "A"
}

private fun iconFor(route: AppRoute): ImageVector {
    return when (route) {
        AppRoute.Home -> Icons.Filled.Home
        AppRoute.InboundScan -> Icons.Filled.Warehouse
        AppRoute.PickupScan -> Icons.Filled.QrCodeScanner
        AppRoute.WaybillList -> Icons.Filled.LocalShipping
        AppRoute.YardInventory -> Icons.Filled.Inventory
        AppRoute.OutboundOrders -> Icons.AutoMirrored.Filled.Assignment
        else -> Icons.Filled.Home
    }
}

private fun accentFor(route: AppRoute): Color {
    return when (route) {
        AppRoute.InboundScan -> Color(0xFF116B58)
        AppRoute.PickupScan -> Color(0xFF315D8C)
        AppRoute.WaybillList -> Color(0xFF7B4FA1)
        AppRoute.YardInventory -> Color(0xFF8A5B13)
        AppRoute.OutboundOrders -> Color(0xFFB4472D)
        else -> Color(0xFF475569)
    }
}

@StringRes
private fun titleFor(route: AppRoute): Int {
    return when (route) {
        AppRoute.InboundScan -> R.string.inbound_scan
        AppRoute.PickupScan -> R.string.pickup_scan
        AppRoute.WaybillList -> R.string.waybills
        AppRoute.YardInventory -> R.string.vin_inventory
        AppRoute.OutboundOrders -> R.string.outbound_orders
        else -> R.string.app_name
    }
}

@StringRes
private fun subtitleFor(route: AppRoute): Int {
    return when (route) {
        AppRoute.InboundScan -> R.string.placeholder_inbound
        AppRoute.PickupScan -> R.string.placeholder_pickup
        AppRoute.WaybillList -> R.string.placeholder_waybill
        AppRoute.YardInventory -> R.string.placeholder_inventory
        AppRoute.OutboundOrders -> R.string.placeholder_outbound
        else -> R.string.brand_subtitle
    }
}

private sealed class MainTab(
    val route: AppRoute,
    @StringRes val labelRes: Int,
    val icon: ImageVector,
) {
    data object Home : MainTab(
        route = AppRoute.Home,
        labelRes = R.string.tab_home,
        icon = Icons.Filled.Home,
    )

    class Feature(
        route: AppRoute,
        @StringRes labelRes: Int,
        icon: ImageVector,
    ) : MainTab(route, labelRes, icon)
}
