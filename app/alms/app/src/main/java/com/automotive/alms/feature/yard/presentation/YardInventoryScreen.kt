package com.automotive.alms.feature.yard.presentation

import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import com.automotive.alms.R
import com.automotive.alms.core.ui.PlaceholderBody
import com.automotive.alms.core.ui.ScreenScaffold

@Composable
fun YardInventoryScreen() {
    ScreenScaffold(title = stringResource(R.string.vin_inventory)) { padding ->
        PlaceholderBody(
            title = stringResource(R.string.placeholder_pending),
            description = stringResource(R.string.placeholder_inventory),
            modifier = Modifier.padding(padding),
        )
    }
}
