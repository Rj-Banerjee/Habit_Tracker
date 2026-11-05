package expo.modules.focuslock

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.SystemClock
import android.view.View
import android.widget.RemoteViews

// Runs for the length of a focus session, with the app open or closed. It keeps the
// countdown in an ongoing notification, on the lock screen too, and asks whether the work
// is done when the time runs out. Keeping other apps closed is screen pinning's job.
class FocusLockService : Service() {
  private val handler = Handler(Looper.getMainLooper())

  private val watch = object : Runnable {
    override fun run() {
      val session = FocusState.load(this@FocusLockService)
      if (session == null) {
        stopSelf()
        return
      }
      if (!session.paused && !session.timeUp && System.currentTimeMillis() >= session.endAt) {
        timeUp(session)
        return
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
    ensureChannels(this)
    val notification = countdown(this, session)
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

  private fun timeUp(session: FocusState.Session) {
    FocusState.save(this, session.copy(timeUp = true, remainingMs = 0L))
    getSystemService(NotificationManager::class.java).notify(
      DONE_ID,
      builder(this, CHANNEL_DONE)
        .setSmallIcon(R.drawable.ic_focus)
        .setContentTitle("Time's up")
        .setContentText("Is ${session.title} done?")
        .setVisibility(Notification.VISIBILITY_PUBLIC)
        .setCategory(Notification.CATEGORY_ALARM)
        .setAutoCancel(true)
        .setContentIntent(openApp(this, null))
        .build()
    )
    stopForeground(STOP_FOREGROUND_REMOVE)
    stopSelf()
  }

  companion object {
    const val CHANNEL_ONGOING = "focus-countdown"
    private const val OLD_CHANNEL_ONGOING = "focus-timer"
    const val CHANNEL_DONE = "focus-done"
    const val ONGOING_ID = 7401
    const val DONE_ID = 7402
    // Its own id, so the app clearing "Time's up" never takes the done message with it.
    const val DONE_MESSAGE_ID = 7403
    private const val CHECK_MS = 700L
    private const val DONE_MESSAGE_MS = 5000L

    fun ensureChannels(context: Context) {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
      val manager = context.getSystemService(NotificationManager::class.java)
      // Normal importance, so phones that hide silent notifications on the lock screen
      // still show the countdown, but with no sound or vibration. A channel's importance is
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

    fun builder(context: Context, channel: String): Notification.Builder =
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) Notification.Builder(context, channel)
      else @Suppress("DEPRECATION") Notification.Builder(context)

    // Opens the app. From the lock screen Android asks for the unlock first, because the
    // app never shows over the lock screen.
    fun openApp(context: Context, action: String?): PendingIntent {
      val intent = launchIntent(context, action)
      return PendingIntent.getActivity(
        context,
        (action ?: "open").hashCode(),
        intent,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
      )
    }

    private fun resume(context: Context): PendingIntent =
      PendingIntent.getActivity(
        context,
        "resume".hashCode(),
        Intent(context, FocusResumeActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
      )

    private fun broadcast(context: Context, action: String): PendingIntent =
      PendingIntent.getBroadcast(
        context,
        action.hashCode(),
        Intent(context, FocusActionReceiver::class.java).setAction(action),
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
      )

    private fun clock(ms: Long): String {
      val total = (ms + 999) / 1000
      val hours = total / 3600
      return if (hours > 0) "%d:%02d:%02d".format(hours, (total % 3600) / 60, total % 60)
      else "%02d:%02d".format(total / 60, total % 60)
    }

    // The design: the app's name and arrow from Android, then the habit, a big countdown,
    // and Pause or Resume, and Done.
    private fun views(context: Context, session: FocusState.Session, layout: Int, buttons: Boolean): RemoteViews {
      val views = RemoteViews(context.packageName, layout)
      views.setTextViewText(R.id.focus_detail, session.detail.ifBlank { session.title })
      if (session.paused) {
        views.setViewVisibility(R.id.focus_clock, View.GONE)
        views.setViewVisibility(R.id.focus_paused_clock, View.VISIBLE)
        views.setTextViewText(R.id.focus_paused_clock, clock(session.remainingMs))
      } else {
        views.setViewVisibility(R.id.focus_clock, View.VISIBLE)
        views.setViewVisibility(R.id.focus_paused_clock, View.GONE)
        val base = SystemClock.elapsedRealtime() + (session.endAt - System.currentTimeMillis())
        views.setChronometer(R.id.focus_clock, base, null, true)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) views.setChronometerCountDown(R.id.focus_clock, true)
      }
      if (buttons) {
        views.setTextViewText(R.id.focus_pause, if (session.paused) "Resume" else "Pause")
        // Pause works in the background. Resume opens the app, because only an app on screen
        // can pin the phone again; from the lock screen Android asks for the unlock first.
        views.setOnClickPendingIntent(
          R.id.focus_pause,
          if (session.paused) resume(context) else broadcast(context, FocusActionReceiver.PAUSE)
        )
        views.setOnClickPendingIntent(R.id.focus_done, broadcast(context, FocusActionReceiver.DONE))
      }
      return views
    }

    fun countdown(context: Context, session: FocusState.Session): Notification {
      val b = builder(context, CHANNEL_ONGOING)
        .setSmallIcon(R.drawable.ic_focus)
        .setOngoing(true)
        .setOnlyAlertOnce(true)
        .setVisibility(Notification.VISIBILITY_PUBLIC)
        .setCategory(Notification.CATEGORY_PROGRESS)
        .setContentIntent(openApp(context, null))
        .setContentTitle(session.detail.ifBlank { session.title })
        .setCustomContentView(views(context, session, R.layout.focus_notification_small, buttons = false))
        .setCustomBigContentView(views(context, session, R.layout.focus_notification_big, buttons = true))
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) b.setStyle(Notification.DecoratedCustomViewStyle())
      return b.build()
    }

    // Done from the notification: the countdown goes, and a short "work is done" message
    // takes its place for a few seconds. The app logs the habit.
    fun showDone(context: Context, session: FocusState.Session) {
      context.stopService(Intent(context, FocusLockService::class.java))
      val manager = context.getSystemService(NotificationManager::class.java)
      manager.cancel(ONGOING_ID)
      val b = builder(context, CHANNEL_DONE)
        .setSmallIcon(R.drawable.ic_focus)
        .setContentTitle("Your work is done")
        .setContentText("${session.title} is logged. Nicely focused.")
        .setVisibility(Notification.VISIBILITY_PUBLIC)
        .setAutoCancel(true)
        .setOnlyAlertOnce(true)
        .setContentIntent(openApp(context, null))
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) b.setTimeoutAfter(DONE_MESSAGE_MS)
      manager.notify(DONE_MESSAGE_ID, b.build())
    }

    fun refresh(context: Context) {
      val session = FocusState.load(context) ?: return
      context.getSystemService(NotificationManager::class.java).notify(ONGOING_ID, countdown(context, session))
    }

    fun launchIntent(context: Context, action: String?): Intent =
      (context.packageManager.getLaunchIntentForPackage(context.packageName) ?: Intent()).apply {
        this.action = Intent.ACTION_VIEW
        val query = if (action != null) "?action=$action" else ""
        data = Uri.parse("${scheme(context)}://focus$query")
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT or Intent.FLAG_ACTIVITY_SINGLE_TOP)
      }

    // The app's own link scheme, so a review build opens itself.
    private fun scheme(context: Context): String =
      if (context.packageName.endsWith(".review")) "habittracker-review" else "habittracker"
  }
}
