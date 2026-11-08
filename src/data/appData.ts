import { BookingAddon, GateLog, Booking, ParkingLot } from '../types';

/** Optional premium services sold per booking. Prices in INR (₹).
 *  Single source of truth: the server reprices addons from this catalog
 *  and drops anything not found here (see server.ts validateAddons). */
export const BOOKING_ADDONS: BookingAddon[] = [
  {
    id: 'ev_charge',
    name: 'EV Charging Top-up',
    price: 150,
    description: '7 kW AC charger for your EV session (charged per session)',
  },
  {
    id: 'car_wash',
    name: 'Express Car Wash',
    price: 199,
    description: 'Quick exterior wash while your car is parked',
  },
  {
    id: 'valet',
    name: 'Valet Parking',
    price: 250,
    description: 'Door-to-door valet drop-off and pickup',
  },
  {
    id: 'theft_protection',
    name: 'Theft & Damage Protection',
    price: 99,
    description: 'CCTV-monitored premium bay with insurance cover',
  },
  {
    id: 'near_exit_premium',
    name: 'Premium Spot Near Exit',
    price: 120,
    description: 'Guaranteed wide bay closest to the gate',
  },
];

export const PARKING_LOTS: ParkingLot[] = [];

export const GATE_LOGS: GateLog[] = [];

export const RECENT_BOOKINGS: Booking[] = [];
