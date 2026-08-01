package com.automotive.alms.feature.inbound.presentation

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
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
import com.automotive.alms.core.evidence.EvidencePhoto
import com.automotive.alms.core.evidence.EvidencePhotoCapture
import com.automotive.alms.core.evidence.accountUnitName
import com.automotive.alms.core.evidence.operatorName
import com.automotive.alms.core.model.LoginResult
import com.automotive.alms.core.network.ApiException
import com.automotive.alms.core.ui.Dimens
import com.automotive.alms.core.ui.ScreenScaffold
import com.automotive.alms.feature.inbound.data.InboundRepository
import com.automotive.alms.feature.inbound.model.InboundScanRequest
import com.automotive.alms.feature.inbound.model.InboundYard
import com.automotive.alms.feature.inbound.model.InboundZone
import com.automotive.alms.feature.inbound.model.displayCode
import kotlinx.coroutines.launch

@Composable
fun InboundScanScreen(
    repository: InboundRepository,
    loginResult: LoginResult?,
) {
    val scope = rememberCoroutineScope()
    var vin by remember { mutableStateOf("") }
    var yards by remember { mutableStateOf<List<InboundYard>>(emptyList()) }
    var zones by remember { mutableStateOf<List<InboundZone>>(emptyList()) }
    var selectedYard by remember { mutableStateOf<InboundYard?>(null) }
    var selectedZone by remember { mutableStateOf<InboundZone?>(null) }
    var yardMenuOpen by remember { mutableStateOf(false) }
    var zoneMenuOpen by remember { mutableStateOf(false) }
    var photos by remember { mutableStateOf<List<EvidencePhoto>>(emptyList()) }
    var remark by remember { mutableStateOf("") }
    var loading by remember { mutableStateOf(false) }
    var message by remember { mutableStateOf<String?>(null) }
    var error by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(Unit) {
        runCatching { repository.listYards() }
            .onSuccess {
                yards = it
                if (it.size == 1) selectedYard = it.first()
            }
            .onFailure { error = appError(it) }
    }
    LaunchedEffect(selectedYard?.id) {
        val yardId = selectedYard?.id ?: return@LaunchedEffect
        selectedZone = null
        runCatching { repository.listZones(yardId) }
            .onSuccess { zones = it }
            .onFailure { error = appError(it) }
    }

    ScreenScaffold(title = stringResource(R.string.inbound_scan)) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(horizontal = Dimens.PagePadding),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            if (loading) LinearProgressIndicator(modifier = Modifier.fillMaxWidth())
            Card(modifier = Modifier.fillMaxWidth()) {
                Column(
                    modifier = Modifier.padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    Text("入库扫描", style = MaterialTheme.typography.titleMedium)
                    OutlinedTextField(
                        value = vin,
                        onValueChange = {
                            val nextVin = it.uppercase()
                            if (nextVin != vin) photos = emptyList()
                            vin = nextVin
                        },
                        label = { Text("VIN") },
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true,
                    )
                    Box(modifier = Modifier.fillMaxWidth()) {
                        Button(onClick = { yardMenuOpen = true }, modifier = Modifier.fillMaxWidth()) {
                            Text(selectedYard?.let { "场地：${it.name ?: it.code}" } ?: "选择场地")
                        }
                        DropdownMenu(expanded = yardMenuOpen, onDismissRequest = { yardMenuOpen = false }) {
                            yards.forEach { yard ->
                                DropdownMenuItem(
                                    text = { Text(yard.name ?: yard.code ?: yard.id.orEmpty()) },
                                    onClick = {
                                        selectedYard = yard
                                        yardMenuOpen = false
                                    },
                                )
                            }
                        }
                    }
                    Box(modifier = Modifier.fillMaxWidth()) {
                        Button(
                            onClick = { zoneMenuOpen = true },
                            enabled = selectedYard != null,
                            modifier = Modifier.fillMaxWidth(),
                        ) {
                            Text(selectedZone?.let { "区域：${it.code}${it.name?.let { name -> " · $name" }.orEmpty()}" } ?: "选择自动分配区域")
                        }
                        DropdownMenu(expanded = zoneMenuOpen, onDismissRequest = { zoneMenuOpen = false }) {
                            zones.forEach { zone ->
                                DropdownMenuItem(
                                    text = { Text("${zone.code}${zone.name?.let { " · $it" }.orEmpty()}") },
                                    onClick = {
                                        selectedZone = zone
                                        zoneMenuOpen = false
                                    },
                                )
                            }
                        }
                    }
                    EvidencePhotoCapture(
                        subject = "入库 VIN ${vin.trim().uppercase()}",
                        operatorName = loginResult.operatorName(),
                        accountUnitName = loginResult.accountUnitName(),
                        photos = photos,
                        onPhotosChange = { photos = it },
                        onUploadPhoto = { bytes ->
                            repository.uploadPhoto(
                                fileName = "inbound-${vin.trim().uppercase()}-${System.currentTimeMillis()}.jpg",
                                bytes = bytes,
                            )
                        },
                        enabled = !loading,
                        title = "入库存证照片",
                        modifier = Modifier.fillMaxWidth(),
                    )
                    OutlinedTextField(
                        value = remark,
                        onValueChange = { remark = it },
                        label = { Text("备注") },
                        modifier = Modifier.fillMaxWidth(),
                    )
                    Button(
                        enabled = !loading && vin.isNotBlank() &&
                            selectedZone != null &&
                            photos.isNotEmpty(),
                        onClick = {
                            loading = true
                            message = null
                            error = null
                            scope.launch {
                                runCatching {
                                    repository.scan(
                                        InboundScanRequest(
                                            vin = vin.trim(),
                                            zoneId = selectedZone!!.id,
                                            photoUrls = photos.map { it.uploadedFile.key },
                                            remark = remark.trim().ifBlank { null },
                                        ),
                                    )
                                }.onSuccess {
                                    message = "入库完成：${it.vin} ${it.slot?.displayCode().orEmpty()}"
                                    vin = ""
                                    photos = emptyList()
                                    remark = ""
                                }.onFailure {
                                    error = appError(it)
                                }
                                loading = false
                            }
                        },
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Text("提交入库")
                    }
                }
            }
            message?.let {
                Text(it, color = MaterialTheme.colorScheme.primary)
            }
        }
    }

    error?.let {
        AlertDialog(
            onDismissRequest = { error = null },
            confirmButton = {
                TextButton(onClick = { error = null }) { Text("确定") }
            },
            title = { Text("提交失败") },
            text = { Text(it) },
        )
    }
}

private fun appError(error: Throwable): String {
    return (error as? ApiException)?.message ?: error.message ?: "请求失败"
}
