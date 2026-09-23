package com.automotive.alms.core.scanner

import android.Manifest
import android.content.pm.PackageManager
import android.util.Log
import android.util.Size
import android.view.MotionEvent
import android.view.Surface as AndroidSurface
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.camera.core.Camera
import androidx.camera.core.CameraSelector
import androidx.camera.core.CameraState
import androidx.camera.core.ExperimentalGetImage
import androidx.camera.core.FocusMeteringAction
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy
import androidx.camera.core.Preview
import androidx.camera.core.resolutionselector.AspectRatioStrategy
import androidx.camera.core.resolutionselector.ResolutionSelector
import androidx.camera.core.resolutionselector.ResolutionStrategy
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.FlashOff
import androidx.compose.material.icons.filled.FlashOn
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Slider
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.Observer
import androidx.lifecycle.compose.LifecycleEventEffect
import androidx.lifecycle.compose.LocalLifecycleOwner
import com.automotive.alms.R
import com.google.mlkit.vision.barcode.BarcodeScanner
import com.google.mlkit.vision.barcode.BarcodeScannerOptions
import com.google.mlkit.vision.barcode.BarcodeScanning
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.common.InputImage
import java.util.concurrent.Executor
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean

// All entrances (transport pickup/signing, inbound, pickup and loading) use this same decoder.
internal fun createVinBarcodeScanner(): BarcodeScanner = BarcodeScanning.getClient(
    BarcodeScannerOptions.Builder().setBarcodeFormats(Barcode.FORMAT_ALL_FORMATS).build(),
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun VinBarcodeScannerScreen(title: String, onVinScanned: (String) -> Unit, onClose: () -> Unit) {
    val context = LocalContext.current
    fun cameraGranted() = ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED
    var hasCameraPermission by remember { mutableStateOf(cameraGranted()) }
    var camera by remember { mutableStateOf<Camera?>(null) }
    var torchEnabled by remember { mutableStateOf(false) }
    var zoom by remember { mutableFloatStateOf(1f) }
    var status by remember { mutableIntStateOf(R.string.scanner_focus_hint) }
    var cameraFailed by remember { mutableStateOf(false) }
    var attempt by remember { mutableIntStateOf(0) }
    val permissionLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) {
        hasCameraPermission = it || cameraGranted()
    }
    LaunchedEffect(Unit) {
        if (!hasCameraPermission) permissionLauncher.launch(Manifest.permission.CAMERA)
    }
    LifecycleEventEffect(Lifecycle.Event.ON_RESUME) { hasCameraPermission = cameraGranted() }
    BackHandler(onBack = onClose)

    Scaffold(topBar = {
        TopAppBar(title = { Text(title) }, navigationIcon = {
            IconButton(onClick = onClose) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = stringResource(R.string.common_close)) }
        }, actions = {
            TextButton(onClick = onClose) { Text(stringResource(R.string.scanner_manual_entry)) }
        })
    }) { padding ->
        Box(Modifier.fillMaxSize().padding(padding)) {
            if (hasCameraPermission && !cameraFailed) {
                key(attempt) {
                    VinCameraPreview(
                        onVinScanned = onVinScanned,
                    onCameraReady = {
                        camera = it
                        zoom = 1f
                        torchEnabled = false
                    },
                        onStatus = { status = it },
                        onCameraError = { camera = null; cameraFailed = true },
                        modifier = Modifier.fillMaxSize(),
                    )
                }
                ScannerOverlay(
                    status = status,
                    torchEnabled = torchEnabled,
                    hasFlash = camera?.cameraInfo?.hasFlashUnit() == true,
                    onToggleTorch = { torchEnabled = !torchEnabled; camera?.cameraControl?.enableTorch(torchEnabled) },
                    zoom = zoom,
                    maxZoom = minOf(camera?.cameraInfo?.zoomState?.value?.maxZoomRatio ?: 1f, 4f),
                    onZoom = { zoom = it; camera?.cameraControl?.setZoomRatio(it) },
                )
            } else {
                AlertDialog(
                    onDismissRequest = onClose,
                    confirmButton = {
                        TextButton(onClick = {
                            if (!hasCameraPermission) permissionLauncher.launch(Manifest.permission.CAMERA)
                            else { attempt++; cameraFailed = false; status = R.string.scanner_focus_hint }
                        }) {
                            Text(stringResource(if (hasCameraPermission) R.string.scanner_retry else R.string.scanner_camera_permission_action))
                        }
                    },
                    dismissButton = { TextButton(onClick = onClose) { Text(stringResource(R.string.scanner_manual_entry)) } },
                    title = { Text(stringResource(if (hasCameraPermission) R.string.scanner_camera_failed_title else R.string.scanner_camera_permission_title)) },
                    text = { Text(stringResource(if (hasCameraPermission) R.string.scanner_camera_failed_body else R.string.scanner_camera_permission_body)) },
                )
            }
        }
    }
}

@Composable
private fun VinCameraPreview(
    onVinScanned: (String) -> Unit,
    onCameraReady: (Camera) -> Unit,
    onStatus: (Int) -> Unit,
    onCameraError: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    val currentOnVin by rememberUpdatedState(onVinScanned)
    val currentOnCamera by rememberUpdatedState(onCameraReady)
    val currentOnStatus by rememberUpdatedState(onStatus)
    val currentOnError by rememberUpdatedState(onCameraError)
    val previewView = remember(context) {
        PreviewView(context).apply {
            scaleType = PreviewView.ScaleType.FIT_CENTER
            implementationMode = PreviewView.ImplementationMode.COMPATIBLE
        }
    }
    AndroidView(factory = { previewView }, modifier = modifier)

    DisposableEffect(lifecycleOwner, previewView) {
        val active = AtomicBoolean(true)
        val handled = AtomicBoolean(false)
        val executor = Executors.newSingleThreadExecutor()
        val mainExecutor = ContextCompat.getMainExecutor(context)
        val scanner = createVinBarcodeScanner()
        val rotation = previewView.display?.rotation ?: AndroidSurface.ROTATION_0
        val preview = Preview.Builder().setTargetRotation(rotation).build().also { it.setSurfaceProvider(previewView.surfaceProvider) }
        // A long VIN barcode needs more pixels than CameraX's default analysis resolution.
        val analysis = ImageAnalysis.Builder()
            .setResolutionSelector(ResolutionSelector.Builder()
                .setAspectRatioStrategy(AspectRatioStrategy.RATIO_16_9_FALLBACK_AUTO_STRATEGY)
                .setResolutionStrategy(ResolutionStrategy(Size(1920, 1080), ResolutionStrategy.FALLBACK_RULE_CLOSEST_LOWER_THEN_HIGHER))
                .build())
            .setTargetRotation(rotation)
            .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
            .build()
        analysis.setAnalyzer(executor) { image ->
            if (!active.get() || handled.get()) image.close()
            else processImageProxy(image, scanner, mainExecutor,
                onResult = { result ->
                    if (active.get() && !handled.get()) {
                        when (result) {
                            is VinScanResult.Found -> if (handled.compareAndSet(false, true)) currentOnVin(result.vin)
                            VinScanResult.Invalid -> currentOnStatus(R.string.scanner_invalid_vin)
                            VinScanResult.Multiple -> currentOnStatus(R.string.scanner_multiple_vins)
                            VinScanResult.Empty -> Unit
                        }
                    }
                },
                onFailure = { if (active.get()) currentOnStatus(R.string.scanner_processing_failed) },
            )
        }
        var provider: ProcessCameraProvider? = null
        var boundCamera: Camera? = null
        val cameraStateObserver = Observer<CameraState> { state ->
            if (active.get() && state.error != null) currentOnError()
        }
        val future = ProcessCameraProvider.getInstance(context)
        future.addListener({
            if (active.get()) {
                try {
                    val ready = future.get()
                    provider = ready
                    val camera = ready.bindToLifecycle(lifecycleOwner, CameraSelector.DEFAULT_BACK_CAMERA, preview, analysis)
                    boundCamera = camera
                    camera.cameraInfo.cameraState.observe(lifecycleOwner, cameraStateObserver)
                    currentOnCamera(camera)
                    fun focus(x: Float, y: Float) {
                        val point = previewView.meteringPointFactory.createPoint(x, y)
                        camera.cameraControl.startFocusAndMetering(FocusMeteringAction.Builder(point,
                            FocusMeteringAction.FLAG_AF or FocusMeteringAction.FLAG_AE)
                            .setAutoCancelDuration(3, TimeUnit.SECONDS).build())
                    }
                    previewView.post {
                        if (active.get() && previewView.width > 0) focus(previewView.width / 2f, previewView.height / 2f)
                    }
                    previewView.setOnTouchListener { view, event ->
                        if (event.action == MotionEvent.ACTION_UP) { view.performClick(); focus(event.x, event.y) }
                        true
                    }
                } catch (error: Exception) {
                    Log.w("VinScanner", "Camera binding failed", error)
                    if (active.get()) currentOnError()
                }
            }
        }, mainExecutor)
        onDispose {
            active.set(false)
            boundCamera?.cameraInfo?.cameraState?.removeObserver(cameraStateObserver)
            analysis.clearAnalyzer()
            // Unbind this screen's use cases only; don't leave an analyzer attached to a closed scanner.
            provider?.unbind(preview, analysis)
            previewView.setOnTouchListener(null)
            scanner.close()
            executor.shutdown()
        }
    }
}

@Composable
private fun BoxScope.ScannerOverlay(
    status: Int,
    torchEnabled: Boolean,
    hasFlash: Boolean,
    onToggleTorch: () -> Unit,
    zoom: Float,
    maxZoom: Float,
    onZoom: (Float) -> Unit,
) {
    Box(Modifier.matchParentSize().background(Color.Black.copy(alpha = 0.12f)))
    Surface(modifier = Modifier.align(Alignment.TopCenter).padding(20.dp), color = Color.Black.copy(alpha = 0.65f), contentColor = Color.White, shape = MaterialTheme.shapes.medium) {
        Text(stringResource(R.string.scanner_vin_hint), Modifier.padding(14.dp), style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold)
    }
    // The guide fits both a long 1D barcode and a complete QR code. Analysis uses the full image.
    Box(Modifier.align(Alignment.Center).fillMaxWidth(0.88f).height(260.dp)
        .border(BorderStroke(2.dp, Color.White), MaterialTheme.shapes.large))
    Surface(modifier = Modifier.align(Alignment.BottomCenter).padding(20.dp), color = Color.Black.copy(alpha = 0.72f), contentColor = Color.White, shape = MaterialTheme.shapes.medium) {
        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            Text(stringResource(status), style = MaterialTheme.typography.bodyMedium)
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                if (maxZoom > 1f) {
                    Text(stringResource(R.string.scanner_zoom))
                    Slider(value = zoom.coerceIn(1f, maxZoom), onValueChange = onZoom, valueRange = 1f..maxZoom, modifier = Modifier.width(170.dp))
                }
                if (hasFlash) IconButton(onClick = onToggleTorch) {
                    Icon(if (torchEnabled) Icons.Filled.FlashOn else Icons.Filled.FlashOff, contentDescription = stringResource(R.string.scanner_flash))
                }
            }
        }
    }
}

@androidx.annotation.OptIn(ExperimentalGetImage::class)
private fun processImageProxy(imageProxy: ImageProxy, scanner: BarcodeScanner, mainExecutor: Executor, onResult: (VinScanResult) -> Unit, onFailure: () -> Unit) {
    val mediaImage = imageProxy.image
    if (mediaImage == null) { imageProxy.close(); return }
    try {
        scanner.process(InputImage.fromMediaImage(mediaImage, imageProxy.imageInfo.rotationDegrees))
            .addOnSuccessListener(mainExecutor) { codes -> onResult(VinScanParser.read(codes.mapNotNull { it.rawValue })) }
            .addOnFailureListener(mainExecutor) { error -> Log.w("VinScanner", "Barcode analysis failed", error); onFailure() }
            .addOnCompleteListener(mainExecutor) { imageProxy.close() }
    } catch (error: Exception) {
        imageProxy.close()
        Log.w("VinScanner", "Could not prepare camera image", error)
        mainExecutor.execute(onFailure)
    }
}
