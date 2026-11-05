package expo.modules.focuslock

import android.app.Activity
import android.os.Bundle

// Resume in the focus notification opens this invisible screen. It restarts the timer,
// brings Habit Tracker to the front, where the app sees the timer running and pins the
// phone again, and closes. From the lock screen Android asks for the unlock first.
class FocusResumeActivity : Activity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    val session = FocusState.load(this)
    if (session != null && session.paused && !session.timeUp) {
      val now = System.currentTimeMillis()
      FocusState.save(this, session.copy(paused = false, endAt = now + session.remainingMs, remainingMs = 0L))
      FocusLockService.refresh(this)
    }
    startActivity(FocusLockService.launchIntent(this, null))
    finish()
    overridePendingTransition(0, 0)
  }
}
