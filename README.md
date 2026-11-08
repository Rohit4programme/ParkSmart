# Smart Parking Spot Finder

A modern parking discovery and booking application with glass morphism UI, real-time navigation, and AI-powered recommendations.

## Features

- **Google Maps** — Interactive map with custom dark theme, animated markers, and route display
- **Google Places API (New)** — Real parking discovery via `places:searchNearby` with photo enrichment
- **Real-time Navigation** — Turn-by-turn navigation with GPS tracking, off-route detection, voice guidance, and traffic segments
- **Entrance-based Routing** — Routes to parking lot entrance coordinates when available, not just centroid
- **Glass Morphism UI** — Theme-aware design with CSS variables, dark/light mode, and custom accent colors
- **Video Background** — Looping MP4 page background (`public/parking-background.mp4`) behind every route, with a themed scrim and a static reduced-motion fallback
- **PillNav** — GSAP-animated pill navigation used in Header, MapView controls, and App tabs
- **ScrollStack** — Lenis-powered scroll stacking for the garage list sidebar
- **MagicBento Effects** — Particles, tilt, magnetism, glow border, and click ripple on parking cards
- **AI Smart Finder** — Gemini-powered parking recommendations
- **Modern Authentication** — Split-screen login modal with logo-colored gradient (dark navy + teal)
- **Booking** — Book parking stalls for backend-managed lots
- **Operator Dashboard** — Manage facilities, stalls, and dynamic pricing

## Tech Stack

- **React 19** + **TypeScript**
- **Vite** — Build tool
- **Tailwind CSS v4** — Styling with `@custom-variant dark` for class-based dark mode
- **Google Maps JavaScript API** — Map rendering with `@vis.gl/react-google-maps`
- **Google Places API (New)** — Parking discovery (`searchNearby`, `searchText`, `placeDetails`)
- **Google Routes API** — Route calculation via `@vis.gl/react-google-maps` (Routes library)
- **Supabase** — Authentication (email/password) + optional session verification
- **Express** — Server for Gemini AI and booking APIs
- **Lenis** — Smooth scroll for ScrollStack
- **GSAP** — PillNav animations and MagicBento effects

> The page background is plain HTML5 video — no WebGL/3D runtime is involved.

## Getting Started

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

Copy `.env.example` to `.env.local` and fill in your keys:

```env
GOOGLE_MAPS_PLATFORM_KEY="YOUR_GOOGLE_MAPS_API_KEY"
GEMINI_API_KEY="YOUR_GEMINI_API_KEY"
VITE_SUPABASE_URL="https://your-project.supabase.co"
VITE_SUPABASE_ANON_KEY="your-anon-key"
```

### 3. Enable Google Cloud APIs

In the [Google Cloud Console](https://console.cloud.google.com/):

1. Create a project (or use an existing one)
2. Enable the **Places API (New)**
3. Enable the **Maps JavaScript API**
4. Enable the **Routes API**
5. Link a billing account (required for map tiles and routes to load)
6. Create an API key with the following restrictions:
   - **API restrictions**: Places API (New), Maps JavaScript API, Routes API
   - **Application restrictions**: HTTP referrers (for browser use)

### 4. Run the app

```bash
npm run dev
```

Open http://localhost:3000 (Express serves the Vite app in dev mode).

> For separate client-only development, run `npx vite` in another terminal.

## How Parking Discovery Works

1. **Current GPS** — Browser geolocation API detects your real position
2. **Nearby Search** — `POST https://places.googleapis.com/v1/places:searchNearby` with:
   - `includedTypes: ["parking"]`
   - `locationRestriction.circle` with progressive radius expansion (5km → 10km → 20km)
3. **Text Search Fallback** — If Nearby Search returns sparse results, falls back to `places:searchText`
4. **Merge + Deduplicate** — Combines results from both sources, removes duplicates by Place ID
5. **Photo Enrichment** — Nearby Search silently ignores the `photos` field, so up to 10 lots are enriched via Place Details (`GET /v1/places/{placeId}`) which returns real photos
6. **Real-time Distance** — Device GPS calculates Haversine distance from your current position
7. **Place Details** — Clicking a marker loads full details (hours, phone, wheelchair access, EV chargers)

## Navigation System

The navigation engine (`useNavigationEngine` hook) provides Google Maps-like navigation:

- **Route Fetching** — Google Routes API (ComputeRoutes) via the Routes library, with request deduplication, abort handling, and a 5-minute route cache
- **GPS Smoothing** — Kalman filter on raw GPS coordinates
- **Off-route Detection** — Triggers reroute when >50m from the planned route (30m hysteresis before clearing)
- **Arrival Detection** — Auto-stops navigation when <100m from destination
- **Voice Guidance** — Web Speech API for turn-by-turn announcements
- **Traffic Segments** — Color-coded polyline segments based on traffic density
- **Camera Modes** — Following (user-centered), Overview (full route), Destination
- **Quota Awareness** — `RESOURCE_EXHAUSTED` is mapped to `ROUTING_QUOTA_EXCEEDED`, shown as a clear "Routing quota exceeded" message with Retry disabled until the daily quota resets

### Navigation UI Components

- **NavigationUI** — Top card (next turn, distance, ETA), route info bar, alternative routes, turn-by-turn steps, bottom panel, arrival overlay
- **NavigationMap** — High-quality polylines with glow, user marker with heading cone and accuracy circle, destination marker

## Data Integrity

- **No fake data** — All parking names, addresses, photos, ratings, and hours come from Google
- **No fabricated prices** — Google does not provide parking prices, so the app shows "Pricing not available"
- **No fake availability** — Google does not provide live occupancy, so the app shows "Live availability unavailable"
- **No placeholder images** — If Google provides no photo, the app shows a generic SVG parking graphic

## Project Structure

```
src/
├── components/
│   ├── Header.tsx              # PillNav header with glass effect
│   ├── MapView.tsx             # Google Maps with route display, navigation overlay
│   ├── ParkingCard.tsx         # Parking card with MagicBento effects
│   ├── ParkingDetailModal.tsx  # Full parking details
│   ├── LoginModal.tsx          # Logo-colored split-screen auth
│   ├── ScrollStack.tsx         # Lenis scroll stacking sidebar
│   ├── PillNav.tsx             # GSAP pill navigation
│   ├── PillNav.css             # PillNav styles
│   ├── VideoBackground.tsx      # Looping MP4 page background
│   └── navigation/
│       ├── NavigationUI.tsx    # Full navigation interface
│       ├── NavigationMap.tsx   # Route polylines, markers, camera
│       └── index.ts            # Module exports
├── hooks/
│   ├── useNearbyParking.ts     # Nearby search with caching & debouncing
│   ├── useNavigationEngine.ts  # Navigation state machine, GPS, rerouting
│   └── useMagicEffects.ts      # Particles, tilt, magnetism, glow, ripple
├── services/
│   ├── googlePlacesService.ts  # Google Places API (New) client
│   ├── parkingService.ts       # Parking service with photo enrichment
│   ├── locationService.ts      # Geolocation utilities
│   └── aiService.ts            # Gemini AI integration
├── utils/
│   ├── distance.ts             # Haversine distance calculation
│   ├── distanceMatrix.ts       # Driving time estimates
│   └── currency.ts             # INR formatting
├── types.ts                    # TypeScript types (ParkingLot, VehicleProfile, etc.)
└── index.css                   # Global styles, theme variables, @custom-variant dark
```

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `POST /v1/places:searchNearby` | Find parking near a location (client-side) |
| `GET /v1/places/{placeId}` | Get parking details + photos (client-side) |
| `POST /v1/places:searchText` | Geocode search queries (client-side) |
| `POST /api/parking/recommend` | Gemini AI parking recommendation |
| `POST /api/parking/book` | Book a parking stall |
| `GET /api/parking/status` | Check parking provider status |

## Theme System

The app uses CSS custom properties for theming:

```css
--color-accent: <hex>;        /* Primary accent (default: amber) */
--color-accent-hover: <hex>;  /* Hover state */
--color-accent-light: <hex>;  /* Light variant */
--color-accent-dark: <hex>;   /* Dark variant */
```

Dark mode uses Tailwind v4's `@custom-variant dark (&:is(.dark *));` for class-based toggling.

## Page Background

The app background is the supplied clip, `public/parking-background.mp4` (1920×1080, H.264, no audio track). It replaces the previous WebGL shader background, which has been removed along with `src/components/ui/atc-shader.tsx`.

`src/components/VideoBackground.tsx` is mounted **once** in `src/main.tsx`, outside the routes, and builds this stack:

```text
.app-background__video   z-index: 0, position: fixed, pointer-events: none
        ↓
.app-background__scrim   theme-aware readability veil
        ↓
application UI           <div class="relative z-10"> around <Routes>
```

Because the layer is `position: fixed`, `overflow: hidden` and `pointer-events: none`, it cannot introduce a scrollbar, shift layout, or intercept a click — every button, input, card, nav and modal above it stays interactive. The `<video>` uses `object-fit: cover` with `object-position: center`, so the 16:9 aspect ratio is preserved and the area is always fully covered.

Behaviour worth knowing:

- **Autoplay** — `autoPlay loop muted playsInline` plus an explicit `video.muted = true` / `volume = 0`; the DOM *property* is what unlocks autoplay on iOS and Android.
- **No player UI** — `controls` is never set, and the element is `aria-hidden` and unfocusable (`tabIndex={-1}`) because the clip is purely decorative.
- **Graceful fallback** — `public/parking-background-poster.jpg` is a real frame pulled from the clip at 20 s. It is used as the `<video poster>`, as the layer's CSS background while the clip buffers, and as the static background if the file is missing or undecodable (`onError` unmounts the `<video>` so no broken element is shown).
- **Reduced motion** — under `prefers-reduced-motion: reduce` the clip is never requested and never plays; the poster stands in. The listener is live, so toggling the OS setting applies immediately.
- **Performance** — the ~10 MB download is deferred to `requestIdleCallback` (with a timeout and a `setTimeout` fallback) so it never competes with the app bundle; playback pauses on `visibilitychange`; and the video is promoted to its own compositor layer so the loop never repaints the page.
- **Overlay** — the scrim is `rgba(248,250,252,0.42)` in light mode and `rgba(2,6,23,0.38)` in dark mode. It is deliberately light in light mode: that theme renders dark text, so it needs a light wash to stay legible, and a dark veil there would only crush an already dark clip.

## Known Issues

- **Google Places Photos** — Nearby Search silently ignores the `photos` field mask. Photo enrichment via Place Details is required (limited to 10 lots per search).
- **Map Tiles / Routing require billing** — The Google Maps JavaScript API and Routes API need a linked billing account on the Cloud project; without it, tiles render black and routing returns `RESOURCE_EXHAUSTED`.
- **Server Hot Reload** — The Express server (`tsx server.ts`) does not hot-reload. Manual restart required for server-side changes.
