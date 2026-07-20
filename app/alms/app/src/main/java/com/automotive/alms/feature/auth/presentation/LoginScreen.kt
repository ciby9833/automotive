package com.automotive.alms.feature.auth.presentation

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import com.automotive.alms.R
import com.automotive.alms.core.model.LoginMode
import com.automotive.alms.core.network.ApiException
import com.automotive.alms.core.ui.AppBackground
import com.automotive.alms.core.ui.Dimens
import com.automotive.alms.feature.auth.data.AuthRepository
import kotlinx.coroutines.launch

@Composable
fun LoginScreen(
    authRepository: AuthRepository,
    onNeedsOrgSelection: () -> Unit,
    onLoggedIn: () -> Unit,
) {
    val scope = rememberCoroutineScope()
    var username by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var submitting by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val loginFailed = stringResource(R.string.login_failed)

    AppBackground {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .imePadding()
                .padding(Dimens.PagePadding),
            verticalArrangement = Arrangement.SpaceBetween,
        ) {
            Column {
                Spacer(modifier = Modifier.height(48.dp))
                Box(
                    modifier = Modifier
                        .size(48.dp)
                        .clip(CircleShape)
                        .background(MaterialTheme.colorScheme.primary),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(text = "A", color = Color.White, style = MaterialTheme.typography.titleLarge)
                }
                Spacer(modifier = Modifier.height(22.dp))
                Text(text = stringResource(R.string.app_name), style = MaterialTheme.typography.headlineLarge)
                Text(
                    text = stringResource(R.string.brand_subtitle),
                    modifier = Modifier.padding(top = 6.dp),
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    style = MaterialTheme.typography.bodyLarge,
                )
            }

            Card(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 36.dp, bottom = 32.dp),
                shape = RoundedCornerShape(Dimens.CardRadius),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
            ) {
                Column(modifier = Modifier.padding(18.dp)) {
                    Text(text = stringResource(R.string.login_title), style = MaterialTheme.typography.titleLarge)

                    Spacer(modifier = Modifier.height(18.dp))

                    OutlinedTextField(
                        value = username,
                        onValueChange = { username = it },
                        label = { Text(stringResource(R.string.login_username)) },
                        singleLine = true,
                        shape = RoundedCornerShape(Dimens.CardRadius),
                        modifier = Modifier.fillMaxWidth(),
                    )
                    OutlinedTextField(
                        value = password,
                        onValueChange = { password = it },
                        label = { Text(stringResource(R.string.login_password)) },
                        singleLine = true,
                        visualTransformation = PasswordVisualTransformation(),
                        shape = RoundedCornerShape(Dimens.CardRadius),
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(top = Dimens.ItemGap),
                    )

                    error?.let {
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(top = Dimens.ItemGap)
                                .clip(RoundedCornerShape(Dimens.CardRadius))
                                .background(MaterialTheme.colorScheme.error.copy(alpha = 0.08f))
                                .padding(horizontal = 12.dp, vertical = 10.dp),
                        ) {
                            Text(
                                text = it,
                                color = MaterialTheme.colorScheme.error,
                                style = MaterialTheme.typography.bodyMedium,
                            )
                        }
                    }

                    Button(
                        onClick = {
                            submitting = true
                            error = null
                            scope.launch {
                                runCatching { authRepository.login(username.trim(), password) }
                                    .onSuccess { result ->
                                        submitting = false
                                        if (result.mode == LoginMode.NEEDS_SELECTION) {
                                            onNeedsOrgSelection()
                                        } else {
                                            onLoggedIn()
                                        }
                                    }
                                    .onFailure { throwable ->
                                        submitting = false
                                        error = (throwable as? ApiException)?.message
                                            ?: throwable.localizedMessage
                                            ?: loginFailed
                                    }
                            }
                        },
                        enabled = !submitting && username.isNotBlank() && password.isNotBlank(),
                        shape = RoundedCornerShape(Dimens.CardRadius),
                        colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.primary),
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(top = 16.dp)
                            .height(52.dp),
                    ) {
                        Text(
                            if (submitting) {
                                stringResource(R.string.login_loading)
                            } else {
                                stringResource(R.string.login_button)
                            },
                        )
                    }
                }
            }
        }
    }
}
