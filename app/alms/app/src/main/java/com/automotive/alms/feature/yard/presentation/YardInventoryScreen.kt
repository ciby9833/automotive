package com.automotive.alms.feature.yard.presentation

import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import com.automotive.alms.R
import com.automotive.alms.core.ui.PlaceholderBody
import com.automotive.alms.core.ui.ScreenScaffold

// VIN 库存整仓浏览是网页端功能（配合大屏 / 场地看板）。App 只保留 VIN 单查
// (提货页 lookup)，不做整仓浏览。占位屏给用户明确提示别在移动端找。
@Composable
fun YardInventoryScreen() {
    ScreenScaffold(title = stringResource(R.string.vin_inventory)) { padding ->
        PlaceholderBody(
            title = stringResource(R.string.placeholder_pending),
            description = stringResource(R.string.placeholder_web_only_inventory),
            modifier = Modifier.padding(padding),
        )
    }
}
