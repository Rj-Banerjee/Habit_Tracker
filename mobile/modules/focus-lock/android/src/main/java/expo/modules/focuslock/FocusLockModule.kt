package expo.modules.focuslock

import android.app.AppOpsManager
import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Process
import android.provider.Settings
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

// Tunnel Vision's Android side: the lock that keeps other apps away, and the countdown
// that carries on with the app closed and on the lock screen.
class FocusLockModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("FocusLock")

    // Usage access: lets the lock see which app has come to the front.
    Function("hasUsageAccess") {
      val ops = context.getSystemService(Context.APP_OPS_SERVICE) as AppOpsManager
      val mode = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        ops.unsafeCheckOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), context.packageName)
      } else {
        @Suppress("DEPRECATION")
        ops.checkOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), context.packageName)
      }
      mode == AppOpsManager.MODE_ALLOWED
    }

    // Display over other apps: lets the lock bring focus back from the background.
    Function("canDrawOverlays") {
      Settings.canDrawOverlays(context)
    }

    Function("openUsageAccessSettings") {
      open(Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS))
    }

    Function("openOverlaySettings") {
      open(Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:${context.packageName}")))
    }

    Function("start") { habitId: String, title: String, minutes: Int, endAt: Double ->
      FocusState.save(
        context,
        FocusState.Session(habitId, title, minutes, endAt.toLong(), paused = false, remainingMs = 0L, timeUp = false)
      )
      clearTimeUp()
      startService()
    }

    Function("pause") { remainingMs: Double ->
      val session = FocusState.load(context) ?: return@Function
      FocusState.save(context, session.copy(paused = true, remainingMs = remainingMs.toLong()))
      startService()
    }

    Function("resume") { endAt: Double ->
      val session = FocusState.load(context) ?: return@Function
      FocusState.save(context, session.copy(paused = false, endAt = endAt.toLong(), remainingMs = 0L))
      startService()
    }

    Function("stop") {
      FocusState.clear(context)
      clearTimeUp()
      context.stopService(Intent(context, FocusLockService::class.java))
    }

    // Read back on every open, so a session started before the app was closed carries on.
    Function("status") {
      val session = FocusState.load(context) ?: return@Function null
      mapOf(
        "habitId" to session.habitId,
        "title" to session.title,
        "minutes" to session.minutes,
        "endAt" to session.endAt.toDouble(),
        "paused" to session.paused,
        "remainingMs" to session.remainingMs.toDouble(),
        "timeUp" to session.timeUp
      )
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

  private fun open(intent: Intent) {
    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    context.startActivity(intent)
  }
}
