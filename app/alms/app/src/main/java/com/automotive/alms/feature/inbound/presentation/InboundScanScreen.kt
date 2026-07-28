package com.automotive.alms.feature.inbound.presentation

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
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
import androidx.compose.runtime.Composable
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
import kotlinx.coroutines.launch

@Composable
fun InboundScanScreen(
    repository: InboundRepository,
    loginResult: LoginResult?,
) {
    val scope = rememberCoroutineScope()
    var vin by remember { mutableStateOf("") }
    var slotCode by remember { mutableStateOf("") }
    var zoneCode by remember { mutableStateOf("") }
    var photos by remember { mutableStateOf<List<EvidencePhoto>>(emptyList()) }
    var remark by remember { mutableStateOf("") }
    var loading by remember { mutableStateOf(false) }
    var message by remember { mutableStateOf<String?>(null) }
    var error by remember { mutableStateOf<String?>(null) }

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
                    OutlinedTextField(
                        value = slotCode,
                        onValueChange = { slotCode = it.uppercase() },
                        label = { Text("库位编码") },
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true,
                    )
                    OutlinedTextField(
                        value = zoneCode,
                        onValueChange = { zoneCode = it.uppercase() },
                        label = { Text("区域编码（自动分配时填写）") },
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true,
                    )
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
                            (slotCode.isNotBlank() || zoneCode.isNotBlank()) &&
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
                                            slotCode = slotCode.trim().ifBlank { null },
                                            zoneCode = zoneCode.trim().ifBlank { null },
                                            photoUrls = photos.map { it.uploadedFile.key },
                                            remark = remark.trim().ifBlank { null },
                                        ),
                                    )
                                }.onSuccess {
                                    message = "入库完成：${it.vin} ${it.slot?.code.orEmpty()}"
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
