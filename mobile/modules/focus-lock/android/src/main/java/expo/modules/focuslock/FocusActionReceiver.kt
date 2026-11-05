package expo.modules.focuslock

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

// Pause and Done from the notification, on the lock screen too, without unlocking. Resume
// isn't here: it opens the app, which is what pins the phone again.
class FocusActionReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val session = FocusState.load(context) ?: return
    val now = System.currentTimeMillis()
    val left = if (session.paused) session.remainingMs else (session.endAt - now).coerceAtLeast(0L)
    when (intent.action) {
      PAUSE -> {
        if (session.paused || session.timeUp) return
        FocusState.save(context, session.copy(paused = true, remainingMs = left))
        FocusLockService.refresh(context)
      }
      // Kept for the app to log, which it does within a moment, or the next time it opens.
      DONE -> {
        FocusState.save(context, session.copy(paused = true, remainingMs = left, pending = "done"))
        FocusLockService.showDone(context, session)
      }
    }
  }

  companion object {
    const val PAUSE = "expo.modules.focuslock.PAUSE"
    const val DONE = "expo.modules.focuslock.DONE"
  }
}
