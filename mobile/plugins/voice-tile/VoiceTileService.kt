package com.rjbanerjee.habittracker

import android.app.PendingIntent
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.service.quicksettings.TileService

// One tap on the Quick Settings tile opens the app straight to the voice sheet.
class VoiceTileService : TileService() {
  override fun onClick() {
    super.onClick()
    if (isLocked) unlockAndRun { openVoice() } else openVoice()
  }

  private fun openVoice() {
    val intent = Intent(Intent.ACTION_VIEW, Uri.parse("habittracker://voice"))
      .setPackage(packageName)
      .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
      val flags = PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
      startActivityAndCollapse(PendingIntent.getActivity(this, 0, intent, flags))
    } else {
      @Suppress("DEPRECATION")
      startActivityAndCollapse(intent)
    }
  }
}
