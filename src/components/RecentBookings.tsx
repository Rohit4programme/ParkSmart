import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Booking, BookingStatus } from '../types';
import { formatINR } from '../utils/currency';
import {
  History,
  RotateCcw,
  MapPin,
  Car,
  Clock,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  Ticket,
  Zap,
  ArrowRight,
} from 'lucide-react';

interface Props {
  bookings: Booking[];
  onRebook: (booking: Booking) => void;
  onViewPass?: (booking: Booking) => void;
}

/** Icon + label for every lifecycle state — never colour alone. */
const STATUS_META: Record<BookingStatus, { label: string; className: string }> = {
  PENDING_PAYMENT: { label: 'Awaiting payment', className: 'bg-amber-50 text-amber-800 border-amber-300' },
  PAYMENT_FAILED: { label: 'Payment failed', className: 'bg-rose-50 text-rose-800 border-rose-300' },
  CONFIRMED: { label: 'Confirmed', className: 'bg-blue-50 text-blue-800 border-blue-300' },
  ACTIVE: { label: 'Active now', className: 'bg-emerald-50 text-emerald-800 border-emerald-300' },
  CHECKED_IN: { label: 'Checked in', className: 'bg-indigo-50 text-indigo-800 border-indigo-300' },
  CHECKED_OUT: { label: 'Checked out', className: 'bg-slate-100 text-slate-700 border-slate-300' },
  COMPLETED: { label: 'Completed', className: 'bg-slate-100 text-slate-700 border-slate-300' },
  CANCELLED: { label: 'Cancelled', className: 'bg-rose-50 text-rose-800 border-rose-300' },
  CANCELLED_BY_OWNER: { label: 'Cancelled by lot', className: 'bg-rose-50 text-rose-800 border-rose-300' },
  EXPIRED: { label: 'Expired', className: 'bg-rose-50 text-rose-800 border-rose-300' },
  REJECTED: { label: 'Entry refused', className: 'bg-rose-50 text-rose-800 border-rose-300' },
};

const formatWindow = (startIso: string, endIso: string): string => {
  try {
    const start = new Date(startIso);
    const end = new Date(endIso);
    const sameDay = start.toDateString() === end.toDateString();
    const day = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const from = start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const to = end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return sameDay ? `${day} · ${from} – ${to}` : `${day} ${from} → ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} ${to}`;
  } catch {
    return `${startIso} – ${endIso}`;
  }
};

export const RecentBookings: React.FC<Props> = ({ bookings, onRebook, onViewPass }) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const navigate = useNavigate();

  if (bookings.length === 0) return null;

  return (
    <div className="bg-white border border-slate-200 rounded-3xl p-4 sm:p-5 shadow-xs space-y-4">
      
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-blue-50 text-blue-600 rounded-xl border border-blue-200 shrink-0">
            <History className="w-4 h-4 stroke-[2.5]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-extrabold text-slate-900 tracking-tight">
                Recent Parking Sessions
              </h3>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200/80 font-mono">
                {bookings.length} Saved
              </span>
            </div>
            <p className="text-[11px] text-slate-500 font-medium">
              Quick 1-click rebooking for your favorite parking spots
            </p>
          </div>
        </div>

        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
          title={isExpanded ? 'Collapse section' : 'Expand section'}
        >
          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>

      {isExpanded && (
        <div className="space-y-3 pt-1">
          {bookings.map((item) => {
            const status: BookingStatus = item.bookingStatus ?? (item.status === 'active' ? 'ACTIVE' : item.status === 'cancelled' ? 'CANCELLED' : 'COMPLETED');
            const meta = STATUS_META[status] ?? STATUS_META.COMPLETED;
            const isActive = status === 'ACTIVE' || status === 'CHECKED_IN' || status === 'CONFIRMED';

            return (
              <div
                key={item.id}
                className="group relative bg-slate-50 hover:bg-slate-50/80 border border-slate-200/80 rounded-2xl p-3.5 transition-all duration-200 hover:shadow-2xs"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  
                  <div className="space-y-1.5 flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-extrabold text-slate-900 text-sm truncate">
                        {item.lotName}
                      </span>

                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border shrink-0 ${meta.className}`}
                      >
                        {isActive ? (
                          <span className="w-1.5 h-1.5 rounded-full bg-current animate-ping" aria-hidden="true" />
                        ) : (
                          <CheckCircle2 className="w-3 h-3" aria-hidden="true" />
                        )}
                        {meta.label}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600 font-medium">
                      <span className="flex items-center gap-1 text-slate-500">
                        <MapPin className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                        <span className="truncate">{item.lotAddress}</span>
                      </span>

                      <span className="font-mono font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-100 shrink-0">
                        Stall {item.stallCode}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500 font-medium pt-0.5">
                      <span className="flex items-center gap-1">
                        <Car className="w-3 h-3 text-slate-400" />
                        <span className="font-mono font-bold text-slate-700">
                          {item.vehicleNumber || item.vehicle.plateNumber}
                        </span>
                        <span className="text-slate-500">· {item.vehicle.makeModel || 'Vehicle'}</span>
                      </span>

                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3 text-slate-400" />
                        <span>{item.durationHours}h · {formatWindow(item.startTime, item.endTime)}</span>
                      </span>

                      {item.addons && item.addons.length > 0 && (
                        <span className="flex items-center gap-1 text-indigo-600 font-semibold">
                          <Zap className="w-3 h-3 text-indigo-500" />
                          <span>{item.addons.map((a) => a.name).join(', ')}</span>
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-200/60">
                    <div className="text-right sm:pr-1">
                      <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                        Total Paid
                      </div>
                      <div className="text-sm font-black text-slate-900 font-mono">
                        {formatINR(item.totalPrice)}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {isActive && onViewPass && (
                        <button
                          onClick={() => onViewPass(item)}
                          className="px-3 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold rounded-xl text-xs border border-emerald-200 transition-all flex items-center gap-1.5 cursor-pointer"
                        >
                          <Ticket className="w-3.5 h-3.5 text-emerald-600" />
                          <span>View Pass</span>
                        </button>
                      )}

                      <button
                        onClick={() => navigate(`/user/bookings/${item.id}`)}
                        className="px-3 py-2 bg-white hover:bg-slate-100 text-slate-700 font-bold rounded-xl text-xs border border-slate-200 transition-all flex items-center gap-1.5 cursor-pointer"
                      >
                        <ArrowRight className="w-3.5 h-3.5 text-slate-500" />
                        <span>Details</span>
                      </button>

                      <button
                        onClick={() => onRebook(item)}
                        className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-extrabold rounded-xl text-xs shadow-xs hover:shadow-md hover:shadow-blue-500/20 transition-all flex items-center gap-1.5 cursor-pointer shrink-0"
                      >
                        <RotateCcw className="w-3.5 h-3.5 stroke-[2.5]" />
                        <span>Rebook</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
