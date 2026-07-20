package com.automotive.alms.feature.home.presentation

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.automirrored.filled.Assignment
import androidx.compose.material.icons.automirrored.filled.Logout
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Inventory
import androidx.compose.material.icons.filled.LocalShipping
import androidx.compose.material.icons.filled.QrCodeScanner
import androidx.compose.material.icons.filled.Warehouse
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.dp
import com.automotive.alms.core.auth.SessionStore
import com.automotive.alms.core.model.Role
import com.automotive.alms.core.navigation.AppRoute
import com.automotive.alms.core.permission.PermissionManager
import com.automotive.alms.core.ui.ActionModuleCard
import com.automotive.alms.core.ui.AppBackground
import com.automotive.alms.core.ui.Dimens
import com.automotive.alms.core.ui.HeaderPanel
import com.automotive.alms.core.ui.StatusPill
import com.automotive.alms.feature.home.model.HomeActions

@Composable
fun HomeScreen(
    sessionStore: SessionStore,
    permissionManager: PermissionManager,
    onOpenRoute: (AppRoute) -> Unit,
    onLogout: () -> Unit,
) {
    val session by sessionStore.state.collectAsState()
    val user = session.loginResult?.user
    val actions = HomeActions.all.filter { permissionManager.has(it.requiredPermission) }

    AppBackground {
        LazyVerticalGrid(
            columns = GridCells.Adaptive(minSize = 156.dp),
            modifier = Modifier
                .fillMaxSize()
                .padding(horizontal = Dimens.PagePadding),
        ) {
            item(span = { GridItemSpan(maxLineSpan) }) {
                Column(modifier = Modifier.padding(top = 28.dp, bottom = 18.dp)) {
                    Row(modifier = Modifier.fillMaxWidth()) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text(text = "工作台", style = MaterialTheme.typography.headlineMedium)
                            Text(
                                text = "按账号权限展示可操作模块",
                                modifier = Modifier.padding(top = 4.dp),
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                        IconButton(onClick = onLogout) {
                            Icon(imageVector = Icons.AutoMirrored.Filled.Logout, contentDescription = "退出登录")
                        }
                    }

                    HeaderPanel(
                        title = user?.displayName ?: "未登录用户",
                        subtitle = roleLabel(user?.role),
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(top = 18.dp),
                    ) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Filled.ArrowForward,
                            contentDescription = null,
                            tint = Color(0xFFC9DCD6),
                        )
                    }

                    Row(modifier = Modifier.padding(top = 12.dp)) {
                        StatusPill(text = "${actions.size} 个可用模块")
                        session.loginResult?.activeOrgId?.let {
                            StatusPill(
                                text = "已选机构",
                                modifier = Modifier.padding(start = 8.dp),
                                color = MaterialTheme.colorScheme.secondary,
                            )
                        }
                    }

                    Text(
                        text = "常用操作",
                        modifier = Modifier.padding(top = 24.dp),
                        style = MaterialTheme.typography.titleLarge,
                    )
                    Text(
                        text = "现场扫码、库存查询和运输任务会在这里聚合。",
                        modifier = Modifier.padding(top = 4.dp, bottom = 12.dp),
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }

            if (actions.isEmpty()) {
                item(span = { GridItemSpan(maxLineSpan) }) {
                    Text(
                        text = "当前账号没有移动端可用功能。",
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }

            items(actions) { action ->
                ActionModuleCard(
                    title = action.title,
                    subtitle = action.subtitle,
                    icon = iconFor(action.route),
                    accent = accentFor(action.route),
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(end = 10.dp, bottom = 10.dp),
                    onClick = { onOpenRoute(action.route) },
                )
            }
        }
    }
}

private fun roleLabel(role: Role?): String {
    return when (role) {
        Role.HQ_ADMIN -> "总部管理员"
        Role.ORG_ADMIN -> "机构管理员"
        Role.YARD_STAFF -> "场地业务员"
        Role.CUSTOMER -> "客户账号"
        Role.CARRIER_STAFF -> "承运商业务员"
        Role.CARRIER_DRIVER -> "承运商司机"
        null -> "未知角色"
    }
}

private fun iconFor(route: AppRoute): ImageVector {
    return when (route) {
        AppRoute.InboundScan -> Icons.Filled.Warehouse
        AppRoute.PickupScan -> Icons.Filled.QrCodeScanner
        AppRoute.WaybillList -> Icons.Filled.LocalShipping
        AppRoute.YardInventory -> Icons.Filled.Inventory
        AppRoute.OutboundOrders -> Icons.AutoMirrored.Filled.Assignment
        else -> Icons.AutoMirrored.Filled.ArrowForward
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
