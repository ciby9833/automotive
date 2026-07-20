package com.automotive.alms.feature.auth.presentation

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.automotive.alms.R
import com.automotive.alms.core.auth.SessionStore
import com.automotive.alms.core.network.ApiException
import com.automotive.alms.core.ui.AppBackground
import com.automotive.alms.core.ui.Dimens
import com.automotive.alms.core.ui.HeaderPanel
import com.automotive.alms.core.ui.ScreenScaffold
import com.automotive.alms.core.ui.StatusPill
import com.automotive.alms.feature.auth.data.AuthRepository
import kotlinx.coroutines.launch

@Composable
fun OrgSelectScreen(
    sessionStore: SessionStore,
    authRepository: AuthRepository,
    onSelected: () -> Unit,
) {
    val session by sessionStore.state.collectAsState()
    val memberships = session.loginResult?.memberships.orEmpty()
    val scope = rememberCoroutineScope()
    var error by remember { mutableStateOf<String?>(null) }
    val selectFailed = stringResource(R.string.org_select_failed)

    AppBackground {
        ScreenScaffold(title = stringResource(R.string.org_select_title)) { padding ->
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding)
                    .padding(Dimens.PagePadding),
            ) {
                HeaderPanel(
                    title = stringResource(R.string.org_select_header),
                    subtitle = stringResource(R.string.app_name),
                )

                error?.let {
                    Text(
                        text = it,
                        modifier = Modifier.padding(top = Dimens.ItemGap),
                        color = MaterialTheme.colorScheme.error,
                    )
                }
                memberships.forEach { membership ->
                    Card(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(top = Dimens.ItemGap)
                            .clickable {
                                error = null
                                scope.launch {
                                    runCatching { authRepository.selectOrg(membership.organizationId) }
                                        .onSuccess { onSelected() }
                                        .onFailure { throwable ->
                                            error = (throwable as? ApiException)?.message ?: selectFailed
                                        }
                                    }
                                },
                        shape = RoundedCornerShape(Dimens.CardRadius),
                        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
                    ) {
                        Column(modifier = Modifier.padding(16.dp)) {
                            Text(text = membership.organizationName, style = MaterialTheme.typography.titleMedium)
                            StatusPill(
                                text = membership.organizationCode,
                                modifier = Modifier.padding(top = 8.dp),
                                color = MaterialTheme.colorScheme.secondary,
                            )
                        }
                    }
                }
            }
        }
    }
}
