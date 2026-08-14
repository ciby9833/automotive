package com.automotive.alms.feature.waybill.presentation

import android.Manifest
import android.content.pm.PackageManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.FilterChip
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import com.automotive.alms.R
import com.automotive.alms.core.evidence.EvidencePhoto
import com.automotive.alms.core.evidence.EvidencePhotoCapture
import com.automotive.alms.core.evidence.accountUnitName
import com.automotive.alms.core.evidence.operatorName
import com.automotive.alms.core.model.LoginResult
import com.automotive.alms.core.network.ApiException
import com.automotive.alms.core.ui.Dimens
import com.automotive.alms.core.ui.ScreenScaffold
import com.automotive.alms.feature.tracking.service.DriverLocationService
import com.automotive.alms.feature.waybill.data.WaybillRepository
import com.automotive.alms.feature.waybill.model.DepartWaybillRequest
import com.automotive.alms.feature.waybill.model.LoadVinRequest
import com.automotive.alms.feature.waybill.model.Waybill
import com.automotive.alms.feature.waybill.model.WaybillScanRequest
import com.automotive.alms.feature.waybill.model.WaybillVin
import kotlinx.coroutines.launch

private const val STATUS_NOT_ARRIVED = "NOT_ARRIVED"
private const val STATUS_IN_TRANSIT = "IN_TRANSIT"
private const val STATUS_ARRIVED = "ARRIVED"

@Composable
fun WaybillListScreen(
    repository: WaybillRepository,
    loginResult: LoginResult?,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var selectedStatus by rememberSaveable { mutableStateOf<String?>(STATUS_NOT_ARRIVED) }
    var waybills by remember { mutableStateOf<List<Waybill>>(emptyList()) }
    var selectedId by rememberSaveable { mutableStateOf<String?>(null) }
    var detail by remember { mutableStateOf<Waybill?>(null) }
    var loading by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var gatePhotos by remember { mutableStateOf<List<EvidencePhoto>>(emptyList()) }
    var vinPhotos by remember { mutableStateOf<Map<String, List<EvidencePhoto>>>(emptyMap()) }
    var remark by rememberSaveable { mutableStateOf("") }
    val requestFailed = stringResource(R.string.common_request_failed)
    val locationPermissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestMultiplePermissions(),
    ) { result ->
        if (result.values.any { it }) {
            detail?.takeIf { it.status == STATUS_IN_TRANSIT }?.let {
                DriverLocationService.start(context, waybillId = it.id, orderId = null)
            }
        }
    }

    fun loadList() {
        loading = true
        scope.launch {
            runCatching { repository.list(selectedStatus) }
                .onSuccess { waybills = it }
                .onFailure { error = appError(it, requestFailed) }
            loading = false
        }
    }

    fun loadDetail(id: String) {
        loading = true
        scope.launch {
            runCatching { repository.detail(id) }
                .onSuccess {
                    if (selectedId != id) {
                        gatePhotos = emptyList()
                        vinPhotos = emptyMap()
                        remark = ""
                    }
                    selectedId = id
                    detail = it
                }
                .onFailure { error = appError(it, requestFailed) }
            loading = false
        }
    }

    LaunchedEffect(selectedStatus) {
        if (selectedId == null) loadList()
    }

    DisposableEffect(detail?.id, detail?.status) {
        val current = detail
        if (current?.status == STATUS_IN_TRANSIT) {
            if (context.hasLocationPermission()) {
                DriverLocationService.start(context, waybillId = current.id, orderId = null)
            } else {
                locationPermissionLauncher.launch(
                    arrayOf(
                        Manifest.permission.ACCESS_FINE_LOCATION,
                        Manifest.permission.ACCESS_COARSE_LOCATION,
                    ),
                )
            }
        }
        onDispose {
            if (current?.status == STATUS_IN_TRANSIT) {
                DriverLocationService.stop(context)
            }
        }
    }

    ScreenScaffold(
        title = detail?.waybillCode ?: stringResource(R.string.waybills),
        actions = {
            TextButton(
                onClick = {
                    if (selectedId == null) {
                        loadList()
                    } else {
                        selectedId = null
                        detail = null
                        gatePhotos = emptyList()
                        vinPhotos = emptyMap()
                        remark = ""
                        loadList()
                    }
                },
            ) {
                Text(
                    if (selectedId == null) {
                        stringResource(R.string.common_refresh)
                    } else {
                        stringResource(R.string.common_back)
                    },
                )
            }
        },
    ) { padding ->
        if (selectedId == null) {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding)
                    .padding(horizontal = Dimens.PagePadding),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                if (loading) LinearProgressIndicator(modifier = Modifier.fillMaxWidth())
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    StatusChip(stringResource(R.string.waybill_filter_pending), STATUS_NOT_ARRIVED, selectedStatus) {
                        selectedStatus = it
                    }
                    StatusChip(stringResource(R.string.waybill_filter_transit), STATUS_IN_TRANSIT, selectedStatus) {
                        selectedStatus = it
                    }
                    StatusChip(stringResource(R.string.waybill_filter_arrived), STATUS_ARRIVED, selectedStatus) {
                        selectedStatus = it
                    }
                }
                LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    items(waybills, key = { it.id }) { waybill ->
                        WaybillCard(waybill = waybill, onClick = { loadDetail(waybill.id) })
                    }
                }
            }
        } else {
            WaybillDetailContent(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding)
                    .padding(horizontal = Dimens.PagePadding),
                detail = detail,
                loading = loading,
                gatePhotos = gatePhotos,
                vinPhotos = vinPhotos,
                remark = remark,
                loginResult = loginResult,
                onGatePhotosChange = { gatePhotos = it },
                onVinPhotosChange = { vin, photos ->
                    vinPhotos = vinPhotos.toMutableMap().apply {
                        if (photos.isEmpty()) remove(vin) else put(vin, photos)
                    }
                },
                onRemarkChange = { remark = it },
                onUploadPhoto = { label, bytes ->
                    repository.uploadPhoto(
                        fileName = "$label-${System.currentTimeMillis()}.jpg",
                        bytes = bytes,
                    )
                },
                onLoadVin = { vin ->
                    val currentPhotos = vinPhotos[vin].orEmpty()
                    loading = true
                    scope.launch {
                        runCatching {
                            repository.loadVin(
                                detail!!.id,
                                vin,
                                LoadVinRequest(currentPhotos.map { it.uploadedFile.key }, remark.ifBlank { null }),
                            )
                        }.onSuccess {
                            vinPhotos = vinPhotos - vin
                            remark = ""
                            loadDetail(detail!!.id)
                        }.onFailure { error = appError(it, requestFailed) }
                        loading = false
                    }
                },
                onDepart = {
                    loading = true
                    scope.launch {
                        runCatching {
                            repository.depart(
                                detail!!.id,
                                DepartWaybillRequest(gatePhotos.map { it.uploadedFile.key }, remark.ifBlank { null }),
                            )
                        }.onSuccess {
                            gatePhotos = emptyList()
                            remark = ""
                            loadDetail(detail!!.id)
                        }.onFailure { error = appError(it, requestFailed) }
                        loading = false
                    }
                },
                onSignVin = { vin ->
                    val currentPhotos = vinPhotos[vin].orEmpty()
                    loading = true
                    scope.launch {
                        runCatching {
                            repository.sign(
                                WaybillScanRequest(
                                    vin = vin,
                                    action = "SIGNED",
                                    attachmentUrls = currentPhotos.map { it.uploadedFile.key },
                                    remark = remark.ifBlank { null },
                                ),
                            )
                        }.onSuccess {
                            vinPhotos = vinPhotos - vin
                            remark = ""
                            loadDetail(detail!!.id)
                        }.onFailure { error = appError(it, requestFailed) }
                        loading = false
                    }
                },
            )
        }
    }

    error?.let {
        AlertDialog(
            onDismissRequest = { error = null },
            confirmButton = { TextButton(onClick = { error = null }) { Text(stringResource(R.string.common_confirm)) } },
            title = { Text(stringResource(R.string.waybill_operation_failed)) },
            text = { Text(it) },
        )
    }
}

@Composable
private fun StatusChip(
    label: String,
    value: String,
    selected: String?,
    onSelect: (String) -> Unit,
) {
    FilterChip(
        selected = selected == value,
        onClick = { onSelect(value) },
        label = { Text(label) },
    )
}

@Composable
private fun WaybillCard(waybill: Waybill, onClick: () -> Unit) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick),
    ) {
        Column(
            modifier = Modifier.padding(14.dp),
            verticalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            Text(waybill.waybillCode, fontWeight = FontWeight.SemiBold)
            Text("${waybill.status} · ${waybill.transportType}", color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text(
                "${waybill.originYard?.name ?: waybill.originText ?: "-"} → " +
                    (waybill.destinationDealer?.dealerName ?: waybill.destinationYard?.name ?: "-"),
            )
            Text(stringResource(R.string.waybill_vin_count, waybill.vins.size), style = MaterialTheme.typography.bodySmall)
        }
    }
}

@Composable
private fun WaybillDetailContent(
    modifier: Modifier,
    detail: Waybill?,
    loading: Boolean,
    gatePhotos: List<EvidencePhoto>,
    vinPhotos: Map<String, List<EvidencePhoto>>,
    remark: String,
    loginResult: LoginResult?,
    onGatePhotosChange: (List<EvidencePhoto>) -> Unit,
    onVinPhotosChange: (String, List<EvidencePhoto>) -> Unit,
    onRemarkChange: (String) -> Unit,
    onUploadPhoto: suspend (String, ByteArray) -> com.automotive.alms.core.upload.UploadedFile,
    onLoadVin: (String) -> Unit,
    onDepart: () -> Unit,
    onSignVin: (String) -> Unit,
) {
    if (detail == null) {
        Column(modifier = modifier) {
            if (loading) LinearProgressIndicator(modifier = Modifier.fillMaxWidth())
            Text(stringResource(R.string.common_loading))
        }
        return
    }
    val allLoaded = detail.vins.isNotEmpty() && detail.vins.all { it.loadedAt != null }
    LazyColumn(
        modifier = modifier,
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        item {
            if (loading) LinearProgressIndicator(modifier = Modifier.fillMaxWidth())
            Card(modifier = Modifier.fillMaxWidth()) {
                Column(
                    modifier = Modifier.padding(14.dp),
                    verticalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    Text(detail.waybillCode, style = MaterialTheme.typography.titleMedium)
                    Text(stringResource(R.string.waybill_status_label, detail.status))
                    Text(stringResource(R.string.waybill_carrier_label, detail.carrier?.shortName ?: detail.carrier?.name ?: "-"))
                    Text(
                        stringResource(
                            R.string.waybill_destination_label,
                            detail.destinationDealer?.dealerName ?: detail.destinationYard?.name ?: "-",
                        ),
                    )
                    Text(stringResource(R.string.waybill_contact_label, detail.recipientName ?: "-", detail.recipientPhone ?: ""))
                }
            }
        }
        item {
            Card(modifier = Modifier.fillMaxWidth()) {
                Column(
                    modifier = Modifier.padding(14.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    OutlinedTextField(
                        value = remark,
                        onValueChange = onRemarkChange,
                        label = { Text(stringResource(R.string.common_remark)) },
                        modifier = Modifier.fillMaxWidth(),
                    )
                    if (detail.status == STATUS_NOT_ARRIVED) {
                        EvidencePhotoCapture(
                            subject = stringResource(R.string.waybill_depart_subject, detail.waybillCode),
                            operatorName = loginResult.operatorName(),
                            accountUnitName = loginResult.accountUnitName(),
                            photos = gatePhotos,
                            onPhotosChange = onGatePhotosChange,
                            onUploadPhoto = { bytes -> onUploadPhoto("depart-${detail.waybillCode}", bytes) },
                            enabled = !loading,
                            title = stringResource(R.string.waybill_depart_photo_title),
                            modifier = Modifier.fillMaxWidth(),
                        )
                        Button(
                            enabled = allLoaded && gatePhotos.isNotEmpty(),
                            onClick = onDepart,
                            modifier = Modifier.fillMaxWidth(),
                        ) {
                            Text(stringResource(R.string.waybill_depart_submit))
                        }
                    }
                }
            }
        }
        items(detail.vins, key = { it.id }) { vin ->
            WaybillVinCard(
                vin = vin,
                waybillStatus = detail.status,
                photos = vinPhotos[vin.vin].orEmpty(),
                loginResult = loginResult,
                loading = loading,
                onPhotosChange = { photos -> onVinPhotosChange(vin.vin, photos) },
                onUploadPhoto = onUploadPhoto,
                onLoadVin = onLoadVin,
                onSignVin = onSignVin,
            )
        }
    }
}

@Composable
private fun WaybillVinCard(
    vin: WaybillVin,
    waybillStatus: String,
    photos: List<EvidencePhoto>,
    loginResult: LoginResult?,
    loading: Boolean,
    onPhotosChange: (List<EvidencePhoto>) -> Unit,
    onUploadPhoto: suspend (String, ByteArray) -> com.automotive.alms.core.upload.UploadedFile,
    onLoadVin: (String) -> Unit,
    onSignVin: (String) -> Unit,
) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(
            modifier = Modifier.padding(14.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            Text(vin.vin, fontWeight = FontWeight.SemiBold)
            Text(listOfNotNull(vin.model, vin.color).joinToString(" / ").ifBlank { "-" })
            Text(
                stringResource(
                    R.string.waybill_vin_scan_status,
                    vin.loadedAt ?: stringResource(R.string.waybill_load_missing),
                    if (vin.isSigned) {
                        stringResource(R.string.waybill_signed_yes)
                    } else {
                        stringResource(R.string.waybill_signed_no)
                    },
                ),
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            if (waybillStatus == STATUS_NOT_ARRIVED && vin.loadedAt == null) {
                EvidencePhotoCapture(
                    subject = stringResource(R.string.waybill_load_subject, vin.vin),
                    operatorName = loginResult.operatorName(),
                    accountUnitName = loginResult.accountUnitName(),
                    photos = photos,
                    onPhotosChange = onPhotosChange,
                    onUploadPhoto = { bytes -> onUploadPhoto("load-${vin.vin}", bytes) },
                    enabled = !loading,
                    title = stringResource(R.string.waybill_load_photo_title),
                    modifier = Modifier.fillMaxWidth(),
                )
                Button(enabled = photos.isNotEmpty() && !loading, onClick = { onLoadVin(vin.vin) }) {
                    Text(stringResource(R.string.waybill_load_submit))
                }
            }
            if (waybillStatus == STATUS_IN_TRANSIT && !vin.isSigned) {
                EvidencePhotoCapture(
                    subject = stringResource(R.string.waybill_sign_subject, vin.vin),
                    operatorName = loginResult.operatorName(),
                    accountUnitName = loginResult.accountUnitName(),
                    photos = photos,
                    onPhotosChange = onPhotosChange,
                    onUploadPhoto = { bytes -> onUploadPhoto("sign-${vin.vin}", bytes) },
                    enabled = !loading,
                    title = stringResource(R.string.waybill_sign_photo_title),
                    modifier = Modifier.fillMaxWidth(),
                )
                Button(enabled = photos.isNotEmpty() && !loading, onClick = { onSignVin(vin.vin) }) {
                    Text(stringResource(R.string.waybill_sign_submit))
                }
            }
        }
    }
}

private fun appError(error: Throwable, fallback: String): String {
    return (error as? ApiException)?.message ?: error.message ?: fallback
}

private fun android.content.Context.hasLocationPermission(): Boolean {
    val fine = ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION)
    val coarse = ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION)
    return fine == PackageManager.PERMISSION_GRANTED || coarse == PackageManager.PERMISSION_GRANTED
}
