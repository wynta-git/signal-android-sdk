package com.signalsdk.services

import android.os.Handler
import android.os.Looper
import androidx.lifecycle.DefaultLifecycleObserver
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.ProcessLifecycleOwner
import com.signalsdk.store.SDKState
import com.signalsdk.utils.Logger
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch

/**
 * Observes application foreground/background via [ProcessLifecycleOwner].
 *
 * PLATFORM LIMITATIONS
 * --------------------
 * app_terminated — Android does not guarantee that onDestroy() fires before a process is killed
 * (force-stop, OOM kill). This service does NOT fire app_terminated to avoid false positives on
 * every background transition. If needed, implement a WorkManager task or a best-effort sync
 * inside onStop — delivery is not guaranteed on process kill.
 *
 * session_ended — Fired on onStop (app goes to background) as the closest reliable proxy.
 * The session_id remains constant for the lifetime of the process; a new session starts on the
 * next cold launch via initSDK().
 */
internal class LifecycleService(
    private val scope: CoroutineScope,
    private val getState: () -> SDKState,
    private val emit: suspend (eventName: String) -> Unit
) : DefaultLifecycleObserver {

    @Volatile private var started = false

    fun start() {
        if (started) return
        // ProcessLifecycleOwner.get() must be called on the main thread
        Handler(Looper.getMainLooper()).post {
            if (!started) {
                started = true
                ProcessLifecycleOwner.get().lifecycle.addObserver(this)
                Logger.log("LifecycleService started")
            }
        }
    }

    fun stop() {
        Handler(Looper.getMainLooper()).post {
            ProcessLifecycleOwner.get().lifecycle.removeObserver(this)
            started = false
        }
    }

    // Fires when ≥1 Activity enters Started (app visible to user)
    override fun onStart(owner: LifecycleOwner) {
        val s = getState()
        if (!s.initialized || !s.appOpenTracked) return
        Logger.log("Lifecycle → app_foreground")
        scope.launch { emit("app_foreground") }
    }

    // Fires when all Activities are Stopped (app fully backgrounded)
    override fun onStop(owner: LifecycleOwner) {
        val s = getState()
        if (!s.initialized) return
        Logger.log("Lifecycle → app_background + session_ended")
        scope.launch {
            emit("app_background")
            emit("session_ended")
        }
    }
}
