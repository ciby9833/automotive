package com.automotive.alms.feature.transport

import android.content.Intent
import android.net.Uri
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.QrCodeScanner
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.ReportProblem
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.UploadFile
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect
import com.automotive.alms.BuildConfig
import com.automotive.alms.R
import com.automotive.alms.core.auth.SessionStore
import com.automotive.alms.core.evidence.EvidencePhoto
import com.automotive.alms.core.evidence.EvidencePhotoCapture
import com.automotive.alms.core.scanner.VinBarcodeScannerScreen
import com.automotive.alms.core.ui.BottomActionBar
import com.automotive.alms.core.ui.ContentCard
import com.automotive.alms.core.ui.Dimens
import com.automotive.alms.core.ui.EmptyState
import com.automotive.alms.core.ui.FilterTabs
import com.automotive.alms.core.ui.FormField
import com.automotive.alms.core.ui.ListCard
import com.automotive.alms.core.ui.ListRow
import com.automotive.alms.core.ui.PrimaryAction
import com.automotive.alms.core.ui.ProgressSummary
import com.automotive.alms.core.ui.ScreenScaffold
import com.automotive.alms.core.ui.SecondaryAction
import com.automotive.alms.core.ui.StatusBadge
import com.automotive.alms.core.ui.SupportingText
import com.automotive.alms.core.ui.Tone
import com.automotive.alms.core.ui.VinInput
import com.automotive.alms.core.ui.rememberFeedback
import com.automotive.alms.core.ui.rememberTaskRunner
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

private const val ACTIVE = "PLANNED,LOADING,IN_TRANSIT"
private const val DONE = "COMPLETED"
private const val MAX_POD_BYTES = 20 * 1024 * 1024

/**
 * 纯运输（司机 / 承运商）：趟次列表 → 趟次详情。
 * 装车阶段按发货地扫码提货（空 VIN 明细自动绑定，多条路线时选门店），发车后按门店逐台签收，
 * 每个“发货地→收货地”段上传一张 POD；货损、拒收只做登记。
 */
@Composable
fun TransportScreen(repository: TransportRepository, sessionStore: SessionStore, onBack: () -> Unit) {
    val context = LocalContext.current
    val feedback = rememberFeedback()
    val tasks = rememberTaskRunner(feedback)
    val session by sessionStore.state.collectAsState()

    var filter by rememberSaveable { mutableStateOf(ACTIVE) }
    var search by rememberSaveable { mutableStateOf("") }
    var page by rememberSaveable { mutableIntStateOf(1) }
    var trips by remember { mutableStateOf<List<TransportTrip>?>(null) }
    var total by remember { mutableIntStateOf(0) }
    var tripId by rememberSaveable { mutableStateOf<String?>(null) }
    var detail by remember { mutableStateOf<TransportTripDetail?>(null) }

    var vin by rememberSaveable { mutableStateOf("") }
    var photos by remember { mutableStateOf<List<EvidencePhoto>>(emptyList()) }
    var scanning by remember { mutableStateOf(false) }
    var choices by remember { mutableStateOf<List<TransportLine>>(emptyList()) }
    var confirmDepart by remember { mutableStateOf(false) }
    var recording by remember { mutableStateOf(false) }
    var podLeg by remember { mutableStateOf<TransportLeg?>(null) }

    suspend fun loadList() {
        val result = repository.trips(filter, search, page)
        trips = result.items
        total = result.total
    }

    suspend fun loadTrip() {
        tripId?.let { detail = repository.trip(it) }
    }

    fun changeVin(next: String) {
        if (next != vin) photos = emptyList()
        vin = next
    }

    fun back() {
        if (tripId != null) {
            tripId = null
            detail = null
            changeVin("")
            tasks.launch { loadList() }
        } else {
            onBack()
        }
    }

    LaunchedEffect(tripId, filter, page, session.loginResult?.activeOrgId) {
        tasks.execute { if (tripId != null) loadTrip() else loadList() }
    }
    LifecycleEventEffect(Lifecycle.Event.ON_RESUME) {
        if (!tasks.busy) tasks.launch { if (tripId != null) loadTrip() else loadList() }
    }
    BackHandler(enabled = tripId != null) { back() }

    val podLauncher = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        val leg = podLeg
        val id = tripId
        podLeg = null
        if (uri == null || leg == null || id == null) return@rememberLauncherForActivityResult
        tasks.launch {
            val invalid = context.getString(R.string.transport_pod_invalid)
            val mime = context.contentResolver.getType(uri).orEmpty()
            require(mime == "application/pdf" || mime == "image/jpeg") { invalid }
            val bytes = withContext(Dispatchers.IO) {
                context.contentResolver.openInputStream(uri)?.use { input ->
                    val output = java.io.ByteArrayOutputStream()
                    val buffer = ByteArray(8192)
                    while (true) {
                        val count = input.read(buffer)
                        if (count < 0) break
                        require(output.size() + count <= MAX_POD_BYTES) { invalid }
                        output.write(buffer, 0, count)
                    }
                    output.toByteArray()
                } ?: error(invalid)
            }
            repository.pod(id, leg, bytes, mime)
            feedback.show(context.getString(R.string.transport_saved))
            loadTrip()
        }
    }

    val d = detail?.takeIf { tripId != null }
    val status = d?.trip?.status
    val loadingPhase = status == "PLANNED" || status == "LOADING"
    val signingPhase = status == "IN_TRANSIT"
    val loaded = d?.lines.orEmpty().count { it.status in setOf("PICKED_UP", "IN_TRANSIT", "DELIVERED", "CLOSED") }
    val notLoaded = d?.lines.orEmpty().count { it.status == "DISPATCHED" }
    val openUnplanned = d?.exceptions.orEmpty().count { it.type == "UNPLANNED_VIN" && it.status == "OPEN" }

    fun submitScan(lineId: String? = null) {
        val trip = d?.trip ?: return
        val code = vin
        if (code.isBlank()) return
        val keys = photos.map { it.uploadedFile.key }
        tasks.launch {
            if (signingPhase) {
                repository.sign(trip.id, SignRequest(code, keys))
                feedback.show(context.getString(R.string.transport_sign_done, code))
            } else {
                val last = photos.lastOrNull()
                val result = repository.pickup(
                    trip.id,
                    PickupRequest(code, lineId, keys, last?.latitude, last?.longitude),
                )
                when (result.result) {
                    "CHOOSE_LINE" -> {
                        choices = result.options
                        return@launch
                    }
                    "UNPLANNED" -> feedback.show(context.getString(R.string.transport_unplanned, code))
                    else -> feedback.show(context.getString(R.string.transport_pickup_done, code))
                }
            }
            choices = emptyList()
            changeVin("")
            loadTrip()
        }
    }

    Box(modifier = Modifier.fillMaxSize()) {
        ScreenScaffold(
            title = d?.trip?.code ?: stringResource(R.string.transport_title),
            onBack = ::back,
            loading = tasks.busy,
            feedback = feedback,
            actions = {
                if (d != null && status != "CANCELLED") {
                    IconButton(enabled = !tasks.busy, onClick = { recording = true }) {
                        Icon(Icons.Filled.ReportProblem, contentDescription = stringResource(R.string.transport_record))
                    }
                }
                IconButton(
                    enabled = !tasks.busy,
                    onClick = { tasks.launch { if (tripId != null) loadTrip() else loadList() } },
                ) {
                    Icon(Icons.Filled.Refresh, contentDescription = stringResource(R.string.common_refresh))
                }
            },
            bottomBar = {
                if (d != null && (loadingPhase || signingPhase)) {
                    BottomActionBar {
                        if (loadingPhase) {
                            SecondaryAction(
                                text = stringResource(R.string.transport_depart),
                                enabled = !tasks.busy && loaded > 0 && openUnplanned == 0,
                                onClick = { confirmDepart = true },
                            )
                        }
                        if (vin.isBlank()) {
                            PrimaryAction(
                                text = stringResource(R.string.common_scan_vin),
                                icon = Icons.Filled.QrCodeScanner,
                                enabled = !tasks.busy,
                                onClick = { scanning = true },
                            )
                        } else {
                            PrimaryAction(
                                text = stringResource(if (signingPhase) R.string.transport_sign else R.string.transport_pickup),
                                enabled = !tasks.busy,
                                onClick = { submitScan() },
                            )
                        }
                    }
                }
            },
        ) { padding ->
            LazyColumn(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding),
                contentPadding = PaddingValues(Dimens.PagePadding),
                verticalArrangement = Arrangement.spacedBy(Dimens.ItemGap),
            ) {
                if (tripId == null) {
                    item {
                        FilterTabs(
                            options = listOf(
                                ACTIVE to stringResource(R.string.transport_filter_active),
                                DONE to stringResource(R.string.transport_filter_done),
                            ),
                            selected = filter,
                            onSelect = {
                                filter = it
                                page = 1
                            },
                        )
                    }
                    item {
                        OutlinedTextField(
                            value = search,
                            onValueChange = { search = it },
                            modifier = Modifier.fillMaxWidth(),
                            singleLine = true,
                            placeholder = { Text(stringResource(R.string.transport_search)) },
                            leadingIcon = { Icon(Icons.Filled.Search, contentDescription = null) },
                            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
                            keyboardActions = KeyboardActions(
                                onSearch = { if (page != 1) page = 1 else tasks.launch { loadList() } },
                            ),
                            shape = RoundedCornerShape(10.dp),
                        )
                    }
                    val list = trips
                    if (list != null && list.isEmpty()) item { EmptyState(stringResource(R.string.transport_empty)) }
                    items(list.orEmpty(), key = { it.id }) { trip -> TripCard(trip) { tripId = trip.id } }
                    if (total > 50) {
                        item {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                TextButton(enabled = !tasks.busy && page > 1, onClick = { page-- }) {
                                    Text(stringResource(R.string.transport_prev_page))
                                }
                                Text(
                                    "$page / ${(total + 49) / 50}",
                                    modifier = Modifier.weight(1f),
                                    style = MaterialTheme.typography.bodyMedium,
                                )
                                TextButton(enabled = !tasks.busy && page * 50 < total, onClick = { page++ }) {
                                    Text(stringResource(R.string.transport_next_page))
                                }
                            }
                        }
                    }
                } else if (d != null) {
                    item { TripHeader(d.trip, loaded, d.lines.count { it.status == "DELIVERED" }, d.lines.size) }
                    if (openUnplanned > 0) {
                        item {
                            ContentCard {
                                SupportingText(stringResource(R.string.transport_blocked, openUnplanned), tone = Tone.Warning)
                            }
                        }
                    }
                    if (loadingPhase || signingPhase) {
                        item {
                            ContentCard {
                                VinInput(
                                    value = vin,
                                    onValueChange = ::changeVin,
                                    onScan = { scanning = true },
                                    enabled = !tasks.busy,
                                    onDone = { submitScan() },
                                )
                                if (vin.isNotBlank()) {
                                    EvidencePhotoCapture(
                                        subject = vin,
                                        operatorName = session.loginResult?.user?.displayName.orEmpty(),
                                        accountUnitName = d.trip.carrierName,
                                        photos = photos,
                                        onPhotosChange = { photos = it },
                                        onUploadPhoto = { repository.photo(it) },
                                        enabled = !tasks.busy,
                                        title = stringResource(R.string.transport_photo),
                                        required = false,
                                    )
                                }
                            }
                        }
                    }
                    items(d.legs, key = { "${it.originId}>${it.destinationId}" }) { leg ->
                        LegCard(
                            leg = leg,
                            lines = d.lines.filter { it.originId == leg.originId && it.destinationId == leg.destinationId },
                            canUpload = status != "CANCELLED" && leg.loaded > 0,
                            busy = tasks.busy,
                            onUpload = {
                                podLeg = leg
                                podLauncher.launch(arrayOf("application/pdf", "image/jpeg"))
                            },
                            onOpen = { doc ->
                                runCatching {
                                    val url = "${BuildConfig.API_BASE_URL.trimEnd('/')}/storage/preview/${Uri.encode(doc.fileKey)}"
                                    context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
                                }.onFailure { feedback.show(it.localizedMessage ?: doc.fileName) }
                            },
                        )
                    }
                }
            }
        }

        if (scanning) {
            VinBarcodeScannerScreen(
                title = stringResource(R.string.common_scan_vin),
                onVinScanned = {
                    changeVin(it)
                    scanning = false
                },
                onClose = { scanning = false },
            )
        }
    }

    if (choices.isNotEmpty()) {
        AlertDialog(
            onDismissRequest = { choices = emptyList() },
            title = { Text(stringResource(R.string.transport_choose_line)) },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    choices.forEach { option ->
                        TextButton(onClick = { submitScan(option.id) }, modifier = Modifier.fillMaxWidth()) {
                            Column(modifier = Modifier.fillMaxWidth()) {
                                Text(option.destinationName, style = MaterialTheme.typography.titleSmall)
                                Text(
                                    "${option.customerName} · ${option.originName}",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                        }
                    }
                }
            },
            confirmButton = {},
            dismissButton = {
                TextButton(onClick = { choices = emptyList() }) { Text(stringResource(R.string.common_cancel)) }
            },
        )
    }

    if (confirmDepart && d != null) {
        AlertDialog(
            onDismissRequest = { confirmDepart = false },
            title = { Text(stringResource(R.string.transport_depart)) },
            text = { Text(stringResource(R.string.transport_depart_confirm, notLoaded)) },
            confirmButton = {
                TextButton(
                    enabled = !tasks.busy,
                    onClick = {
                        confirmDepart = false
                        tasks.launch {
                            repository.depart(d.trip.id)
                            feedback.show(context.getString(R.string.transport_departed))
                            loadTrip()
                        }
                    },
                ) { Text(stringResource(R.string.transport_confirm)) }
            },
            dismissButton = {
                TextButton(onClick = { confirmDepart = false }) { Text(stringResource(R.string.common_cancel)) }
            },
        )
    }

    if (recording && d != null) {
        RecordDialog(
            vins = d.lines.mapNotNull { it.vin },
            busy = tasks.busy,
            onDismiss = { recording = false },
            onSubmit = { request ->
                tasks.launch {
                    repository.recordException(d.trip.id, request)
                    recording = false
                    feedback.show(context.getString(R.string.transport_recorded))
                    loadTrip()
                }
            },
        )
    }
}

@Composable
private fun TripCard(trip: TransportTrip, onClick: () -> Unit) {
    ContentCard(onClick = onClick) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(trip.code, modifier = Modifier.weight(1f), style = MaterialTheme.typography.titleMedium)
            StatusBadge(tripStatus(trip.status), tripTone(trip.status))
        }
        SupportingText("${trip.origins ?: "-"} → ${trip.destinations ?: "-"}")
        SupportingText(listOf(trip.plateNumber, trip.towType, trip.driverName).filter { it.isNotBlank() }.joinToString(" · "))
        if (trip.status == "IN_TRANSIT" || trip.status == "COMPLETED") {
            ProgressSummary(
                text = stringResource(R.string.transport_signed_progress, trip.deliveredCount, trip.lineCount),
                done = trip.deliveredCount,
                total = trip.lineCount,
            )
        } else {
            ProgressSummary(
                text = stringResource(R.string.transport_loaded_progress, trip.loadedCount, trip.capacity),
                done = trip.loadedCount,
                total = trip.capacity,
            )
        }
        if (trip.openExceptions > 0) {
            SupportingText(stringResource(R.string.transport_blocked, trip.openExceptions), tone = Tone.Warning)
        }
    }
}

@Composable
private fun TripHeader(trip: TransportTrip, loaded: Int, delivered: Int, lines: Int) {
    ContentCard {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                "${trip.plateNumber} · ${trip.towType}",
                modifier = Modifier.weight(1f),
                style = MaterialTheme.typography.titleMedium,
            )
            StatusBadge(tripStatus(trip.status), tripTone(trip.status))
        }
        SupportingText(listOfNotNull(trip.carrierName, trip.driverName, trip.driverPhone).filter { it.isNotBlank() }.joinToString(" · "))
        if (trip.status == "IN_TRANSIT" || trip.status == "COMPLETED") {
            ProgressSummary(stringResource(R.string.transport_signed_progress, delivered, lines), delivered, lines)
        } else {
            ProgressSummary(stringResource(R.string.transport_loaded_progress, loaded, trip.capacity), loaded, trip.capacity)
        }
    }
}

@Composable
private fun LegCard(
    leg: TransportLeg,
    lines: List<TransportLine>,
    canUpload: Boolean,
    busy: Boolean,
    onUpload: () -> Unit,
    onOpen: (TransportDocument) -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        com.automotive.alms.core.ui.SectionHeader(
            title = "${leg.originName} → ${leg.destinationName}",
            trailing = stringResource(R.string.transport_leg_counts, leg.lines, leg.loaded, leg.delivered),
        )
        ListCard(items = lines) { line ->
            val (label, tone) = lineStatus(line.status)
            ListRow(
                title = line.vin ?: stringResource(R.string.transport_pending_vin),
                monospace = line.vin != null,
                supporting = listOf(line.customerName, line.vehicleModel, line.vehicleColor).filter { it.isNotBlank() }.joinToString(" · "),
                badge = label,
                badgeTone = tone,
            )
        }
        if (leg.documents.isNotEmpty()) {
            ListCard(items = leg.documents) { doc ->
                ListRow(title = doc.fileName, onClick = { onOpen(doc) })
            }
        }
        if (canUpload) {
            TextButton(enabled = !busy, onClick = onUpload) {
                Icon(Icons.Filled.UploadFile, contentDescription = null)
                Text(stringResource(R.string.transport_pod), modifier = Modifier.padding(start = 6.dp))
            }
        }
    }
}

@Composable
private fun RecordDialog(
    vins: List<String>,
    busy: Boolean,
    onDismiss: () -> Unit,
    onSubmit: (ExceptionRequest) -> Unit,
) {
    var type by remember { mutableStateOf("DAMAGE") }
    var vin by remember { mutableStateOf(vins.firstOrNull().orEmpty()) }
    var note by remember { mutableStateOf("") }
    AlertDialog(
        onDismissRequest = { if (!busy) onDismiss() },
        title = { Text(stringResource(R.string.transport_record)) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    listOf(
                        "DAMAGE" to R.string.transport_damage,
                        "REFUSED" to R.string.transport_refused,
                        "OTHER" to R.string.transport_other,
                    ).forEach { (value, label) ->
                        FilterChip(selected = type == value, onClick = { type = value }, label = { Text(stringResource(label)) })
                    }
                }
                FormField(
                    value = vin,
                    onValueChange = { vin = it.trim().uppercase() },
                    label = stringResource(R.string.common_vin),
                )
                FormField(
                    value = note,
                    onValueChange = { note = it },
                    label = stringResource(R.string.transport_note),
                    singleLine = false,
                )
            }
        },
        confirmButton = {
            TextButton(
                enabled = !busy && note.isNotBlank(),
                onClick = { onSubmit(ExceptionRequest(type, vin.ifBlank { null }, note.trim())) },
            ) { Text(stringResource(R.string.transport_confirm)) }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text(stringResource(R.string.common_cancel)) } },
    )
}

@Composable
private fun tripStatus(value: String): String = when (value) {
    "PLANNED" -> stringResource(R.string.transport_planned)
    "LOADING" -> stringResource(R.string.transport_loading)
    "IN_TRANSIT" -> stringResource(R.string.transport_transit)
    "COMPLETED" -> stringResource(R.string.transport_completed)
    "CANCELLED" -> stringResource(R.string.transport_cancelled)
    else -> value
}

private fun tripTone(value: String): Tone = when (value) {
    "PLANNED" -> Tone.Warning
    "LOADING", "IN_TRANSIT" -> Tone.Info
    "COMPLETED" -> Tone.Success
    else -> Tone.Neutral
}

@Composable
private fun lineStatus(value: String): Pair<String, Tone> = when (value) {
    "DISPATCHED" -> stringResource(R.string.transport_line_to_pick) to Tone.Warning
    "PICKED_UP" -> stringResource(R.string.transport_line_loaded) to Tone.Info
    "IN_TRANSIT" -> stringResource(R.string.transport_line_transit) to Tone.Info
    "DELIVERED" -> stringResource(R.string.transport_line_delivered) to Tone.Success
    "CLOSED" -> stringResource(R.string.transport_line_closed) to Tone.Neutral
    else -> value to Tone.Neutral
}
