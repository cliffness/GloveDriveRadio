package com.globedrive.radio

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Intent
import android.os.Build
import android.os.Bundle
import androidx.core.app.NotificationCompat
import androidx.media.MediaBrowserServiceCompat
import android.support.v4.media.MediaBrowserCompat
import android.support.v4.media.session.MediaSessionCompat
import android.support.v4.media.session.PlaybackStateCompat
import com.google.android.exoplayer2.ExoPlayer
import com.google.android.exoplayer2.MediaItem

class RadioService : MediaBrowserServiceCompat() {

  private lateinit var mediaSession: MediaSessionCompat
  private lateinit var player: ExoPlayer

  override fun onCreate() {
    super.onCreate()

    createNotificationChannel()

    player = ExoPlayer.Builder(this).build()

    mediaSession = MediaSessionCompat(this, "GlobeDriveRadioSession").apply {
      setCallback(object : MediaSessionCompat.Callback() {

        override fun onPlayFromMediaId(mediaId: String?, extras: Bundle?) {
          mediaId?.let { playStream(it, extras?.getString("title")) }
        }

        override fun onPlayFromSearch(query: String?, extras: Bundle?) {
          val q = query ?: return
          val results = MediaLibrary.search(this@RadioService, q)
          if (results.isNotEmpty()) {
            val first = results[0]
            val url = first.description.mediaId
            val title = first.description.title?.toString()
            if (!url.isNullOrBlank()) playStream(url, title)
          }
        }

        override fun onPlay() {
          player.play()
          updatePlaybackState(PlaybackStateCompat.STATE_PLAYING)
          startForegroundNowPlaying("Playing")
        }

        override fun onPause() {
          player.pause()
          updatePlaybackState(PlaybackStateCompat.STATE_PAUSED)
          stopForeground(false)
        }

        override fun onStop() {
          player.stop()
          updatePlaybackState(PlaybackStateCompat.STATE_STOPPED)
          stopForeground(true)
        }
      })

      isActive = true
    }

    sessionToken = mediaSession.sessionToken
    updatePlaybackState(PlaybackStateCompat.STATE_STOPPED)
  }

  // Allows WebView UI (AndroidBridge) to ask the service to play a stream
  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (intent?.action == "PLAY_STREAM") {
      val url = intent.getStringExtra("url")
      val title = intent.getStringExtra("title")
      if (!url.isNullOrBlank()) {
        playStream(url, title)
      }
    }
    return START_STICKY
  }

  override fun onGetRoot(
    clientPackageName: String,
    clientUid: Int,
    rootHints: Bundle?
  ): BrowserRoot {
    return BrowserRoot(MediaLibrary.ROOT, null)
  }

  override fun onLoadChildren(
    parentId: String,
    result: Result<MutableList<MediaBrowserCompat.MediaItem>>
  ) {
    val out = mutableListOf<MediaBrowserCompat.MediaItem>()

    when (parentId) {
      MediaLibrary.ROOT -> {
        out += MediaLibrary.browsableItem("Favorites", MediaLibrary.FAVORITES)
        out += MediaLibrary.browsableItem("Recents", MediaLibrary.RECENTS)
        out += MediaLibrary.browsableItem("All Stations", MediaLibrary.ALL)
      }
      MediaLibrary.FAVORITES -> out += MediaLibrary.loadSection(this, MediaLibrary.FAVORITES)
      MediaLibrary.RECENTS -> out += MediaLibrary.loadSection(this, MediaLibrary.RECENTS)
      MediaLibrary.ALL -> out += MediaLibrary.loadSection(this, MediaLibrary.ALL)
    }

    result.sendResult(out)
  }

  override fun onSearch(
    query: String,
    extras: Bundle?,
    result: Result<MutableList<MediaBrowserCompat.MediaItem>>
  ) {
    result.sendResult(MediaLibrary.search(this, query).toMutableList())
  }

  private fun playStream(url: String, title: String? = null) {
    player.setMediaItem(MediaItem.fromUri(url))
    player.prepare()
    player.play()

    updatePlaybackState(PlaybackStateCompat.STATE_PLAYING)
    startForegroundNowPlaying(title ?: "GlobeDrive Radio")
  }

  private fun updatePlaybackState(state: Int) {
    val playbackState = PlaybackStateCompat.Builder()
      .setActions(
        PlaybackStateCompat.ACTION_PLAY or
          PlaybackStateCompat.ACTION_PAUSE or
          PlaybackStateCompat.ACTION_PLAY_FROM_MEDIA_ID or
          PlaybackStateCompat.ACTION_PLAY_FROM_SEARCH or
          PlaybackStateCompat.ACTION_STOP
      )
      .setState(state, PlaybackStateCompat.PLAYBACK_POSITION_UNKNOWN, 1.0f)
      .build()

    mediaSession.setPlaybackState(playbackState)
  }

  private fun createNotificationChannel() {
    if (Build.VERSION.SDK_INT >= 26) {
      val nm = getSystemService(NotificationManager::class.java)
      nm.createNotificationChannel(
        NotificationChannel(
          "globedrive_playback",
          "GlobeDrive Playback",
          NotificationManager.IMPORTANCE_LOW
        )
      )
    }
  }

  private fun startForegroundNowPlaying(title: String) {
    val openIntent = Intent(this, MainActivity::class.java)
    val pi = PendingIntent.getActivity(
      this, 0, openIntent,
      PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
    )

    val notif = NotificationCompat.Builder(this, "globedrive_playback")
      .setContentTitle("GlobeDrive Radio")
      .setContentText(title)
      .setSmallIcon(android.R.drawable.ic_media_play)
      .setContentIntent(pi)
      .setOngoing(true)
      .build()

    startForeground(1, notif)
  }

  override fun onDestroy() {
    super.onDestroy()
    player.release()
    mediaSession.release()
  }
}
