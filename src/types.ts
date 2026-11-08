export type SpotType = 'standard' | 'compact' | 'suv' | 'ev' | 'disabled' | 'valet';

export type SpotStatus = 'available' | 'occupied' | 'reserved' | 'maintenance';

export interface ParkingStall {
  id: string;
  code: string;
  floor: string;
  type: SpotType;
  status: SpotStatus;
  priceModifier?: number;
  hasEvCharger?: boolean;
  evKw?: number;
  isWide?: boolean;
  nearExit?: boolean;
}

export interface FloorPlan {
  id: string;
  name: string;
  level: number;
  totalStalls: number;
  availableStalls: number;
  stalls: ParkingStall[];
}

export interface HourlyDemand {
  hour: string;
  occupancyPercent: number;
}

export interface Review {
  id: string;
  userName: string;
  userAvatar?: string;
  rating: number;
  date: string;
  vehicleType?: string;
  comment: string;
  helpfulCount?: number;
  isVerifiedBooking?: boolean;
}

export type ParkingDataSource = 'google_places' | 'backend';

/** Google Places API (New) photo reference */
export interface PlacePhoto {
  name: string;
  heightPx?: number;
  widthPx?: number;
  authorAttributions?: Array<{ displayName: string; uri: string; photoUri: string }>;
}

/** Google Places API (New) opening hours period */
export interface PlaceOpeningHoursPeriod {
  open?: { day: number; hour: number; minute: number };
  close?: { day: number; hour: number; minute: number };
}

/** Google Places API (New) current opening hours */
export interface PlaceCurrentOpeningHours {
  openNow?: boolean;
  periods?: PlaceOpeningHoursPeriod[];
  weekdayDescriptions?: string[];
}

/** Google Places API (New) EV charge options */
export interface PlaceEvChargeOptions {
  connectorCount?: number;
  connectorAggregation?: Array<{
    type: string;
    count: number;
    maxChargeRateKw?: number;
  }>;
}

/** Google Places API (New) payment options */
export interface PlacePaymentOptions {
  acceptsCreditCards?: boolean;
  acceptsDebitCards?: boolean;
  acceptsCashOnly?: boolean;
  acceptsNfc?: boolean;
}

/** Google Places API (New) viewport */
export interface PlaceViewport {
  low: { latitude: number; longitude: number };
  high: { latitude: number; longitude: number };
}

export interface ParkingLot {
  id: string;
  placeId: string;
  name: string;
  displayName: string;
  formattedAddress: string;
  address: string;
  city: string;
  lat: number;
  lng: number;
  /** Entrance coordinates — if available, routing should use these instead of lat/lng */
  entranceLat?: number;
  entranceLng?: number;
  /** Source of this parking lot data: 'google_places' for Google Places API (New), 'backend' for own database */
  dataSource: ParkingDataSource;
  /** True if this lot is bookable through the app's own backend database */
  isBookable: boolean;
  /** Google rating (0-5) — only present when Google provides it */
  rating?: number;
  /** Google review count — only present when Google provides it */
  userRatingCount?: number;
  /** Google business status — only present when Google provides it */
  businessStatus?: string;
  /** Google current opening hours — only present when Google provides it */
  currentOpeningHours?: PlaceCurrentOpeningHours;
  /** Google photos — only present when Google provides them */
  photos?: PlacePhoto[];
  /** Google Maps URI for this place */
  googleMapsUri?: string;
  /** Google website URI — only present when Google provides it */
  websiteUri?: string;
  /** Google national phone number — only present when Google provides it */
  nationalPhoneNumber?: string;
  /** Google wheelchair accessible — only present when Google provides it */
  wheelchairAccessible?: boolean;
  /** Google EV charge options — only present when Google provides them */
  evChargeOptions?: PlaceEvChargeOptions;
  /** Google payment options — only present when Google provides them */
  paymentOptions?: PlacePaymentOptions;
  /** Google viewport — only present when Google provides it */
  viewport?: PlaceViewport;
  /** Distance from search center in km (computed client-side) */
  distanceKm: number;
  /** Opening hours summary string (derived from currentOpeningHours) */
  openingHours?: string;
  /** Legacy fields kept for backward compatibility with booking flow */
  pricePerHour?: number;
  dailyMaxPrice?: number;
  reviewCount?: number;
  walkingMinutes?: number;
  totalSpots?: number;
  availableSpots?: number;
  evChargersCount?: number;
  disabledSpotsCount?: number;
  heightClearanceMeters?: number;
  isCovered?: boolean;
  is24x7?: boolean;
  hasSecurity?: boolean;
  hasValet?: boolean;
  hasCarWash?: boolean;
  imageUrl?: string;
  operator?: string;
  fee?: string;
  capacity?: number;
  surface?: string;
  access?: string;
  floors?: FloorPlan[];
  hourlyDemand?: HourlyDemand[];
  reviews?: Review[];
}

export interface VehicleProfile {
  id: string;
  nickname?: string;
  makeModel: string;
  vehiclePlate: string;
  type?: SpotType;
  color?: string;
  isDefault?: boolean;
}

export interface UserAccount {
  id: string;
  email: string;
  name: string;
  vehiclePlate: string;
  vehicleModel: string;
  vehicles?: VehicleProfile[];
  isE2EEEnabled: boolean;
  e2eeSaltHex?: string;
  e2eeIvHex?: string;
  encryptedVaultCipher?: string;
  createdAt: string;
}

export interface VehicleInfo {
  plateNumber: string;
  makeModel: string;
  type: SpotType;
  color: string;
}

export interface BookingAddon {
  id: string;
  name: string;
  price: number;
  description: string;
}

/** Full booking lifecycle state machine (server-side source of truth).
 *  See src/server/bookingLifecycle.ts for the permitted transitions. */
export type BookingStatus =
  | 'PENDING_PAYMENT'
  | 'PAYMENT_FAILED'
  | 'CONFIRMED'
  | 'ACTIVE'
  | 'CHECKED_IN'
  | 'CHECKED_OUT'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'EXPIRED'
  | 'REJECTED'
  | 'CANCELLED_BY_OWNER';

export type PaymentStatus = 'PENDING' | 'PAID' | 'FAILED' | 'REFUNDED';

/** Derived, human-facing QR pass state shown to the driver. */
export type QrPassStatus =
  | 'NOT_ACTIVE_YET'
  | 'ACTIVE'
  | 'CHECKED_IN'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'EXPIRED';

export interface Booking {
  id: string;
  lotId: string;
  lotName: string;
  lotAddress: string;
  stallId: string;
  stallCode: string;
  floorName: string;
  startTime: string;
  endTime: string;
  durationHours: number;
  vehicle: VehicleInfo;
  addons: BookingAddon[];
  basePrice: number;
  addonsPrice: number;
  tax: number;
  totalPrice: number;
  qrCodeData: string;
  status: 'active' | 'completed' | 'cancelled';
  createdAt: string;
  lotLat: number;
  lotLng: number;

  // ── QR verification & vehicle authentication (server-managed) ────────────
  /** Normalized registration number (see utils/vehicleNumber.ts). */
  vehicleNumber?: string;
  /** Authoritative lifecycle status. `status` above is kept for backward
   *  compatibility with the existing UI and is derived from this value. */
  bookingStatus?: BookingStatus;
  paymentStatus?: PaymentStatus;
  paymentMethod?: string;
  /** Owner of the parking location at booking time (informational — the
   *  owner check always re-reads the live lot-ownership record). */
  parkingOwnerId?: string | null;
  userId?: string | null;
  /** Short human-typable fallback code shown on the ticket. Never grants
   *  access on its own: the backend runs the full verification algorithm. */
  verifyCode?: string;
  qrCreatedAt?: string;
  qrExpiresAt?: string;
  qrRevokedAt?: string | null;
  checkInTime?: string;
  checkOutTime?: string;
  verifiedByOwnerId?: string | null;
  verificationTime?: string;
  checkedOutBy?: string | null;
  cancelledAt?: string;
  updatedAt?: string;
  /** Derived only — never persisted as authority. */
  qrStatus?: QrPassStatus;
}

// ── QR verification system ───────────────────────────────────────────────────

/** Structured failure reasons returned by POST /api/bookings/verify. */
export type VerificationReasonCode =
  | 'QR_INVALID'
  | 'QR_EXPIRED'
  | 'BOOKING_NOT_FOUND'
  | 'BOOKING_CANCELLED'
  | 'BOOKING_EXPIRED'
  | 'BOOKING_REJECTED'
  | 'PAYMENT_NOT_COMPLETED'
  | 'WRONG_PARKING_OWNER'
  | 'ALREADY_CHECKED_IN'
  | 'ALREADY_COMPLETED'
  | 'INVALID_TIME'
  | 'TOKEN_REVOKED'
  | 'UNAUTHENTICATED'
  | 'RATE_LIMITED'
  | 'NOT_FOUND'
  | 'SERVER_ERROR';

export interface VerificationSuccess {
  valid: true;
  status: 'VALID';
  reason: 'OK';
  message: string;
  bookingId: string;
  vehicleNumber: string;
  vehicleModel?: string;
  parkingSpot: string;
  parkingName: string;
  parkingLocationId: string;
  startTime: string;
  endTime: string;
  paymentStatus: PaymentStatus;
  bookingStatus: BookingStatus;
  canCheckIn: boolean;
  checkInTime?: string;
  checkOutTime?: string;
}

export interface VerificationFailure {
  valid: false;
  status: 'INVALID' | 'WARNING';
  reason: VerificationReasonCode;
  message: string;
  /** Only present when the token/code resolved to a real booking. */
  bookingId?: string;
  vehicleNumber?: string;
  parkingSpot?: string;
  parkingName?: string;
  startTime?: string;
  endTime?: string;
  paymentStatus?: PaymentStatus;
  bookingStatus?: BookingStatus;
  canCheckIn: false;
}

export type VerificationResult = VerificationSuccess | VerificationFailure;

/** Audit-trail entry written for every verification attempt / gate action. */
export type VerificationAction =
  | 'QR_SCANNED'
  | 'BOOKING_VERIFIED'
  | 'CHECK_IN_APPROVED'
  | 'CHECK_IN_REJECTED'
  | 'CHECK_OUT'
  | 'INVALID_QR'
  | 'EXPIRED_QR'
  | 'WRONG_OWNER'
  | 'QR_REGENERATED'
  | 'QR_REVOKED'
  | 'BOOKING_CANCELLED'
  | 'LOT_CLAIMED';

export interface VerificationAuditEntry {
  id: string;
  bookingId: string | null;
  ownerId: string;
  parkingLocationId: string | null;
  action: VerificationAction;
  result: 'success' | 'failure';
  reason: string;
  detail?: string;
  timestamp: string;
  ip?: string;
}

/** Aggregated owner dashboard counters (Parking Verification card). */
export interface OwnerVerificationSummary {
  ownedLotIds: string[];
  activeBookings: number;
  checkedIn: number;
  awaitingEntry: number;
}

export interface ActiveParkingSession {
  bookingId: string;
  vehicleNumber: string;
  vehicleModel?: string;
  parkingSpot: string;
  floorName?: string;
  parkingName: string;
  parkingLocationId: string;
  checkInTime: string;
  checkOutTime?: string;
  durationMinutes: number;
  bookingStatus: BookingStatus;
}

export interface ParkSmartNotification {
  id: string;
  userId: string;
  type: 'CHECK_IN' | 'CHECK_OUT' | 'BOOKING' | 'SYSTEM';
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
  bookingId?: string;
}

/** Actor identity resolved server-side from the request (never from a body). */
export type ActorKind = 'supabase' | 'access_token' | 'demo';

export interface Actor {
  id: string;
  email?: string;
  name?: string;
  kind: ActorKind;
  /** True when the identity was cryptographically verified by an auth
   *  provider. False for demo/fallback identities. */
  verified: boolean;
}

export interface AiRecommendationRequest {
  vehicleType: SpotType;
  durationHours: number;
  destination: string;
  maxBudget?: number;
  needsEvCharging?: boolean;
  needsAccessible?: boolean;
  preferredSpotTrait?: 'nearest_exit' | 'widest_space' | 'cheapest' | 'highest_security';
}

export interface AiRecommendation {
  recommendedLotId: string;
  recommendedStallCode: string;
  matchScorePercent: number;
  headline: string;
  explanation: string;
  keyBenefits: string[];
  estimatedCost: number;
}

export interface GateLog {
  id: string;
  timestamp: string;
  plateNumber: string;
  event: 'entry' | 'exit';
  stallCode: string;
  gateName: string;
  status: 'verified' | 'flagged';
}

export type ThemeMode = 'light' | 'dark' | 'system';
export type AccentColor = 'blue' | 'emerald' | 'violet' | 'amber' | 'rose' | 'slate';
export type MapStyleTheme = 'standard' | 'dark' | 'satellite' | 'cyberpunk';
export type UiDensity = 'comfortable' | 'compact';

export interface ThemeConfig {
  mode: ThemeMode;
  accent: AccentColor;
  mapStyle: MapStyleTheme;
  density: UiDensity;
  highContrast: boolean;
  reduceMotion: boolean;
}