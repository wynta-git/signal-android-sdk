package com.signalsdk.services

import android.content.Context
import android.os.Build
import com.signalsdk.models.DeviceInfo
import java.util.Locale
import java.util.TimeZone

internal class DeviceService(private val context: Context) {

    fun getDeviceInfo(): DeviceInfo {
        val osVersion = Build.VERSION.RELEASE
        val appVersion = try {
            @Suppress("DEPRECATION")
            context.packageManager.getPackageInfo(context.packageName, 0).versionName
        } catch (_: Exception) { null }

        return DeviceInfo(
            platform    = "android",
            os          = "Android $osVersion",
            os_version  = osVersion,
            app_version = appVersion,
            device_model = Build.MODEL,
            manufacturer = Build.MANUFACTURER,
            timezone    = TimeZone.getDefault().id,
            locale      = Locale.getDefault().toLanguageTag()
        )
    }
}
