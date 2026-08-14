package com.automotive.alms.core.locale

import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import android.content.res.Configuration
import androidx.annotation.StringRes
import com.automotive.alms.R
import java.util.Locale

enum class AppLanguage(
    val tag: String,
    @StringRes val labelRes: Int,
) {
    English("en", R.string.language_english),
    Chinese("zh", R.string.language_chinese),
    Indonesian("id", R.string.language_indonesian),
}

object AppLocaleManager {
    private const val PREFS = "alms_locale"
    private const val KEY_LANGUAGE_TAG = "language_tag"

    fun currentLanguage(context: Context): AppLanguage {
        val tag = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .getString(KEY_LANGUAGE_TAG, null)
        return AppLanguage.entries.firstOrNull { it.tag == tag }
            ?: context.resolveDefaultLanguage()
    }

    fun setLanguage(context: Context, language: AppLanguage) {
        if (currentLanguage(context) == language) return
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putString(KEY_LANGUAGE_TAG, language.tag)
            .apply()
        context.findActivity()?.recreate()
    }

    fun wrapContext(base: Context): Context {
        return localizedContext(base, currentLanguage(base))
    }

    private fun localizedContext(base: Context, language: AppLanguage): Context {
        val locale = Locale.forLanguageTag(language.tag)
        Locale.setDefault(locale)
        val configuration = Configuration(base.resources.configuration)
        configuration.setLocale(locale)
        configuration.setLayoutDirection(locale)
        return base.createConfigurationContext(configuration)
    }
}

private tailrec fun Context.findActivity(): Activity? {
    return when (this) {
        is Activity -> this
        is ContextWrapper -> baseContext.findActivity()
        else -> null
    }
}

private fun Context.resolveDefaultLanguage(): AppLanguage {
    val language = resources.configuration.locales[0]?.language
    return when (language) {
        "zh" -> AppLanguage.Chinese
        "id", "in" -> AppLanguage.Indonesian
        else -> AppLanguage.Chinese
    }
}
