# Streamify MVP

Local-first music streaming over your Wi-Fi network. The web app scans audio files from `music/`, stores metadata in SQLite, streams tracks through Express, and provides a PWA-style React player.

## Run Locally

Prerequisites: Node.js 20+.

1. Install dependencies:
   `npm install`
2. Put audio files in the `music/` folder.
3. Start the server:
   `npm run dev`
4. Open `http://localhost:3000` and click **Scan Library**.

## Production

1. Build:
   `npm run build`
2. Start:
   `npm start`

## Android

Open the `android/` folder in Android Studio. Update `serverUrl` in `android/app/src/main/java/com/streamify/MainActivity.kt` to your computer's local network IP address before running on a device.
