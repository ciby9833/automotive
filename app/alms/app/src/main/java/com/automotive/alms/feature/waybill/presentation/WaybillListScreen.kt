package com.automotive.alms.feature.waybill.presentation

import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import com.automotive.alms.core.ui.PlaceholderBody
import com.automotive.alms.core.ui.ScreenScaffold

@Composable
fun WaybillListScreen() {
    ScreenScaffold(title = "运单") { padding ->
        PlaceholderBody(
            title = "待接入：运单列表与扫码",
            description = "后续在此模块接入 /waybills、/waybills/:id、/waybills/lookup/:vin 和 /waybills/scan。",
            modifier = Modifier.padding(padding),
        )
    }
}
