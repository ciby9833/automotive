package com.automotive.alms.feature.auth.presentation

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import com.automotive.alms.R
import com.automotive.alms.core.auth.SessionStore
import com.automotive.alms.core.ui.Dimens
import com.automotive.alms.core.ui.ListCard
import com.automotive.alms.core.ui.ListRow
import com.automotive.alms.core.ui.ScreenScaffold
import com.automotive.alms.core.ui.rememberFeedback
import com.automotive.alms.core.ui.rememberTaskRunner
import com.automotive.alms.feature.auth.data.AuthRepository

@Composable
fun OrgSelectScreen(
    sessionStore: SessionStore,
    authRepository: AuthRepository,
    onSelected: () -> Unit,
) {
    val session by sessionStore.state.collectAsState()
    val memberships = session.loginResult?.memberships.orEmpty()
    val feedback = rememberFeedback()
    val tasks = rememberTaskRunner(feedback)

    ScreenScaffold(
        title = stringResource(R.string.org_select_title),
        loading = tasks.busy,
        feedback = feedback,
    ) { padding ->
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding),
            contentPadding = PaddingValues(Dimens.PagePadding),
            verticalArrangement = Arrangement.spacedBy(Dimens.ItemGap),
        ) {
            item {
                ListCard(items = memberships) { membership ->
                    ListRow(
                        title = membership.organizationName,
                        supporting = membership.organizationCode,
                        onClick = {
                            if (!tasks.busy) {
                                tasks.launch {
                                    authRepository.selectOrg(membership.organizationId)
                                    onSelected()
                                }
                            }
                        },
                    )
                }
            }
        }
    }
}
