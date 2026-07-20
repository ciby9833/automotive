package com.automotive.alms.feature.outbound.presentation

import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import com.automotive.alms.core.ui.PlaceholderBody
import com.automotive.alms.core.ui.ScreenScaffold

@Composable
fun OutboundOrdersScreen() {
    ScreenScaffold(title = "出库订单") { padding ->
        PlaceholderBody(
            title = "待接入：出库订单查询",
            description = "后续在此模块接入 /outbound/orders 和 /outbound/orders/{id}。",
            modifier = Modifier.padding(padding),
        )
    }
}
