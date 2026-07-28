import java.util.Properties

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
}

// API_BASE_URL 解析优先级：
//   1. gradle.properties / -PapiBaseUrl=... (CI 覆盖用)
//   2. local.properties 里的 API_BASE_URL_DEV (每个开发者本地机器 IP)
//   3. flavor 默认值 (dev/staging/prod)
// 生产/预发的 URL 直接写在下面 flavor 里，不放 local.properties；
// 本地 dev 环境每个人机器不一样 (10.0.2.2 只在模拟器通，真机要用宿主 IP)，
// 所以 local.properties 提供每人机器可覆盖的入口，且这个文件不进 git。
fun Project.readLocalProperty(key: String): String? {
    val file = rootProject.file("local.properties")
    if (!file.exists()) return null
    val props = Properties().apply { file.inputStream().use { load(it) } }
    return props.getProperty(key)
}

android {
    namespace = "com.automotive.alms"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.automotive.alms"
        minSdk = 26
        targetSdk = 36
        versionCode = 1
        versionName = "1.0"
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    flavorDimensions += "env"
    productFlavors {
        create("dev") {
            dimension = "env"
            // 优先取 local.properties 里的 API_BASE_URL_DEV；否则回退到 10.0.2.2 (模拟器)
            val devUrl = (project.findProperty("apiBaseUrl") as String?)
                ?: readLocalProperty("API_BASE_URL_DEV")
                ?: "http://10.0.2.2:3001"
            buildConfigField("String", "API_BASE_URL", "\"$devUrl\"")
            buildConfigField("String", "ENV_NAME", "\"dev\"")
            manifestPlaceholders["appLabel"] = "ALMS Dev"
            applicationIdSuffix = ".dev"
            versionNameSuffix = "-dev"
        }
        create("staging") {
            dimension = "env"
            val stagingUrl = (project.findProperty("apiBaseUrl") as String?)
                ?: readLocalProperty("API_BASE_URL_STAGING")
                ?: "https://staging.example.com"
            buildConfigField("String", "API_BASE_URL", "\"$stagingUrl\"")
            buildConfigField("String", "ENV_NAME", "\"staging\"")
            manifestPlaceholders["appLabel"] = "ALMS Staging"
            applicationIdSuffix = ".staging"
            versionNameSuffix = "-staging"
        }
        create("prod") {
            dimension = "env"
            // 生产 URL 硬编码在此，出包时不允许被 local.properties 覆盖（安全）
            buildConfigField("String", "API_BASE_URL", "\"http://8.215.32.251:8080/api\"")
            buildConfigField("String", "ENV_NAME", "\"prod\"")
            manifestPlaceholders["appLabel"] = "ALMS"
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

kotlin {
    compilerOptions {
        jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17)
    }
}

dependencies {
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.appcompat)
    implementation(libs.androidx.compose.foundation)
    implementation(libs.androidx.compose.material3)
    implementation(libs.androidx.compose.material.icons.extended)
    implementation(libs.androidx.compose.runtime)
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.ui.tooling.preview)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.navigation.compose)
    implementation(libs.kotlinx.coroutines.android)
    implementation(libs.kotlinx.serialization.json)
    implementation(libs.okhttp)
    implementation(libs.okhttp.logging)

    debugImplementation(libs.androidx.compose.ui.tooling)
}
