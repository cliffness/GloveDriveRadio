package com.globedrive.radio

import android.annotation.SuppressLint
import android.os.Build
import android.os.Bundle
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
    window.addFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

    // Android 13+ notification permission (needed for foreground playback notification)
    if (Build.VERSION.SDK_INT >= 33) {
      val granted = ContextCompat.checkSelfPermission(this, android.Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED
      if (!granted) {
        ActivityCompat.requestPermissions(this, arrayOf(android.Manifest.permission.POST_NOTIFICATIONS), 1001)
      }
    }

    val webView = WebView(this)
    webView.settings.javaScriptEnabled = true
    webView.settings.domStorageEnabled = true
    webView.settings.mediaPlaybackRequiresUserGesture = false
    webView.keepScreenOn = true
    webView.addJavascriptInterface(AndroidBridge(this), "AndroidBridge")
    webView.loadUrl("file:///android_asset/webapp/index.html")

    setContentView(webView)
  }
}

class AndroidBridge(private val baseDir: File) {

  private fun write(name: String, json: String) {
    File(baseDir, name).writeText(json)
  }

class AndroidBridge(private val context: android.content.Context) {

  private fun write(name: String, json: String) {
    java.io.File(context.filesDir, name).writeText(json)
  }

  @JavascriptInterface fun saveAllStations(json: String) = write("all_stations.json", json)
  @JavascriptInterface fun saveFavorites(json: String) = write("favorites.json", json)
  @JavascriptInterface fun saveRecents(json: String) = write("recents.json", json)
  @JavascriptInterface fun playStream(url: String, title: String) {
    val intent = android.content.Intent(context, RadioService::class.java).apply {
      action = "PLAY_STREAM"
      putExtra("url", url)
      putExtra("title", title)
    }
    context.startService(intent)
  }
}
