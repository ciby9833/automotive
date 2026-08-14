package com.automotive.alms.feature.inbound.presentation

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.PhotoCamera
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MenuAnchorType
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.automotive.alms.R
import com.automotive.alms.core.evidence.EvidencePhoto
import com.automotive.alms.core.evidence.EvidencePhotoCapture
import com.automotive.alms.core.evidence.accountUnitName
import com.automotive.alms.core.evidence.operatorName
import com.automotive.alms.core.model.LoginResult
import com.automotive.alms.core.network.ApiException
import com.automotive.alms.core.scanner.VinBarcodeScannerScreen
import com.automotive.alms.core.ui.Dimens
import com.automotive.alms.core.ui.ScreenScaffold
import com.automotive.alms.feature.inbound.data.InboundRepository
import com.automotive.alms.feature.inbound.model.InboundScanRequest
import com.automotive.alms.feature.inbound.model.InboundVinResult
import com.automotive.alms.feature.inbound.model.InboundYard
import com.automotive.alms.feature.inbound.model.InboundZone
import com.automotive.alms.feature.inbound.model.displayCode
import kotlinx.coroutines.launch

@Composable
fun InboundScanScreen(
    repository: InboundRepository,
    loginResult: LoginResult?,
) {
    val scope = rememberCoroutineScope()
    var yards by remember { mutableStateOf<List<InboundYard>>(emptyList()) }
    var zones by remember { mutableStateOf<List<InboundZone>>(emptyList()) }
    var selectedYard by remember { mutableStateOf<InboundYard?>(null) }
    var selectedZone by remember { mutableStateOf<InboundZone?>(null) }
    var yardMenuOpen by remember { mutableStateOf(false) }
    var zoneMenuOpen by remember { mutableStateOf(false) }
    var sessionStarted by remember { mutableStateOf(false) }
    var loading by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var recent by remember { mutableStateOf<List<InboundScanDone>>(emptyList()) }
    val requestFailed = stringResource(R.string.common_request_failed)

    LaunchedEffect(Unit) {
        loading = true
        runCatching { repository.listYards() }
            .onSuccess {
                yards = it
                if (it.size == 1) selectedYard = it.first()
            }
            .onFailure { error = appError(it, requestFailed) }
        loading = false
    }

    LaunchedEffect(selectedYard?.id) {
        val yardId = selectedYard?.id ?: return@LaunchedEffect
        selectedZone = null
        zones = emptyList()
        loading = true
        runCatching { repository.listZones(yardId) }
            .onSuccess {
                zones = it
                // 只有一个 zone 时直接选中，省一次点击
                if (it.size == 1) selectedZone = it.first()
            }
            .onFailure { error = appError(it, requestFailed) }
        loading = false
    }

    ScreenScaffold(
        title = stringResource(R.string.inbound_scan),
        actions = {
            if (sessionStarted) {
                TextButton(
                    onClick = {
                        sessionStarted = false
                    },
                    enabled = !loading,
                ) {
                    Text(stringResource(R.string.inbound_change_yard))
                }
            }
        },
    ) { padding ->
        if (sessionStarted && selectedYard != null && selectedZone != null) {
            InboundScanLoop(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding)
                    .padding(horizontal = Dimens.PagePadding),
                repository = repository,
                loginResult = loginResult,
                zone = selectedZone!!,
                loading = loading,
                recent = recent,
                onLoadingChange = { loading = it },
                onDone = {
                    recent = listOf(it) + recent.take(9)
                },
                onError = { error = it },
            )
        } else {
            InboundSessionSetup(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding)
                    .padding(horizontal = Dimens.PagePadding),
                yards = yards,
                zones = zones,
                selectedYard = selectedYard,
                selectedZone = selectedZone,
                yardMenuOpen = yardMenuOpen,
                zoneMenuOpen = zoneMenuOpen,
                loading = loading,
                onYardMenuChange = { yardMenuOpen = it },
                onZoneMenuChange = { zoneMenuOpen = it },
                onYardSelected = {
                    selectedYard = it
                    yardMenuOpen = false
                },
                onZoneSelected = {
                    selectedZone = it
                    zoneMenuOpen = false
                },
                onStart = { sessionStarted = true },
            )
        }
    }

    error?.let {
        AlertDialog(
            onDismissRequest = { error = null },
            confirmButton = {
                TextButton(onClick = { error = null }) {
                    Text(stringResource(R.string.common_confirm))
                }
            },
            title = { Text(stringResource(R.string.inbound_submit_failed)) },
            text = { Text(it) },
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun InboundSessionSetup(
    modifier: Modifier,
    yards: List<InboundYard>,
    zones: List<InboundZone>,
    selectedYard: InboundYard?,
    selectedZone: InboundZone?,
    yardMenuOpen: Boolean,
    zoneMenuOpen: Boolean,
    loading: Boolean,
    onYardMenuChange: (Boolean) -> Unit,
    onZoneMenuChange: (Boolean) -> Unit,
    onYardSelected: (InboundYard) -> Unit,
    onZoneSelected: (InboundZone) -> Unit,
    onStart: () -> Unit,
) {
    Column(
        modifier = modifier,
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        if (loading) LinearProgressIndicator(modifier = Modifier.fillMaxWidth())
        Card(modifier = Modifier.fillMaxWidth()) {
            Column(
                modifier = Modifier.padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Text(
                    text = stringResource(R.string.inbound_session_setup),
                    style = MaterialTheme.typography.titleMedium,
                )

                // Yard 选择：ExposedDropdownMenuBox 是 M3 官方针对"下拉选择"的稳定模式，
                // 之前用 Button + DropdownMenu inside Box 在 BOM 2024.09 会出现点击不响应的行为
                ExposedDropdownMenuBox(
                    expanded = yardMenuOpen,
                    onExpandedChange = { onYardMenuChange(!yardMenuOpen) },
                ) {
                    OutlinedTextField(
                        value = selectedYard?.let { it.name ?: it.code ?: it.id.orEmpty() }
                            ?: "",
                        onValueChange = {},
                        readOnly = true,
                        label = { Text(stringResource(R.string.inbound_select_yard)) },
                        trailingIcon = {
                            ExposedDropdownMenuDefaults.TrailingIcon(expanded = yardMenuOpen)
                        },
                        modifier = Modifier
                            .menuAnchor(MenuAnchorType.PrimaryNotEditable, enabled = true)
                            .fillMaxWidth(),
                    )
                    ExposedDropdownMenu(
                        expanded = yardMenuOpen,
                        onDismissRequest = { onYardMenuChange(false) },
                    ) {
                        yards.forEach { yard ->
                            DropdownMenuItem(
                                text = { Text(yard.name ?: yard.code ?: yard.id.orEmpty()) },
                                onClick = { onYardSelected(yard) },
                            )
                        }
                    }
                }

                // Zone 选择：yard 未选、或 yard 已选但 zone 列表还在加载时都禁用
                val zoneEnabled = selectedYard != null && !loading
                ExposedDropdownMenuBox(
                    expanded = zoneMenuOpen && zoneEnabled,
                    onExpandedChange = { if (zoneEnabled) onZoneMenuChange(!zoneMenuOpen) },
                ) {
                    OutlinedTextField(
                        value = selectedZone?.let {
                            "${it.code}${it.name?.let { name -> " · $name" }.orEmpty()}"
                        } ?: "",
                        onValueChange = {},
                        readOnly = true,
                        enabled = zoneEnabled,
                        label = { Text(stringResource(R.string.inbound_select_zone)) },
                        trailingIcon = {
                            ExposedDropdownMenuDefaults.TrailingIcon(expanded = zoneMenuOpen)
                        },
                        modifier = Modifier
                            .menuAnchor(MenuAnchorType.PrimaryNotEditable, enabled = zoneEnabled)
                            .fillMaxWidth(),
                    )
                    ExposedDropdownMenu(
                        expanded = zoneMenuOpen && zoneEnabled,
                        onDismissRequest = { onZoneMenuChange(false) },
                    ) {
                        if (zones.isEmpty()) {
                            DropdownMenuItem(
                                text = { Text(stringResource(R.string.inbound_no_zones)) },
                                onClick = { onZoneMenuChange(false) },
                                enabled = false,
                            )
                        } else {
                            zones.forEach { zone ->
                                DropdownMenuItem(
                                    text = {
                                        Text("${zone.code}${zone.name?.let { " · $it" }.orEmpty()}")
                                    },
                                    onClick = { onZoneSelected(zone) },
                                )
                            }
                        }
                    }
                }

                Button(
                    onClick = onStart,
                    enabled = !loading && selectedYard != null && selectedZone != null,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text(stringResource(R.string.inbound_start_session))
                }
            }
        }
    }
}

@Composable
private fun InboundScanLoop(
    modifier: Modifier,
    repository: InboundRepository,
    loginResult: LoginResult?,
    zone: InboundZone,
    loading: Boolean,
    recent: List<InboundScanDone>,
    onLoadingChange: (Boolean) -> Unit,
    onDone: (InboundScanDone) -> Unit,
    onError: (String) -> Unit,
) {
    val scope = rememberCoroutineScope()
    var vin by remember { mutableStateOf("") }
    var scannerOpen by remember { mutableStateOf(false) }
    var photos by remember { mutableStateOf<List<EvidencePhoto>>(emptyList()) }
    var battery by remember { mutableStateOf("") }
    var mileage by remember { mutableStateOf("") }
    var exterior by remember { mutableStateOf("") }
    var remark by remember { mutableStateOf("") }
    val requestFailed = stringResource(R.string.common_request_failed)
    val inboundCompletedTemplate = stringResource(R.string.inbound_completed, "%1\$s", "%2\$s")

    fun resetCurrentVin() {
        vin = ""
        photos = emptyList()
        battery = ""
        mileage = ""
        exterior = ""
        remark = ""
    }

    LazyColumn(
        modifier = modifier,
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            if (loading) LinearProgressIndicator(modifier = Modifier.fillMaxWidth())
            Card(modifier = Modifier.fillMaxWidth()) {
                Column(
                    modifier = Modifier.padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    Text(
                        text = stringResource(R.string.inbound_scan_loop_title),
                        style = MaterialTheme.typography.titleMedium,
                    )
                    Text(
                        text = stringResource(
                            R.string.inbound_working_zone,
                            "${zone.code}${zone.name?.let { " · $it" }.orEmpty()}",
                        ),
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        OutlinedTextField(
                            value = vin,
                            onValueChange = {
                                val nextVin = it.trim().uppercase()
                                if (nextVin != vin) photos = emptyList()
                                vin = nextVin
                            },
                            label = { Text(stringResource(R.string.pickup_vin)) },
                            modifier = Modifier.weight(1f),
                            singleLine = true,
                        )
                        Button(
                            onClick = { scannerOpen = true },
                            modifier = Modifier.padding(top = 8.dp),
                            enabled = !loading,
                        ) {
                            Icon(Icons.Filled.PhotoCamera, contentDescription = null)
                        }
                    }
                    if (vin.isNotBlank()) {
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
                            enabled = !loading,
                            title = stringResource(R.string.inbound_photo_title),
                            modifier = Modifier.fillMaxWidth(),
                        )
                        VehicleCheckFields(
                            battery = battery,
                            mileage = mileage,
                            exterior = exterior,
                            remark = remark,
                            onBatteryChange = { battery = it },
                            onMileageChange = { mileage = it },
                            onExteriorChange = { exterior = it },
                            onRemarkChange = { remark = it },
                        )
                        Button(
                            enabled = !loading && photos.isNotEmpty(),
                            onClick = {
                                onLoadingChange(true)
                                scope.launch {
                                    runCatching {
                                        repository.scan(
                                            InboundScanRequest(
                                                vin = vin,
                                                zoneId = zone.id,
                                                photoUrls = photos.map { it.uploadedFile.key },
                                                vehicleCheckInfo = vehicleCheckInfo(
                                                    battery = battery,
                                                    mileage = mileage,
                                                    exterior = exterior,
                                                ),
                                                remark = remark.trim().ifBlank { null },
                                            ),
                                        )
                                    }.onSuccess { result ->
                                        val done = result.toDone(
                                            message = inboundCompletedTemplate
                                                .format(result.vin, result.slot?.displayCode().orEmpty()),
                                        )
                                        onDone(done)
                                        resetCurrentVin()
                                    }.onFailure {
                                        onError(appError(it, requestFailed))
                                    }
                                    onLoadingChange(false)
                                }
                            },
                            modifier = Modifier.fillMaxWidth(),
                        ) {
                            Icon(Icons.Filled.CheckCircle, contentDescription = null)
                            Text(
                                text = stringResource(R.string.inbound_submit_and_next),
                                modifier = Modifier.padding(start = 8.dp),
                            )
                        }
                    } else {
                        Button(
                            onClick = { scannerOpen = true },
                            enabled = !loading,
                            modifier = Modifier.fillMaxWidth(),
                        ) {
                            Text(stringResource(R.string.inbound_scan_next_vin))
                        }
                    }
                }
            }
        }

        if (recent.isNotEmpty()) {
            item {
                Text(
                    text = stringResource(R.string.inbound_recent_completed),
                    style = MaterialTheme.typography.titleMedium,
                )
            }
            items(recent, key = { it.id }) { item ->
                Card(modifier = Modifier.fillMaxWidth()) {
                    Column(
                        modifier = Modifier.padding(14.dp),
                        verticalArrangement = Arrangement.spacedBy(4.dp),
                    ) {
                        Text(item.vin, fontWeight = FontWeight.SemiBold)
                        Text(item.message, color = MaterialTheme.colorScheme.primary)
                    }
                }
            }
        }
    }

    if (scannerOpen) {
        VinBarcodeScannerScreen(
            title = stringResource(R.string.inbound_scan_vin_title),
            onVinScanned = { scanned ->
                if (scanned != vin) photos = emptyList()
                vin = scanned
                scannerOpen = false
            },
            onClose = { scannerOpen = false },
        )
    }
}

@Composable
private fun VehicleCheckFields(
    battery: String,
    mileage: String,
    exterior: String,
    remark: String,
    onBatteryChange: (String) -> Unit,
    onMileageChange: (String) -> Unit,
    onExteriorChange: (String) -> Unit,
    onRemarkChange: (String) -> Unit,
) {
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        OutlinedTextField(
            value = battery,
            onValueChange = onBatteryChange,
            label = { Text(stringResource(R.string.inbound_battery)) },
            modifier = Modifier.weight(1f),
            singleLine = true,
        )
        OutlinedTextField(
            value = mileage,
            onValueChange = onMileageChange,
            label = { Text(stringResource(R.string.inbound_mileage)) },
            modifier = Modifier.weight(1f),
            singleLine = true,
        )
    }
    OutlinedTextField(
        value = exterior,
        onValueChange = onExteriorChange,
        label = { Text(stringResource(R.string.inbound_exterior)) },
        modifier = Modifier.fillMaxWidth(),
    )
    OutlinedTextField(
        value = remark,
        onValueChange = onRemarkChange,
        label = { Text(stringResource(R.string.common_remark)) },
        modifier = Modifier.fillMaxWidth(),
    )
}

private data class InboundScanDone(
    val id: String,
    val vin: String,
    val message: String,
)

private fun InboundVinResult.toDone(message: String): InboundScanDone {
    return InboundScanDone(
        id = id,
        vin = vin,
        message = message,
    )
}

private fun vehicleCheckInfo(
    battery: String,
    mileage: String,
    exterior: String,
): Map<String, String>? {
    val values = buildMap {
        battery.trim().takeIf { it.isNotBlank() }?.let { put("battery", it) }
        mileage.trim().takeIf { it.isNotBlank() }?.let { put("mileage", it) }
        exterior.trim().takeIf { it.isNotBlank() }?.let { put("exterior", it) }
    }
    return values.ifEmpty { null }
}

private fun appError(error: Throwable, fallback: String): String {
    return (error as? ApiException)?.message ?: error.message ?: fallback
}
