package com.automotive.alms.feature.pickup.presentation

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Rect
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.net.Uri
import android.os.Bundle
import android.os.Looper
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.PhotoCamera
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.FilterChip
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
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.core.content.FileProvider
import com.automotive.alms.BuildConfig
import com.automotive.alms.R
import com.automotive.alms.core.model.LoginResult
import com.automotive.alms.core.network.ApiException
import com.automotive.alms.core.ui.Dimens
import com.automotive.alms.core.ui.ScreenScaffold
import com.automotive.alms.core.ui.StatusPill
import com.automotive.alms.core.upload.UploadedFile
import com.automotive.alms.feature.pickup.data.PickupRepository
import com.automotive.alms.feature.pickup.model.PickupOrderDetail
import com.automotive.alms.feature.pickup.model.PickupOrderScanRequest
import com.automotive.alms.feature.pickup.model.PickupOrderScanResult
import com.automotive.alms.feature.pickup.model.PickupOrderSummary
import com.automotive.alms.feature.pickup.model.PickupVin
import java.io.File
import java.io.ByteArrayOutputStream
import java.time.LocalDateTime
import java.time.format.DateTimeFormatter
import java.util.Locale
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull
import kotlin.coroutines.resume

private const val STATUS_PENDING = "PENDING"
private const val STATUS_IN_PROGRESS = "IN_PROGRESS"
private const val STATUS_COMPLETED = "COMPLETED"
private const val GPS_MAX_AGE_MS = 180_000L

private data class EvidencePhoto(
    val uploadedFile: UploadedFile,
    val bitmap: Bitmap,
    val latitude: Double,
    val longitude: Double,
)

private data class GpsSnapshot(
    val location: Location,
    val capturedAtMillis: Long,
) {
    fun isFresh(nowMillis: Long = System.currentTimeMillis()): Boolean {
        return nowMillis - capturedAtMillis <= GPS_MAX_AGE_MS
    }
}

private data class WatermarkData(
    val vin: String,
    val gpsText: String,
    val latitude: Double,
    val longitude: Double,
    val operatorName: String,
    val accountUnitName: String,
    val timestamp: String,
)

@Composable
fun PickupScanScreen(
    repository: PickupRepository,
    loginResult: LoginResult?,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var orders by remember { mutableStateOf<List<PickupOrderSummary>>(emptyList()) }
    var selectedOrderId by rememberSaveable { mutableStateOf<String?>(null) }
    var detail by remember { mutableStateOf<PickupOrderDetail?>(null) }
    var loading by remember { mutableStateOf(false) }
    var message by remember { mutableStateOf<String?>(null) }
    var selectedStatus by rememberSaveable { mutableStateOf(STATUS_PENDING) }
    var outOfOrderVin by remember { mutableStateOf<String?>(null) }
    var gpsSnapshot by remember { mutableStateOf<GpsSnapshot?>(null) }
    var gpsRefreshing by remember { mutableStateOf(false) }
    val successText = stringResource(R.string.pickup_success)
    val outOfOrderText = stringResource(R.string.pickup_out_of_order)

    fun refreshGps(force: Boolean = false) {
        val current = gpsSnapshot
        if (!force && current?.isFresh() == true) return
        if (!context.hasAnyLocationPermission() || gpsRefreshing) return
        gpsRefreshing = true
        scope.launch {
            runCatching { context.resolveCurrentLocation() }
                .getOrNull()
                ?.let { gpsSnapshot = GpsSnapshot(it, System.currentTimeMillis()) }
            gpsRefreshing = false
        }
    }

    val locationPermissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestMultiplePermissions(),
    ) {
        refreshGps(force = true)
    }

    fun ensureGpsRefresh(force: Boolean = false) {
        if (context.hasAnyLocationPermission()) {
            refreshGps(force = force)
        } else {
            locationPermissionLauncher.launch(
                arrayOf(
                    Manifest.permission.ACCESS_FINE_LOCATION,
                    Manifest.permission.ACCESS_COARSE_LOCATION,
                ),
            )
        }
    }

    fun loadOrders() {
        loading = true
        message = null
        scope.launch {
            runCatching { repository.pickupOrders(includeCompleted = true) }
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
                    ensureGpsRefresh(force = true)
                }
                .onFailure { message = errorMessage(it) }
            loading = false
        }
    }

    LaunchedEffect(Unit) {
        loadOrders()
        ensureGpsRefresh(force = true)
    }

    ScreenScaffold(
        title = detail?.order?.orderCode ?: stringResource(R.string.pickup_tasks),
        actions = {
            IconButton(
                onClick = {
                    if (selectedOrderId == null) {
                        loadOrders()
                    } else {
                        selectedOrderId = null
                        detail = null
                        loadOrders()
                    }
                },
                enabled = !loading,
            ) {
                Icon(
                    imageVector = if (selectedOrderId == null) {
                        Icons.Filled.Refresh
                    } else {
                        Icons.AutoMirrored.Filled.ArrowBack
                    },
                    contentDescription = null,
                )
            }
        },
    ) { padding ->
        if (selectedOrderId == null) {
            PickupOrderList(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding)
                    .padding(horizontal = Dimens.PagePadding),
                orders = orders.filter { it.pickupStatus == selectedStatus },
                loading = loading,
                message = message,
                selectedStatus = selectedStatus,
                onStatusSelected = { selectedStatus = it },
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
                onUploadPhoto = { bytes ->
                    repository.uploadPhoto(
                        fileName = "pickup-${System.currentTimeMillis()}.jpg",
                        bytes = bytes,
                    )
                },
                operatorName = loginResult.operatorName(),
                accountUnitName = loginResult.accountUnitName(),
                onSubmitScan = { vin, location, remark, photos ->
                    val orderId = selectedOrderId ?: error("Missing order")
                    repository.scanOrder(
                        orderId = orderId,
                        request = PickupOrderScanRequest(
                            vin = vin,
                            allowOutOfOrder = true,
                            location = location.ifBlank { null },
                            pickupLatitude = photos.lastOrNull()?.latitude,
                            pickupLongitude = photos.lastOrNull()?.longitude,
                            photoUrls = photos.map { it.uploadedFile.key }.ifEmpty { null },
                            remark = remark.ifBlank { null },
                        ),
                    )
                },
                gpsSnapshot = gpsSnapshot,
                gpsRefreshing = gpsRefreshing,
                onRequestGpsRefresh = { ensureGpsRefresh(force = true) },
                onSubmitted = { result ->
                    message = if (result.outOfOrder) {
                        outOfOrderVin = result.vin.vin
                        "${result.vin.vin} $outOfOrderText"
                    } else {
                        "${result.vin.vin} $successText"
                    }
                    selectedOrderId?.let { loadDetail(it) }
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
    selectedStatus: String,
    onStatusSelected: (String) -> Unit,
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
                StatusTabs(selectedStatus = selectedStatus, onStatusSelected = onStatusSelected)
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

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun StatusTabs(selectedStatus: String, onStatusSelected: (String) -> Unit) {
    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        listOf(STATUS_PENDING, STATUS_IN_PROGRESS, STATUS_COMPLETED).forEach { status ->
            FilterChip(
                selected = selectedStatus == status,
                onClick = { onStatusSelected(status) },
                label = { Text(statusLabel(status)) },
            )
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
        Row(
            modifier = Modifier.padding(16.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text(order.orderCode, style = MaterialTheme.typography.titleLarge)
                Text(order.customerName, color = MaterialTheme.colorScheme.onSurfaceVariant)
                RouteLine(origin = order.originText, destination = order.destinationYardName)
                order.plannedPickupDate?.let {
                    Text(it, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                StatusPill(text = statusLabel(order.pickupStatus))
                Text(
                    text = "${order.total}",
                    style = MaterialTheme.typography.headlineSmall,
                    fontWeight = FontWeight.SemiBold,
                )
            }
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
    onUploadPhoto: suspend (ByteArray) -> UploadedFile,
    onSubmitScan: suspend (
        vin: String,
        location: String,
        remark: String,
        photos: List<EvidencePhoto>,
    ) -> PickupOrderScanResult,
    operatorName: String,
    accountUnitName: String,
    gpsSnapshot: GpsSnapshot?,
    gpsRefreshing: Boolean,
    onRequestGpsRefresh: () -> Unit,
    onSubmitted: (PickupOrderScanResult) -> Unit,
) {
    var scannedVin by rememberSaveable(detail?.order?.id) { mutableStateOf<String?>(null) }
    var vinInput by rememberSaveable(detail?.order?.id) { mutableStateOf("") }

    if (scannedVin != null && detail != null) {
        LaunchedEffect(scannedVin) {
            onRequestGpsRefresh()
        }
        PickupEvidenceContent(
            modifier = modifier,
            order = detail,
            vin = scannedVin.orEmpty(),
            onBack = { scannedVin = null },
            onUploadPhoto = onUploadPhoto,
            onSubmitScan = onSubmitScan,
            operatorName = operatorName,
            accountUnitName = accountUnitName,
            gpsSnapshot = gpsSnapshot,
            gpsRefreshing = gpsRefreshing,
            onRequestGpsRefresh = onRequestGpsRefresh,
            onSubmitted = {
                scannedVin = null
                vinInput = ""
                onSubmitted(it)
            },
        )
        return
    }

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

        item { PickupTaskHeader(detail) }

        item {
            VinScanEntry(
                vin = vinInput,
                onVinChange = { vinInput = it.trim().uppercase() },
                onScan = { scannedVin = vinInput },
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

@Composable
private fun VinScanEntry(
    vin: String,
    onVinChange: (String) -> Unit,
    onScan: () -> Unit,
) {
    Card(
        shape = RoundedCornerShape(Dimens.CardRadius),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
    ) {
        Row(
            modifier = Modifier.padding(12.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            OutlinedTextField(
                value = vin,
                onValueChange = onVinChange,
                label = { Text(stringResource(R.string.pickup_vin)) },
                leadingIcon = { Icon(Icons.Filled.Search, contentDescription = null) },
                singleLine = true,
                modifier = Modifier.weight(1f),
                shape = RoundedCornerShape(Dimens.CardRadius),
            )
            Button(
                onClick = onScan,
                enabled = vin.length >= 8,
                modifier = Modifier.padding(top = 8.dp),
            ) {
                Text(stringResource(R.string.pickup_scan_action))
            }
        }
    }
}

@Composable
private fun PickupEvidenceContent(
    modifier: Modifier,
    order: PickupOrderDetail,
    vin: String,
    onBack: () -> Unit,
    onUploadPhoto: suspend (ByteArray) -> UploadedFile,
    onSubmitScan: suspend (
        vin: String,
        location: String,
        remark: String,
        photos: List<EvidencePhoto>,
    ) -> PickupOrderScanResult,
    operatorName: String,
    accountUnitName: String,
    gpsSnapshot: GpsSnapshot?,
    gpsRefreshing: Boolean,
    onRequestGpsRefresh: () -> Unit,
    onSubmitted: (PickupOrderScanResult) -> Unit,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var remark by rememberSaveable(order.order.id, vin) { mutableStateOf("") }
    var photos by remember { mutableStateOf<List<EvidencePhoto>>(emptyList()) }
    var photoUri by remember { mutableStateOf<Uri?>(null) }
    var pendingWatermark by remember { mutableStateOf<WatermarkData?>(null) }
    var previewPhoto by remember { mutableStateOf<EvidencePhoto?>(null) }
    var submitting by remember { mutableStateOf(false) }
    var uploadingPhoto by remember { mutableStateOf(false) }
    var waitingForGpsCapture by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    val uploadFailed = stringResource(R.string.pickup_photo_upload_failed)
    val gpsRequired = stringResource(R.string.pickup_gps_required)
    val cameraLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.TakePicture(),
    ) { saved ->
        val capturedUri = photoUri
        if (!saved || capturedUri == null) return@rememberLauncherForActivityResult
        uploadingPhoto = true
        error = null
        scope.launch {
            runCatching {
                val watermark = pendingWatermark ?: error(gpsRequired)
                val bytes = context.readWatermarkedJpeg(capturedUri, watermark)
                EvidencePhoto(
                    uploadedFile = onUploadPhoto(bytes),
                    bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.size),
                    latitude = watermark.latitude,
                    longitude = watermark.longitude,
                )
            }
                .onSuccess { photos = photos + it }
                .onFailure { error = errorMessage(it).ifBlank { uploadFailed } }
            uploadingPhoto = false
        }
    }

    fun startCameraWithLocation(snapshot: GpsSnapshot) {
        val location = snapshot.location
        pendingWatermark = WatermarkData(
            vin = vin,
            gpsText = location.toGpsText(),
            latitude = location.latitude,
            longitude = location.longitude,
            operatorName = operatorName,
            accountUnitName = accountUnitName,
            timestamp = LocalDateTime.now().format(WATERMARK_TIME_FORMATTER),
        )
        val uri = context.createPickupPhotoUri()
        photoUri = uri
        cameraLauncher.launch(uri)
    }

    val permissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestPermission(),
    ) { granted ->
        if (granted || context.hasPermission(Manifest.permission.CAMERA)) {
            val snapshot = gpsSnapshot
            if (snapshot?.isFresh() == true) {
                startCameraWithLocation(snapshot)
            } else {
                waitingForGpsCapture = true
                onRequestGpsRefresh()
            }
        } else {
            error = context.getString(R.string.pickup_permission_denied)
        }
    }

    fun requestCapture() {
        if (!context.hasPermission(Manifest.permission.CAMERA)) {
            permissionLauncher.launch(Manifest.permission.CAMERA)
            return
        }
        val snapshot = gpsSnapshot
        if (snapshot?.isFresh() == true) {
            error = null
            waitingForGpsCapture = false
            startCameraWithLocation(snapshot)
            return
        }
        waitingForGpsCapture = true
        error = null
        onRequestGpsRefresh()
    }

    LaunchedEffect(gpsSnapshot, waitingForGpsCapture) {
        val snapshot = gpsSnapshot
        if (waitingForGpsCapture && snapshot?.isFresh() == true) {
            waitingForGpsCapture = false
            startCameraWithLocation(snapshot)
        }
    }

    LazyColumn(
        modifier = modifier,
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            Column(
                modifier = Modifier.padding(top = 12.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                OutlinedButton(onClick = onBack, enabled = !submitting && !uploadingPhoto) {
                    Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = null)
                    Text(
                        text = stringResource(R.string.pickup_task_detail),
                        modifier = Modifier.padding(start = 6.dp),
                    )
                }
                if (submitting || uploadingPhoto || gpsRefreshing || waitingForGpsCapture) {
                    LinearProgressIndicator(modifier = Modifier.fillMaxWidth())
                }
                if (waitingForGpsCapture && !gpsRefreshing && gpsSnapshot?.isFresh() != true) {
                    Text(text = gpsRequired, color = MaterialTheme.colorScheme.error)
                }
                error?.let { Text(text = it, color = MaterialTheme.colorScheme.error) }
            }
        }

        item {
            Card(
                shape = RoundedCornerShape(Dimens.CardRadius),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
            ) {
                Column(
                    modifier = Modifier.padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    Text(vin, style = MaterialTheme.typography.headlineSmall)
                    VehicleLine(order.vins.firstOrNull { it.vin == vin } ?: PickupVin(id = vin, vin = vin))
                    OutlinedTextField(
                        value = remark,
                        onValueChange = { remark = it },
                        label = { Text(stringResource(R.string.pickup_remark_optional)) },
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(Dimens.CardRadius),
                    )
                    PhotoThumbList(
                        photos = photos,
                        enabled = !submitting && !uploadingPhoto && !gpsRefreshing && !waitingForGpsCapture,
                        uploading = uploadingPhoto,
                        resolvingGps = gpsRefreshing || waitingForGpsCapture,
                        onAddPhoto = { requestCapture() },
                        onPreviewPhoto = { previewPhoto = it },
                        onRemovePhoto = { removed ->
                            photos = photos.filterNot {
                                it.uploadedFile.key == removed.uploadedFile.key
                            }
                        },
                    )
                    Button(
                        onClick = {
                            submitting = true
                            error = null
                            scope.launch {
                                runCatching {
                                    onSubmitScan(
                                        vin,
                                        order.order.originText.orEmpty(),
                                        remark,
                                        photos,
                                    )
                                }
                                    .onSuccess { onSubmitted(it) }
                                    .onFailure { error = errorMessage(it) }
                                submitting = false
                            }
                        },
                        enabled = photos.isNotEmpty() && !submitting && !uploadingPhoto && !gpsRefreshing && !waitingForGpsCapture,
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
    }

    previewPhoto?.let { photo ->
        AlertDialog(
            onDismissRequest = { previewPhoto = null },
            confirmButton = {
                TextButton(onClick = { previewPhoto = null }) {
                    Text(stringResource(R.string.pickup_out_of_order_confirm))
                }
            },
            text = {
                Image(
                    bitmap = photo.bitmap.asImageBitmap(),
                    contentDescription = null,
                    modifier = Modifier.fillMaxWidth(),
                )
            },
        )
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun PhotoThumbList(
    photos: List<EvidencePhoto>,
    enabled: Boolean,
    uploading: Boolean,
    resolvingGps: Boolean,
    onAddPhoto: () -> Unit,
    onPreviewPhoto: (EvidencePhoto) -> Unit,
    onRemovePhoto: (EvidencePhoto) -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        if (photos.isNotEmpty()) {
            Text(
                text = stringResource(R.string.pickup_photo_count, photos.size),
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                style = MaterialTheme.typography.bodyMedium,
            )
        }
        FlowRow(
            horizontalArrangement = Arrangement.spacedBy(10.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            photos.forEach { photo ->
                Box {
                    Image(
                        bitmap = photo.bitmap.asImageBitmap(),
                        contentDescription = null,
                        modifier = Modifier
                            .size(86.dp)
                            .clickable { onPreviewPhoto(photo) },
                    )
                    IconButton(onClick = { onRemovePhoto(photo) }) {
                        Icon(Icons.Filled.Delete, contentDescription = null)
                    }
                }
            }
            OutlinedButton(
                onClick = onAddPhoto,
                enabled = enabled,
                modifier = Modifier.size(86.dp),
                shape = RoundedCornerShape(Dimens.CardRadius),
            ) {
                Icon(
                    imageVector = if (uploading || resolvingGps) {
                        Icons.Filled.PhotoCamera
                    } else {
                        Icons.Filled.Add
                    },
                    contentDescription = null,
                )
            }
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
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(14.dp),
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
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
        STATUS_PENDING -> stringResource(R.string.pickup_status_pending)
        STATUS_IN_PROGRESS -> stringResource(R.string.pickup_status_progress)
        STATUS_COMPLETED -> stringResource(R.string.pickup_status_completed)
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

private fun Context.createPickupPhotoUri(): Uri {
    val dir = File(cacheDir, "pickup_photos").apply { mkdirs() }
    val file = File(dir, "pickup-${System.currentTimeMillis()}.jpg")
    return FileProvider.getUriForFile(this, "${BuildConfig.APPLICATION_ID}.fileprovider", file)
}

private suspend fun Context.readWatermarkedJpeg(
    uri: Uri,
    watermark: WatermarkData,
): ByteArray = withContext(Dispatchers.IO) {
    val bitmap = contentResolver.openInputStream(uri)?.use { input ->
        BitmapFactory.decodeStream(input)
    } ?: error("Photo file is empty")
    bitmap.withWatermark(watermark).toJpegBytes()
}

private fun Bitmap.withWatermark(watermark: WatermarkData): Bitmap {
    val result = copy(Bitmap.Config.ARGB_8888, true)
    val canvas = Canvas(result)
    val density = result.width / 390f
    val textPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.WHITE
        textSize = (13f * density).coerceAtLeast(18f)
        typeface = android.graphics.Typeface.DEFAULT_BOLD
    }
    val lines = listOf(
        "VIN ${watermark.vin}",
        "GPS ${watermark.gpsText}",
        "${watermark.timestamp}  ${watermark.operatorName}",
        watermark.accountUnitName,
    )
    val lineHeight = (textPaint.textSize * 1.35f).toInt()
    val padding = (12f * density).toInt().coerceAtLeast(16)
    val panelHeight = lineHeight * lines.size + padding * 2
    val top = result.height - panelHeight
    Paint().apply {
        color = Color.argb(150, 0, 0, 0)
        canvas.drawRect(0f, top.toFloat(), result.width.toFloat(), result.height.toFloat(), this)
    }
    lines.forEachIndexed { index, line ->
        canvas.drawText(
            line,
            padding.toFloat(),
            (top + padding + lineHeight * (index + 1)).toFloat(),
            textPaint,
        )
    }
    return result
}

private fun Bitmap.toJpegBytes(): ByteArray {
    val output = ByteArrayOutputStream()
    compress(Bitmap.CompressFormat.JPEG, 90, output)
    return output.toByteArray()
}

private fun Context.hasPermission(permission: String): Boolean {
    return checkSelfPermission(permission) == PackageManager.PERMISSION_GRANTED
}

private fun Context.hasAnyLocationPermission(): Boolean {
    return hasPermission(Manifest.permission.ACCESS_FINE_LOCATION) ||
        hasPermission(Manifest.permission.ACCESS_COARSE_LOCATION)
}

private suspend fun Context.resolveCurrentLocation(): Location? {
    if (!hasAnyLocationPermission()) return null
    val manager = getSystemService(Context.LOCATION_SERVICE) as LocationManager
    val providers = listOf(LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER)
        .filter { provider -> manager.isProviderEnabled(provider) }
    val current = providers.firstNotNullOfOrNull { provider ->
        withTimeoutOrNull(8000) { manager.awaitSingleLocation(provider) }
    }
    if (current != null) return current
    return providers.mapNotNull { provider ->
        runCatching { manager.getLastKnownLocation(provider) }.getOrNull()
    }.maxByOrNull { it.time }
}

private suspend fun LocationManager.awaitSingleLocation(provider: String): Location? {
    return suspendCancellableCoroutine { continuation ->
        val listener = object : LocationListener {
            override fun onLocationChanged(location: Location) {
                if (continuation.isActive) continuation.resume(location)
                removeUpdates(this)
            }

            @Deprecated("Deprecated by Android")
            override fun onStatusChanged(provider: String?, status: Int, extras: Bundle?) = Unit

            override fun onProviderEnabled(provider: String) = Unit
            override fun onProviderDisabled(provider: String) {
                if (continuation.isActive) continuation.resume(null)
                removeUpdates(this)
            }
        }
        runCatching {
            requestSingleUpdate(provider, listener, Looper.getMainLooper())
        }.onFailure {
            if (continuation.isActive) continuation.resume(null)
        }
        continuation.invokeOnCancellation { removeUpdates(listener) }
    }
}

private fun Location.toGpsText(): String {
    return String.format(Locale.US, "%.6f, %.6f", latitude, longitude)
}

private fun LoginResult?.operatorName(): String {
    return this?.user?.displayName?.takeIf { it.isNotBlank() }
        ?: this?.user?.username
        ?: "-"
}

private fun LoginResult?.accountUnitName(): String {
    val result = this ?: return "-"
    return result.accountUnit?.name
        ?: result.externalContext?.carrierName
        ?: result.externalContext?.customerName
        ?: result.memberships.firstOrNull { it.organizationId == result.activeOrgId }?.organizationName
        ?: result.memberships.firstOrNull()?.organizationName
        ?: result.user.username
}

private fun errorMessage(throwable: Throwable): String {
    return (throwable as? ApiException)?.message
        ?: throwable.localizedMessage
        ?: "Request failed"
}

private val WATERMARK_TIME_FORMATTER: DateTimeFormatter =
    DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss")
