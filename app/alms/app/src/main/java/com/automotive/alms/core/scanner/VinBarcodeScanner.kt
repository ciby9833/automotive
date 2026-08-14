package com.automotive.alms.core.scanner

import android.Manifest
import android.content.pm.PackageManager
import android.view.MotionEvent
import androidx.camera.core.CameraControl
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.camera.core.FocusMeteringAction
import androidx.camera.core.CameraSelector
import androidx.camera.core.ExperimentalGetImage
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.border
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.FlashOff
import androidx.compose.material.icons.filled.FlashOn
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.Alignment
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.LocalLifecycleOwner
import com.automotive.alms.R
import com.google.mlkit.vision.barcode.BarcodeScannerOptions
import com.google.mlkit.vision.barcode.BarcodeScanning
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.common.InputImage
import java.util.concurrent.TimeUnit
import java.util.concurrent.Executors

private val VIN_PATTERN = Regex("""[A-HJ-NPR-Z0-9]{17}""")

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun VinBarcodeScannerScreen(
    title: String,
    onVinScanned: (String) -> Unit,
    onClose: () -> Unit,
) {
    val context = LocalContext.current
    var hasCameraPermission by remember {
        mutableStateOf(
            ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) ==
                PackageManager.PERMISSION_GRANTED,
        )
    }
    var cameraControl by remember { mutableStateOf<CameraControl?>(null) }
    var torchEnabled by remember { mutableStateOf(false) }
    val permissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestPermission(),
    ) { granted ->
        hasCameraPermission = granted ||
            ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) ==
            PackageManager.PERMISSION_GRANTED
    }

    LaunchedEffect(Unit) {
        if (!hasCameraPermission) permissionLauncher.launch(Manifest.permission.CAMERA)
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(title) },
                navigationIcon = {
                    IconButton(onClick = onClose) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = null)
                    }
                },
            )
        },
    ) { padding ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding),
        ) {
            if (hasCameraPermission) {
                VinCameraPreview(
                    onVinScanned = onVinScanned,
                    onCameraControlReady = { cameraControl = it },
                    modifier = Modifier.fillMaxSize(),
                )
                ScannerOverlay(
                    torchEnabled = torchEnabled,
                    onToggleTorch = {
                        torchEnabled = !torchEnabled
                        cameraControl?.enableTorch(torchEnabled)
                    },
                )
            } else {
                AlertDialog(
                    onDismissRequest = onClose,
                    confirmButton = {
                        TextButton(onClick = { permissionLauncher.launch(Manifest.permission.CAMERA) }) {
                            Text(stringResource(R.string.scanner_camera_permission_action))
                        }
                    },
                    dismissButton = {
                        TextButton(onClick = onClose) {
                            Text(stringResource(R.string.common_close))
                        }
                    },
                    title = { Text(stringResource(R.string.scanner_camera_permission_title)) },
                    text = { Text(stringResource(R.string.scanner_camera_permission_body)) },
                )
            }
        }
    }
}

@Composable
private fun VinCameraPreview(
    onVinScanned: (String) -> Unit,
    onCameraControlReady: (CameraControl) -> Unit,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    val cameraExecutor = remember { Executors.newSingleThreadExecutor() }
    val scanner = remember {
        BarcodeScanning.getClient(
            BarcodeScannerOptions.Builder()
                .setBarcodeFormats(
                    Barcode.FORMAT_CODE_128,
                    Barcode.FORMAT_CODE_39,
                    Barcode.FORMAT_QR_CODE,
                    Barcode.FORMAT_DATA_MATRIX,
                )
                .build(),
        )
    }
    var handled by remember { mutableStateOf(false) }

    DisposableEffect(Unit) {
        onDispose {
            cameraExecutor.shutdown()
            scanner.close()
        }
    }

    AndroidView(
        modifier = modifier,
        factory = { viewContext ->
            PreviewView(viewContext).apply {
                scaleType = PreviewView.ScaleType.FILL_CENTER
                implementationMode = PreviewView.ImplementationMode.COMPATIBLE
                val cameraProviderFuture = ProcessCameraProvider.getInstance(viewContext)
                cameraProviderFuture.addListener(
                    {
                        val cameraProvider = cameraProviderFuture.get()
                        val preview = Preview.Builder().build().also {
                            it.setSurfaceProvider(surfaceProvider)
                        }
                        val analysis = ImageAnalysis.Builder()
                            .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                            .build()
                            .also { imageAnalysis ->
                                imageAnalysis.setAnalyzer(cameraExecutor) { imageProxy ->
                                    if (handled) {
                                        imageProxy.close()
                                        return@setAnalyzer
                                    }
                                    processImageProxy(
                                        imageProxy = imageProxy,
                                        scanner = scanner,
                                        onVin = { vin ->
                                            handled = true
                                            onVinScanned(vin)
                                        },
                                    )
                                }
                            }
                        runCatching {
                            cameraProvider.unbindAll()
                            val camera = cameraProvider.bindToLifecycle(
                                lifecycleOwner,
                                CameraSelector.DEFAULT_BACK_CAMERA,
                                preview,
                                analysis,
                            )
                            onCameraControlReady(camera.cameraControl)
                            camera.cameraControl.setZoomRatio(1.25f)
                            setOnTouchListener { _, event ->
                                if (event.action == MotionEvent.ACTION_UP) {
                                    val point = meteringPointFactory.createPoint(event.x, event.y)
                                    val action = FocusMeteringAction.Builder(
                                        point,
                                        FocusMeteringAction.FLAG_AF or FocusMeteringAction.FLAG_AE,
                                    )
                                        .setAutoCancelDuration(2, TimeUnit.SECONDS)
                                        .build()
                                    camera.cameraControl.startFocusAndMetering(action)
                                }
                                true
                            }
                        }
                    },
                    ContextCompat.getMainExecutor(context),
                )
            }
        },
    )
}

@Composable
private fun BoxScope.ScannerOverlay(
    torchEnabled: Boolean,
    onToggleTorch: () -> Unit,
) {
    Box(
        modifier = Modifier
            .matchParentSize()
            .background(Color.Black.copy(alpha = 0.24f)),
    )
    Column(
        modifier = Modifier
            .align(Alignment.TopCenter)
            .fillMaxWidth()
            .padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Surface(
            color = Color.Black.copy(alpha = 0.52f),
            contentColor = Color.White,
            shape = MaterialTheme.shapes.medium,
        ) {
            Text(
                text = stringResource(R.string.scanner_vin_hint),
                modifier = Modifier.padding(horizontal = 14.dp, vertical = 10.dp),
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.SemiBold,
            )
        }
    }
    Box(
        modifier = Modifier
            .align(Alignment.Center)
            .width(320.dp)
            .height(132.dp)
            .border(
                BorderStroke(2.dp, Color.White.copy(alpha = 0.92f)),
                MaterialTheme.shapes.large,
            )
            .padding(8.dp)
            .border(
                BorderStroke(1.dp, MaterialTheme.colorScheme.primary),
                MaterialTheme.shapes.medium,
            ),
    )
    Row(
        modifier = Modifier
            .align(Alignment.BottomCenter)
            .fillMaxWidth()
            .padding(24.dp),
        horizontalArrangement = Arrangement.Center,
    ) {
        Surface(
            color = Color.Black.copy(alpha = 0.58f),
            contentColor = Color.White,
            shape = MaterialTheme.shapes.large,
        ) {
            IconButton(onClick = onToggleTorch) {
                Icon(
                    imageVector = if (torchEnabled) Icons.Filled.FlashOn else Icons.Filled.FlashOff,
                    contentDescription = null,
                )
            }
        }
    }
}

@androidx.annotation.OptIn(ExperimentalGetImage::class)
private fun processImageProxy(
    imageProxy: ImageProxy,
    scanner: com.google.mlkit.vision.barcode.BarcodeScanner,
    onVin: (String) -> Unit,
) {
    val mediaImage = imageProxy.image
    if (mediaImage == null) {
        imageProxy.close()
        return
    }
    val image = InputImage.fromMediaImage(mediaImage, imageProxy.imageInfo.rotationDegrees)
    scanner.process(image)
        .addOnSuccessListener { barcodes ->
            barcodes.asSequence()
                .mapNotNull { it.rawValue?.extractVin() }
                .firstOrNull()
                ?.let(onVin)
        }
        .addOnCompleteListener {
            imageProxy.close()
        }
}

fun String.extractVin(): String? {
    val compact = uppercase()
        .replace(" ", "")
        .replace("-", "")
        .replace("_", "")
    return VIN_PATTERN.find(compact)?.value
}
