package com.automotive.alms.core.scanner

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import java.net.URI
import java.net.URLDecoder
import java.util.Locale

sealed interface VinScanResult {
    data object Empty : VinScanResult
    data object Invalid : VinScanResult
    data object Multiple : VinScanResult
    data class Found(val vin: String) : VinScanResult
}

/** Decode content only. Never open a scanned URL or submit a business operation here. */
object VinScanParser {
    // Same identifier range as transport and inbound entry, not an extra 17-character-only restriction.
    private val identifier = Regex("[A-Z0-9]{8,32}")
    private val labelled = Regex("""(?:^|[\s;|])VIN\s*[:=：]\s*([A-Z0-9]+)(?=$|[\s;|])""", RegexOption.IGNORE_CASE)

    fun read(rawValues: List<String>): VinScanResult {
        if (rawValues.isEmpty()) return VinScanResult.Empty
        val vins = rawValues.flatMap(::values).toSet()
        return when (vins.size) {
            0 -> VinScanResult.Invalid
            1 -> VinScanResult.Found(vins.single())
            else -> VinScanResult.Multiple
        }
    }

    private fun normalize(value: String): String? = value.trim().uppercase(Locale.ROOT)
        .takeIf(identifier::matches)

    private fun values(raw: String): List<String> {
        if (raw.length > 8192) return emptyList()
        val text = raw.trim().removePrefix("\uFEFF")
        normalize(text)?.let { return listOf(it) }
        // Code 39 labels may include visible start/stop markers in their payload.
        if (text.startsWith('*') && text.endsWith('*')) {
            normalize(text.drop(1).dropLast(1))?.let { return listOf(it) }
        }
        if (text.startsWith('{')) {
            val json = runCatching { Json.parseToJsonElement(text) as? JsonObject }.getOrNull()
                ?: return emptyList()
            return json.entries.filter { it.key.equals("vin", ignoreCase = true) }
                .mapNotNull { (_, value) ->
                    (value as? JsonPrimitive)?.takeIf { it.isString }?.content?.let(::normalize)
                }
        }
        if (text.startsWith("https://", true) || text.startsWith("http://", true)) {
            // Interpret only explicit VIN query parameters; do not guess from order IDs or URL paths.
            return runCatching {
                URI(text).rawQuery.orEmpty().split('&').mapNotNull { pair ->
                    val parts = pair.split('=', limit = 2)
                    if (parts.size == 2 && URLDecoder.decode(parts[0], "UTF-8").equals("vin", true))
                        normalize(URLDecoder.decode(parts[1], "UTF-8")) else null
                }
            }.getOrDefault(emptyList())
        }
        // Keep boundaries intact: never strip separators then take a 17-character substring.
        return labelled.findAll(text).mapNotNull { normalize(it.groupValues[1]) }.toList()
    }
}
