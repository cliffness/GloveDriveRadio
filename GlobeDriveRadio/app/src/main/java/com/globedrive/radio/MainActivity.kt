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

    webView.addJavascriptInterface(AndroidBridge(filesDir), "AndroidBridge")
    webView.loadUrl("file:///android_asset/webapp/index.html")

    setContentView(webView)
  }
}

class AndroidBridge(private val baseDir: File) {

  private fun write(name: String, json: String) {
    File(baseDir, name).writeText(json)
  }

  @JavascriptInterface fun saveAllStations(json: String) = write("all_stations.json", json)
  @JavascriptInterface fun saveFavorites(json: String) = write("favorites.json", json)
  @JavascriptInterface fun saveRecents(json: String) = write("recents.json", json)
}
