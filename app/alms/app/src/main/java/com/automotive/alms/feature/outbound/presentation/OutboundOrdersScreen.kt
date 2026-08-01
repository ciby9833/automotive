package com.automotive.alms.feature.outbound.presentation

import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import com.automotive.alms.R
import com.automotive.alms.core.ui.PlaceholderBody
import com.automotive.alms.core.ui.ScreenScaffold

// 移动端不做出库订单管理：这个流程完全在网页端「出库管理」里做（Excel 导入 →
// 出库单 → 开单）。App 只对司机开放"提货/装车/启运/签收"扫描动作。
// 保留此占位屏是因为路由已注册；点进来给用户明确提示别在移动端找该功能。
@Composable
fun OutboundOrdersScreen() {
    ScreenScaffold(title = stringResource(R.string.outbound_orders)) { padding ->
        PlaceholderBody(
            title = stringResource(R.string.placeholder_pending),
            description = stringResource(R.string.placeholder_web_only_outbound),
            modifier = Modifier.padding(padding),
        )
    }
}
