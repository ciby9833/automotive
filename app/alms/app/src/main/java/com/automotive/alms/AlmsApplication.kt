package com.automotive.alms

import android.app.Application
import com.automotive.alms.core.config.AppContainer

class AlmsApplication : Application() {
    val container: AppContainer by lazy {
        AppContainer(applicationContext)
    }
}
