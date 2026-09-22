package com.automotive.alms.feature.home.presentation

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Assignment
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.AltRoute
import androidx.compose.material.icons.filled.Dashboard
import androidx.compose.material.icons.filled.DirectionsCar
import androidx.compose.material.icons.filled.LocalShipping
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Warehouse
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.automotive.alms.R
import com.automotive.alms.core.auth.SessionStore
import com.automotive.alms.core.evidence.accountUnitName
import com.automotive.alms.core.locale.AppLanguage
import com.automotive.alms.core.locale.AppLocaleManager
import com.automotive.alms.core.model.LoginResult
import com.automotive.alms.core.model.Role
import com.automotive.alms.core.navigation.AppRoute
import com.automotive.alms.core.permission.PermissionManager
import com.automotive.alms.core.ui.ContentCard
import com.automotive.alms.core.ui.Dimens
import com.automotive.alms.core.ui.EmptyState
import com.automotive.alms.core.ui.ListCard
import com.automotive.alms.core.ui.SectionHeader
import com.automotive.alms.core.ui.SelectableRow
import com.automotive.alms.feature.home.model.HomeAction
import com.automotive.alms.feature.home.model.HomeActions

private enum class MainTab { Work, Profile }

@Composable
fun HomeScreen(
    sessionStore: SessionStore,
    permissionManager: PermissionManager,
    onOpen: (AppRoute) -> Unit,
    onLogout: () -> Unit,
) {
    val session by sessionStore.state.collectAsState()
    val loginResult = session.loginResult
    val actions = HomeActions.all.filter { permissionManager.has(it.requiredPermission) }
    var tab by rememberSaveable { mutableStateOf(MainTab.Work) }

    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        bottomBar = {
            NavigationBar(containerColor = MaterialTheme.colorScheme.surface) {
                NavigationBarItem(
                    selected = tab == MainTab.Work,
                    onClick = { tab = MainTab.Work },
                    icon = { Icon(Icons.Filled.Dashboard, contentDescription = null) },
                    label = { Text(stringResource(R.string.tab_work)) },
                )
                NavigationBarItem(
                    selected = tab == MainTab.Profile,
                    onClick = { tab = MainTab.Profile },
                    icon = { Icon(Icons.Filled.Person, contentDescription = null) },
                    label = { Text(stringResource(R.string.tab_profile)) },
                )
            }
        },
    ) { padding ->
        when (tab) {
            MainTab.Work -> WorkTab(padding, loginResult, actions, onOpen)
            MainTab.Profile -> ProfileTab(padding, loginResult, onLogout)
        }
    }
}

@Composable
private fun WorkTab(
    padding: PaddingValues,
    loginResult: LoginResult?,
    actions: List<HomeAction>,
    onOpen: (AppRoute) -> Unit,
) {
    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .padding(padding),
        contentPadding = PaddingValues(Dimens.PagePadding),
        verticalArrangement = Arrangement.spacedBy(Dimens.ItemGap),
    ) {
        item { UserHeader(loginResult) }
        item {
            if (actions.isEmpty()) {
                EmptyState(stringResource(R.string.home_empty))
            } else {
                ContentCard(contentPadding = PaddingValues(0.dp)) {
                    Column {
                        actions.forEachIndexed { index, action ->
                            if (index > 0) {
                                HorizontalDivider(
                                    modifier = Modifier.padding(start = 68.dp),
                                    color = MaterialTheme.colorScheme.outlineVariant,
                                )
                            }
                            ActionRow(action = action, onClick = { onOpen(action.route) })
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun UserHeader(loginResult: LoginResult?) {
    val user = loginResult?.user
    Column(modifier = Modifier.padding(start = 4.dp, top = 12.dp, bottom = 12.dp)) {
        Text(
            text = user?.displayName?.takeIf { it.isNotBlank() } ?: stringResource(R.string.app_name),
            style = MaterialTheme.typography.headlineSmall,
        )
        Text(
            text = listOf(roleLabel(user?.role), loginResult.accountUnitName())
                .filter { it.isNotBlank() && it != "-" }
                .distinct()
                .joinToString(" · "),
            modifier = Modifier.padding(top = 2.dp),
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

@Composable
private fun ActionRow(action: HomeAction, onClick: () -> Unit) {
    androidx.compose.material3.Surface(onClick = onClick, color = MaterialTheme.colorScheme.surface) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .height(64.dp)
                .padding(horizontal = Dimens.CardPadding),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(
                modifier = Modifier
                    .size(40.dp)
                    .background(MaterialTheme.colorScheme.primaryContainer, RoundedCornerShape(10.dp)),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    imageVector = iconFor(action.route),
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.size(22.dp),
                )
            }
            Text(
                text = stringResource(action.titleRes),
                modifier = Modifier
                    .weight(1f)
                    .padding(start = 14.dp),
                style = MaterialTheme.typography.titleMedium,
            )
            Icon(
                Icons.AutoMirrored.Filled.KeyboardArrowRight,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.outline,
            )
        }
    }
}

@Composable
private fun ProfileTab(
    padding: PaddingValues,
    loginResult: LoginResult?,
    onLogout: () -> Unit,
) {
    val context = LocalContext.current
    val current = remember { AppLocaleManager.currentLanguage(context) }
    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .padding(padding),
        contentPadding = PaddingValues(Dimens.PagePadding),
        verticalArrangement = Arrangement.spacedBy(Dimens.ItemGap),
    ) {
        item { UserHeader(loginResult) }
        item {
            ContentCard {
                com.automotive.alms.core.ui.InfoLine(
                    label = stringResource(R.string.profile_account),
                    value = loginResult?.user?.username,
                )
            }
        }
        item { SectionHeader(stringResource(R.string.menu_language)) }
        item {
            ListCard(items = AppLanguage.entries) { language ->
                SelectableRow(
                    title = stringResource(language.labelRes),
                    selected = language == current,
                    onClick = { AppLocaleManager.setLanguage(context, language) },
                )
            }
        }
        item {
            OutlinedButton(
                onClick = onLogout,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = Dimens.SectionGap)
                    .height(Dimens.ActionHeight),
                shape = RoundedCornerShape(10.dp),
                colors = ButtonDefaults.outlinedButtonColors(contentColor = MaterialTheme.colorScheme.error),
            ) {
                Text(stringResource(R.string.menu_logout))
            }
        }
    }
}

@Composable
private fun roleLabel(role: Role?): String = when (role) {
    Role.HQ_ADMIN -> stringResource(R.string.role_hq_admin)
    Role.ORG_ADMIN -> stringResource(R.string.role_org_admin)
    Role.YARD_STAFF -> stringResource(R.string.role_yard_staff)
    Role.CUSTOMER -> stringResource(R.string.role_customer)
    Role.CARRIER_STAFF -> stringResource(R.string.role_carrier_staff)
    Role.CARRIER_DRIVER -> stringResource(R.string.role_carrier_driver)
    null -> ""
}

private fun iconFor(route: AppRoute): ImageVector = when (route) {
    AppRoute.Transport -> Icons.Filled.AltRoute
    AppRoute.InboundScan -> Icons.Filled.Warehouse
    AppRoute.PickupScan -> Icons.Filled.DirectionsCar
    AppRoute.LoadScan -> Icons.Filled.LocalShipping
    AppRoute.WaybillList -> Icons.AutoMirrored.Filled.Assignment
    else -> Icons.Filled.Dashboard
}
