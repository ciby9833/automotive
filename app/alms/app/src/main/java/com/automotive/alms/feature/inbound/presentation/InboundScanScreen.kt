package com.automotive.alms.feature.inbound.presentation

import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import com.automotive.alms.R
import com.automotive.alms.core.ui.PlaceholderBody
import com.automotive.alms.core.ui.ScreenScaffold

@Composable
fun InboundScanScreen() {
    ScreenScaffold(title = stringResource(R.string.inbound_scan)) { padding ->
        PlaceholderBody(
            title = stringResource(R.string.placeholder_pending),
            description = stringResource(R.string.placeholder_inbound),
            modifier = Modifier.padding(padding),
        )
    }
}
