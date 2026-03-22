# FaBu Mobile (React Native + Expo)

Mobile App fuer Android und iOS auf Basis des bestehenden FaBu Backends.

## Enthaltene Screens (MVP)

- Login
- Fahrzeugliste
- Neue Reservierung
- Reservierungsliste
- Reservierung stornieren
- Reservierung abschliessen (km + Zielort)

## Voraussetzungen

- Node.js 18+
- npm
- Expo Go App (oder Android/iOS Emulator)

## Installation

```bash
cd mobile
npm install
cp .env.example .env
```

## API-URL konfigurieren

Die App liest `EXPO_PUBLIC_API_BASE_URL`.
Wenn `.env` vorhanden ist, wird der Wert automatisch von Expo geladen.

Beispiele:

- Android Emulator + lokales Backend:
  - `http://10.0.2.2:3001/api`
- iOS Simulator + lokales Backend:
  - `http://localhost:3001/api`
- Physisches Geraet:
  - `http://<DEINE-LAN-IP>:3001/api`
- Produktion:
  - `https://fabu-online.de/api`

Start mit gesetzter URL:

```bash
EXPO_PUBLIC_API_BASE_URL=http://10.0.2.2:3001/api npm run start
```

## Start

```bash
npm run start
npm run android
npm run ios
```

## Hinweise

- Session-Token wird in `expo-secure-store` gespeichert.
- Nach Login werden Fahrzeuge geladen.
- Neue Reservierung prueft Verfuegbarkeit und erstellt den Eintrag ueber die Backend-API.
- Reservierungsliste hat Status-Filter (Alle, Aktiv, Abgeschlossen, Storniert) und eine Suche.
- Stornieren hat einen Bestaetigungsdialog.
- Erfolgreiches Stornieren/Abschliessen zeigt einen kurzen Success-Hinweis.
- API-Fehlercodes (`409`, `429`, `500` etc.) werden mit nutzerfreundlichen Meldungen behandelt.
- Bei `401` (abgelaufener/ungueltiger Token) wird die Session zentral geloescht und auf Login zurueckgefallen.
