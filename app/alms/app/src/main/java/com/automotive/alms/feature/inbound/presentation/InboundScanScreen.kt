package com.automotive.alms.feature.inbound.presentation

import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import com.automotive.alms.core.ui.PlaceholderBody
import com.automotive.alms.core.ui.ScreenScaffold

@Composable
fun InboundScanScreen() {
    ScreenScaffold(title = "入库扫描") { padding ->
        PlaceholderBody(
            title = "待接入：入库扫描流程",
            description = "后续在此模块接入场地选择、批次、VIN 扫描、库位扫描、照片上传和 /inbound/scan。",
            modifier = Modifier.padding(padding),
        )
    }
}
