package expo.modules.focuslock

import android.content.Context

// What the service and the app agree on, kept on disk so it survives the app being
// closed. The JS side reads it back on the next open.
object FocusState {
  private const val PREFS = "focus-lock"

  data class Session(
    val habitId: String,
    val title: String,
    val minutes: Int,
    val endAt: Long,
    val paused: Boolean,
    val remainingMs: Long,
    val timeUp: Boolean
  )

  fun save(context: Context, session: Session) {
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
      .putBoolean("active", true)
      .putString("habitId", session.habitId)
      .putString("title", session.title)
      .putInt("minutes", session.minutes)
      .putLong("endAt", session.endAt)
      .putBoolean("paused", session.paused)
      .putLong("remainingMs", session.remainingMs)
      .putBoolean("timeUp", session.timeUp)
      .apply()
  }

  fun load(context: Context): Session? {
    val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    if (!prefs.getBoolean("active", false)) return null
    return Session(
      habitId = prefs.getString("habitId", "") ?: "",
      title = prefs.getString("title", "") ?: "",
      minutes = prefs.getInt("minutes", 25),
      endAt = prefs.getLong("endAt", 0L),
      paused = prefs.getBoolean("paused", false),
      remainingMs = prefs.getLong("remainingMs", 0L),
      timeUp = prefs.getBoolean("timeUp", false)
    )
  }

  fun clear(context: Context) {
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().clear().apply()
  }
}
