package com.automotive.alms.feature.pickup.presentation

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.automotive.alms.R
import com.automotive.alms.core.network.ApiException
import com.automotive.alms.core.ui.Dimens
import com.automotive.alms.core.ui.ScreenScaffold
import com.automotive.alms.core.ui.StatusPill
import com.automotive.alms.feature.pickup.data.PickupRepository
import com.automotive.alms.feature.pickup.model.PickupLookupResult
import com.automotive.alms.feature.pickup.model.PickupScanRequest
import com.automotive.alms.feature.pickup.model.PickupVin
import kotlinx.coroutines.launch

@Composable
fun PickupScanScreen(
    repository: PickupRepository,
) {
    val scope = rememberCoroutineScope()
    var vin by remember { mutableStateOf("") }
    var location by remember { mutableStateOf("") }
    var remark by remember { mutableStateOf("") }
    var photoKeys by remember { mutableStateOf("") }
    var lookup by remember { mutableStateOf<PickupLookupResult?>(null) }
    var recent by remember { mutableStateOf<List<PickupVin>>(emptyList()) }
    var loading by remember { mutableStateOf(false) }
    var message by remember { mutableStateOf<String?>(null) }
    val successText = stringResource(R.string.pickup_success)

    fun refreshRecent() {
        scope.launch {
            runCatching { repository.myPickups() }
                .onSuccess { recent = it }
        }
    }

    LaunchedEffect(Unit) {
        refreshRecent()
    }

    ScreenScaffold(title = stringResource(R.string.pickup_scan)) { padding ->
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(horizontal = Dimens.PagePadding),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            item {
                Card(
                    shape = RoundedCornerShape(Dimens.CardRadius),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                ) {
                    Column(
                        modifier = Modifier.padding(16.dp),
                        verticalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        OutlinedTextField(
                            value = vin,
                            onValueChange = {
                                vin = it.trim()
                                lookup = null
                                message = null
                            },
                            label = { Text(stringResource(R.string.pickup_vin)) },
                            singleLine = true,
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(Dimens.CardRadius),
                        )
                        Button(
                            onClick = {
                                loading = true
                                message = null
                                scope.launch {
                                    runCatching { repository.lookup(vin) }
                                        .onSuccess {
                                            lookup = it
                                            location = it.vin.order?.originText.orEmpty()
                                        }
                                        .onFailure { message = errorMessage(it) }
                                    loading = false
                                }
                            },
                            enabled = vin.length >= 8 && !loading,
                            modifier = Modifier.fillMaxWidth(),
                        ) {
                            Text(stringResource(R.string.pickup_lookup))
                        }

                        lookup?.let { result ->
                            LookupCard(result = result)
                        }

                        OutlinedTextField(
                            value = location,
                            onValueChange = { location = it },
                            label = { Text(stringResource(R.string.pickup_location)) },
                            placeholder = { Text(stringResource(R.string.pickup_location_hint)) },
                            singleLine = true,
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(Dimens.CardRadius),
                        )
                        OutlinedTextField(
                            value = photoKeys,
                            onValueChange = { photoKeys = it },
                            label = { Text(stringResource(R.string.pickup_photo_keys)) },
                            placeholder = { Text(stringResource(R.string.pickup_photo_keys_hint)) },
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(Dimens.CardRadius),
                        )
                        OutlinedTextField(
                            value = remark,
                            onValueChange = { remark = it },
                            label = { Text(stringResource(R.string.pickup_remark)) },
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(Dimens.CardRadius),
                        )
                        Button(
                            onClick = {
                                loading = true
                                message = null
                                scope.launch {
                                    val keys = photoKeys.split(',')
                                        .map { it.trim() }
                                        .filter { it.isNotEmpty() }
                                    runCatching {
                                        repository.scan(
                                            PickupScanRequest(
                                                vin = vin,
                                                location = location.ifBlank { null },
                                                photoUrls = keys.ifEmpty { null },
                                                remark = remark.ifBlank { null },
                                            ),
                                        )
                                    }.onSuccess {
                                        message = successText
                                        lookup = null
                                        vin = ""
                                        location = ""
                                        remark = ""
                                        photoKeys = ""
                                        refreshRecent()
                                    }.onFailure {
                                        message = errorMessage(it)
                                    }
                                    loading = false
                                }
                            },
                            enabled = lookup?.canPickup == true && !loading,
                            modifier = Modifier.fillMaxWidth(),
                        ) {
                            Text(stringResource(R.string.pickup_confirm))
                        }
                        message?.let {
                            Text(
                                text = it,
                                color = if (it == successText) {
                                    MaterialTheme.colorScheme.primary
                                } else {
                                    MaterialTheme.colorScheme.error
                                },
                            )
                        }
                    }
                }
            }

            item {
                Text(
                    text = stringResource(R.string.pickup_recent),
                    style = MaterialTheme.typography.titleLarge,
                    modifier = Modifier.padding(top = 8.dp),
                )
            }

            if (recent.isEmpty()) {
                item {
                    Text(
                        text = stringResource(R.string.pickup_empty),
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            } else {
                items(recent) { item ->
                    PickupRecordCard(item)
                }
            }
        }
    }
}

@Composable
private fun LookupCard(result: PickupLookupResult) {
    Card(
        shape = RoundedCornerShape(Dimens.CardRadius),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
    ) {
        Column(
            modifier = Modifier.padding(12.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                StatusPill(
                    text = stringResource(
                        if (result.canPickup) R.string.pickup_can_pickup else R.string.pickup_cannot_pickup,
                    ),
                    color = if (result.canPickup) {
                        MaterialTheme.colorScheme.primary
                    } else {
                        MaterialTheme.colorScheme.error
                    },
                )
            }
            Text(text = result.vin.vin, style = MaterialTheme.typography.titleMedium)
            VehicleLine(result.vin)
            result.vin.order?.customer?.name?.let {
                Text("${stringResource(R.string.pickup_customer)}: $it")
            }
            result.vin.order?.originText?.let {
                Text("${stringResource(R.string.pickup_origin)}: $it")
            }
            result.reason?.let {
                Text(text = it, color = MaterialTheme.colorScheme.error)
            }
        }
    }
}

@Composable
private fun PickupRecordCard(item: PickupVin) {
    Card(
        shape = RoundedCornerShape(Dimens.CardRadius),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(14.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            Text(item.vin, style = MaterialTheme.typography.titleMedium)
            VehicleLine(item)
            item.pickupLocation?.let { Text("${stringResource(R.string.pickup_location)}: $it") }
            item.pickedUpAt?.let { Text(it, color = MaterialTheme.colorScheme.onSurfaceVariant) }
        }
    }
}

@Composable
private fun VehicleLine(item: PickupVin) {
    val parts = listOfNotNull(item.brand, item.model, item.color, item.vehicleType)
    if (parts.isNotEmpty()) {
        Text(
            text = "${stringResource(R.string.pickup_vehicle)}: ${parts.joinToString(" / ")}",
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

private fun errorMessage(throwable: Throwable): String {
    return (throwable as? ApiException)?.message
        ?: throwable.localizedMessage
        ?: "Request failed"
}
