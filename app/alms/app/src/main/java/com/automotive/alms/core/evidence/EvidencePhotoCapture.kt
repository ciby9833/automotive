package com.automotive.alms.core.evidence

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
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
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.PhotoCamera
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.core.content.FileProvider
import com.automotive.alms.BuildConfig
import com.automotive.alms.R
import com.automotive.alms.core.model.LoginResult
import com.automotive.alms.core.ui.Dimens
import com.automotive.alms.core.upload.UploadedFile
import java.io.ByteArrayOutputStream
import java.io.File
import java.time.LocalDateTime
import java.time.format.DateTimeFormatter
import java.util.Locale
import kotlin.coroutines.resume
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull

private val WATERMARK_TIME_FORMATTER = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss")

data class EvidencePhoto(
    val uploadedFile: UploadedFile,
    val bitmap: Bitmap,
    val latitude: Double,
    val longitude: Double,
)

private data class WatermarkData(
    val subject: String,
    val gpsText: String,
    val latitude: Double,
    val longitude: Double,
    val operatorName: String,
    val accountUnitName: String,
    val timestamp: String,
)

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun EvidencePhotoCapture(
    subject: String,
    operatorName: String,
    accountUnitName: String,
    photos: List<EvidencePhoto>,
    onPhotosChange: (List<EvidencePhoto>) -> Unit,
    onUploadPhoto: suspend (ByteArray) -> UploadedFile,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    title: String? = null,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val resolvedTitle = title ?: stringResource(R.string.evidence_default_title)
    val missingWatermarkMessage = stringResource(R.string.evidence_missing_watermark)
    val previewFailedMessage = stringResource(R.string.evidence_preview_failed)
    val uploadFailedMessage = stringResource(R.string.evidence_upload_failed)
    val gpsUnavailableMessage = stringResource(R.string.evidence_gps_unavailable)
    val locationPermissionRequiredMessage = stringResource(R.string.evidence_location_permission_required)
    val cameraPermissionRequiredMessage = stringResource(R.string.evidence_camera_permission_required)
    var photoUri by remember { mutableStateOf<Uri?>(null) }
    var pendingWatermark by remember { mutableStateOf<WatermarkData?>(null) }
    var previewPhoto by remember { mutableStateOf<EvidencePhoto?>(null) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    val cameraLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.TakePicture(),
    ) { saved ->
        val capturedUri = photoUri
        if (!saved || capturedUri == null) return@rememberLauncherForActivityResult
        busy = true
        error = null
        scope.launch {
            runCatching {
                val watermark = pendingWatermark ?: kotlin.error(missingWatermarkMessage)
                val bytes = context.readWatermarkedJpeg(capturedUri, watermark)
                EvidencePhoto(
                    uploadedFile = onUploadPhoto(bytes),
                    bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
                        ?: kotlin.error(previewFailedMessage),
                    latitude = watermark.latitude,
                    longitude = watermark.longitude,
                )
            }.onSuccess {
                onPhotosChange(photos + it)
            }.onFailure {
                error = it.localizedMessage ?: uploadFailedMessage
            }
            busy = false
        }
    }

    fun launchCameraAfterLocation() {
        busy = true
        error = null
        scope.launch {
            val location = context.resolveCurrentLocation()
            if (location == null) {
                busy = false
                error = gpsUnavailableMessage
                return@launch
            }
            pendingWatermark = WatermarkData(
                subject = subject,
                gpsText = location.toGpsText(),
                latitude = location.latitude,
                longitude = location.longitude,
                operatorName = operatorName,
                accountUnitName = accountUnitName,
                timestamp = LocalDateTime.now().format(WATERMARK_TIME_FORMATTER),
            )
            val uri = context.createEvidencePhotoUri()
            photoUri = uri
            busy = false
            cameraLauncher.launch(uri)
        }
    }

    val locationPermissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestMultiplePermissions(),
    ) { result ->
        if (result.values.any { it }) {
            launchCameraAfterLocation()
        } else {
            error = locationPermissionRequiredMessage
        }
    }

    val cameraPermissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestPermission(),
    ) { granted ->
        if (granted || context.hasPermission(Manifest.permission.CAMERA)) {
            if (context.hasAnyLocationPermission()) {
                launchCameraAfterLocation()
            } else {
                locationPermissionLauncher.launch(
                    arrayOf(
                        Manifest.permission.ACCESS_FINE_LOCATION,
                        Manifest.permission.ACCESS_COARSE_LOCATION,
                    ),
                )
            }
        } else {
            error = cameraPermissionRequiredMessage
        }
    }

    fun requestCapture() {
        if (!context.hasPermission(Manifest.permission.CAMERA)) {
            cameraPermissionLauncher.launch(Manifest.permission.CAMERA)
            return
        }
        if (!context.hasAnyLocationPermission()) {
            locationPermissionLauncher.launch(
                arrayOf(
                    Manifest.permission.ACCESS_FINE_LOCATION,
                    Manifest.permission.ACCESS_COARSE_LOCATION,
                ),
            )
            return
        }
        launchCameraAfterLocation()
    }

    Column(modifier = modifier, verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(
            text = if (photos.isEmpty()) {
                stringResource(R.string.evidence_title_required, resolvedTitle)
            } else {
                stringResource(R.string.evidence_title_count, resolvedTitle, photos.size)
            },
            style = MaterialTheme.typography.titleSmall,
        )
        if (busy) LinearProgressIndicator(modifier = Modifier.fillMaxWidth())
        error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
        FlowRow(
            horizontalArrangement = Arrangement.spacedBy(10.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            photos.forEach { photo ->
                Box {
                    Image(
                        bitmap = photo.bitmap.asImageBitmap(),
                        contentDescription = null,
                        contentScale = ContentScale.Crop,
                        modifier = Modifier
                            .size(86.dp)
                            .clickable(enabled = enabled && !busy) { previewPhoto = photo },
                    )
                    IconButton(
                        onClick = { onPhotosChange(photos.filterNot { it.uploadedFile.key == photo.uploadedFile.key }) },
                        enabled = enabled && !busy,
                    ) {
                        Icon(Icons.Filled.Delete, contentDescription = null)
                    }
                }
            }
            OutlinedButton(
                onClick = { requestCapture() },
                enabled = enabled && !busy && subject.isNotBlank(),
                modifier = Modifier.size(86.dp),
                shape = RoundedCornerShape(Dimens.CardRadius),
            ) {
                Icon(
                    imageVector = if (busy) Icons.Filled.PhotoCamera else Icons.Filled.Add,
                    contentDescription = null,
                )
            }
        }
    }

    previewPhoto?.let { photo ->
        AlertDialog(
            onDismissRequest = { previewPhoto = null },
            confirmButton = {
                TextButton(onClick = { previewPhoto = null }) {
                    Text(stringResource(R.string.common_close))
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

fun LoginResult?.operatorName(): String {
    return this?.user?.displayName?.takeIf { it.isNotBlank() }
        ?: this?.user?.username
        ?: "-"
}

fun LoginResult?.accountUnitName(): String {
    val result = this ?: return "-"
    return result.accountUnit?.name
        ?: result.externalContext?.carrierName
        ?: result.externalContext?.customerName
        ?: result.memberships.firstOrNull { it.organizationId == result.activeOrgId }?.organizationName
        ?: result.memberships.firstOrNull()?.organizationName
        ?: result.user.username
}

private fun Context.createEvidencePhotoUri(): Uri {
    val dir = File(cacheDir, "pickup_photos").apply { mkdirs() }
    val file = File(dir, "evidence-${System.currentTimeMillis()}.jpg")
    return FileProvider.getUriForFile(this, "${BuildConfig.APPLICATION_ID}.fileprovider", file)
}

private suspend fun Context.readWatermarkedJpeg(
    uri: Uri,
    watermark: WatermarkData,
): ByteArray = withContext(Dispatchers.IO) {
    val bitmap = contentResolver.openInputStream(uri)?.use { input ->
        BitmapFactory.decodeStream(input)
    } ?: kotlin.error(getString(R.string.evidence_empty_file))
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
        watermark.subject,
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

@SuppressLint("MissingPermission")
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

@SuppressLint("MissingPermission")
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
