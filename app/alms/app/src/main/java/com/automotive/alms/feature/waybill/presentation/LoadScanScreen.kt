package com.automotive.alms.feature.waybill.presentation

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.PaddingValues
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
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
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
import com.automotive.alms.core.ui.FormField
import com.automotive.alms.core.ui.ListCard
import com.automotive.alms.core.ui.ListRow
import com.automotive.alms.core.ui.PrimaryAction
import com.automotive.alms.core.ui.ProgressSummary
import com.automotive.alms.core.ui.ScreenScaffold
import com.automotive.alms.core.ui.SectionHeader
import com.automotive.alms.core.ui.SupportingText
import com.automotive.alms.core.ui.Tone
import com.automotive.alms.core.ui.VinInput
import com.automotive.alms.core.ui.rememberFeedback
import com.automotive.alms.core.ui.rememberTaskRunner
import com.automotive.alms.feature.waybill.data.WaybillRepository
import com.automotive.alms.feature.waybill.model.LoadVinRequest
import com.automotive.alms.feature.waybill.model.Waybill

private const val STATUS_NOT_ARRIVED = "NOT_ARRIVED"

@Composable
fun LoadScanScreen(
    repository: WaybillRepository,
    loginResult: LoginResult?,
    onBack: () -> Unit,
) {
    val context = LocalContext.current
    val feedback = rememberFeedback()
    val tasks = rememberTaskRunner(feedback)

    var waybills by remember { mutableStateOf<List<Waybill>?>(null) }
    var selected by remember { mutableStateOf<Waybill?>(null) }
    var currentVin by rememberSaveable { mutableStateOf("") }
    var photos by remember { mutableStateOf<List<EvidencePhoto>>(emptyList()) }
    var remark by rememberSaveable { mutableStateOf("") }
    // null = 未打开；true = 全局扫码匹配运单；false = 当前运单内扫码
    var scanGlobal by remember { mutableStateOf<Boolean?>(null) }

    fun changeVin(next: String) {
        if (next != currentVin) {
            photos = emptyList()
            remark = ""
        }
        currentVin = next
    }

    fun loadTasks() {
        tasks.launch { waybills = repository.list(STATUS_NOT_ARRIVED) }
    }

    fun openWaybill(id: String, vin: String = "") {
        tasks.launch {
            selected = repository.detail(id)
            changeVin(vin)
        }
    }

    fun lookupVin(vin: String) {
        tasks.launch {
            val lookup = repository.lookup(vin)
            selected = repository.detail(lookup.waybill.id)
            changeVin(vin)
        }
    }

    fun closeWaybill() {
        selected = null
        changeVin("")
        loadTasks()
    }

    fun submit(waybill: Waybill, vin: String) {
        tasks.launch {
            repository.loadVin(
                waybill.id,
                vin,
                LoadVinRequest(photoKeys = photos.map { it.uploadedFile.key }, remark = remark.ifBlank { null }),
            )
            changeVin("")
            feedback.show(context.getString(R.string.load_success, vin))
            selected = repository.detail(waybill.id)
        }
    }

    LifecycleEventEffect(Lifecycle.Event.ON_RESUME) {
        if (selected == null && !tasks.busy) loadTasks()
    }

    BackHandler(enabled = selected != null) { closeWaybill() }

    val waybill = selected
    val matched = waybill?.vins?.firstOrNull { it.vin == currentVin }
    val ready = matched != null && matched.loadedAt == null

    Box(modifier = Modifier.fillMaxSize()) {
        ScreenScaffold(
            title = waybill?.waybillCode ?: stringResource(R.string.load_title),
            onBack = { if (selected != null) closeWaybill() else onBack() },
            loading = tasks.busy,
            feedback = feedback,
            actions = {
                IconButton(
                    enabled = !tasks.busy,
                    onClick = {
                        val current = selected
                        if (current == null) loadTasks() else tasks.launch { selected = repository.detail(current.id) }
                    },
                ) {
                    Icon(Icons.Filled.Refresh, contentDescription = stringResource(R.string.common_refresh))
                }
            },
            bottomBar = {
                BottomActionBar {
                    when {
                        waybill == null -> PrimaryAction(
                            text = stringResource(R.string.load_scan_start),
                            icon = Icons.Filled.QrCodeScanner,
                            enabled = !tasks.busy,
                            onClick = { scanGlobal = true },
                        )
                        ready -> PrimaryAction(
                            text = stringResource(R.string.load_confirm),
                            enabled = !tasks.busy && photos.isNotEmpty(),
                            onClick = { submit(waybill, currentVin) },
                        )
                        else -> PrimaryAction(
                            text = stringResource(R.string.common_scan_vin),
                            icon = Icons.Filled.QrCodeScanner,
                            enabled = !tasks.busy,
                            onClick = { scanGlobal = false },
                        )
                    }
                }
            },
        ) { padding ->
            LazyColumn(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding),
                contentPadding = PaddingValues(Dimens.PagePadding),
                verticalArrangement = Arrangement.spacedBy(Dimens.ItemGap),
            ) {
                if (waybill == null) {
                    val list = waybills
                    if (list != null && list.isEmpty()) {
                        item { EmptyState(stringResource(R.string.load_empty)) }
                    }
                    if (!list.isNullOrEmpty()) {
                        item { SectionHeader(stringResource(R.string.load_pending_waybills), trailing = list.size.toString()) }
                    }
                    items(list.orEmpty(), key = { it.id }) { item ->
                        WaybillSummaryCard(waybill = item, onClick = { openWaybill(item.id) })
                    }
                } else {
                    val loadedCount = waybill.vins.count { it.loadedAt != null }
                    val pending = waybill.vins.filter { it.loadedAt == null }
                    val loaded = waybill.vins.filter { it.loadedAt != null }
                    item {
                        ContentCard {
                            Text(waybill.routeLabel(), style = MaterialTheme.typography.titleMedium)
                            WaybillCrew(waybill)
                            ProgressSummary(
                                text = stringResource(R.string.load_progress, loadedCount, waybill.vins.size),
                                done = loadedCount,
                                total = waybill.vins.size,
                            )
                        }
                    }
                    item {
                        ContentCard {
                            VinInput(
                                value = currentVin,
                                onValueChange = ::changeVin,
                                onScan = { scanGlobal = false },
                                enabled = !tasks.busy,
                            )
                            when {
                                currentVin.isBlank() -> Unit
                                matched == null -> SupportingText(stringResource(R.string.load_vin_not_in_waybill), tone = Tone.Danger)
                                matched.loadedAt != null -> SupportingText(
                                    stringResource(R.string.load_vin_loaded, matched.loadedAt),
                                    tone = Tone.Danger,
                                )
                                else -> SupportingText(
                                    listOfNotNull(stringResource(R.string.load_vin_ready), matched.model, matched.color)
                                        .joinToString(" · "),
                                    tone = Tone.Success,
                                )
                            }
                        }
                    }
                    if (ready) {
                        item {
                            ContentCard {
                                EvidencePhotoCapture(
                                    subject = stringResource(R.string.load_photo_subject, currentVin),
                                    operatorName = loginResult.operatorName(),
                                    accountUnitName = loginResult.accountUnitName(),
                                    photos = photos,
                                    onPhotosChange = { photos = it },
                                    onUploadPhoto = { bytes ->
                                        repository.uploadPhoto(
                                            fileName = "load-$currentVin-${System.currentTimeMillis()}.jpg",
                                            bytes = bytes,
                                        )
                                    },
                                    enabled = !tasks.busy,
                                    title = stringResource(R.string.load_photos),
                                )
                                FormField(
                                    value = remark,
                                    onValueChange = { remark = it },
                                    label = stringResource(R.string.common_remark),
                                    singleLine = false,
                                )
                            }
                        }
                    }
                    if (pending.isNotEmpty()) {
                        item { SectionHeader(stringResource(R.string.load_pending_list), trailing = pending.size.toString()) }
                        item {
                            ListCard(items = pending) { vin ->
                                ListRow(
                                    title = vin.vin,
                                    monospace = true,
                                    supporting = listOfNotNull(vin.model, vin.color).joinToString(" / "),
                                    onClick = { changeVin(vin.vin) },
                                )
                            }
                        }
                    }
                    if (loaded.isNotEmpty()) {
                        item { SectionHeader(stringResource(R.string.load_loaded_list), trailing = loaded.size.toString()) }
                        item {
                            ListCard(items = loaded) { vin ->
                                ListRow(
                                    title = vin.vin,
                                    monospace = true,
                                    supporting = vin.loadedAt,
                                    badge = stringResource(R.string.waybill_vin_loaded),
                                    badgeTone = Tone.Success,
                                )
                            }
                        }
                    }
                }
            }
        }

        scanGlobal?.let { global ->
            VinBarcodeScannerScreen(
                title = stringResource(R.string.common_scan_vin),
                onVinScanned = { vin ->
                    scanGlobal = null
                    if (global) lookupVin(vin) else changeVin(vin)
                },
                onClose = { scanGlobal = null },
            )
        }
    }
}

@Composable
internal fun WaybillSummaryCard(
    waybill: Waybill,
    onClick: () -> Unit,
    badge: (@Composable () -> Unit)? = null,
) {
    val loadedCount = waybill.vins.count { it.loadedAt != null }
    ContentCard(onClick = onClick) {
        androidx.compose.foundation.layout.Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
            Text(
                text = waybill.waybillCode,
                modifier = Modifier.weight(1f),
                style = MaterialTheme.typography.titleMedium,
            )
            badge?.invoke()
        }
        SupportingText(waybill.routeLabel())
        listOfNotNull(waybill.vehicle?.plateNumber, waybill.driver?.name)
            .joinToString(" · ")
            .takeIf { it.isNotBlank() }
            ?.let { SupportingText(it) }
        ProgressSummary(
            text = stringResource(R.string.load_progress, loadedCount, waybill.vins.size),
            done = loadedCount,
            total = waybill.vins.size,
        )
    }
}

@Composable
internal fun WaybillCrew(waybill: Waybill) {
    com.automotive.alms.core.ui.InfoLine(
        label = stringResource(R.string.label_carrier),
        value = waybill.carrier?.shortName ?: waybill.carrier?.name,
    )
    com.automotive.alms.core.ui.InfoLine(
        label = stringResource(R.string.label_driver),
        value = listOfNotNull(waybill.driver?.name, waybill.driver?.phone).joinToString("  "),
    )
    com.automotive.alms.core.ui.InfoLine(
        label = stringResource(R.string.label_plate),
        value = waybill.vehicle?.plateNumber,
    )
}

internal fun Waybill.routeLabel(): String = com.automotive.alms.core.ui.joinRoute(
    originYard?.name ?: originText,
    destinationDealer?.dealerName ?: destinationYard?.name ?: recipientName,
)
