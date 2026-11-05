package expo.modules.focuslock

import android.app.KeyguardManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

// Pause and Resume from the notification, without opening the app. Stop and Done open the
// app instead, because the app asks the question or logs the habit.
class FocusActionReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    // Not from the lock screen: the countdown shows there, but its buttons need an unlock.
    val keyguard = context.getSystemService(KeyguardManager::class.java)
    if (keyguard?.isKeyguardLocked == true) return

    val session = FocusState.load(context) ?: return
    val now = System.currentTimeMillis()
    val next = when (intent.action) {
      PAUSE -> if (session.paused || session.timeUp) null
        else session.copy(paused = true, remainingMs = (session.endAt - now).coerceAtLeast(0L))
      RESUME -> if (!session.paused) null
        else session.copy(paused = false, endAt = now + session.remainingMs, remainingMs = 0L)
      else -> null
    } ?: return
    FocusState.save(context, next)
    FocusLockService.refresh(context)
  }

  companion object {
    const val PAUSE = "expo.modules.focuslock.PAUSE"
    const val RESUME = "expo.modules.focuslock.RESUME"
  }
}
