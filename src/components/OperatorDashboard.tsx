import React, { useCallback, useEffect, useState, useMemo } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell,
} from 'recharts';
import { Link } from 'react-router-dom';
import { ParkingLot, OwnerVerificationSummary, VerificationAuditEntry } from '../types';
import { formatINR, formatINRPerHour } from '../utils/currency';
import {
  Building2,
  TrendingUp,
  DollarSign,
  Car,
  Zap,
  Activity,
  Sliders,
  ShieldCheck,
  RefreshCw,
  Plus,
  AlertTriangle,
  CheckCircle2,
  BarChart3,
  Clock,
  Scan,
  History,
  LogIn,
  MapPin,
} from 'lucide-react';
import {
  claimLot,
  getOwnerSummary,
  getVerificationHistory,
  listOwnedLots,
} from '../services/verificationService';
import NotificationsBell from './NotificationsBell';
import VerifyBookingPanel from './owner/VerifyBookingPanel';
import VerificationHistoryPanel, { ACTION_LABELS } from './owner/VerificationHistoryPanel';
import ParkingSessionsPanel from './owner/ParkingSessionsPanel';

interface Props {
  parkingLots: ParkingLot[];
  onUpdateLot: (updatedLots: ParkingLot[]) => void;
}

type OwnerSection = 'overview' | 'verify' | 'sessions' | 'history';

const SECTIONS: Array<{ key: OwnerSection; label: string; icon: React.ReactNode }> = [
  { key: 'overview', label: 'Overview', icon: <Building2 className="w-3.5 h-3.5" aria-hidden="true" /> },
  { key: 'verify', label: 'Verify Booking', icon: <Scan className="w-3.5 h-3.5" aria-hidden="true" /> },
  { key: 'sessions', label: 'Parking Sessions', icon: <Car className="w-3.5 h-3.5" aria-hidden="true" /> },
  { key: 'history', label: 'Verification History', icon: <History className="w-3.5 h-3.5" aria-hidden="true" /> },
];

export const OperatorDashboard: React.FC<Props> = ({
  parkingLots,
  onUpdateLot,
}) => {
  const [selectedLotId, setSelectedLotId] = useState<string>(parkingLots[0]?.id || '');
  const [isSurgePricing, setIsSurgePricing] = useState(true);

  // ── QR verification (owner scope) ────────────────────────────────────────
  const [section, setSection] = useState<OwnerSection>('overview');
  const [summary, setSummary] = useState<OwnerVerificationSummary | null>(null);
  const [ownedLotIds, setOwnedLotIds] = useState<string[]>([]);
  const [recentEvents, setRecentEvents] = useState<VerificationAuditEntry[]>([]);
  const [todayChecks, setTodayChecks] = useState<{ success: number; failure: number }>({ success: 0, failure: 0 });
  const [claimBusy, setClaimBusy] = useState(false);
  const [claimMessage, setClaimMessage] = useState('');
  const [claimError, setClaimError] = useState(false);

  const refreshVerificationData = useCallback(async () => {
    const [summaryRes, ownedRes, historyRes] = await Promise.all([
      getOwnerSummary(),
      listOwnedLots(),
      getVerificationHistory({ limit: 100 }),
    ]);
    if (summaryRes.ok === true) setSummary(summaryRes.data);
    if (ownedRes.ok === true) setOwnedLotIds(ownedRes.data);
    if (historyRes.ok === true) {
      setRecentEvents(historyRes.data.slice(0, 8));
      const midnight = new Date();
      midnight.setHours(0, 0, 0, 0);
      const today = historyRes.data.filter((entry) => new Date(entry.timestamp).getTime() >= midnight.getTime());
      setTodayChecks({
        success: today.filter((entry) => entry.result === 'success').length,
        failure: today.filter((entry) => entry.result === 'failure').length,
      });
    }
  }, []);

  useEffect(() => {
    void refreshVerificationData();
  }, [refreshVerificationData]);

  // Refresh the counters whenever the owner returns to the dashboard.
  useEffect(() => {
    if (section === 'overview') void refreshVerificationData();
  }, [section, refreshVerificationData]);

  const isCurrentLotOwned = selectedLotId ? ownedLotIds.includes(selectedLotId) : false;

  const handleClaimLot = async () => {
    if (!currentLotForClaim) return;
    setClaimBusy(true);
    setClaimMessage('');
    setClaimError(false);
    const res = await claimLot(currentLotForClaim.id, currentLotForClaim.name);
    setClaimBusy(false);
    if (res.ok === true) {
      setClaimMessage(
        res.data.alreadyOwned
          ? `${currentLotForClaim.name} is already registered to you.`
          : `${currentLotForClaim.name} is now registered to your account.`
      );
      await refreshVerificationData();
    } else {
      setClaimError(true);
      setClaimMessage(res.error.message);
    }
  };

  const currentLot = parkingLots.find((l) => l.id === selectedLotId) || parkingLots[0] || null;
  const currentLotForClaim = parkingLots.find((l) => l.id === selectedLotId) || null;

  const totalSpotsAll = parkingLots.reduce((sum, l) => sum + (l.totalSpots ?? 0), 0);
  const freeSpotsAll = parkingLots.reduce((sum, l) => sum + (l.availableSpots ?? 0), 0);
  const occupiedSpotsAll = totalSpotsAll - freeSpotsAll;
  const occupancyPercent = totalSpotsAll > 0 ? Math.round((occupiedSpotsAll / totalSpotsAll) * 100) : 0;

  const hourlyData = useMemo(() => {
    if (!currentLot) {
      return [];
    }

    const lotRatio = (currentLot.totalSpots ?? 0) / 150;
    const baseHours = [
      { hour: '06:00', base: 14 },
      { hour: '07:00', base: 28 },
      { hour: '08:00', base: 56 },
      { hour: '09:00', base: 64 },
      { hour: '10:00', base: 48 },
      { hour: '11:00', base: 42 },
      { hour: '12:00', base: 58 },
      { hour: '13:00', base: 50 },
      { hour: '14:00', base: 44 },
      { hour: '15:00', base: 54 },
      { hour: '16:00', base: 70 },
      { hour: '17:00', base: 82 },
      { hour: '18:00', base: 65 },
      { hour: '19:00', base: 45 },
      { hour: '20:00', base: 32 },
      { hour: '21:00', base: 20 },
      { hour: '22:00', base: 12 },
    ];

    return baseHours.map((item) => {
      const bookings = Math.round(item.base * lotRatio);
      return {
        hour: item.hour,
        bookings,
        revenue: Math.round(bookings * (currentLot.pricePerHour ?? 0)),
      };
    });
  }, [currentLot]);

  const totalBookingsToday = useMemo(
    () => hourlyData.reduce((acc, curr) => acc + curr.bookings, 0),
    [hourlyData]
  );
  const peakHourItem = useMemo(() => {
    return [...hourlyData].sort((a, b) => b.bookings - a.bookings)[0];
  }, [hourlyData]);

  const sectionNav = (
    <nav aria-label="Operator dashboard sections" className="flex flex-wrap gap-1.5 bg-white border border-slate-200 p-1.5 rounded-2xl shadow-2xs w-fit max-w-full overflow-x-auto">
      {SECTIONS.map((item) => {
        const active = section === item.key;
        return (
          <button
            key={item.key}
            type="button"
            onClick={() => setSection(item.key)}
            aria-current={active ? 'page' : undefined}
            className={`px-3 py-2 rounded-xl text-xs font-extrabold flex items-center gap-1.5 whitespace-nowrap transition-colors cursor-pointer ${
              active
                ? 'bg-blue-600 text-white shadow-xs'
                : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            {item.icon}
            <span>{item.label}</span>
            {item.key === 'verify' && summary && summary.awaitingEntry > 0 ? (
              <span
                className={`ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-black ${
                  active ? 'bg-white/20 text-white' : 'bg-amber-100 text-amber-800 border border-amber-200'
                }`}
              >
                {summary.awaitingEntry} waiting
              </span>
            ) : null}
          </button>
        );
      })}
    </nav>
  );

  // ── Owner verification sections (independent of lot inventory) ──────────
  if (section !== 'overview') {
    return (
      <div className="space-y-5">
        {sectionNav}

        <div className="bg-white border border-slate-200 p-4 rounded-2xl shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <span className="p-2 bg-blue-50 text-blue-600 rounded-xl border border-blue-200 shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-extrabold text-slate-900 uppercase tracking-wider">Gate verification</p>
              <p className="text-[11px] text-slate-500 font-medium truncate">
                {summary
                  ? `${summary.checkedIn} checked in · ${summary.awaitingEntry} awaiting entry · ${summary.ownedLotIds.length} facility(ies) registered`
                  : 'Sign in as the owner of a parking location to verify bookings.'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Link
              to="/owner/parking-sessions"
              className="px-3 py-2 text-xs font-bold text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50"
            >
              Sessions page
            </Link>
            <NotificationsBell />
          </div>
        </div>

        {section === 'verify' && <VerifyBookingPanel />}
        {section === 'sessions' && <ParkingSessionsPanel />}
        {section === 'history' && <VerificationHistoryPanel />}
      </div>
    );
  }

  if (!currentLot) {
    return (
      <div className="space-y-6">
        {sectionNav}
        <div className="bg-white border border-slate-200 p-6 rounded-3xl shadow-xs text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center mx-auto">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-extrabold text-slate-900">No operator inventory is configured</h2>
          <p className="text-sm text-slate-500 max-w-md mx-auto">
            Demo garages and gate activity have been removed. Connect a live facility feed before using the operator dashboard.
            You can still verify bookings from the Verify Booking tab.
          </p>
        </div>
      </div>
    );
  }

  const handleToggleStallStatus = (stallCode: string) => {
    const updated = parkingLots.map((lot) => {
      if (lot.id !== selectedLotId) return lot;
      if (!lot.floors) return lot;

      const newFloors = lot.floors.map((floor) => {
        const newStalls = floor.stalls.map((s) => {
          if (s.code === stallCode || s.id === stallCode) {
            let nextStatus = s.status;
            if (s.status === 'available') nextStatus = 'maintenance';
            else if (s.status === 'maintenance') nextStatus = 'reserved';
            else nextStatus = 'available';
            return { ...s, status: nextStatus };
          }
          return s;
        });
        const freeInFloor = newStalls.filter((s) => s.status === 'available').length;
        return { ...floor, stalls: newStalls, availableStalls: freeInFloor };
      });

      const totalFree = newFloors.reduce((sum, f) => sum + f.availableStalls, 0);
      return { ...lot, floors: newFloors, availableSpots: totalFree };
    });

    onUpdateLot(updated);
  };

  const handleAdjustPrice = (newRate: number) => {
    const updated = parkingLots.map((lot) => {
      if (lot.id === selectedLotId) {
        return { ...lot, pricePerHour: newRate };
      }
      return lot;
    });
    onUpdateLot(updated);
  };

  return (
    <div className="space-y-6">

      {sectionNav}

      <div className="bg-white border border-slate-200 p-4 sm:p-6 rounded-3xl shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 bg-blue-50 text-blue-600 rounded-xl border border-blue-200">
              <Building2 className="w-5 h-5" />
            </span>
            <h2 className="text-xl font-extrabold text-slate-900">Garage Host IoT Control Center</h2>
          </div>
          <p className="text-xs text-slate-500 font-medium mt-1">Real-time stall sensors, gate scanner feeds, and dynamic rates</p>
        </div>

        <div className="flex flex-col items-stretch gap-2 w-full sm:w-auto">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 w-full sm:w-auto">
            <label className="text-xs font-bold text-slate-700">Select Facility:</label>
            <select
              value={selectedLotId}
              onChange={(e) => setSelectedLotId(e.target.value)}
              className="w-full sm:w-auto sm:min-w-[240px] px-3 py-2 bg-slate-50 border border-slate-200 text-slate-800 rounded-xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-blue-500/30"
            >
              {parkingLots.map((lot) => (
                <option key={lot.id} value={lot.id}>
                  {lot.name} ({lot.availableSpots !== undefined ? `${lot.availableSpots} free` : 'No live data'})
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center justify-between sm:justify-end gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span
                className={`px-2 py-1 rounded-lg text-[10px] font-black uppercase border ${
                  isCurrentLotOwned
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : 'bg-amber-50 text-amber-800 border-amber-200'
                }`}
              >
                {isCurrentLotOwned ? 'Registered to you' : 'Not registered'}
              </span>
              <button
                type="button"
                onClick={() => void handleClaimLot()}
                disabled={claimBusy || isCurrentLotOwned || !currentLotForClaim}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white rounded-xl text-[11px] font-extrabold flex items-center gap-1.5 cursor-pointer disabled:cursor-not-allowed"
                title="Register this facility to your owner account so only you can verify its bookings"
              >
                <MapPin className="w-3.5 h-3.5" aria-hidden="true" />
                {isCurrentLotOwned ? 'Facility registered' : 'Register facility'}
              </button>
            </div>
            <NotificationsBell />
          </div>

          {claimMessage && (
            <p
              role="status"
              aria-live="polite"
              className={`text-[11px] font-bold text-right ${claimError ? 'text-rose-600' : 'text-emerald-700'}`}
            >
              {claimMessage}
            </p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 p-4 rounded-2xl shadow-2xs flex items-center justify-between gap-2">
          <div className="min-w-0">
            <span className="text-xs text-slate-500 block font-semibold">Network Occupancy</span>
            <span className="text-2xl font-black text-slate-900 font-mono">{occupancyPercent}%</span>
            <span className="text-[10px] text-slate-500 block font-medium mt-0.5">{occupiedSpotsAll} of {totalSpotsAll} filled</span>
          </div>
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-2xl border border-emerald-100 shrink-0">
            <Activity className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white border border-slate-200 p-4 rounded-2xl shadow-2xs flex items-center justify-between gap-2">
          <div className="min-w-0">
            <span className="text-xs text-slate-500 block font-semibold">Est. Revenue Today</span>
            <span className="text-2xl font-black text-blue-600 font-mono">{formatINR(2480)}</span>
            <span className="text-[10px] text-emerald-600 block font-bold mt-0.5">+18% vs yesterday</span>
          </div>
          <div className="p-3 bg-blue-50 text-blue-600 rounded-2xl border border-blue-100 shrink-0">
            <DollarSign className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white border border-slate-200 p-4 rounded-2xl shadow-2xs flex items-center justify-between gap-2">
          <div className="min-w-0">
            <span className="text-xs text-slate-500 block font-semibold">Active EV Chargers</span>
            <span className="text-2xl font-black text-indigo-600 font-mono">18 / 20</span>
            <span className="text-[10px] text-slate-500 block font-medium mt-0.5">150kW Fast Charging</span>
          </div>
          <div className="p-3 bg-indigo-50 text-indigo-600 rounded-2xl border border-indigo-100 shrink-0">
            <Zap className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white border border-slate-200 p-4 rounded-2xl shadow-2xs flex items-center justify-between gap-2">
          <div className="min-w-0">
            <span className="text-xs text-slate-500 block font-semibold">Verifications Today</span>
            <span className="text-2xl font-black text-amber-600 font-mono">{todayChecks.success + todayChecks.failure}</span>
            <span className="text-[10px] text-slate-500 block font-medium mt-0.5">
              {todayChecks.success} approved · {todayChecks.failure} refused
            </span>
          </div>
          <div className="p-3 bg-amber-50 text-amber-600 rounded-2xl border border-amber-100 shrink-0">
            <ShieldCheck className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Live parking-verification summary (spec §43) */}
      <div className="bg-white border border-slate-200 p-4 sm:p-6 rounded-3xl shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-2 bg-emerald-50 text-emerald-600 rounded-xl border border-emerald-200">
                <Scan className="w-5 h-5" />
              </span>
              <h3 className="text-base font-extrabold text-slate-900">Parking Verification</h3>
            </div>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              Live counters from the booking store for your registered facilities
            </p>
          </div>
          <Link
            to="/owner/verify"
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-extrabold flex items-center gap-1.5 self-start sm:self-auto"
          >
            <Scan className="w-3.5 h-3.5" aria-hidden="true" /> Open scanner
          </Link>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3">
            <span className="text-[11px] text-slate-500 font-semibold block">Registered facilities</span>
            <span className="text-xl font-black text-slate-900 font-mono">{summary?.ownedLotIds.length ?? 0}</span>
          </div>
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3">
            <span className="text-[11px] text-slate-500 font-semibold block">Awaiting entry</span>
            <span className="text-xl font-black text-amber-600 font-mono">{summary?.awaitingEntry ?? 0}</span>
          </div>
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3">
            <span className="text-[11px] text-slate-500 font-semibold block">Checked in now</span>
            <span className="text-xl font-black text-emerald-600 font-mono">{summary?.checkedIn ?? 0}</span>
          </div>
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3">
            <span className="text-[11px] text-slate-500 font-semibold block">Active sessions</span>
            <span className="text-xl font-black text-blue-600 font-mono">{summary?.activeBookings ?? 0}</span>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link
            to="/owner/parking-sessions"
            className="px-3 py-2 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl text-xs font-bold flex items-center gap-1.5"
          >
            <Car className="w-3.5 h-3.5 text-blue-600" aria-hidden="true" /> Active parking sessions
          </Link>
          <Link
            to="/owner/verification-history"
            className="px-3 py-2 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl text-xs font-bold flex items-center gap-1.5"
          >
            <History className="w-3.5 h-3.5 text-blue-600" aria-hidden="true" /> Verification history
          </Link>
          {!isCurrentLotOwned && currentLotForClaim && (
            <button
              type="button"
              onClick={() => void handleClaimLot()}
              disabled={claimBusy}
              className="px-3 py-2 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <MapPin className="w-3.5 h-3.5" aria-hidden="true" /> Register {currentLotForClaim.name} for verification
            </button>
          )}
        </div>
      </div>

      <div className="bg-white border border-slate-200 p-4 sm:p-6 rounded-3xl shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-2 bg-blue-50 text-blue-600 rounded-xl border border-blue-200">
                <BarChart3 className="w-5 h-5" />
              </span>
              <h3 className="text-base font-extrabold text-slate-900">
                Total Bookings Per Hour (Today)
              </h3>
            </div>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              Hourly booking traffic & surge volume for {currentLot.name}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs font-semibold text-slate-600 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200 self-start sm:self-auto">
            <div>
              Total Today: <span className="font-extrabold text-blue-600 font-mono">{totalBookingsToday}</span>
            </div>
            <div className="h-3 w-px bg-slate-300" />
            <div>
              Peak Hour: <span className="font-extrabold text-emerald-600 font-mono">{peakHourItem?.hour} ({peakHourItem?.bookings} bks)</span>
            </div>
          </div>
        </div>

        <div className="h-64 sm:h-72 w-full pt-2">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={hourlyData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
              <XAxis
                dataKey="hour"
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 11, fill: '#64748B' }}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 11, fill: '#64748B' }}
                allowDecimals={false}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const data = payload[0].payload;
                    return (
                      <div className="bg-slate-900 text-white p-3 rounded-xl shadow-xl border border-slate-800 text-xs space-y-1">
                        <div className="font-bold flex items-center gap-1.5 text-blue-400">
                          <Clock className="w-3.5 h-3.5" />
                          <span>Time Slot: {data.hour}</span>
                        </div>
                        <div className="text-slate-200 font-mono font-extrabold">
                          Total Bookings: <span className="text-emerald-400">{data.bookings}</span>
                        </div>
                        <div className="text-slate-400 text-[10px] font-mono">
                          Est. Revenue: {formatINR(data.revenue)}
                        </div>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Bar dataKey="bookings" radius={[6, 6, 0, 0]}>
                {hourlyData.map((entry) => (
                  <Cell
                    key={entry.hour}
                    fill={entry.hour === peakHourItem?.hour ? '#10B981' : '#3B82F6'}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        <div className="lg:col-span-2 bg-white border border-slate-200 p-4 sm:p-6 rounded-3xl shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                <span>{currentLot.name} Stall Sensor Grid</span>
              </h3>
              <p className="text-xs text-slate-500 font-medium">Click any stall to override status (Available -&gt; Maintenance -&gt; Reserved)</p>
            </div>

            <span className="px-2.5 py-1 rounded-full text-xs font-mono font-extrabold bg-blue-50 text-blue-600 border border-blue-200">
              {currentLot.availableSpots !== undefined ? `${currentLot.availableSpots} Free Stalls` : 'No Live Data'}
            </span>
          </div>

          <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
            {currentLot.floors?.[0]?.stalls.map((stall) => {
              let bg = 'bg-emerald-50 border-emerald-200 text-emerald-800 hover:bg-emerald-100';
              if (stall.status === 'occupied') bg = 'bg-slate-100 border-slate-200 text-slate-400';
              if (stall.status === 'maintenance') bg = 'bg-rose-50 border-rose-200 text-rose-700';
              if (stall.status === 'reserved') bg = 'bg-amber-50 border-amber-200 text-amber-800';

              return (
                <button
                  key={stall.id}
                  onClick={() => handleToggleStallStatus(stall.code)}
                  className={`p-2 rounded-xl border flex flex-col items-center justify-between min-h-[64px] transition-all cursor-pointer hover:scale-105 shadow-2xs ${bg}`}
                >
                  <span className="font-mono font-bold text-xs">{stall.code}</span>
                  <span className="text-[10px] uppercase font-bold">{stall.status}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-6">

          <div className="bg-white border border-slate-200 p-4 sm:p-6 rounded-3xl shadow-xs space-y-4">
            <h3 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <Sliders className="w-4 h-4 text-blue-600" /> Dynamic Rate Adjuster
            </h3>

            <div className="space-y-3 bg-slate-50 p-4 rounded-2xl border border-slate-200 text-xs">
              <div>
                <div className="flex justify-between text-slate-700 font-bold mb-1">
                  <span>Base Hourly Rate</span>
                  <span className="text-blue-600 font-mono">
                    {currentLot.pricePerHour !== undefined ? formatINRPerHour(currentLot.pricePerHour) : 'Not provided'}
                  </span>
                </div>
                <input
                  type="range"
                  min="30"
                  max="300"
                  step="5"
                  value={currentLot.pricePerHour ?? 60}
                  onChange={(e) => handleAdjustPrice(parseFloat(e.target.value))}
                  className="w-full accent-blue-600 cursor-pointer"
                />
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-slate-200">
                <span className="text-slate-700 font-semibold">Peak Surge Multiplier (+20%)</span>
                <button
                  onClick={() => setIsSurgePricing(!isSurgePricing)}
                  className={`px-3 py-1 rounded-full text-[11px] font-bold transition-all cursor-pointer ${isSurgePricing
                    ? 'bg-amber-500 text-white shadow-2xs'
                    : 'bg-slate-200 text-slate-600'
                    }`}
                >
                  {isSurgePricing ? 'Surge Active' : 'Off'}
                </button>
              </div>
            </div>
          </div>

          <div className="bg-white border border-slate-200 p-4 sm:p-6 rounded-3xl shadow-xs space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-blue-600" aria-hidden="true" /> Recent Gate Activity
              </h3>
              <button
                type="button"
                onClick={() => void refreshVerificationData()}
                className="p-1.5 rounded-lg border border-slate-200 text-slate-400 hover:text-slate-700 cursor-pointer"
                aria-label="Refresh gate activity"
              >
                <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </div>

            <div className="space-y-2">
              {recentEvents.length === 0 ? (
                <div className="p-3 bg-slate-50 rounded-xl border border-dashed border-slate-300 text-xs text-slate-500 font-medium">
                  No verification events recorded yet. Scans, approvals and refusals show up here in real time.
                </div>
              ) : (
                recentEvents.map((event) => {
                  const success = event.result === 'success';
                  return (
                    <div
                      key={event.id}
                      className="p-2.5 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between gap-2 text-xs"
                    >
                      <div className="min-w-0">
                        <div className="font-bold text-slate-900 flex items-center gap-1.5">
                          <span className="truncate">{ACTION_LABELS[event.action] ?? event.action}</span>
                          <span
                            className={`text-[9px] px-1.5 py-0.2 rounded font-bold uppercase font-sans ${
                              success ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                            }`}
                          >
                            {success ? 'approved' : 'refused'}
                          </span>
                        </div>
                        <span className="text-[10px] text-slate-500 font-medium truncate block">
                          {event.bookingId ? `Booking ${event.bookingId}` : event.parkingLocationId ?? '—'} · {event.reason}
                        </span>
                      </div>
                      <span className="text-[10px] text-slate-400 font-mono font-semibold shrink-0">
                        {new Date(event.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  );
                })
              )}
            </div>

            <Link
              to="/owner/verification-history"
              className="block text-center text-[11px] font-bold text-blue-700 hover:underline"
            >
              View full verification history →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};
