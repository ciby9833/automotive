package com.automotive.alms.core.scanner

import org.junit.Assert.assertEquals
import org.junit.Test
import java.util.Locale

class VinScanParserTest {
    private val example = "22222222222222222"
    private val other = "LDC613P23A1305189"
    private fun read(vararg raw: String) = VinScanParser.read(raw.toList())

    @Test fun userExampleIsAcceptedWithoutChangingIt() {
        assertEquals(VinScanResult.Found(example), read(example))
    }
    @Test fun barcodeAndQrDuplicatesProduceOneVin() {
        assertEquals(VinScanResult.Found(example), read(example, "{\"vin\":\"$example\"}"))
    }
    @Test fun independentTransportIdentifiersAreNotTruncatedTo17Characters() {
        for (value in listOf("TEST1234", "VIN123456789012345678", "0".repeat(32), "VINIOQ123456"))
            assertEquals(VinScanResult.Found(value), read(value))
    }
    @Test fun trimsScannerWhitespaceAndNormalizesCase() {
        assertEquals(VinScanResult.Found(other), read("\r\n ${other.lowercase()} \r\n"))
    }
    @Test fun caseConversionDoesNotDependOnDeviceLocale() {
        val original = Locale.getDefault()
        try {
            Locale.setDefault(Locale.forLanguageTag("tr-TR"))
            assertEquals(VinScanResult.Found("VIN12345"), read("vin12345"))
        } finally { Locale.setDefault(original) }
    }
    @Test fun handlesCode39StartAndStopMarkers() {
        assertEquals(VinScanResult.Found(example), read("*$example*"))
    }
    @Test fun supportsExplicitVinLabels() {
        for (value in listOf("VIN:$example", "VIN = $example", "VIN：$example", "vehicle; VIN:$example; end"))
            assertEquals(VinScanResult.Found(example), read(value))
    }
    @Test fun readsOnlyVinFromJsonNotOtherVehicleOrOrderFields() {
        assertEquals(VinScanResult.Found(example), read("{\"VIN\":\"$example\",\"order\":\"$other\"}"))
        assertEquals(VinScanResult.Invalid, read("{\"order\":\"$example\"}"))
        assertEquals(VinScanResult.Invalid, read("{\"vin\":22222222222222222}"))
    }
    @Test fun readsExplicitUrlVinWithoutOpeningTheUrl() {
        assertEquals(VinScanResult.Found(example), read("https://example.test/car?VIN=$example&order=$other"))
        assertEquals(VinScanResult.Found(example), read("https://example.test/car?vin=%32${example.drop(1)}"))
        assertEquals(VinScanResult.Invalid, read("https://example.test/$example"))
        assertEquals(VinScanResult.Invalid, read("https://example.test/?order=$example"))
    }
    @Test fun neverTakesFirstVinWhenSeveralVehiclesAreVisible() {
        assertEquals(VinScanResult.Multiple, read(example, other))
        assertEquals(VinScanResult.Multiple, read("VIN:$example; VIN:$other"))
        assertEquals(VinScanResult.Multiple, read("https://example.test/?vin=$example&vin=$other"))
    }
    @Test fun doesNotJoinOrExtractPartialIdentifiers() {
        for (value in listOf("1".repeat(33), "VIN:" + "1".repeat(33), "12345678-123456789", "ABC_12345678901234567", "VIN: 1234 5678"))
            assertEquals(VinScanResult.Invalid, read(value))
    }
    @Test fun emptyAndNonVinCodesHaveDifferentFeedback() {
        assertEquals(VinScanResult.Empty, read())
        for (value in listOf("", "1234567", "https://example.test", "{bad json}", "WIFI:T:WPA;S:abc;P:def;;", "x".repeat(8193)))
            assertEquals(VinScanResult.Invalid, read(value))
    }
}
