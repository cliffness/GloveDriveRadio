# GlobeDrive Radio (Android Auto + 3D Globe on phone)

## What this project is
- Phone: loads a 3D globe web app in a WebView (replace the placeholder in `app/src/main/assets/webapp/`)
- Car (Android Auto): shows Favorites / Recents / All Stations and supports search/voice via MediaBrowserService

## Build for free (no Android Studio)
1. Create a free GitHub account
2. Create a public repo and upload this project
3. Go to **Actions** → **Build APK (Debug)** → **Run workflow**
4. Download the APK from the workflow artifact

## Android Auto setup
- Android Auto app → Settings → tap version 10x → Developer settings → enable **Unknown sources**
- Plug in your phone and open the music apps list; choose **GlobeDrive Radio**

## Sync from globe → car
From your globe JS, call:
- AndroidBridge.saveAllStations(JSON.stringify(arrayOfStations))
- AndroidBridge.saveFavorites(JSON.stringify(arrayOfStations))
- AndroidBridge.saveRecents(JSON.stringify(arrayOfStations))

Each station object should have at least:
{ "name": "...", "stream": "https://...", "country": "..." , "favicon": "https://..." }
