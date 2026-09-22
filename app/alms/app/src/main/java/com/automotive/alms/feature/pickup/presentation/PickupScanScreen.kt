package com.automotive.alms.feature.pickup.presentation

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.QrCodeScanner
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontFamily
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect
import com.automotive.alms.R
import com.automotive.alms.core.evidence.EvidencePhoto
import com.automotive.alms.core.evidence.EvidencePhotoCapture
import com.automotive.alms.core.evidence.accountUnitName
import com.automotive.alms.core.evidence.operatorName
import com.automotive.alms.core.model.LoginResult
import com.automotive.alms.core.scanner.VinBarcodeScannerScreen
import com.automotive.alms.core.ui.BottomActionBar
import com.automotive.alms.core.ui.ContentCard
import com.automotive.alms.core.ui.Dimens
import com.automotive.alms.core.ui.EmptyState
import com.automotive.alms.core.ui.FilterTabs
import com.automotive.alms.core.ui.FormField
import com.automotive.alms.core.ui.ListCard
import com.automotive.alms.core.ui.ListRow
import com.automotive.alms.core.ui.PrimaryAction
import com.automotive.alms.core.ui.ProgressSummary
import com.automotive.alms.core.ui.ScreenScaffold
import com.automotive.alms.core.ui.SectionHeader
import com.automotive.alms.core.ui.StatusBadge
import com.automotive.alms.core.ui.SupportingText
import com.automotive.alms.core.ui.Tone
import com.automotive.alms.core.ui.VinInput
import com.automotive.alms.core.ui.joinRoute
import com.automotive.alms.core.ui.rememberFeedback
import com.automotive.alms.core.ui.rememberTaskRunner
import com.automotive.alms.feature.pickup.data.PickupRepository
import com.automotive.alms.feature.pickup.model.PickupOrderDetail
import com.automotive.alms.feature.pickup.model.PickupOrderScanRequest
import com.automotive.alms.feature.pickup.model.PickupOrderSummary
import com.automotive.alms.feature.pickup.model.PickupVin
import com.automotive.alms.feature.tracking.service.DriverLocationService

private const val STATUS_PENDING = "PENDING"
private const val STATUS_IN_PROGRESS = "IN_PROGRESS"
private const val STATUS_COMPLETED = "COMPLETED"

@Composable
fun PickupScanScreen(
    repository: PickupRepository,
    loginResult: LoginResult?,
    onBack: () -> Unit,
) {
    val context = LocalContext.current
    val feedback = rememberFeedback()
    val tasks = rememberTaskRunner(feedback)

    var orders by remember { mutableStateOf<List<PickupOrderSummary>?>(null) }
    var status by rememberSaveable { mutableStateOf(STATUS_PENDING) }
    var selectedOrderId by rememberSaveable { mutableStateOf<String?>(null) }
    var detail by remember { mutableStateOf<PickupOrderDetail?>(null) }
    var evidenceVin by rememberSaveable { mutableStateOf<String?>(null) }
    var vinInput by rememberSaveable { mutableStateOf("") }
    var remark by rememberSaveable { mutableStateOf("") }
    var photos by remember { mutableStateOf<List<EvidencePhoto>>(emptyList()) }
    var scannerOpen by remember { mutableStateOf(false) }

    val locationPermissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestMultiplePermissions(),
    ) {}

    fun loadOrders() {
        tasks.launch { orders = repository.pickupOrders(includeCompleted = true) }
    }

    fun openEvidence(vin: String) {
        if (vin != evidenceVin) {
            photos = emptyList()
            remark = ""
        }
        evidenceVin = vin
    }

    fun closeEvidence() {
        evidenceVin = null
        photos = emptyList()
        remark = ""
    }

    fun closeOrder() {
        closeEvidence()
        selectedOrderId = null
        detail = null
        vinInput = ""
        loadOrders()
    }

    fun back() {
        when {
            evidenceVin != null -> closeEvidence()
            selectedOrderId != null -> closeOrder()
            else -> onBack()
        }
    }

    fun submit(order: PickupOrderDetail, vin: String) {
        tasks.launch {
            val result = repository.scanOrder(
                orderId = order.order.id,
                request = PickupOrderScanRequest(
                    vin = vin,
                    allowOutOfOrder = true,
                    location = order.order.originText?.ifBlank { null },
                    pickupLatitude = photos.lastOrNull()?.latitude,
                    pickupLongitude = photos.lastOrNull()?.longitude,
                    photoUrls = photos.map { it.uploadedFile.key }.ifEmpty { null },
                    remark = remark.ifBlank { null },
                ),
            )
            closeEvidence()
            vinInput = ""
            feedback.show(
                context.getString(
                    if (result.outOfOrder) R.string.pickup_out_of_order else R.string.pickup_success,
                    result.vin.vin,
                ),
            )
            detail = repository.pickupOrderDetail(order.order.id)
        }
    }

    LaunchedEffect(Unit) {
        if (!context.hasAnyLocationPermission()) {
            locationPermissionLauncher.launch(
                arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION),
            )
        }
    }

    LaunchedEffect(selectedOrderId) {
        val orderId = selectedOrderId ?: return@LaunchedEffect
        if (detail?.order?.id == orderId) return@LaunchedEffect
        detail = null
        val ok = tasks.execute { detail = repository.pickupOrderDetail(orderId) }
        if (!ok) selectedOrderId = null
    }

    DisposableEffect(detail?.order?.id) {
        val orderId = detail?.order?.id
        if (orderId != null) DriverLocationService.start(context, waybillId = null, orderId = orderId)
        onDispose {
            if (orderId != null) DriverLocationService.stop(context)
        }
    }

    // 回到前台或从详情返回时刷新任务池；扫码流程中不打断。
    LifecycleEventEffect(Lifecycle.Event.ON_RESUME) {
        if (selectedOrderId == null && !tasks.busy) loadOrders()
    }

    BackHandler(enabled = selectedOrderId != null) { back() }

    val currentDetail = detail
    val currentEvidenceVin = evidenceVin
    Box(modifier = Modifier.fillMaxSize()) {
        ScreenScaffold(
            title = currentDetail?.order?.orderCode?.takeIf { selectedOrderId != null }
                ?: stringResource(R.string.pickup_title),
            onBack = ::back,
            loading = tasks.busy,
            feedback = feedback,
            actions = {
                if (currentEvidenceVin == null) {
                    IconButton(
                        enabled = !tasks.busy,
                        onClick = {
                            val orderId = selectedOrderId
                            if (orderId == null) {
                                loadOrders()
                            } else {
                                tasks.launch { detail = repository.pickupOrderDetail(orderId) }
                            }
                        },
                    ) {
                        Icon(Icons.Filled.Refresh, contentDescription = stringResource(R.string.common_refresh))
                    }
                }
            },
            bottomBar = {
                when {
                    currentDetail == null || selectedOrderId == null -> Unit
                    currentEvidenceVin != null -> BottomActionBar {
                        PrimaryAction(
                            text = stringResource(R.string.pickup_confirm),
                            enabled = !tasks.busy && photos.isNotEmpty(),
                            onClick = { submit(currentDetail, currentEvidenceVin) },
                        )
                    }
                    currentDetail.order.pickupStatus != STATUS_COMPLETED -> BottomActionBar {
                        if (vinInput.length >= 8) {
                            PrimaryAction(
                                text = stringResource(R.string.common_next),
                                onClick = { openEvidence(vinInput) },
                            )
                        } else {
                            PrimaryAction(
                                text = stringResource(R.string.common_scan_vin),
                                icon = Icons.Filled.QrCodeScanner,
                                onClick = { scannerOpen = true },
                            )
                        }
                    }
                }
            },
        ) { padding ->
            val listModifier = Modifier
                .fillMaxSize()
                .padding(padding)
            val contentPadding = PaddingValues(Dimens.PagePadding)
            val spacing = Arrangement.spacedBy(Dimens.ItemGap)
            when {
                selectedOrderId == null -> LazyColumn(
                    modifier = listModifier,
                    contentPadding = contentPadding,
                    verticalArrangement = spacing,
                ) {
                    val all = orders.orEmpty()
                    item {
                        FilterTabs(
                            options = listOf(STATUS_PENDING, STATUS_IN_PROGRESS, STATUS_COMPLETED).map { value ->
                                value to "${statusLabel(value)} ${all.count { it.pickupStatus == value }}"
                            },
                            selected = status,
                            onSelect = { status = it },
                        )
                    }
                    val visible = all.filter { it.pickupStatus == status }
                    if (orders != null && visible.isEmpty()) {
                        item { EmptyState(stringResource(R.string.pickup_empty)) }
                    }
                    items(visible, key = { it.id }) { order ->
                        OrderCard(order = order, onClick = { selectedOrderId = order.id })
                    }
                }

                currentDetail == null -> Unit

                currentEvidenceVin != null -> LazyColumn(
                    modifier = listModifier,
                    contentPadding = contentPadding,
                    verticalArrangement = spacing,
                ) {
                    val matched = currentDetail.vins.firstOrNull { it.vin == currentEvidenceVin }
                    item {
                        ContentCard {
                            Text(
                                text = currentEvidenceVin,
                                style = MaterialTheme.typography.titleLarge.copy(fontFamily = FontFamily.Monospace),
                            )
                            matched?.vehicleLine()?.let { SupportingText(it) }
                            if (matched == null || !matched.isPending()) {
                                SupportingText(stringResource(R.string.pickup_vin_not_in_task), tone = Tone.Warning)
                            }
                        }
                    }
                    item {
                        ContentCard {
                            EvidencePhotoCapture(
                                subject = stringResource(R.string.pickup_photo_subject, currentEvidenceVin),
                                operatorName = loginResult.operatorName(),
                                accountUnitName = loginResult.accountUnitName(),
                                photos = photos,
                                onPhotosChange = { photos = it },
                                onUploadPhoto = { bytes ->
                                    repository.uploadPhoto(
                                        fileName = "pickup-${System.currentTimeMillis()}.jpg",
                                        bytes = bytes,
                                    )
                                },
                                enabled = !tasks.busy,
                                title = stringResource(R.string.pickup_photos),
                            )
                        }
                    }
                    item {
                        ContentCard {
                            FormField(
                                value = remark,
                                onValueChange = { remark = it },
                                label = stringResource(R.string.common_remark),
                                singleLine = false,
                            )
                        }
                    }
                }

                else -> LazyColumn(
                    modifier = listModifier,
                    contentPadding = contentPadding,
                    verticalArrangement = spacing,
                ) {
                    val order = currentDetail.order
                    val pending = currentDetail.vins.filter { it.isPending() }
                    val handled = currentDetail.vins.filterNot { it.isPending() }
                    item {
                        ContentCard {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text(
                                    text = order.customer?.name ?: order.orderCode,
                                    modifier = Modifier.weight(1f),
                                    style = MaterialTheme.typography.titleMedium,
                                )
                                StatusBadge(statusLabel(order.pickupStatus), statusTone(order.pickupStatus))
                            }
                            SupportingText(joinRoute(order.originText, order.destinationYard?.name ?: order.destinationText))
                            order.plannedPickupDate?.let { SupportingText(it) }
                            ProgressSummary(
                                text = stringResource(R.string.pickup_progress, currentDetail.stats.pickedUp, currentDetail.stats.total),
                                done = currentDetail.stats.pickedUp,
                                total = currentDetail.stats.total,
                            )
                        }
                    }
                    if (order.pickupStatus != STATUS_COMPLETED) {
                        item {
                            ContentCard {
                                VinInput(
                                    value = vinInput,
                                    onValueChange = { vinInput = it },
                                    onScan = { scannerOpen = true },
                                    onDone = { if (vinInput.length >= 8) openEvidence(vinInput) },
                                )
                            }
                        }
                    }
                    if (pending.isNotEmpty()) {
                        item { SectionHeader(stringResource(R.string.pickup_pending_list), trailing = pending.size.toString()) }
                        item {
                            ListCard(items = pending) { vin ->
                                ListRow(
                                    title = vin.vin,
                                    monospace = true,
                                    supporting = vin.vehicleLine(),
                                    onClick = { openEvidence(vin.vin) },
                                )
                            }
                        }
                    }
                    if (handled.isNotEmpty()) {
                        item { SectionHeader(stringResource(R.string.pickup_handled_list), trailing = handled.size.toString()) }
                        item {
                            ListCard(items = handled) { vin ->
                                val (label, tone) = vinStatus(vin)
                                ListRow(title = vin.vin, monospace = true, badge = label, badgeTone = tone)
                            }
                        }
                    }
                }
            }
        }

        if (scannerOpen) {
            VinBarcodeScannerScreen(
                title = stringResource(R.string.common_scan_vin),
                onVinScanned = { vin ->
                    scannerOpen = false
                    vinInput = vin
                    openEvidence(vin)
                },
                onClose = { scannerOpen = false },
            )
        }
    }
}

@Composable
private fun OrderCard(order: PickupOrderSummary, onClick: () -> Unit) {
    ContentCard(onClick = onClick) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(order.orderCode, modifier = Modifier.weight(1f), style = MaterialTheme.typography.titleMedium)
            StatusBadge(statusLabel(order.pickupStatus), statusTone(order.pickupStatus))
        }
        SupportingText(order.customerName)
        SupportingText(joinRoute(order.originText, order.destinationYardName))
        ProgressSummary(
            text = stringResource(R.string.pickup_progress, order.pickedUp, order.total),
            done = order.pickedUp,
            total = order.total,
        )
    }
}

private fun PickupVin.isPending(): Boolean = pickedUpAt == null && arrivalStatus == "EXPECTED"

private fun PickupVin.vehicleLine(): String? =
    listOfNotNull(brand, model, color).joinToString(" / ").ifBlank { null }

@Composable
private fun statusLabel(status: String): String = when (status) {
    STATUS_PENDING -> stringResource(R.string.pickup_status_pending)
    STATUS_IN_PROGRESS -> stringResource(R.string.pickup_status_progress)
    STATUS_COMPLETED -> stringResource(R.string.pickup_status_completed)
    else -> status
}

private fun statusTone(status: String): Tone = when (status) {
    STATUS_PENDING -> Tone.Warning
    STATUS_IN_PROGRESS -> Tone.Info
    STATUS_COMPLETED -> Tone.Success
    else -> Tone.Neutral
}

@Composable
private fun vinStatus(item: PickupVin): Pair<String, Tone> = when {
    item.pickedUpAt != null -> stringResource(R.string.pickup_vin_picked) to Tone.Success
    item.arrivalStatus == "ARRIVED" -> stringResource(R.string.pickup_vin_arrived) to Tone.Info
    item.arrivalStatus == "CANCELLED" -> stringResource(R.string.pickup_vin_cancelled) to Tone.Neutral
    else -> stringResource(R.string.pickup_vin_pending) to Tone.Warning
}

private fun Context.hasAnyLocationPermission(): Boolean {
    return checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED ||
        checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED
}
