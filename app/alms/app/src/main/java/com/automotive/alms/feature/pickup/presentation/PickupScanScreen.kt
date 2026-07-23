package com.automotive.alms.feature.pickup.presentation

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.automotive.alms.R
import com.automotive.alms.core.network.ApiException
import com.automotive.alms.core.ui.Dimens
import com.automotive.alms.core.ui.ScreenScaffold
import com.automotive.alms.core.ui.StatusPill
import com.automotive.alms.feature.pickup.data.PickupRepository
import com.automotive.alms.feature.pickup.model.PickupOrderDetail
import com.automotive.alms.feature.pickup.model.PickupOrderScanRequest
import com.automotive.alms.feature.pickup.model.PickupOrderSummary
import com.automotive.alms.feature.pickup.model.PickupVin
import kotlinx.coroutines.launch

@Composable
fun PickupScanScreen(
    repository: PickupRepository,
) {
    val scope = rememberCoroutineScope()
    var orders by remember { mutableStateOf<List<PickupOrderSummary>>(emptyList()) }
    var selectedOrderId by rememberSaveable { mutableStateOf<String?>(null) }
    var detail by remember { mutableStateOf<PickupOrderDetail?>(null) }
    var loading by remember { mutableStateOf(false) }
    var message by remember { mutableStateOf<String?>(null) }
    var includeCompleted by rememberSaveable { mutableStateOf(false) }
    var outOfOrderVin by remember { mutableStateOf<String?>(null) }
    val successText = stringResource(R.string.pickup_success)
    val outOfOrderText = stringResource(R.string.pickup_out_of_order)

    fun loadOrders() {
        loading = true
        message = null
        scope.launch {
            runCatching { repository.pickupOrders(includeCompleted) }
                .onSuccess { orders = it }
                .onFailure { message = errorMessage(it) }
            loading = false
        }
    }

    fun loadDetail(orderId: String) {
        loading = true
        message = null
        scope.launch {
            runCatching { repository.pickupOrderDetail(orderId) }
                .onSuccess {
                    selectedOrderId = orderId
                    detail = it
                }
                .onFailure { message = errorMessage(it) }
            loading = false
        }
    }

    LaunchedEffect(includeCompleted) {
        loadOrders()
    }

    ScreenScaffold(
        title = if (selectedOrderId == null) {
            stringResource(R.string.pickup_tasks)
        } else {
            detail?.order?.orderCode ?: stringResource(R.string.pickup_task_detail)
        },
        actions = {
            if (selectedOrderId == null) {
                IconButton(onClick = { loadOrders() }, enabled = !loading) {
                    Icon(Icons.Filled.Refresh, contentDescription = null)
                }
            } else {
                IconButton(
                    onClick = {
                        selectedOrderId = null
                        detail = null
                        loadOrders()
                    },
                ) {
                    Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = null)
                }
            }
        },
    ) { padding ->
        if (selectedOrderId == null) {
            PickupOrderList(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding)
                    .padding(horizontal = Dimens.PagePadding),
                orders = orders,
                loading = loading,
                message = message,
                includeCompleted = includeCompleted,
                onToggleCompleted = { includeCompleted = !includeCompleted },
                onOpenOrder = { loadDetail(it.id) },
            )
        } else {
            PickupOrderDetailContent(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding)
                    .padding(horizontal = Dimens.PagePadding),
                detail = detail,
                loading = loading,
                message = message,
                onBack = {
                    selectedOrderId = null
                    detail = null
                    loadOrders()
                },
                onScan = { vin, location, remark ->
                    val orderId = selectedOrderId ?: return@PickupOrderDetailContent
                    loading = true
                    message = null
                    scope.launch {
                        runCatching {
                            repository.scanOrder(
                                orderId = orderId,
                                request = PickupOrderScanRequest(
                                    vin = vin,
                                    allowOutOfOrder = true,
                                    location = location.ifBlank { null },
                                    remark = remark.ifBlank { null },
                                ),
                            )
                        }.onSuccess {
                            message = if (it.outOfOrder) {
                                outOfOrderVin = it.vin.vin
                                "${it.vin.vin} $outOfOrderText"
                            } else {
                                "${it.vin.vin} $successText"
                            }
                            runCatching { repository.pickupOrderDetail(orderId) }
                                .onSuccess { detail = it }
                        }.onFailure {
                            message = errorMessage(it)
                        }
                        loading = false
                    }
                },
            )
        }
    }

    outOfOrderVin?.let { vinCode ->
        AlertDialog(
            onDismissRequest = { outOfOrderVin = null },
            title = { Text(stringResource(R.string.pickup_out_of_order_title)) },
            text = { Text(stringResource(R.string.pickup_out_of_order_dialog, vinCode)) },
            confirmButton = {
                TextButton(onClick = { outOfOrderVin = null }) {
                    Text(stringResource(R.string.pickup_out_of_order_confirm))
                }
            },
        )
    }
}

@Composable
private fun PickupOrderList(
    modifier: Modifier,
    orders: List<PickupOrderSummary>,
    loading: Boolean,
    message: String?,
    includeCompleted: Boolean,
    onToggleCompleted: () -> Unit,
    onOpenOrder: (PickupOrderSummary) -> Unit,
) {
    LazyColumn(
        modifier = modifier,
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            Column(
                modifier = Modifier.padding(top = 12.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    StatusPill(text = stringResource(R.string.pickup_task_count, orders.size))
                    OutlinedButton(onClick = onToggleCompleted) {
                        Text(
                            stringResource(
                                if (includeCompleted) {
                                    R.string.pickup_hide_completed
                                } else {
                                    R.string.pickup_show_completed
                                },
                            ),
                        )
                    }
                }
                if (loading) LinearProgressIndicator(modifier = Modifier.fillMaxWidth())
                message?.let { Text(text = it, color = MaterialTheme.colorScheme.error) }
            }
        }

        if (!loading && orders.isEmpty()) {
            item {
                Text(
                    text = stringResource(R.string.pickup_no_tasks),
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }

        items(orders, key = { it.id }) { order ->
            PickupOrderCard(order = order, onClick = { onOpenOrder(order) })
        }
    }
}

@Composable
private fun PickupOrderCard(order: PickupOrderSummary, onClick: () -> Unit) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick),
        shape = RoundedCornerShape(Dimens.CardRadius),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                StatusPill(text = statusLabel(order.pickupStatus))
                order.plannedPickupDate?.let {
                    StatusPill(
                        text = it,
                        color = MaterialTheme.colorScheme.secondary,
                    )
                }
            }
            Text(order.orderCode, style = MaterialTheme.typography.titleLarge)
            Text(
                text = order.customerName,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            RouteLine(origin = order.originText, destination = order.destinationYardName)
            PickupProgress(pickedUp = order.pickedUp, total = order.total, remaining = order.remaining)
        }
    }
}

@Composable
private fun PickupOrderDetailContent(
    modifier: Modifier,
    detail: PickupOrderDetail?,
    loading: Boolean,
    message: String?,
    onBack: () -> Unit,
    onScan: (vin: String, location: String, remark: String) -> Unit,
) {
    var vin by rememberSaveable(detail?.order?.id) { mutableStateOf("") }
    var location by rememberSaveable(detail?.order?.id) { mutableStateOf(detail?.order?.originText.orEmpty()) }
    var remark by rememberSaveable(detail?.order?.id) { mutableStateOf("") }

    LazyColumn(
        modifier = modifier,
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            Column(
                modifier = Modifier.padding(top = 12.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                OutlinedButton(onClick = onBack) {
                    Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = null)
                    Text(
                        text = stringResource(R.string.pickup_back_to_tasks),
                        modifier = Modifier.padding(start = 6.dp),
                    )
                }
                if (loading) LinearProgressIndicator(modifier = Modifier.fillMaxWidth())
                message?.let {
                    Text(
                        text = it,
                        color = if (it.contains(stringResource(R.string.pickup_success))) {
                            MaterialTheme.colorScheme.primary
                        } else {
                            MaterialTheme.colorScheme.error
                        },
                    )
                }
            }
        }

        if (detail == null) {
            item {
                Text(
                    text = stringResource(R.string.pickup_loading_detail),
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            return@LazyColumn
        }

        item {
            PickupTaskHeader(detail)
        }

        item {
            ScanPanel(
                vin = vin,
                location = location,
                remark = remark,
                loading = loading,
                onVinChange = { vin = it.trim().uppercase() },
                onLocationChange = { location = it },
                onRemarkChange = { remark = it },
                onScan = {
                    onScan(vin, location, remark)
                    vin = ""
                    remark = ""
                },
            )
        }

        val pending = detail.vins.filter { it.pickedUpAt == null && it.arrivalStatus == "EXPECTED" }
        val handled = detail.vins.filterNot { it.pickedUpAt == null && it.arrivalStatus == "EXPECTED" }

        item {
            Text(
                text = stringResource(R.string.pickup_pending_vins, pending.size),
                style = MaterialTheme.typography.titleMedium,
            )
        }
        items(pending, key = { it.id }) { item ->
            VinRow(item = item, completed = false)
        }

        item {
            Text(
                text = stringResource(R.string.pickup_handled_vins, handled.size),
                modifier = Modifier.padding(top = 8.dp),
                style = MaterialTheme.typography.titleMedium,
            )
        }
        items(handled, key = { it.id }) { item ->
            VinRow(item = item, completed = true)
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun PickupTaskHeader(detail: PickupOrderDetail) {
    val order = detail.order
    Card(
        shape = RoundedCornerShape(Dimens.CardRadius),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                StatusPill(text = statusLabel(order.pickupStatus))
                order.plannedPickupDate?.let {
                    StatusPill(text = it, color = MaterialTheme.colorScheme.secondary)
                }
            }
            Text(order.orderCode, style = MaterialTheme.typography.headlineSmall)
            order.customer?.name?.let {
                Text(it, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            RouteLine(origin = order.originText, destination = order.destinationYard?.name ?: order.destinationText)
            PickupProgress(
                pickedUp = detail.stats.pickedUp,
                total = detail.stats.total,
                remaining = detail.stats.remaining,
            )
        }
    }
}

@Composable
private fun ScanPanel(
    vin: String,
    location: String,
    remark: String,
    loading: Boolean,
    onVinChange: (String) -> Unit,
    onLocationChange: (String) -> Unit,
    onRemarkChange: (String) -> Unit,
    onScan: () -> Unit,
) {
    Card(
        shape = RoundedCornerShape(Dimens.CardRadius),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            OutlinedTextField(
                value = vin,
                onValueChange = onVinChange,
                label = { Text(stringResource(R.string.pickup_vin)) },
                leadingIcon = { Icon(Icons.Filled.Search, contentDescription = null) },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(Dimens.CardRadius),
            )
            OutlinedTextField(
                value = location,
                onValueChange = onLocationChange,
                label = { Text(stringResource(R.string.pickup_location)) },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(Dimens.CardRadius),
            )
            OutlinedTextField(
                value = remark,
                onValueChange = onRemarkChange,
                label = { Text(stringResource(R.string.pickup_remark_optional)) },
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(Dimens.CardRadius),
            )
            Button(
                onClick = onScan,
                enabled = vin.length >= 8 && !loading,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Icon(Icons.Filled.CheckCircle, contentDescription = null)
                Text(
                    text = stringResource(R.string.pickup_confirm),
                    modifier = Modifier.padding(start = 8.dp),
                )
            }
        }
    }
}

@Composable
private fun VinRow(item: PickupVin, completed: Boolean) {
    Card(
        shape = RoundedCornerShape(Dimens.CardRadius),
        colors = CardDefaults.cardColors(
            containerColor = if (completed) {
                MaterialTheme.colorScheme.primary.copy(alpha = 0.08f)
            } else {
                MaterialTheme.colorScheme.surface
            },
        ),
        elevation = CardDefaults.cardElevation(defaultElevation = if (completed) 0.dp else 1.dp),
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(14.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(
                    text = item.vin,
                    modifier = Modifier.weight(1f),
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold,
                )
                StatusPill(
                    text = vinStatusLabel(item),
                    color = if (item.pickedUpAt != null) {
                        MaterialTheme.colorScheme.primary
                    } else {
                        MaterialTheme.colorScheme.secondary
                    },
                )
            }
            VehicleLine(item)
            item.pickupLocation?.let {
                Text(
                    text = "${stringResource(R.string.pickup_location)}: $it",
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

@Composable
private fun PickupProgress(pickedUp: Int, total: Int, remaining: Int) {
    val progress = if (total <= 0) 0f else pickedUp.toFloat() / total.toFloat()
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        LinearProgressIndicator(progress = { progress }, modifier = Modifier.fillMaxWidth())
        Text(
            text = stringResource(R.string.pickup_progress, pickedUp, total, remaining),
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            style = MaterialTheme.typography.bodyMedium,
        )
    }
}

@Composable
private fun RouteLine(origin: String?, destination: String?) {
    val parts = listOfNotNull(origin?.takeIf { it.isNotBlank() }, destination?.takeIf { it.isNotBlank() })
    if (parts.isNotEmpty()) {
        Text(
            text = parts.joinToString(" -> "),
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

@Composable
private fun VehicleLine(item: PickupVin) {
    val parts = listOfNotNull(item.brand, item.model, item.color, item.vehicleType)
    if (parts.isNotEmpty()) {
        Text(
            text = parts.joinToString(" / "),
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

@Composable
private fun statusLabel(status: String): String {
    return when (status) {
        "PENDING" -> stringResource(R.string.pickup_status_pending)
        "IN_PROGRESS" -> stringResource(R.string.pickup_status_progress)
        "COMPLETED" -> stringResource(R.string.pickup_status_completed)
        else -> status
    }
}

@Composable
private fun vinStatusLabel(item: PickupVin): String {
    return when {
        item.pickedUpAt != null -> stringResource(R.string.pickup_vin_picked)
        item.arrivalStatus == "ARRIVED" -> stringResource(R.string.pickup_vin_arrived)
        item.arrivalStatus == "CANCELLED" -> stringResource(R.string.pickup_vin_cancelled)
        else -> stringResource(R.string.pickup_vin_pending)
    }
}

private fun errorMessage(throwable: Throwable): String {
    return (throwable as? ApiException)?.message
        ?: throwable.localizedMessage
        ?: "Request failed"
}
