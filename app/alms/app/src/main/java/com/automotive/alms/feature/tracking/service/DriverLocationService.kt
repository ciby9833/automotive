package com.automotive.alms.feature.tracking.service

import android.Manifest
import android.annotation.SuppressLint
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Bundle
import android.os.IBinder
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import com.automotive.alms.BuildConfig
import com.automotive.alms.R
import java.time.Instant
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject

class DriverLocationService : Service(), LocationListener {
    private val serviceScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val httpClient = OkHttpClient()
    private lateinit var queuePreferences: SharedPreferences
    private val queueLock = Any()
    private var waybillId: String? = null
    private var orderId: String? = null
    private var lastAcceptedAt = 0L
    private var lastFlushAt = 0L
    private var lastLocation: Location? = null

    override fun onCreate() {
        super.onCreate()
        queuePreferences = getSharedPreferences(QUEUE_PREFS, Context.MODE_PRIVATE)
        createChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) {
            stopSelf()
            return START_NOT_STICKY
        }
        waybillId = intent?.getStringExtra(EXTRA_WAYBILL_ID)
        orderId = intent?.getStringExtra(EXTRA_ORDER_ID)
        if (!hasLocationPermission()) {
            stopSelf()
            return START_NOT_STICKY
        }
        startForeground(NOTIFICATION_ID, notification())
        startLocationUpdates()
        flush()
        return START_STICKY
    }

    override fun onDestroy() {
        val locationManager = getSystemService(Context.LOCATION_SERVICE) as LocationManager
        runCatching { locationManager.removeUpdates(this) }
        flush()
        serviceScope.cancel()
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onLocationChanged(location: Location) {
        val now = System.currentTimeMillis()
        val previous = lastLocation
        val moving = previous == null ||
            location.speed >= 1.0f ||
            previous.distanceTo(location) >= 30f
        val minInterval = if (moving) MOVING_INTERVAL_MS else STILL_INTERVAL_MS
        if (now - lastAcceptedAt < minInterval) return

        lastAcceptedAt = now
        lastLocation = location
        enqueue(JSONObject().apply {
            put("capturedAt", Instant.ofEpochMilli(location.time.takeIf { it > 0 } ?: now).toString())
            waybillId?.let { put("waybillId", it) }
            orderId?.let { put("orderId", it) }
            put("latitude", location.latitude)
            put("longitude", location.longitude)
            if (location.hasAccuracy()) put("accuracy", location.accuracy.toDouble())
            if (location.hasSpeed()) put("speed", location.speed.toDouble())
            if (location.hasBearing()) put("heading", location.bearing.toDouble())
            put("source", "android-location")
        })
        if (pendingSize() >= MAX_BATCH_SIZE || now - lastFlushAt >= FLUSH_INTERVAL_MS) {
            flush()
        }
    }

    @Deprecated("Deprecated by Android")
    override fun onStatusChanged(provider: String?, status: Int, extras: Bundle?) = Unit
    override fun onProviderEnabled(provider: String) = Unit
    override fun onProviderDisabled(provider: String) = Unit

    @SuppressLint("MissingPermission")
    private fun startLocationUpdates() {
        val locationManager = getSystemService(Context.LOCATION_SERVICE) as LocationManager
        val provider = when {
            locationManager.isProviderEnabled(LocationManager.GPS_PROVIDER) -> LocationManager.GPS_PROVIDER
            else -> LocationManager.NETWORK_PROVIDER
        }
        locationManager.requestLocationUpdates(
            provider,
            MOVING_INTERVAL_MS,
            20f,
            this,
        )
    }

    private fun hasLocationPermission(): Boolean {
        val fine = ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION)
        val coarse = ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION)
        return fine == PackageManager.PERMISSION_GRANTED || coarse == PackageManager.PERMISSION_GRANTED
    }

    private fun flush() {
        val batch = peekPending(MAX_BATCH_SIZE)
        if (batch.isEmpty()) return
        lastFlushAt = System.currentTimeMillis()
        val token = getSharedPreferences("alms_session", Context.MODE_PRIVATE)
            .getString("access_token", null)
            .orEmpty()
        if (token.isBlank()) return
        serviceScope.launch {
            val body = JSONObject()
                .put("positions", JSONArray(batch))
                .toString()
                .toRequestBody("application/json; charset=utf-8".toMediaType())
            val request = Request.Builder()
                .url(BuildConfig.API_BASE_URL.trimEnd('/') + "/tracking/positions/batch")
                .header("Authorization", "Bearer $token")
                .post(body)
                .build()
            val ok = runCatching {
                httpClient.newCall(request).execute().use { it.isSuccessful }
            }.getOrDefault(false)
            if (ok) {
                removeUploaded(batch.size)
            }
        }
    }

    private fun enqueue(position: JSONObject) {
        synchronized(queueLock) {
            val queue = readQueue()
            queue.put(position)
            if (queue.length() <= MAX_BUFFER_SIZE) {
                saveQueue(queue)
                return
            }
            val trimmed = JSONArray()
            for (index in queue.length() - MAX_BUFFER_SIZE until queue.length()) {
                trimmed.put(queue.get(index))
            }
            saveQueue(trimmed)
        }
    }

    private fun pendingSize(): Int {
        return synchronized(queueLock) { readQueue().length() }
    }

    private fun peekPending(limit: Int): List<JSONObject> {
        return synchronized(queueLock) {
            val queue = readQueue()
            val count = minOf(queue.length(), limit)
            (0 until count).mapNotNull { index -> queue.optJSONObject(index) }
        }
    }

    private fun removeUploaded(count: Int) {
        synchronized(queueLock) {
            val queue = readQueue()
            val remaining = JSONArray()
            for (index in count until queue.length()) {
                remaining.put(queue.get(index))
            }
            saveQueue(remaining)
        }
    }

    private fun readQueue(): JSONArray {
        val raw = queuePreferences.getString(KEY_PENDING_POSITIONS, null).orEmpty()
        return runCatching { JSONArray(raw) }.getOrElse { JSONArray() }
    }

    private fun saveQueue(queue: JSONArray) {
        queuePreferences.edit()
            .putString(KEY_PENDING_POSITIONS, queue.toString())
            .apply()
    }

    private fun notification(): Notification {
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_menu_mylocation)
            .setContentTitle(getString(R.string.app_name))
            .setContentText(getString(R.string.tracking_location_notification))
            .setOngoing(true)
            .build()
    }

    private fun createChannel() {
        val manager = getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(
            NotificationChannel(
                CHANNEL_ID,
                "Driver location",
                NotificationManager.IMPORTANCE_LOW,
            ),
        )
    }

    companion object {
        private const val CHANNEL_ID = "driver_location"
        private const val QUEUE_PREFS = "driver_location_queue"
        private const val KEY_PENDING_POSITIONS = "pending_positions"
        private const val NOTIFICATION_ID = 7101
        private const val ACTION_STOP = "com.automotive.alms.STOP_LOCATION"
        private const val EXTRA_WAYBILL_ID = "waybillId"
        private const val EXTRA_ORDER_ID = "orderId"
        private const val MOVING_INTERVAL_MS = 30_000L
        private const val STILL_INTERVAL_MS = 120_000L
        private const val FLUSH_INTERVAL_MS = 300_000L
        private const val MAX_BATCH_SIZE = 10
        private const val MAX_BUFFER_SIZE = 500

        fun start(context: Context, waybillId: String?, orderId: String?) {
            val intent = Intent(context, DriverLocationService::class.java).apply {
                putExtra(EXTRA_WAYBILL_ID, waybillId)
                putExtra(EXTRA_ORDER_ID, orderId)
            }
            ContextCompat.startForegroundService(context, intent)
        }

        fun stop(context: Context) {
            val intent = Intent(context, DriverLocationService::class.java).apply {
                action = ACTION_STOP
            }
            context.startService(intent)
        }
    }
}
