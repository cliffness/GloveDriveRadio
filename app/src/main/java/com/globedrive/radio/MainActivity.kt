package com.globedrive.radio

import android.annotation.SuppressLint
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.view.WindowManager
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import android.content.pm.PackageManager
import java.io.File

class MainActivity : AppCompatActivity() {

  @SuppressLint("SetJavaScriptEnabled")
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)

    // Keep screen on while the app is open
    window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

    // Android 13+ notification permission (helps show the foreground playback notification)
    if (Build.VERSION.SDK_INT >= 33) {
      val granted = ContextCompat.checkSelfPermission(
        this,
        android.Manifest.permission.POST_NOTIFICATIONS
      ) == PackageManager.PERMISSION_GRANTED

      if (!granted) {
        ActivityCompat.requestPermissions(
          this,
          arrayOf(android.Manifest.permission.POST_NOTIFICATIONS),
          1001
        )
      }
    }

    val webView = WebView(this)
    webView.keepScreenOn = true
    webView.settings.javaScriptEnabled = true
    webView.settings.domStorageEnabled = true
    webView.settings.mediaPlaybackRequiresUserGesture = false

    webView.addJavascriptInterface(AndroidBridge(this), "AndroidBridge")
    webView.loadUrl("file:///android_asset/webapp/index.html")

    setContentView(webView)
  }
}

class AndroidBridge(private val context: Context) {

  private fun write(name: String, json: String) {
    File(context.filesDir, name).writeText(json)
  }

  @JavascriptInterface fun saveAllStations(json: String) = write("all_stations.json", json)
  @JavascriptInterface fun saveFavorites(json: String) = write("favorites.json", json)
  @JavascriptInterface fun saveRecents(json: String) = write("recents.json", json)

  // Called by the globe UI to play audio via the native RadioService (ExoPlayer)
  @JavascriptInterface
  fun playStream(url: String, title: String) {
    val intent = Intent(context, RadioService::class.java).apply {
      action = "PLAY_STREAM"
      putExtra("url", url)
      putExtra("title", title)
    }
    context.startService(intent)
  }
}
