package com.automotive.alms.feature.pickup.presentation

import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import com.automotive.alms.core.ui.PlaceholderBody
import com.automotive.alms.core.ui.ScreenScaffold

@Composable
fun PickupScanScreen() {
    ScreenScaffold(title = "提货扫描") { padding ->
        PlaceholderBody(
            title = "待接入：提货扫描流程",
            description = "后续在此模块接入 VIN 预查、拍照上传、/pickup/scan 和我的提货记录。",
            modifier = Modifier.padding(padding),
        )
    }
}
