package expo.modules.focuslock

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.app.usage.UsageEvents
import android.app.usage.UsageStatsManager
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.provider.Settings
import android.telecom.TelecomManager

// Runs for the length of a focus session, with the app open or closed. It shows the
// countdown as an ongoing notification, on the lock screen too, and brings the app back
// whenever another app comes to the front. Calls and emergency calls are always allowed.
class FocusLockService : Service() {
  private val handler = Handler(Looper.getMainLooper())
  private var lastBounce = 0L

  private val watch = object : Runnable {
    override fun run() {
      val session = FocusState.load(this@FocusLockService)
      if (session == null) {
        stopSelf()
        return
      }
      if (!session.paused && !session.timeUp) {
        if (System.currentTimeMillis() >= session.endAt) {
          timeUp(session)
          return
        }
        bounceIfAway()
      }
      handler.postDelayed(this, CHECK_MS)
    }
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val session = FocusState.load(this)
    if (session == null) {
      stopSelf()
      return START_NOT_STICKY
    }
    ensureChannels()
    val notification = countdown(session)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
      startForeground(ONGOING_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
    } else {
      startForeground(ONGOING_ID, notification)
    }
    handler.removeCallbacks(watch)
    handler.post(watch)
    return START_STICKY
  }

  override fun onDestroy() {
    handler.removeCallbacks(watch)
    super.onDestroy()
  }

  private fun ensureChannels() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = getSystemService(NotificationManager::class.java)
    // Normal importance, so phones that hide silent notifications on the lock screen still
    // show the countdown there, but with no sound or vibration. A channel's importance is
    // fixed once made, hence a new id rather than changing the old one.
    manager.deleteNotificationChannel(OLD_CHANNEL_ONGOING)
    manager.createNotificationChannel(
      NotificationChannel(CHANNEL_ONGOING, "Focus timer", NotificationManager.IMPORTANCE_DEFAULT).apply {
        description = "The countdown while Tunnel Vision is on"
        lockscreenVisibility = Notification.VISIBILITY_PUBLIC
        setSound(null, null)
        enableVibration(false)
        setShowBadge(false)
      }
    )
    manager.createNotificationChannel(
      NotificationChannel(CHANNEL_DONE, "Focus finished", NotificationManager.IMPORTANCE_HIGH).apply {
        description = "Asks whether the work is done when the focus timer ends"
        lockscreenVisibility = Notification.VISIBILITY_PUBLIC
      }
    )
  }

  private fun openApp(): PendingIntent {
    val intent = launchIntent(this)
    return PendingIntent.getActivity(
      this,
      0,
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )
  }

  private fun builder(channel: String): Notification.Builder =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) Notification.Builder(this, channel)
    else @Suppress("DEPRECATION") Notification.Builder(this)

  private fun countdown(session: FocusState.Session): Notification {
    val b = builder(CHANNEL_ONGOING)
      .setSmallIcon(R.drawable.ic_focus)
      .setContentTitle("Focusing on ${session.title}")
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setVisibility(Notification.VISIBILITY_PUBLIC)
      .setCategory(Notification.CATEGORY_PROGRESS)
      .setContentIntent(openApp())
    if (session.paused) {
      b.setContentText("Paused · ${clock(session.remainingMs)} left")
        .setShowWhen(false)
    } else {
      b.setContentText("Open the app to stop, or say \"done my work\"")
        .setWhen(session.endAt)
        .setShowWhen(true)
        .setUsesChronometer(true)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) b.setChronometerCountDown(true)
    }
    return b.build()
  }

  private fun timeUp(session: FocusState.Session) {
    FocusState.save(this, session.copy(timeUp = true, remainingMs = 0L))
    val manager = getSystemService(NotificationManager::class.java)
    manager.notify(
      DONE_ID,
      builder(CHANNEL_DONE)
        .setSmallIcon(R.drawable.ic_focus)
        .setContentTitle("Time's up")
        .setContentText("Is ${session.title} done?")
        .setVisibility(Notification.VISIBILITY_PUBLIC)
        .setCategory(Notification.CATEGORY_ALARM)
        .setAutoCancel(true)
        .setContentIntent(openApp())
        .build()
    )
    // The question is asked in the app, so it comes to the front.
    bringBack()
    stopForeground(STOP_FOREGROUND_REMOVE)
    stopSelf()
  }

  private fun bounceIfAway() {
    val front = foregroundPackage() ?: return
    if (front in allowedPackages()) return
    val now = System.currentTimeMillis()
    if (now - lastBounce < BOUNCE_GAP_MS) return
    lastBounce = now
    bringBack()
  }

  private fun bringBack() {
    try {
      startActivity(launchIntent(this))
    } catch (_: Exception) {
      // Without "Display over other apps" Android refuses. The countdown still shows.
    }
  }

  // The app most recently brought to the front, from usage access.
  private fun foregroundPackage(): String? {
    val usage = getSystemService(Context.USAGE_STATS_SERVICE) as? UsageStatsManager ?: return null
    val now = System.currentTimeMillis()
    val events = usage.queryEvents(now - LOOKBACK_MS, now)
    val event = UsageEvents.Event()
    var latest: String? = null
    while (events.hasNextEvent()) {
      events.getNextEvent(event)
      val resumed = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        event.eventType == UsageEvents.Event.ACTIVITY_RESUMED
      } else {
        @Suppress("DEPRECATION")
        event.eventType == UsageEvents.Event.MOVE_TO_FOREGROUND
      }
      if (resumed) latest = event.packageName
    }
    return latest
  }

  private fun allowedPackages(): Set<String> {
    val allowed = mutableSetOf(packageName, "android", "com.android.systemui").apply { addAll(ALWAYS_ALLOWED) }
    (getSystemService(Context.TELECOM_SERVICE) as? TelecomManager)?.defaultDialerPackage?.let(allowed::add)
    Settings.Secure.getString(contentResolver, Settings.Secure.DEFAULT_INPUT_METHOD)
      ?.substringBefore('/')
      ?.let(allowed::add)
    return allowed
  }

  private fun clock(ms: Long): String {
    val total = (ms + 999) / 1000
    return "%02d:%02d".format(total / 60, total % 60)
  }

  companion object {
    const val CHANNEL_ONGOING = "focus-countdown"
    private const val OLD_CHANNEL_ONGOING = "focus-timer"
    const val CHANNEL_DONE = "focus-done"
    const val ONGOING_ID = 7401
    const val DONE_ID = 7402
    private const val CHECK_MS = 700L
    private const val BOUNCE_GAP_MS = 700L
    private const val LOOKBACK_MS = 10_000L

    // Calls, emergency calls and the permission screen are never blocked.
    private val ALWAYS_ALLOWED = setOf(
      "com.android.phone",
      "com.android.server.telecom",
      "com.android.incallui",
      "com.samsung.android.incallui",
      "com.android.emergency",
      "com.samsung.android.emergency",
      "com.google.android.dialer",
      "com.android.dialer",
      "com.samsung.android.dialer",
      "com.google.android.permissioncontroller",
      "com.android.permissioncontroller"
    )

    fun launchIntent(context: Context): Intent =
      (context.packageManager.getLaunchIntentForPackage(context.packageName) ?: Intent()).apply {
        action = Intent.ACTION_VIEW
        data = Uri.parse("${scheme(context)}://focus")
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT or Intent.FLAG_ACTIVITY_SINGLE_TOP)
      }

    // The app's own link scheme, so the review build opens itself.
    private fun scheme(context: Context): String =
      if (context.packageName.endsWith(".review")) "habittracker-review" else "habittracker"
  }
}
