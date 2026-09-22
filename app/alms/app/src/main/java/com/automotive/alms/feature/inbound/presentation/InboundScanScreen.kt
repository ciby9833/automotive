package com.automotive.alms.feature.inbound.presentation

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.QrCodeScanner
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
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
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
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
import com.automotive.alms.core.ui.ScreenScaffold
import com.automotive.alms.core.ui.SectionHeader
import com.automotive.alms.core.ui.SelectableRow
import com.automotive.alms.core.ui.SupportingText
import com.automotive.alms.core.ui.Tone
import com.automotive.alms.core.ui.VinInput
import com.automotive.alms.core.ui.rememberFeedback
import com.automotive.alms.core.ui.rememberTaskRunner
import com.automotive.alms.feature.inbound.data.InboundRepository
import com.automotive.alms.feature.inbound.model.InboundScanRequest
import com.automotive.alms.feature.inbound.model.InboundVinResult
import com.automotive.alms.feature.inbound.model.InboundYard
import com.automotive.alms.feature.inbound.model.InboundZone
import com.automotive.alms.feature.inbound.model.displayCode

@Composable
fun InboundScanScreen(
    repository: InboundRepository,
    loginResult: LoginResult?,
    onBack: () -> Unit,
) {
    val context = LocalContext.current
    val feedback = rememberFeedback()
    val tasks = rememberTaskRunner(feedback)

    var yards by remember { mutableStateOf<List<InboundYard>?>(null) }
    var zones by remember { mutableStateOf<List<InboundZone>?>(null) }
    var yard by remember { mutableStateOf<InboundYard?>(null) }
    var zone by remember { mutableStateOf<InboundZone?>(null) }
    var started by remember { mutableStateOf(false) }
    var autoStarted by remember { mutableStateOf(false) }

    var vin by rememberSaveable { mutableStateOf("") }
    var photos by remember { mutableStateOf<List<EvidencePhoto>>(emptyList()) }
    var battery by rememberSaveable { mutableStateOf("") }
    var mileage by rememberSaveable { mutableStateOf("") }
    var exterior by rememberSaveable { mutableStateOf("") }
    var remark by rememberSaveable { mutableStateOf("") }
    var completed by remember { mutableStateOf<List<InboundVinResult>>(emptyList()) }
    var scannerOpen by remember { mutableStateOf(false) }

    fun changeVin(next: String) {
        if (next != vin) photos = emptyList()
        vin = next
    }

    fun resetVin() {
        vin = ""
        photos = emptyList()
        battery = ""
        mileage = ""
        exterior = ""
        remark = ""
    }

    fun submit(activeZone: InboundZone) {
        val submittedVin = vin
        tasks.launch {
            val result = repository.scan(
                InboundScanRequest(
                    vin = submittedVin,
                    zoneId = activeZone.id,
                    photoUrls = photos.map { it.uploadedFile.key },
                    vehicleCheckInfo = vehicleCheckInfo(battery, mileage, exterior),
                    remark = remark.trim().ifBlank { null },
                ),
            )
            completed = (listOf(result) + completed).take(50)
            resetVin()
            feedback.show(
                context.getString(R.string.inbound_success, result.vin, result.slot?.displayCode().orEmpty()),
            )
        }
    }

    LaunchedEffect(Unit) {
        tasks.execute {
            val list = repository.listYards()
            yards = list
            if (list.size == 1) yard = list.first()
        }
    }

    LaunchedEffect(yard?.id) {
        val yardId = yard?.id ?: return@LaunchedEffect
        zone = null
        zones = null
        tasks.execute {
            val list = repository.listZones(yardId)
            zones = list
            if (list.size == 1) {
                zone = list.first()
                // 单场地单区域：直接进入扫描，省掉设置页
                if (yards?.size == 1 && !autoStarted) {
                    autoStarted = true
                    started = true
                }
            }
        }
    }

    BackHandler(enabled = started) { started = false }

    val activeZone = zone
    Box(modifier = Modifier.fillMaxSize()) {
        ScreenScaffold(
            title = stringResource(R.string.inbound_title),
            onBack = { if (started) started = false else onBack() },
            loading = tasks.busy,
            feedback = feedback,
            bottomBar = {
                BottomActionBar {
                    when {
                        !started || activeZone == null -> PrimaryAction(
                            text = stringResource(R.string.inbound_start),
                            enabled = yard != null && activeZone != null,
                            onClick = { started = true },
                        )
                        vin.isBlank() -> PrimaryAction(
                            text = stringResource(R.string.common_scan_vin),
                            icon = Icons.Filled.QrCodeScanner,
                            enabled = !tasks.busy,
                            onClick = { scannerOpen = true },
                        )
                        else -> PrimaryAction(
                            text = stringResource(R.string.inbound_submit),
                            enabled = !tasks.busy && photos.isNotEmpty(),
                            onClick = { submit(activeZone) },
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
                if (!started || activeZone == null) {
                    item { SectionHeader(stringResource(R.string.inbound_yard)) }
                    item {
                        val yardList = yards
                        when {
                            yardList == null -> Unit
                            yardList.isEmpty() -> EmptyState(stringResource(R.string.inbound_no_yards))
                            else -> ListCard(items = yardList) { item ->
                                SelectableRow(
                                    title = item.name ?: item.code ?: item.id.orEmpty(),
                                    subtitle = item.code?.takeIf { item.name != null },
                                    selected = item.id == yard?.id,
                                    onClick = { yard = item },
                                )
                            }
                        }
                    }
                    if (yard != null) {
                        item { SectionHeader(stringResource(R.string.inbound_zone)) }
                        item {
                            val zoneList = zones
                            when {
                                zoneList == null -> Unit
                                zoneList.isEmpty() -> ContentCard {
                                    SupportingText(stringResource(R.string.inbound_no_zones), tone = Tone.Warning)
                                }
                                else -> ListCard(items = zoneList) { item ->
                                    SelectableRow(
                                        title = item.label(),
                                        selected = item.id == zone?.id,
                                        onClick = { zone = item },
                                    )
                                }
                            }
                        }
                    }
                } else {
                    item {
                        ContentCard(contentPadding = PaddingValues(start = Dimens.CardPadding, end = 4.dp, top = 6.dp, bottom = 6.dp)) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(activeZone.label(), style = MaterialTheme.typography.titleMedium)
                                    SupportingText(yard?.name ?: yard?.code.orEmpty())
                                }
                                TextButton(onClick = { started = false }) {
                                    Text(stringResource(R.string.inbound_change))
                                }
                            }
                        }
                    }
                    item {
                        ContentCard {
                            VinInput(
                                value = vin,
                                onValueChange = ::changeVin,
                                onScan = { scannerOpen = true },
                                enabled = !tasks.busy,
                            )
                        }
                    }
                    if (vin.isNotBlank()) {
                        item {
                            ContentCard {
                                EvidencePhotoCapture(
                                    subject = stringResource(R.string.inbound_photo_subject, vin),
                                    operatorName = loginResult.operatorName(),
                                    accountUnitName = loginResult.accountUnitName(),
                                    photos = photos,
                                    onPhotosChange = { photos = it },
                                    onUploadPhoto = { bytes ->
                                        repository.uploadPhoto(
                                            fileName = "inbound-$vin-${System.currentTimeMillis()}.jpg",
                                            bytes = bytes,
                                        )
                                    },
                                    enabled = !tasks.busy,
                                    title = stringResource(R.string.inbound_photos),
                                )
                            }
                        }
                        item {
                            ContentCard {
                                Text(stringResource(R.string.inbound_check), style = MaterialTheme.typography.titleSmall)
                                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                    FormField(
                                        value = battery,
                                        onValueChange = { battery = it },
                                        label = stringResource(R.string.inbound_battery),
                                        modifier = Modifier.weight(1f),
                                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                                    )
                                    FormField(
                                        value = mileage,
                                        onValueChange = { mileage = it },
                                        label = stringResource(R.string.inbound_mileage),
                                        modifier = Modifier.weight(1f),
                                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                                    )
                                }
                                FormField(
                                    value = exterior,
                                    onValueChange = { exterior = it },
                                    label = stringResource(R.string.inbound_exterior),
                                    singleLine = false,
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
                    if (completed.isNotEmpty()) {
                        item {
                            SectionHeader(
                                title = stringResource(R.string.inbound_session_done),
                                trailing = completed.size.toString(),
                            )
                        }
                        item {
                            ListCard(items = completed) { result ->
                                ListRow(
                                    title = result.vin,
                                    monospace = true,
                                    badge = result.slot?.displayCode()?.takeIf { it.isNotBlank() },
                                    badgeTone = Tone.Success,
                                )
                            }
                        }
                    }
                }
            }
        }

        if (scannerOpen) {
            VinBarcodeScannerScreen(
                title = stringResource(R.string.common_scan_vin),
                onVinScanned = {
                    changeVin(it)
                    scannerOpen = false
                },
                onClose = { scannerOpen = false },
            )
        }
    }
}

private fun InboundZone.label(): String = code + name?.let { " · $it" }.orEmpty()

private fun vehicleCheckInfo(battery: String, mileage: String, exterior: String): Map<String, String>? {
    val values = buildMap {
        battery.trim().takeIf { it.isNotBlank() }?.let { put("battery", it) }
        mileage.trim().takeIf { it.isNotBlank() }?.let { put("mileage", it) }
        exterior.trim().takeIf { it.isNotBlank() }?.let { put("exterior", it) }
    }
    return values.ifEmpty { null }
}
