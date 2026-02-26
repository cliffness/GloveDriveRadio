package com.globedrive.radio

import android.content.Context
import android.net.Uri
import android.support.v4.media.MediaBrowserCompat
import android.support.v4.media.MediaDescriptionCompat
import org.json.JSONArray
import org.json.JSONObject
import java.io.File

data class Station(
  val name: String,
  val stream: String,
  val country: String?,
  val favicon: String?
)

object MediaLibrary {
  const val ROOT = "root"
  const val FAVORITES = "favorites"
  const val RECENTS = "recents"
  const val ALL = "all"

  private fun readJsonArray(context: Context, filename: String): JSONArray {
    val f = File(context.filesDir, filename)
    if (!f.exists()) return JSONArray()
    return JSONArray(f.readText())
  }

  private fun parseStations(arr: JSONArray): List<Station> {
    val out = ArrayList<Station>(arr.length())
    for (i in 0 until arr.length()) {
      val o: JSONObject = arr.getJSONObject(i)
      val name = o.optString("name")
      val stream = o.optString("stream")
      if (name.isBlank() || stream.isBlank()) continue
      out.add(
        Station(
          name = name,
          stream = stream,
          country = o.optString("country", null),
          favicon = o.optString("favicon", null)
        )
      )
    }
    return out
  }

  private fun stationToItem(st: Station, titlePrefix: String = ""): MediaBrowserCompat.MediaItem {
    val descBuilder = MediaDescriptionCompat.Builder()
      .setMediaId(st.stream) // mediaId = stream URL (easy playback)
      .setTitle(titlePrefix + st.name)
      .setSubtitle(st.country ?: "")

    if (!st.favicon.isNullOrBlank()) {
      descBuilder.setIconUri(Uri.parse(st.favicon))
    }

    return MediaBrowserCompat.MediaItem(descBuilder.build(), MediaBrowserCompat.MediaItem.FLAG_PLAYABLE)
  }

  fun loadSection(context: Context, section: String): List<MediaBrowserCompat.MediaItem> {
    val (file, prefix) = when (section) {
      FAVORITES -> "favorites.json" to "★ "
      RECENTS -> "recents.json" to "⟲ "
      ALL -> "all_stations.json" to ""
      else -> "all_stations.json" to ""
    }
    val stations = parseStations(readJsonArray(context, file))
    return stations.map { stationToItem(it, prefix) }
  }

  fun search(context: Context, query: String): List<MediaBrowserCompat.MediaItem> {
    val q = query.trim()
    if (q.isEmpty()) return emptyList()
    val stations = parseStations(readJsonArray(context, "all_stations.json"))
    return stations.filter {
      it.name.contains(q, ignoreCase = true) ||
        (it.country?.contains(q, ignoreCase = true) == true)
    }.map { stationToItem(it) }
  }

  fun browsableItem(title: String, mediaId: String): MediaBrowserCompat.MediaItem {
    val desc = MediaDescriptionCompat.Builder()
      .setMediaId(mediaId)
      .setTitle(title)
      .build()
    return MediaBrowserCompat.MediaItem(desc, MediaBrowserCompat.MediaItem.FLAG_BROWSABLE)
  }
}
