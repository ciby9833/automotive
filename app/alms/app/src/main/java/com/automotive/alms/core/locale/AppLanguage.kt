package com.automotive.alms.core.locale

import androidx.annotation.StringRes
import androidx.appcompat.app.AppCompatDelegate
import androidx.core.os.LocaleListCompat
import com.automotive.alms.R

enum class AppLanguage(
    val tag: String,
    @StringRes val labelRes: Int,
) {
    English("en", R.string.language_english),
    Chinese("zh", R.string.language_chinese),
    Indonesian("in", R.string.language_indonesian),
}

object AppLocaleManager {
    fun setLanguage(language: AppLanguage) {
        AppCompatDelegate.setApplicationLocales(
            LocaleListCompat.forLanguageTags(language.tag),
        )
    }
}
