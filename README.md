# ParkSmart — Smart Parking Spot Finder

A modern parking discovery, booking, and gate-verification platform: real parking from Google Places, floor-level stall maps, a QR digital pass, live turn-by-turn navigation to your stall, and an operator dashboard for owners — all in a glass-morphism UI.

## Features

- **Real Parking Discovery** — Google Places API (New) `searchNearby` + `searchText` with progressive radius expansion (5 km → 10 km → 20 km), merge/dedupe by Place ID, and photo enrichment via Place Details
- **Booking with QR Digital Pass** — book a stall, get a server-generated QR token, active-pass modal with countdown, plus dedicated QR pages (`/user/bookings/:id/qr`, `/verify/booking/:token`)
- **Gate Verification (Owner side)** — camera QR scanner (jsQR) to check-in / check-out / reject bookings, verification history, and live parking sessions (owner pages under `/owner/*`)
- **Garage Floor-Level Maps** — floor tabs + stall grid in the parking detail modal; book a specific stall, not just a lot
- **Real-time Navigation** — turn-by-turn navigation with GPS tracking, Kalman-filter smoothing, off-route detection with auto-reroute, voice guidance (Web Speech), traffic-segmented polylines, and arrival detection
- **Entrance-based Routing** — routes to parking lot entrance coordinates when available, not just the centroid
- **AI Smart Finder** — Gemini-powered parking recommendation (`POST /api/parking/recommend`) with a rule-based fallback when no API key is configured
- **Operator Dashboard** — claim lots, manage stalls and pricing, occupancy stats (recharts bar chart)
- **Notifications** — driver notification inbox bell (`/api/notifications`)
- **Modern Auth** — Supabase Auth when configured; otherwise a localStorage SHA-256 demo flow (server never accepts demo identity in production); split-screen sign-in/sign-up pages
- **Theme Customizer** — multiple accent presets (blue, green, purple, amber, rose, …), map style, density, high contrast, and motion preferences (persisted)
- **Glass Morphism UI** — Tailwind v4 with class-based dark mode, curtain-effect theme toggle, GSAP PillNav, Lenis ScrollStack sidebar, MagicBento card effects, and confetti on successful booking
- **Video Background** — looping MP4 page background behind every route with a theme-aware scrim and reduced-motion fallback

## Tech Stack

- **React 19** + **TypeScript** + **Vite**
- **React Router v7** — driver (`/`), auth, bookings, owner, and verify routes
- **Tailwind CSS v4** — styling with `@custom-variant dark` for class-based dark mode
- **Google Maps JavaScript API** — map rendering via `@vis.gl/react-google-maps` (advanced markers, InfoWindows, Circles)
- **Google Places API (New)** — parking discovery via direct REST `fetch` (`searchNearby`, `searchText`, place details + photos)
- **Google Routes API** — route calculation through the Maps JS Routes library (`importLibrary('routes')`)
- **Express** — API server (helmet, CORS allowlist, express-rate-limit) serving the Vite app in dev and `dist/` in production
- **@google/genai** — Gemini AI recommendation endpoint
- **Supabase** — authentication and server-side bearer-token session verification (`@supabase/supabase-js`)
- **qrcode** + **jsQR** — QR pass generation and camera scanning
- **GSAP**, **Lenis**, **motion**, **lucide-react**, **recharts**, **canvas-confetti**

## Getting Started

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

Copy `.env.example` to `.env.local` and fill in your keys:

```env
# Google Maps (server + browser). The server key feeds the browser bundle at dev time.
GOOGLE_MAPS_PLATFORM_KEY=""
VITE_GOOGLE_MAPS_PLATFORM_KEY=""
VITE_GOOGLE_MAPS_MAP_ID=""      # optional; falls back to DEMO_MAP_ID
GEMINI_API_KEY=""               # server only — used for /api/parking/recommend
API_ACCESS_TOKEN=""             # bearer token required to call booking/verification APIs
VITE_API_ACCESS_TOKEN=""
VITE_SUPABASE_URL=""            # enable real auth when set
VITE_SUPABASE_ANON_KEY=""
```

Other supported variables (see `.env.example` for the full list and comments): `SUPABASE_URL` / `SUPABASE_ANON_KEY` (server-side mirror), `CORS_ORIGINS`, `TRUST_PROXY`, `PORT`, `NODE_ENV`, `APP_URL`, `PARKSMART_DATA_DIR`.

> `GEMINI_API_KEY` is intentionally **not** exposed to the browser — AI runs server-side only. `API_ACCESS_TOKEN` is required in any deployed environment; leave it empty for a local demo.

### 3. Enable Google Cloud APIs

In the [Google Cloud Console](https://console.cloud.google.com/):

1. Enable the **Maps JavaScript API**, **Places API (New)**, and **Routes API**
2. Link a billing account (required for map tiles and routes to load)
3. Create an API key restricted to those APIs, with HTTP-referrer restrictions for browser use

### 4. Run the app

```bash
npm run dev
```

Open http://localhost:3000 — the Express server hosts the Vite app in dev mode. For client-only development, run `npx vite` separately.

Other scripts:

```bash
npm run build   # vite build + bundle server to dist/server.cjs
npm start       # run the production server (serves dist/)
npm run lint    # tsc --noEmit
```

## How Parking Discovery Works

1. **Current GPS** — browser geolocation detects your real position (Kolkata fallback when unavailable)
2. **Nearby Search** — `POST https://places.googleapis.com/v1/places:searchNearby` with `includedTypes: ["parking"]` and a progressively expanding circle
3. **Text Search Fallback** — if Nearby Search returns sparse results, falls back to `places:searchText`
4. **Merge + Deduplicate** — combines results from both sources, removes duplicates by Place ID
5. **Photo Enrichment** — Nearby Search ignores the `photos` field, so the first lots are enriched via Place Details (`GET /v1/places/{placeId}`) which returns real photos
6. **Real-time Distance** — device GPS recalculates Haversine distance from your live position
7. **Place Details** — clicking a marker loads full details (hours, phone, wheelchair access)

## Navigation System

The navigation engine (`useNavigationEngine` hook) provides Google Maps-like navigation:

- **Route Fetching** — Google Routes library with request deduplication, abort handling, and a route cache
- **GPS Smoothing** — Kalman filter on raw GPS coordinates
- **Off-route Detection** — triggers reroute when far from the planned route (with hysteresis before clearing)
- **Arrival Detection** — auto-stops navigation near the destination
- **Voice Guidance** — Web Speech API for turn-by-turn announcements
- **Traffic Segments** — color-coded polyline segments based on traffic density
- **Camera Modes** — Following (user-centered), Overview (full route), Destination

## Booking & Verification Flow

1. **Book** — pick a floor + stall in the detail modal, choose duration/vehicle/addons/payment; the server computes pricing (tax included) and returns a PAID booking with a QR token
2. **Pass** — the active pass shows a QR ticket (React `qrcode`), countdown, extend/cancel actions, and "Start internal navigation"
3. **Verify at the gate** — the operator scans the QR (camera + jsQR) or enters the code; the server validates the token and records check-in / check-out / rejection
4. **History** — drivers see upcoming + recent bookings with pass status; owners see verification history and active sessions

## Project Structure

```
server.ts                       # Express API + Vite (dev) / dist (prod) host
src/
├── main.tsx                    # Router mount, VideoBackground (once, outside routes)
├── App.tsx                     # Driver dashboard: search, filters, favorites, parking list + map
├── types.ts                    # ParkingLot, FloorPlan, ParkingStall, Booking, Actor, ...
├── index.css                   # Theme variables, accent presets, @custom-variant dark
├── lib/                        # supabase client, auth abstraction (Supabase or demo fallback)
├── data/appData.ts             # Booking addons catalog, seed data
├── components/
│   ├── Header.tsx              # Search, driver/operator switch, active-booking chip, user menu
│   ├── MapView.tsx             # Google Map with markers, route & navigation overlay
│   ├── ParkingCard.tsx         # Card with MagicBento effects
│   ├── ParkingDetailModal.tsx  # Lot details + garage floor/stall picker
│   ├── BookingModal.tsx        # Booking flow (confetti on success)
│   ├── ActivePassModal.tsx     # Active booking pass with QR + countdown
│   ├── QrTicket.tsx            # QR pass renderer + status badge
│   ├── QrScanner.tsx           # Camera QR scanner (jsQR)
│   ├── AiAssistantDrawer.tsx   # AI Smart Finder (calls /api/parking/recommend)
│   ├── OperatorDashboard.tsx   # Lot claim, pricing, stall map, occupancy chart
│   ├── NotificationsBell.tsx   # Driver notification inbox
│   ├── LoginModal.tsx          # Account modal
│   ├── ThemeCustomizerModal.tsx / ui/curtain-theme-toggle.tsx  # Theming UI
│   ├── ui/sign-in-page.tsx     # /auth/signin and /auth/signup pages
│   ├── VideoBackground.tsx     # Looping MP4 page background
│   ├── ScrollStack.tsx         # Lenis scroll-stacking list sidebar
│   ├── PillNav.tsx             # GSAP pill navigation
│   └── navigation/             # NavigationUI (turn-by-turn panel) + NavigationMap (polylines/markers)
├── components/bookings/        # Driver pages: history, details, QR page
├── components/owner/           # Owner pages: verify, verification result/history, parking sessions
├── hooks/
│   ├── useCurrentLocation.ts   # Geolocation + watchPosition + permission state
│   ├── useNearbyParking.ts     # Nearby search orchestration with caching & debouncing
│   ├── useNavigationEngine.ts  # Navigation state machine, GPS, rerouting
│   └── useMagicEffects.ts      # Particles, tilt, magnetism, glow, ripple
├── services/
│   ├── googlePlacesService.ts  # Places API (New) client (direct REST fetch)
│   ├── parkingService.ts       # Search merge, radius expansion, photo enrichment
│   ├── routingService.ts       # Routes library client with error taxonomy + cache
│   ├── verificationService.ts  # Client for all server booking/owner/notification APIs
│   ├── lotSyncService.ts       # Sync client-discovered lots to the server
│   ├── locationService.ts      # Geolocation helpers
│   └── qrTokenCache.ts         # Client-side QR credential cache
├── server/                     # Server modules bundled into server.ts:
│                               # routes, actor (auth), bookingStore, bookingLifecycle,
│                               # lotOwnership, qrToken, rateLimiter, notifications,
│                               # auditLog, storage
└── utils/                      # distance, distanceMatrix, polyline, placeMapper,
                                # geocoding, duration, currency (INR), crypto, vehicleNumber
```

## API Endpoints

### Core (`server.ts`)

| Endpoint | Description |
|----------|-------------|
| `GET /api/health` | Health check |
| `GET /api/parking/status` | Parking provider status |
| `POST /api/parking/lots/sync` | Sync client-discovered bookable lots (auth required) |
| `POST /api/parking/recommend` | Gemini AI parking recommendation (rate-limited) |
| `POST /api/parking/book` | Book a stall — server-side pricing, QR token generation (auth required) |

### Bookings, verification & owner (`src/server/routes.ts`, auth required)

| Endpoint | Description |
|----------|-------------|
| `GET /api/bookings`, `GET /api/bookings/:id` | List / get bookings |
| `GET /api/bookings/:id/qr` | Fetch QR pass |
| `POST /api/bookings/:id/regenerate-qr` / `cancel` | Regenerate or cancel a booking |
| `POST /api/bookings/verify` | Owner verification (QR scan or code entry) |
| `POST /api/bookings/check-in` / `check-out` / `reject` | Gate actions |
| `POST /api/owner/lots/claim`, `GET /api/owner/lots` | Claim and list owned lots |
| `GET /api/owner/summary` / `active-parking-sessions` / `verifications` | Owner dashboard data |
| `GET /api/notifications`, `POST /api/notifications/read` | Driver notification inbox |

### Google (client-side, direct fetch)

| Endpoint | Description |
|----------|-------------|
| `POST /v1/places:searchNearby` | Find parking near a location |
| `POST /v1/places:searchText` | Text search fallback / geocoding queries |
| `GET /v1/places/{placeId}` | Place details + photos (enrichment) |

## Theme System

The app uses CSS custom properties for theming, with several built-in accent presets:

```css
--color-accent: <hex>;        /* Primary accent */
--color-accent-hover: <hex>;  /* Hover state */
--color-accent-light: <hex>;  /* Light variant */
--color-accent-dark: <hex>;   /* Dark variant */
```

Dark mode uses Tailwind v4's `@custom-variant dark (&:is(.dark *));` for class-based toggling. The theme customizer persists accent, map style, density, contrast, and motion preferences.

## Page Background

The app background is the looping clip `public/parking-background.mp4`, mounted **once** in `src/main.tsx` via `src/components/VideoBackground.tsx`, outside the routes:

```text
.app-background__video   z-index: 0, position: fixed, pointer-events: none
        ↓
.app-background__scrim   theme-aware readability veil
        ↓
application UI           <div class="relative z-10"> around <Routes>
```

Because the layer is `position: fixed`, `overflow: hidden` and `pointer-events: none`, it never introduces a scrollbar, shifts layout, or intercepts clicks.

- **Autoplay** — `autoPlay loop muted playsInline` plus an explicit `video.muted = true` / `volume = 0`
- **No player UI** — no `controls`, `aria-hidden`, and unfocusable (`tabIndex={-1}`)
- **Graceful fallback** — if the video is missing or undecodable (`onError`), the `<video>` element is unmounted and a static fallback background is shown instead
- **Reduced motion** — under `prefers-reduced-motion: reduce` the clip is never requested or played; the fallback stands in (listener is live)
- **Performance** — the download is deferred to `requestIdleCallback` (with `setTimeout` fallback) so it never competes with the app bundle; playback pauses on `visibilitychange`; and the video is promoted to its own compositor layer

## Known Issues

- **Google Places Photos** — Nearby Search silently ignores the `photos` field mask. Photo enrichment via Place Details is required (limited to a few lots per search).
- **Map Tiles / Routing require billing** — the Google Maps JavaScript API and Routes API need a linked billing account on the Cloud project; without it, tiles render black and routing returns `RESOURCE_EXHAUSTED`.
- **Server Hot Reload** — the Express server (`tsx server.ts`) does not hot-reload. Manual restart required for server-side changes.
- **Demo auth** — without `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`, auth falls back to an insecure localStorage SHA-256 flow intended for local demos only; the server refuses demo identity in production.
