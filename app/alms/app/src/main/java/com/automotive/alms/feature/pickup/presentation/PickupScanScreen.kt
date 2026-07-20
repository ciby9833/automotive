package com.automotive.alms.feature.pickup.presentation

import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import com.automotive.alms.R
import com.automotive.alms.core.ui.PlaceholderBody
import com.automotive.alms.core.ui.ScreenScaffold

@Composable
fun PickupScanScreen() {
    ScreenScaffold(title = stringResource(R.string.pickup_scan)) { padding ->
        PlaceholderBody(
            title = stringResource(R.string.placeholder_pending),
            description = stringResource(R.string.placeholder_pickup),
            modifier = Modifier.padding(padding),
        )
    }
}
