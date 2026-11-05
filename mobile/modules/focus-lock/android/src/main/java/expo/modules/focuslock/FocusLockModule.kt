package expo.modules.focuslock

import android.app.ActivityManager
import android.app.KeyguardManager
import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.os.Build
import android.provider.Settings
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

// Tunnel Vision's Android side: screen pinning, which keeps the phone in the app without it
// ever closing, and the countdown that carries on in the notification and on the lock screen.
class FocusLockModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("FocusLock")

    // Android turns off Home, Recents and the notification shade while pinned, and shows
    // its own message instead. It asks once each time, and always lets people unpin with a
    // held gesture, which the app treats as Stop.
    Function("pin") {
      val activity = appContext.currentActivity ?: return@Function false
      activity.runOnUiThread {
        try {
          activity.startLockTask()
        } catch (_: Exception) {
          // Pinning is off on this phone. The app says so and carries on without it.
        }
      }
      true
    }

    Function("unpin") {
      val activity = appContext.currentActivity ?: return@Function null
      activity.runOnUiThread {
        try {
          if (isPinned()) activity.stopLockTask()
        } catch (_: Exception) {
        }
      }
      null
    }

    Function("isPinned") { isPinned() }

    Function("openPinningSettings") {
      val intent = Intent(Settings.ACTION_SECURITY_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      context.startActivity(intent)
    }

    Function("start") { habitId: String, title: String, detail: String, minutes: Int, endAt: Double ->
      FocusState.save(
        context,
        FocusState.Session(
          habitId, title, detail, minutes, endAt.toLong(),
          paused = false, remainingMs = 0L, timeUp = false
        )
      )
      clearTimeUp()
      startService()
    }

    Function("pause") { remainingMs: Double ->
      val session = FocusState.load(context) ?: return@Function null
      FocusState.save(context, session.copy(paused = true, remainingMs = remainingMs.toLong()))
      startService()
      null
    }

    Function("resume") { endAt: Double ->
      val session = FocusState.load(context) ?: return@Function null
      FocusState.save(context, session.copy(paused = false, endAt = endAt.toLong(), remainingMs = 0L))
      startService()
      null
    }

    Function("stop") {
      FocusState.clear(context)
      clearTimeUp()
      context.stopService(Intent(context, FocusLockService::class.java))
    }

    // Read back on every tick and every open, so a session started before the app was
    // closed carries on, and a notification button is acted on.
    Function("status") {
      val session = FocusState.load(context) ?: return@Function null
      mapOf(
        "habitId" to session.habitId,
        "title" to session.title,
        "minutes" to session.minutes,
        "endAt" to session.endAt.toDouble(),
        "paused" to session.paused,
        "remainingMs" to session.remainingMs.toDouble(),
        "timeUp" to session.timeUp,
        "pending" to session.pending
      )
    }

    // The app has acted on Stop or Done from the notification.
    Function("clearPending") {
      val session = FocusState.load(context) ?: return@Function null
      FocusState.save(context, session.copy(pending = null))
      null
    }

    // Some phones lock when an app unpins. The app checks this after a pause.
    Function("isLocked") {
      context.getSystemService(KeyguardManager::class.java)?.isKeyguardLocked == true
    }
  }

  private fun isPinned(): Boolean {
    val manager = context.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
      manager.lockTaskModeState != ActivityManager.LOCK_TASK_MODE_NONE
    } else {
      @Suppress("DEPRECATION")
      manager.isInLockTaskMode
    }
  }

  private fun startService() {
    val intent = Intent(context, FocusLockService::class.java)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) context.startForegroundService(intent)
    else context.startService(intent)
  }

  private fun clearTimeUp() {
    context.getSystemService(NotificationManager::class.java)?.cancel(FocusLockService.DONE_ID)
  }
}
