package com.automotive.alms.core.ui

import androidx.compose.material3.SnackbarDuration
import androidx.compose.material3.SnackbarHostState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.res.stringResource
import com.automotive.alms.R
import com.automotive.alms.core.network.ApiException
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch

/** 统一的轻提示：成功/失败都走 Snackbar，不再弹 AlertDialog 打断作业。 */
@Stable
class Feedback(
    val host: SnackbarHostState,
    private val scope: CoroutineScope,
) {
    fun show(message: String) {
        scope.launch {
            host.currentSnackbarData?.dismiss()
            host.showSnackbar(message = message, duration = SnackbarDuration.Short)
        }
    }
}

@Composable
fun rememberFeedback(): Feedback {
    val host = remember { SnackbarHostState() }
    val scope = rememberCoroutineScope()
    return remember(host, scope) { Feedback(host, scope) }
}

fun Throwable.readableMessage(fallback: String): String {
    return (this as? ApiException)?.message
        ?: localizedMessage?.takeIf { it.isNotBlank() }
        ?: fallback
}

/** 执行异步请求：统计进行中的任务作为 busy，异常统一转成 Snackbar。 */
@Stable
class TaskRunner(
    private val scope: CoroutineScope,
    private val feedback: Feedback,
    private val fallback: String,
) {
    private var running by mutableIntStateOf(0)

    val busy: Boolean get() = running > 0

    fun launch(block: suspend () -> Unit): Job = scope.launch { execute(block) }

    /** 在调用方协程内执行（例如 LaunchedEffect），随其一起取消；返回是否成功。 */
    suspend fun execute(block: suspend () -> Unit): Boolean {
        running++
        return try {
            block()
            true
        } catch (e: CancellationException) {
            throw e
        } catch (e: Throwable) {
            feedback.show(e.readableMessage(fallback))
            false
        } finally {
            running--
        }
    }
}

@Composable
fun rememberTaskRunner(feedback: Feedback): TaskRunner {
    val scope = rememberCoroutineScope()
    val fallback = stringResource(R.string.common_request_failed)
    return remember(scope, feedback, fallback) { TaskRunner(scope, feedback, fallback) }
}
