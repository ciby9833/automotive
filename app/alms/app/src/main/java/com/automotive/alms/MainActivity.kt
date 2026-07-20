package com.automotive.alms

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import com.automotive.alms.core.navigation.AlmsApp
import com.automotive.alms.core.ui.AlmsTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val container = (application as AlmsApplication).container
        setContent {
            AlmsTheme {
                AlmsApp(container = container)
            }
        }
    }
}
