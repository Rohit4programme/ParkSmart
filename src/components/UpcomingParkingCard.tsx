import React from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarClock, Car, MapPin, QrCode, Ticket } from 'lucide-react';
import { Booking, BookingStatus } from '../types';
import { QrStatusBadge } from './QrTicket';
import { formatVehicleNumberForDisplay } from '../utils/vehicleNumber';

/** Booking states where the driver still has something to do at the gate. */
const UPCOMING_STATUSES: BookingStatus[] = ['PENDING_PAYMENT', 'CONFIRMED', 'ACTIVE', 'CHECKED_IN'];

const formatWindow = (startIso: string, endIso: string): string => {
  try {
    const start = new Date(startIso);
    const end = new Date(endIso);
    const day = start.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    const from = start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const to = end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return `${day} · ${from} – ${to}`;
  } catch {
    return `${startIso} – ${endIso}`;
  }
};

interface Props {
  booking: Booking;
  onOpenPass: () => void;
}

/**
 * Driver dashboard card for the booking that still needs a gate QR scan.
 * Everything shown (status, window, plate) comes from the server booking.
 */
export const UpcomingParkingCard: React.FC<Props> = ({ booking, onOpenPass }) => {
  const navigate = useNavigate();
  const status: BookingStatus =
    booking.bookingStatus ?? (booking.status === 'cancelled' ? 'CANCELLED' : booking.status === 'completed' ? 'COMPLETED' : 'CONFIRMED');

  if (!UPCOMING_STATUSES.includes(status)) return null;

  const plate = formatVehicleNumberForDisplay(booking.vehicleNumber || booking.vehicle.plateNumber);

  return (
    <section
      aria-label="Upcoming parking"
      className="mb-4 sm:mb-5 bg-gradient-to-r from-blue-700 via-blue-600 to-indigo-700 text-white rounded-3xl p-4 sm:p-5 shadow-lg border border-blue-500/30 relative overflow-hidden"
    >
      <div className="absolute -right-8 -bottom-10 w-32 h-32 bg-white/10 rounded-full blur-2xl pointer-events-none" />

      <div className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="min-w-0 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest bg-white/15 border border-white/25 rounded-full px-2.5 py-1">
              <CalendarClock className="w-3 h-3" aria-hidden="true" /> Upcoming parking
            </span>
            {booking.qrStatus && <QrStatusBadge status={booking.qrStatus} />}
          </div>

          <h3 className="text-base sm:text-lg font-black tracking-tight truncate">{booking.lotName}</h3>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-semibold text-blue-100">
            <span className="flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span className="truncate max-w-[220px]">{booking.lotAddress}</span>
            </span>
            <span className="flex items-center gap-1">
              <Ticket className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              Stall {booking.stallCode} · {formatWindow(booking.startTime, booking.endTime)}
            </span>
            <span className="inline-flex items-center gap-1.5 bg-slate-900/60 border border-white/20 rounded-lg px-2 py-0.5 font-mono font-black text-white text-xs tracking-wider">
              <Car className="w-3 h-3" aria-hidden="true" />
              {plate || '—'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onOpenPass}
            className="px-3.5 py-2.5 bg-white hover:bg-blue-50 text-blue-700 font-black rounded-xl text-xs transition-all shadow-md flex items-center gap-1.5 cursor-pointer"
          >
            <QrCode className="w-4 h-4" aria-hidden="true" />
            <span>Show QR Pass</span>
          </button>
          <button
            type="button"
            onClick={() => navigate(`/user/bookings/${booking.id}`)}
            className="px-3.5 py-2.5 bg-white/15 hover:bg-white/25 border border-white/25 text-white font-bold rounded-xl text-xs transition-all flex items-center gap-1.5 cursor-pointer"
          >
            Details
          </button>
        </div>
      </div>
    </section>
  );
};

export default UpcomingParkingCard;
