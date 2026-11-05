package expo.modules.focuslock

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

// Pause, Resume, Stop and Done from the notification, on the lock screen too, without
// unlocking. Stop and Done are left for the app to act on, because the app asks whether
// to log the minimum version, or logs the habit.
class FocusActionReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val session = FocusState.load(context) ?: return
    val now = System.currentTimeMillis()
    val left = if (session.paused) session.remainingMs else (session.endAt - now).coerceAtLeast(0L)
    val next = when (intent.action) {
      PAUSE -> if (session.paused || session.timeUp) null
        else session.copy(paused = true, remainingMs = left)
      RESUME -> if (!session.paused) null
        else session.copy(paused = false, endAt = now + session.remainingMs, remainingMs = 0L)
      // Stopping holds the clock where it is while the app asks its question.
      STOP -> session.copy(paused = true, remainingMs = left, pending = "stop")
      DONE -> session.copy(paused = true, remainingMs = left, pending = "done")
      else -> null
    } ?: return
    FocusState.save(context, next)
    FocusLockService.refresh(context)
  }

  companion object {
    const val PAUSE = "expo.modules.focuslock.PAUSE"
    const val RESUME = "expo.modules.focuslock.RESUME"
    const val STOP = "expo.modules.focuslock.STOP"
    const val DONE = "expo.modules.focuslock.DONE"
  }
}
