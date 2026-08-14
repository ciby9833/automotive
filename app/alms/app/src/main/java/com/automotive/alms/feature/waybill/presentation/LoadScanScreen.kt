package com.automotive.alms.feature.waybill.presentation

import androidx.compose.foundation.clickable
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.DirectionsCar
import androidx.compose.material.icons.filled.LocalShipping
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.QrCodeScanner
import androidx.compose.material.icons.filled.Storefront
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ElevatedCard
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
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
import androidx.compose.ui.Alignment
import androidx.compose.ui.graphics.Color
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
import com.automotive.alms.feature.waybill.data.WaybillRepository
import com.automotive.alms.feature.waybill.model.LoadVinRequest
import com.automotive.alms.feature.waybill.model.Waybill
import com.automotive.alms.feature.waybill.model.WaybillVin
import kotlinx.coroutines.launch

private const val STATUS_NOT_ARRIVED = "NOT_ARRIVED"

@Composable
fun LoadScanScreen(
    repository: WaybillRepository,
    loginResult: LoginResult?,
) {
    val scope = rememberCoroutineScope()
    var waybills by remember { mutableStateOf<List<Waybill>>(emptyList()) }
    var selectedWaybill by remember { mutableStateOf<Waybill?>(null) }
    var currentVin by rememberSaveable { mutableStateOf("") }
    var scannerOpen by remember { mutableStateOf(false) }
    var lookupMode by remember { mutableStateOf(LoadLookupMode.Global) }
    var photos by remember { mutableStateOf<List<EvidencePhoto>>(emptyList()) }
    var remark by rememberSaveable { mutableStateOf("") }
    var recent by remember { mutableStateOf<List<LoadDone>>(emptyList()) }
    var loading by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val requestFailed = stringResource(R.string.common_request_failed)

    fun resetVin() {
        currentVin = ""
        photos = emptyList()
        remark = ""
    }

    fun loadTasks() {
        loading = true
        scope.launch {
            runCatching { repository.list(STATUS_NOT_ARRIVED) }
                .onSuccess { waybills = it }
                .onFailure { error = appError(it, requestFailed) }
            loading = false
        }
    }

    fun openWaybill(waybillId: String) {
        loading = true
        scope.launch {
            runCatching { repository.detail(waybillId) }
                .onSuccess {
                    selectedWaybill = it
                    resetVin()
                }
                .onFailure { error = appError(it, requestFailed) }
            loading = false
        }
    }

    fun scanGlobal(vin: String) {
        loading = true
        scope.launch {
            runCatching {
                val lookup = repository.lookup(vin)
                repository.detail(lookup.waybill.id)
            }.onSuccess {
                selectedWaybill = it
                currentVin = vin
                photos = emptyList()
                remark = ""
            }.onFailure {
                error = appError(it, requestFailed)
            }
            loading = false
        }
    }

    LaunchedEffect(Unit) {
        loadTasks()
    }

    ScreenScaffold(
        title = stringResource(R.string.load_scan),
        actions = {
            TextButton(
                onClick = {
                    selectedWaybill = null
                    resetVin()
                    loadTasks()
                },
            ) {
                Text(
                    if (selectedWaybill == null) {
                        stringResource(R.string.common_refresh)
                    } else {
                        stringResource(R.string.common_back)
                    },
                )
            }
        },
    ) { padding ->
        if (selectedWaybill == null) {
            LoadTaskPicker(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding)
                    .padding(horizontal = Dimens.PagePadding),
                loading = loading,
                waybills = waybills,
                onScanVin = {
                    lookupMode = LoadLookupMode.Global
                    scannerOpen = true
                },
                onOpenWaybill = { openWaybill(it.id) },
            )
        } else {
            LoadSession(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding)
                    .padding(horizontal = Dimens.PagePadding),
                repository = repository,
                loginResult = loginResult,
                waybill = selectedWaybill!!,
                currentVin = currentVin,
                photos = photos,
                remark = remark,
                recent = recent,
                loading = loading,
                onCurrentVinChange = {
                    if (it != currentVin) photos = emptyList()
                    currentVin = it
                },
                onPhotosChange = { photos = it },
                onRemarkChange = { remark = it },
                onScanVin = {
                    lookupMode = LoadLookupMode.InWaybill
                    scannerOpen = true
                },
                onSubmit = { vin ->
                    loading = true
                    scope.launch {
                        runCatching {
                            repository.loadVin(
                                selectedWaybill!!.id,
                                vin,
                                LoadVinRequest(
                                    photoKeys = photos.map { it.uploadedFile.key },
                                    remark = remark.ifBlank { null },
                                ),
                            )
                            repository.detail(selectedWaybill!!.id)
                        }.onSuccess { refreshed ->
                            selectedWaybill = refreshed
                            recent = listOf(LoadDone(vin = vin, waybillCode = refreshed.waybillCode)) + recent.take(9)
                            resetVin()
                        }.onFailure {
                            error = appError(it, requestFailed)
                        }
                        loading = false
                    }
                },
            )
        }
    }

    if (scannerOpen) {
        VinBarcodeScannerScreen(
            title = stringResource(R.string.load_scan_vin_title),
            onVinScanned = { vin ->
                scannerOpen = false
                when (lookupMode) {
                    LoadLookupMode.Global -> scanGlobal(vin)
                    LoadLookupMode.InWaybill -> {
                        currentVin = vin
                        photos = emptyList()
                        remark = ""
                    }
                }
            },
            onClose = { scannerOpen = false },
        )
    }

    error?.let {
        AlertDialog(
            onDismissRequest = { error = null },
            confirmButton = {
                TextButton(onClick = { error = null }) {
                    Text(stringResource(R.string.common_confirm))
                }
            },
            title = { Text(stringResource(R.string.load_scan_error_title)) },
            text = { Text(it) },
        )
    }
}

@Composable
private fun LoadTaskPicker(
    modifier: Modifier,
    loading: Boolean,
    waybills: List<Waybill>,
    onScanVin: () -> Unit,
    onOpenWaybill: (Waybill) -> Unit,
) {
    LazyColumn(
        modifier = modifier,
        contentPadding = PaddingValues(bottom = 120.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        item {
            if (loading) LinearProgressIndicator(modifier = Modifier.fillMaxWidth())
            ElevatedCard(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.elevatedCardColors(
                    containerColor = MaterialTheme.colorScheme.primary,
                    contentColor = MaterialTheme.colorScheme.onPrimary,
                ),
            ) {
                Column(
                    modifier = Modifier.padding(20.dp),
                    verticalArrangement = Arrangement.spacedBy(14.dp),
                ) {
                    Text(
                        text = stringResource(R.string.load_scan_start_title),
                        style = MaterialTheme.typography.headlineSmall,
                    )
                    Text(
                        text = stringResource(R.string.load_scan_start_subtitle),
                        color = MaterialTheme.colorScheme.onPrimary.copy(alpha = 0.82f),
                    )
                    Button(
                        onClick = onScanVin,
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Icon(Icons.Filled.QrCodeScanner, contentDescription = null)
                        Text(
                            text = stringResource(R.string.load_scan_by_vin),
                            modifier = Modifier.padding(start = 8.dp),
                        )
                    }
                }
            }
        }
        item {
            SectionTitle(
                title = stringResource(R.string.load_pending_waybills),
                trailing = stringResource(R.string.waybill_vin_count, waybills.sumOf { it.vins.size }),
            )
        }
        if (waybills.isEmpty() && !loading) {
            item {
                Text(
                    text = stringResource(R.string.load_no_pending_waybills),
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
        items(waybills, key = { it.id }) { waybill ->
            WaybillLoadCard(waybill = waybill, onClick = { onOpenWaybill(waybill) })
        }
    }
}

@Composable
private fun WaybillLoadCard(waybill: Waybill, onClick: () -> Unit) {
    val loadedCount = waybill.vins.count { it.loadedAt != null }
    val totalCount = waybill.vins.size
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.Top,
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = waybill.waybillCode,
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.SemiBold,
                    )
                    Text(
                        text = waybill.routeLabel(),
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        style = MaterialTheme.typography.bodyMedium,
                    )
                }
                ProgressPill(loadedCount = loadedCount, totalCount = totalCount)
            }
            LinearProgressIndicator(
                progress = { if (totalCount == 0) 0f else loadedCount.toFloat() / totalCount },
                modifier = Modifier.fillMaxWidth(),
            )
            WaybillInfoGrid(waybill = waybill)
        }
    }
}

@Composable
private fun LoadSession(
    modifier: Modifier,
    repository: WaybillRepository,
    loginResult: LoginResult?,
    waybill: Waybill,
    currentVin: String,
    photos: List<EvidencePhoto>,
    remark: String,
    recent: List<LoadDone>,
    loading: Boolean,
    onCurrentVinChange: (String) -> Unit,
    onPhotosChange: (List<EvidencePhoto>) -> Unit,
    onRemarkChange: (String) -> Unit,
    onScanVin: () -> Unit,
    onSubmit: (String) -> Unit,
) {
    val loadedCount = waybill.vins.count { it.loadedAt != null }
    val matchedVin = waybill.vins.firstOrNull { it.vin == currentVin }
    val canSubmit = matchedVin != null && matchedVin.loadedAt == null && photos.isNotEmpty() && !loading

    LazyColumn(
        modifier = modifier,
        contentPadding = PaddingValues(bottom = 140.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        item {
            if (loading) LinearProgressIndicator(modifier = Modifier.fillMaxWidth())
            ElevatedCard(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.elevatedCardColors(
                    containerColor = MaterialTheme.colorScheme.primary,
                    contentColor = MaterialTheme.colorScheme.onPrimary,
                ),
            ) {
                Column(
                    modifier = Modifier.padding(20.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    Text(waybill.waybillCode, style = MaterialTheme.typography.headlineSmall)
                    Text(
                        waybill.routeLabel(),
                        color = MaterialTheme.colorScheme.onPrimary.copy(alpha = 0.82f),
                    )
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(
                            stringResource(R.string.load_progress, loadedCount, waybill.vins.size),
                            fontWeight = FontWeight.SemiBold,
                        )
                        Text(
                            waybill.status,
                            style = MaterialTheme.typography.labelLarge,
                            color = MaterialTheme.colorScheme.onPrimary.copy(alpha = 0.82f),
                        )
                    }
                    LinearProgressIndicator(
                        progress = {
                            if (waybill.vins.isEmpty()) 0f else loadedCount.toFloat() / waybill.vins.size
                        },
                        modifier = Modifier.fillMaxWidth(),
                        color = Color.White,
                        trackColor = Color.White.copy(alpha = 0.28f),
                    )
                    Button(onClick = onScanVin, enabled = !loading, modifier = Modifier.fillMaxWidth()) {
                        Icon(Icons.Filled.QrCodeScanner, contentDescription = null)
                        Text(
                            text = stringResource(R.string.load_scan_next_vin),
                            modifier = Modifier.padding(start = 8.dp),
                        )
                    }
                }
            }
        }

        item {
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
            ) {
                Column(
                    modifier = Modifier.padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    SectionTitle(title = stringResource(R.string.load_waybill_info))
                    WaybillInfoGrid(waybill = waybill)
                }
            }
        }

        item {
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
            ) {
                Column(
                    modifier = Modifier.padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    SectionTitle(title = stringResource(R.string.load_current_operation))
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        OutlinedTextField(
                            value = currentVin,
                            onValueChange = { onCurrentVinChange(it.trim().uppercase()) },
                            label = { Text(stringResource(R.string.pickup_vin)) },
                            modifier = Modifier.weight(1f),
                            singleLine = true,
                        )
                        OutlinedButton(
                            onClick = onScanVin,
                            enabled = !loading,
                            modifier = Modifier.padding(top = 8.dp),
                        ) {
                            Icon(Icons.Filled.QrCodeScanner, contentDescription = null)
                        }
                    }
                    LoadVinState(vin = matchedVin, hasInput = currentVin.isNotBlank())
                    if (matchedVin != null && matchedVin.loadedAt == null) {
                        EvidencePhotoCapture(
                            subject = stringResource(R.string.waybill_load_subject, matchedVin.vin),
                            operatorName = loginResult.operatorName(),
                            accountUnitName = loginResult.accountUnitName(),
                            photos = photos,
                            onPhotosChange = onPhotosChange,
                            onUploadPhoto = { bytes ->
                                repository.uploadPhoto(
                                    fileName = "load-${matchedVin.vin}-${System.currentTimeMillis()}.jpg",
                                    bytes = bytes,
                                )
                            },
                            enabled = !loading,
                            title = stringResource(R.string.waybill_load_photo_title),
                            modifier = Modifier.fillMaxWidth(),
                        )
                        OutlinedTextField(
                            value = remark,
                            onValueChange = onRemarkChange,
                            label = { Text(stringResource(R.string.common_remark)) },
                            modifier = Modifier.fillMaxWidth(),
                        )
                        Button(
                            onClick = { onSubmit(matchedVin.vin) },
                            enabled = canSubmit,
                            modifier = Modifier.fillMaxWidth(),
                        ) {
                            Icon(Icons.Filled.CheckCircle, contentDescription = null)
                            Text(
                                text = stringResource(R.string.load_confirm_and_next),
                                modifier = Modifier.padding(start = 8.dp),
                            )
                        }
                    }
                }
            }
        }

        item {
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
            ) {
                LoadVinGroups(
                    waybill = waybill,
                    modifier = Modifier.padding(16.dp),
                )
            }
        }

        if (recent.isNotEmpty()) {
            item {
                SectionTitle(title = stringResource(R.string.load_recent_completed))
            }
            items(recent, key = { "${it.waybillCode}-${it.vin}" }) {
                Card(modifier = Modifier.fillMaxWidth()) {
                    Text(
                        text = "${it.vin}  ${it.waybillCode}",
                        modifier = Modifier.padding(14.dp),
                        color = MaterialTheme.colorScheme.primary,
                    )
                }
            }
        }
    }
}

@Composable
private fun LoadVinState(vin: WaybillVin?, hasInput: Boolean) {
    if (!hasInput) {
        Text(
            text = stringResource(R.string.load_waiting_for_scan),
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        return
    }
    when {
        vin == null -> Text(
            text = stringResource(R.string.load_vin_not_in_waybill),
            color = MaterialTheme.colorScheme.error,
            fontWeight = FontWeight.SemiBold,
        )
        vin.loadedAt != null -> Text(
            text = stringResource(R.string.load_vin_already_loaded, vin.loadedAt),
            color = MaterialTheme.colorScheme.error,
            fontWeight = FontWeight.SemiBold,
        )
        else -> {
            Text(
                text = stringResource(R.string.load_vin_ready),
                color = MaterialTheme.colorScheme.primary,
                fontWeight = FontWeight.SemiBold,
            )
            Text(listOfNotNull(vin.model, vin.color).joinToString(" / ").ifBlank { "-" })
        }
    }
}

@Composable
private fun LoadVinGroups(waybill: Waybill, modifier: Modifier = Modifier) {
    val pending = waybill.vins.filter { it.loadedAt == null }
    val loaded = waybill.vins.filter { it.loadedAt != null }
    Column(
        modifier = modifier,
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Text(
            text = stringResource(R.string.load_pending_vins, pending.size),
            style = MaterialTheme.typography.titleMedium,
        )
        pending.forEach { vin ->
            VinRow(vin = vin.vin, secondary = listOfNotNull(vin.model, vin.color).joinToString(" / "))
        }
        HorizontalDivider(modifier = Modifier.padding(vertical = 4.dp))
        Text(
            text = stringResource(R.string.load_loaded_vins, loaded.size),
            style = MaterialTheme.typography.titleMedium,
        )
        loaded.forEach { vin ->
            VinRow(vin = vin.vin, secondary = vin.loadedAt.orEmpty())
        }
    }
}

@Composable
private fun SectionTitle(title: String, trailing: String? = null) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(text = title, style = MaterialTheme.typography.titleMedium)
        trailing?.let {
            Text(
                text = it,
                style = MaterialTheme.typography.labelLarge,
                color = MaterialTheme.colorScheme.primary,
            )
        }
    }
}

@Composable
private fun ProgressPill(loadedCount: Int, totalCount: Int) {
    Surface(
        color = MaterialTheme.colorScheme.primaryContainer,
        contentColor = MaterialTheme.colorScheme.primary,
        shape = RoundedCornerShape(999.dp),
    ) {
        Text(
            text = stringResource(R.string.load_progress, loadedCount, totalCount),
            modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp),
            style = MaterialTheme.typography.labelLarge,
        )
    }
}

@Composable
private fun WaybillInfoGrid(waybill: Waybill) {
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        InfoLine(
            icon = Icons.Filled.Storefront,
            label = stringResource(R.string.load_destination_dealer),
            value = waybill.destinationDealer?.dealerName
                ?: waybill.destinationYard?.name
                ?: waybill.recipientName
                ?: "-",
        )
        InfoLine(
            icon = Icons.Filled.LocalShipping,
            label = stringResource(R.string.load_carrier),
            value = waybill.carrier?.shortName ?: waybill.carrier?.name ?: "-",
        )
        InfoLine(
            icon = Icons.Filled.Person,
            label = stringResource(R.string.load_driver),
            value = listOfNotNull(waybill.driver?.name, waybill.driver?.phone)
                .joinToString("  ")
                .ifBlank { "-" },
        )
        InfoLine(
            icon = Icons.Filled.DirectionsCar,
            label = stringResource(R.string.load_vehicle),
            value = waybill.vehicle?.plateNumber ?: "-",
        )
    }
}

@Composable
private fun InfoLine(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    label: String,
    value: String,
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Box(
            modifier = Modifier
                .size(34.dp)
                .background(MaterialTheme.colorScheme.surfaceVariant, RoundedCornerShape(10.dp)),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = icon,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.primary,
                modifier = Modifier.size(18.dp),
            )
        }
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = label,
                style = MaterialTheme.typography.labelLarge,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Text(text = value, style = MaterialTheme.typography.bodyLarge)
        }
    }
}

@Composable
private fun VinRow(vin: String, secondary: String) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(vin, fontWeight = FontWeight.SemiBold)
            if (secondary.isNotBlank()) {
                Text(
                    secondary,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

private fun Waybill.routeLabel(): String {
    return "${originYard?.name ?: originText ?: "-"} -> " +
        (destinationDealer?.dealerName ?: destinationYard?.name ?: recipientName ?: "-")
}

private data class LoadDone(
    val vin: String,
    val waybillCode: String,
)

private enum class LoadLookupMode {
    Global,
    InWaybill,
}

private fun appError(error: Throwable, fallback: String): String {
    return (error as? ApiException)?.message ?: error.message ?: fallback
}
