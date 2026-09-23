package com.automotive.alms.core.scanner

import android.graphics.Bitmap
import android.graphics.Color
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.google.android.gms.tasks.Tasks
import com.google.mlkit.vision.common.InputImage
import com.google.zxing.BarcodeFormat
import com.google.zxing.EncodeHintType
import com.google.zxing.MultiFormatWriter
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith
import java.util.concurrent.TimeUnit

/** Real bundled ML Kit decoding on Android, not a mocked barcode callback. No business API writes. */
@RunWith(AndroidJUnit4::class)
class VinBarcodeDecoderTest {
    private val vin = "22222222222222222"

    private fun decode(format: BarcodeFormat, payload: String = vin): VinScanResult {
        val matrix = MultiFormatWriter().encode(payload, format, 1200, 800, mapOf(EncodeHintType.MARGIN to 20))
        val bitmap = Bitmap.createBitmap(matrix.width, matrix.height, Bitmap.Config.ARGB_8888)
        bitmap.setPixels(IntArray(matrix.width * matrix.height) { i ->
            if (matrix[i % matrix.width, i / matrix.width]) Color.BLACK else Color.WHITE
        }, 0, matrix.width, 0, 0, matrix.width, matrix.height)
        val scanner = createVinBarcodeScanner()
        return try {
            val barcodes = Tasks.await(scanner.process(InputImage.fromBitmap(bitmap, 0)), 20, TimeUnit.SECONDS)
            VinScanParser.read(barcodes.mapNotNull { it.rawValue })
        } finally { scanner.close(); bitmap.recycle() }
    }

    @Test fun code128UserExample() { assertEquals(VinScanResult.Found(vin), decode(BarcodeFormat.CODE_128)) }
    @Test fun code39UserExample() { assertEquals(VinScanResult.Found(vin), decode(BarcodeFormat.CODE_39)) }
    @Test fun code93UserExample() { assertEquals(VinScanResult.Found(vin), decode(BarcodeFormat.CODE_93)) }
    @Test fun qrUserExample() { assertEquals(VinScanResult.Found(vin), decode(BarcodeFormat.QR_CODE)) }
    @Test fun qrJsonVin() { assertEquals(VinScanResult.Found(vin), decode(BarcodeFormat.QR_CODE, "{\"vin\":\"$vin\"}")) }
    @Test fun qrUrlVin() { assertEquals(VinScanResult.Found(vin), decode(BarcodeFormat.QR_CODE, "https://example.test/?vin=$vin")) }
    @Test fun dataMatrixUserExample() { assertEquals(VinScanResult.Found(vin), decode(BarcodeFormat.DATA_MATRIX)) }
    @Test fun qrNonVinDoesNotBecomeBusinessInput() { assertEquals(VinScanResult.Invalid, decode(BarcodeFormat.QR_CODE, "https://example.test/help")) }
}
