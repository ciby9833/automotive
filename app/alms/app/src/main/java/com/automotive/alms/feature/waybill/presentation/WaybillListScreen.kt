package com.automotive.alms.feature.waybill.presentation

import android.Manifest
import android.content.pm.PackageManager
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
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
import androidx.core.content.ContextCompat
import com.automotive.alms.R
import com.automotive.alms.core.evidence.EvidencePhoto
import com.automotive.alms.core.evidence.EvidencePhotoCapture
import com.automotive.alms.core.evidence.accountUnitName
import com.automotive.alms.core.evidence.operatorName
import com.automotive.alms.core.model.LoginResult
import com.automotive.alms.core.ui.BottomActionBar
import com.automotive.alms.core.ui.ContentCard
import com.automotive.alms.core.ui.Dimens
import com.automotive.alms.core.ui.EmptyState
import com.automotive.alms.core.ui.FilterTabs
import com.automotive.alms.core.ui.FormField
import com.automotive.alms.core.ui.InfoLine
import com.automotive.alms.core.ui.ListCard
import com.automotive.alms.core.ui.ListRow
import com.automotive.alms.core.ui.PrimaryAction
import com.automotive.alms.core.ui.ProgressSummary
import com.automotive.alms.core.ui.ScreenScaffold
import com.automotive.alms.core.ui.SectionHeader
import com.automotive.alms.core.ui.StatusBadge
import com.automotive.alms.core.ui.SupportingText
import com.automotive.alms.core.ui.Tone
import com.automotive.alms.core.ui.rememberFeedback
import com.automotive.alms.core.ui.rememberTaskRunner
import com.automotive.alms.feature.tracking.service.DriverLocationService
import com.automotive.alms.feature.waybill.data.WaybillRepository
import com.automotive.alms.feature.waybill.model.DepartWaybillRequest
import com.automotive.alms.feature.waybill.model.LoadVinRequest
import com.automotive.alms.feature.waybill.model.Waybill
import com.automotive.alms.feature.waybill.model.WaybillScanRequest
import com.automotive.alms.feature.waybill.model.WaybillVin

private const val STATUS_NOT_ARRIVED = "NOT_ARRIVED"
private const val STATUS_IN_TRANSIT = "IN_TRANSIT"
private const val STATUS_ARRIVED = "ARRIVED"

private sealed interface WaybillAction {
    data class Load(val vin: String) : WaybillAction
    data class Sign(val vin: String) : WaybillAction
    data object Depart : WaybillAction
}

@Composable
fun WaybillListScreen(
    repository: WaybillRepository,
    loginResult: LoginResult?,
    onBack: () -> Unit,
) {
    val context = LocalContext.current
    val feedback = rememberFeedback()
    val tasks = rememberTaskRunner(feedback)

    var status by rememberSaveable { mutableStateOf(STATUS_NOT_ARRIVED) }
    var waybills by remember { mutableStateOf<List<Waybill>?>(null) }
    var selectedId by rememberSaveable { mutableStateOf<String?>(null) }
    var detail by remember { mutableStateOf<Waybill?>(null) }
    var action by remember { mutableStateOf<WaybillAction?>(null) }
    var photos by remember { mutableStateOf<List<EvidencePhoto>>(emptyList()) }
    var remark by rememberSaveable { mutableStateOf("") }
    var listVersion by remember { mutableStateOf(0) }

    val locationPermissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestMultiplePermissions(),
    ) { result ->
        if (result.values.any { it }) {
            detail?.takeIf { it.status == STATUS_IN_TRANSIT }?.let {
                DriverLocationService.start(context, waybillId = it.id, orderId = null)
            }
        }
    }

    fun openAction(next: WaybillAction?) {
        action = next
        photos = emptyList()
        remark = ""
    }

    fun back() {
        when {
            action != null -> openAction(null)
            selectedId != null -> {
                selectedId = null
                detail = null
                listVersion++
            }
            else -> onBack()
        }
    }

    fun submit(waybill: Waybill, current: WaybillAction) {
        val keys = photos.map { it.uploadedFile.key }
        val note = remark.ifBlank { null }
        tasks.launch {
            val message = when (current) {
                is WaybillAction.Load -> {
                    repository.loadVin(waybill.id, current.vin, LoadVinRequest(keys, note))
                    context.getString(R.string.load_success, current.vin)
                }
                is WaybillAction.Sign -> {
                    repository.sign(WaybillScanRequest(vin = current.vin, action = "SIGNED", attachmentUrls = keys, remark = note))
                    context.getString(R.string.waybill_sign_success, current.vin)
                }
                WaybillAction.Depart -> {
                    repository.depart(waybill.id, DepartWaybillRequest(keys, note))
                    context.getString(R.string.waybill_depart_success)
                }
            }
            openAction(null)
            feedback.show(message)
            detail = repository.detail(waybill.id)
        }
    }

    LaunchedEffect(status, selectedId, listVersion) {
        if (selectedId == null) tasks.execute { waybills = repository.list(status) }
    }

    LaunchedEffect(selectedId) {
        val id = selectedId ?: return@LaunchedEffect
        if (detail?.id == id) return@LaunchedEffect
        val ok = tasks.execute { detail = repository.detail(id) }
        if (!ok) selectedId = null
    }

    DisposableEffect(detail?.id, detail?.status) {
        val current = detail
        if (current?.status == STATUS_IN_TRANSIT) {
            if (context.hasLocationPermission()) {
                DriverLocationService.start(context, waybillId = current.id, orderId = null)
            } else {
                locationPermissionLauncher.launch(
                    arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION),
                )
            }
        }
        onDispose {
            if (current?.status == STATUS_IN_TRANSIT) DriverLocationService.stop(context)
        }
    }

    BackHandler(enabled = selectedId != null) { back() }

    val waybill = detail?.takeIf { selectedId != null }
    val currentAction = action
    val allLoaded = waybill != null && waybill.vins.isNotEmpty() && waybill.vins.all { it.loadedAt != null }

    ScreenScaffold(
        title = waybill?.waybillCode ?: stringResource(R.string.waybill_title),
        onBack = ::back,
        loading = tasks.busy,
        feedback = feedback,
        actions = {
            if (currentAction == null) {
                IconButton(
                    enabled = !tasks.busy,
                    onClick = {
                        val id = selectedId
                        if (id == null) listVersion++ else tasks.launch { detail = repository.detail(id) }
                    },
                ) {
                    Icon(Icons.Filled.Refresh, contentDescription = stringResource(R.string.common_refresh))
                }
            }
        },
        bottomBar = {
            when {
                waybill == null -> Unit
                currentAction != null -> BottomActionBar {
                    PrimaryAction(
                        text = stringResource(
                            when (currentAction) {
                                is WaybillAction.Load -> R.string.load_confirm
                                is WaybillAction.Sign -> R.string.waybill_sign
                                WaybillAction.Depart -> R.string.waybill_depart
                            },
                        ),
                        enabled = !tasks.busy && photos.isNotEmpty(),
                        onClick = { submit(waybill, currentAction) },
                    )
                }
                waybill.status == STATUS_NOT_ARRIVED && allLoaded -> BottomActionBar {
                    PrimaryAction(
                        text = stringResource(R.string.waybill_depart),
                        enabled = !tasks.busy,
                        onClick = { openAction(WaybillAction.Depart) },
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
            when {
                selectedId == null -> {
                    item {
                        FilterTabs(
                            options = listOf(
                                STATUS_NOT_ARRIVED to stringResource(R.string.waybill_status_pending),
                                STATUS_IN_TRANSIT to stringResource(R.string.waybill_status_transit),
                                STATUS_ARRIVED to stringResource(R.string.waybill_status_arrived),
                            ),
                            selected = status,
                            onSelect = { status = it },
                        )
                    }
                    val list = waybills
                    if (list != null && list.isEmpty()) {
                        item { EmptyState(stringResource(R.string.waybill_empty)) }
                    }
                    items(list.orEmpty(), key = { it.id }) { item ->
                        WaybillSummaryCard(
                            waybill = item,
                            onClick = { selectedId = item.id },
                            badge = { StatusBadge(statusLabel(item.status), statusTone(item.status)) },
                        )
                    }
                }

                waybill == null -> Unit

                currentAction != null -> {
                    item {
                        ContentCard {
                            Text(
                                text = when (currentAction) {
                                    is WaybillAction.Load -> currentAction.vin
                                    is WaybillAction.Sign -> currentAction.vin
                                    WaybillAction.Depart -> waybill.waybillCode
                                },
                                style = MaterialTheme.typography.titleLarge.copy(fontFamily = FontFamily.Monospace),
                            )
                            SupportingText(waybill.routeLabel())
                        }
                    }
                    item {
                        ContentCard {
                            val (subjectRes, titleRes, subjectValue) = when (currentAction) {
                                is WaybillAction.Load -> Triple(R.string.load_photo_subject, R.string.load_photos, currentAction.vin)
                                is WaybillAction.Sign -> Triple(R.string.waybill_sign_subject, R.string.waybill_sign_photos, currentAction.vin)
                                WaybillAction.Depart -> Triple(R.string.waybill_depart_subject, R.string.waybill_depart_photos, waybill.waybillCode)
                            }
                            EvidencePhotoCapture(
                                subject = stringResource(subjectRes, subjectValue),
                                operatorName = loginResult.operatorName(),
                                accountUnitName = loginResult.accountUnitName(),
                                photos = photos,
                                onPhotosChange = { photos = it },
                                onUploadPhoto = { bytes ->
                                    repository.uploadPhoto(
                                        fileName = "waybill-${waybill.waybillCode}-${System.currentTimeMillis()}.jpg",
                                        bytes = bytes,
                                    )
                                },
                                enabled = !tasks.busy,
                                title = stringResource(titleRes),
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

                else -> {
                    val loadedCount = waybill.vins.count { it.loadedAt != null }
                    val signedCount = waybill.vins.count { it.isSigned }
                    item {
                        ContentCard {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text(
                                    text = waybill.routeLabel(),
                                    modifier = Modifier.weight(1f),
                                    style = MaterialTheme.typography.titleMedium,
                                )
                                StatusBadge(statusLabel(waybill.status), statusTone(waybill.status))
                            }
                            WaybillCrew(waybill)
                            InfoLine(
                                label = stringResource(R.string.label_recipient),
                                value = listOfNotNull(waybill.recipientName, waybill.recipientPhone).joinToString("  "),
                            )
                            if (waybill.status == STATUS_NOT_ARRIVED) {
                                ProgressSummary(
                                    text = stringResource(R.string.load_progress, loadedCount, waybill.vins.size),
                                    done = loadedCount,
                                    total = waybill.vins.size,
                                )
                                if (!allLoaded) {
                                    SupportingText(
                                        stringResource(R.string.waybill_depart_blocked, waybill.vins.size - loadedCount),
                                        tone = Tone.Warning,
                                    )
                                }
                            } else {
                                ProgressSummary(
                                    text = stringResource(R.string.waybill_sign_progress, signedCount, waybill.vins.size),
                                    done = signedCount,
                                    total = waybill.vins.size,
                                )
                            }
                        }
                    }
                    item { SectionHeader(stringResource(R.string.common_vehicles), trailing = waybill.vins.size.toString()) }
                    item {
                        ListCard(items = waybill.vins) { vin ->
                            val state = vinState(waybill.status, vin)
                            ListRow(
                                title = vin.vin,
                                monospace = true,
                                supporting = listOfNotNull(vin.model, vin.color).joinToString(" / "),
                                badge = state.label,
                                badgeTone = state.tone,
                                onClick = state.action?.let { next -> { openAction(next) } },
                            )
                        }
                    }
                }
            }
        }
    }
}

private data class VinState(val label: String, val tone: Tone, val action: WaybillAction?)

@Composable
private fun vinState(waybillStatus: String, vin: WaybillVin): VinState = when {
    waybillStatus == STATUS_NOT_ARRIVED && vin.loadedAt == null ->
        VinState(stringResource(R.string.waybill_vin_unloaded), Tone.Warning, WaybillAction.Load(vin.vin))
    waybillStatus == STATUS_NOT_ARRIVED ->
        VinState(stringResource(R.string.waybill_vin_loaded), Tone.Success, null)
    vin.isSigned ->
        VinState(stringResource(R.string.waybill_vin_signed), Tone.Success, null)
    waybillStatus == STATUS_IN_TRANSIT ->
        VinState(stringResource(R.string.waybill_vin_unsigned), Tone.Info, WaybillAction.Sign(vin.vin))
    else ->
        VinState(stringResource(R.string.waybill_vin_unsigned), Tone.Neutral, null)
}

@Composable
private fun statusLabel(status: String): String = when (status) {
    STATUS_NOT_ARRIVED -> stringResource(R.string.waybill_status_pending)
    STATUS_IN_TRANSIT -> stringResource(R.string.waybill_status_transit)
    STATUS_ARRIVED -> stringResource(R.string.waybill_status_arrived)
    else -> status
}

private fun statusTone(status: String): Tone = when (status) {
    STATUS_NOT_ARRIVED -> Tone.Warning
    STATUS_IN_TRANSIT -> Tone.Info
    STATUS_ARRIVED -> Tone.Success
    else -> Tone.Neutral
}

private fun android.content.Context.hasLocationPermission(): Boolean {
    val fine = ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION)
    val coarse = ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION)
    return fine == PackageManager.PERMISSION_GRANTED || coarse == PackageManager.PERMISSION_GRANTED
}
