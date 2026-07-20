package com.automotive.alms.feature.yard.presentation

import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import com.automotive.alms.core.ui.PlaceholderBody
import com.automotive.alms.core.ui.ScreenScaffold

@Composable
fun YardInventoryScreen() {
    ScreenScaffold(title = "VIN 库存") { padding ->
        PlaceholderBody(
            title = "待接入：VIN 库存与生命周期",
            description = "后续在此模块接入 /yards/inventory/vin、/yards/vin/{vin}/lifecycle 和库位查询。",
            modifier = Modifier.padding(padding),
        )
    }
}
