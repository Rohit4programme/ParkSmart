import React, { useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ParkingLot, ParkingStall, VehicleInfo, BookingAddon, Booking, UserAccount, VehicleProfile } from '../types';
import { BOOKING_ADDONS } from '../data/appData';
import { formatINR } from '../utils/currency';
import { createBookingRequest } from '../services/verificationService';
import { syncParkingLots } from '../services/lotSyncService';
import { saveQrToken } from '../services/qrTokenCache';
import confetti from 'canvas-confetti';
import {
  X,
  Clock,
  Car,
  CreditCard,
  ShieldCheck,
  Zap,
  Sparkles,
  Check,
  Plus,
  Ticket,
  ChevronDown,
} from 'lucide-react';

interface Props {
  lot: ParkingLot | null;
  stall: ParkingStall | null;
  currentUser?: UserAccount | null;
  initialDurationHours?: number;
  initialVehicle?: VehicleInfo;
  initialAddonIds?: string[];
  onClose: () => void;
  onBookingSuccess: (booking: Booking) => void;
}

export const BookingModal: React.FC<Props> = (props) => {
  return (
    <AnimatePresence>
      {props.lot && (
        <BookingModalContent
          key={props.lot.id}
          {...props}
          lot={props.lot}
        />
      )}
    </AnimatePresence>
  );
};

const BookingModalContent: React.FC<Omit<Props, 'lot'> & { lot: ParkingLot }> = ({
  lot,
  stall,
  currentUser,
  initialDurationHours,
  initialVehicle,
  initialAddonIds,
  onClose,
  onBookingSuccess,
}) => {

  const availableVehicles: VehicleProfile[] = React.useMemo(() => {
    if (currentUser?.vehicles && currentUser.vehicles.length > 0) {
      return currentUser.vehicles;
    }
    if (currentUser?.vehiclePlate && currentUser?.vehicleModel) {
      return [
        {
          id: 'veh_primary_user',
          nickname: 'Primary Vehicle',
          makeModel: currentUser.vehicleModel,
          vehiclePlate: currentUser.vehiclePlate,
          type: 'standard',
          color: 'Black Metallic',
          isDefault: true,
        },
      ];
    }
    return [];
  }, [currentUser]);

  const defaultProfile = availableVehicles.find((v) => v.isDefault) || availableVehicles[0];

  const [selectedVehicleProfileId, setSelectedVehicleProfileId] = useState<string>(
    defaultProfile ? defaultProfile.id : 'custom'
  );
  const [saveSuccessMsg, setSaveSuccessMsg] = useState('');

  const handleSaveCurrentVehicleToAccount = () => {
    if (!currentUser || !vehicle.plateNumber || !vehicle.makeModel) return;

    const existing: VehicleProfile[] =
      currentUser.vehicles && currentUser.vehicles.length > 0
        ? currentUser.vehicles
        : currentUser.vehiclePlate && currentUser.vehicleModel
          ? [
            {
              id: 'veh_primary_user',
              nickname: 'Primary Vehicle',
              makeModel: currentUser.vehicleModel,
              vehiclePlate: currentUser.vehiclePlate,
              type: 'standard',
              color: 'Black',
              isDefault: true,
            }
          ]
          : [];

    const exists = existing.find((v) => v.vehiclePlate.toUpperCase() === vehicle.plateNumber.toUpperCase());
    if (exists) {
      setSaveSuccessMsg(`Plate ${vehicle.plateNumber} is already saved in your profile.`);
      setTimeout(() => setSaveSuccessMsg(''), 3000);
      return;
    }

    const newProfile: VehicleProfile = {
      id: `veh_${Date.now()}`,
      nickname: vehicle.makeModel,
      makeModel: vehicle.makeModel,
      vehiclePlate: vehicle.plateNumber.toUpperCase(),
      type: vehicle.type || 'standard',
      color: vehicle.color || 'Standard',
      isDefault: false,
    };

    const updatedVehicles = [...existing, newProfile];
    const updatedUser: UserAccount = {
      ...currentUser,
      vehicles: updatedVehicles,
    };

    localStorage.setItem('parksmart_current_user', JSON.stringify(updatedUser));
    if (currentUser.email) {
      localStorage.setItem(`parksmart_user_${currentUser.email.trim().toLowerCase()}`, JSON.stringify(updatedUser));
    }

    setSelectedVehicleProfileId(newProfile.id);
    setSaveSuccessMsg(`Saved ${newProfile.vehiclePlate} (${newProfile.makeModel}) to your account profile!`);
    setTimeout(() => setSaveSuccessMsg(''), 3500);
  };

  const [durationHours, setDurationHours] = useState<number>(initialDurationHours || 2);
  const [vehicle, setVehicle] = useState<VehicleInfo>(() => {
    if (initialVehicle) return initialVehicle;
    if (defaultProfile) {
      return {
        plateNumber: defaultProfile.vehiclePlate,
        makeModel: defaultProfile.makeModel,
        type: defaultProfile.type || stall?.type || 'standard',
        color: defaultProfile.color || 'Pearl White',
      };
    }
    return {
      plateNumber: '',
      makeModel: '',
      type: stall?.type || 'standard',
      color: '',
    };
  });

  const handleVehicleProfileSelect = (profileId: string) => {
    setSelectedVehicleProfileId(profileId);
    if (profileId === 'custom') return;
    const found = availableVehicles.find((v) => v.id === profileId);
    if (found) {
      setVehicle({
        plateNumber: found.vehiclePlate,
        makeModel: found.makeModel,
        type: found.type || stall?.type || 'standard',
        color: found.color || 'Standard Color',
      });
    }
  };
  const [selectedAddonIds, setSelectedAddonIds] = useState<string[]>(
    initialAddonIds || (stall?.hasEvCharger ? ['ev_charge'] : [])
  );
  const [paymentMethod, setPaymentMethod] = useState<'card' | 'apple_pay' | 'park_pass'>('apple_pay');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const basePrice = Number(((lot.pricePerHour ?? 0) * durationHours * (1 + (stall?.priceModifier ?? 0))).toFixed(2));
  const addonsPrice = selectedAddonIds.reduce((sum, id) => {
    const addon = BOOKING_ADDONS.find((a) => a.id === id);
    return sum + (addon ? addon.price : 0);
  }, 0);
  const tax = Number(((basePrice + addonsPrice) * 0.08).toFixed(2));
  const totalPrice = Number((basePrice + addonsPrice + tax).toFixed(2));

  const toggleAddon = (id: string) => {
    if (selectedAddonIds.includes(id)) {
      setSelectedAddonIds(selectedAddonIds.filter((item) => item !== id));
    } else {
      setSelectedAddonIds([...selectedAddonIds, id]);
    }
  };

  const handleConfirmBooking = async () => {
    if (!vehicle.plateNumber || !vehicle.makeModel) {
      alert('Enter your vehicle plate number and make/model before booking.');
      return;
    }

    setIsSubmitting(true);
    setSubmitError('');
    const selectedAddons = BOOKING_ADDONS.filter((a) => selectedAddonIds.includes(a.id));

    // The backend is the source of truth: it validates auth, stall
    // availability, pricing and payment, then mints the QR token. There is no
    // local/offline booking fallback — a pass without a server-issued token
    // could never be verified at the gate.
    const submit = () =>
      createBookingRequest({
        lotId: lot.id,
        stallCode: stall?.code || 'P1-01',
        durationHours,
        vehicle,
        addons: selectedAddons,
        basePrice,
        totalPrice,
        paymentMethod,
      });

    let result = await submit();

    // Self-heal: a 404 means the server does not know this lot yet. The store is
    // filled by a debounced background sync (App.tsx), so booking inside that
    // window — or after a server restart with an empty store — would otherwise
    // fail outright. Re-sync this one lot and retry exactly once.
    if (result.ok === false && result.error.status === 404) {
      console.warn('[booking] Server did not know this lot; re-syncing and retrying once.');
      const resync = await syncParkingLots([lot]);
      if (resync.error) {
        console.error(`[booking] Re-sync failed: ${resync.error}`);
      }
      result = await submit();
    }

    if (result.ok === false) {
      const { error } = result;
      if (error.code === 'UNAUTHENTICATED') {
        setSubmitError('Please sign in to book a spot — bookings are tied to your account.');
      } else if (error.code === 'OFFLINE') {
        setSubmitError(
          'Could not reach the booking server. Check your connection — an online booking is required to issue a gate QR pass.',
        );
      } else {
        setSubmitError(error.message || 'Booking failed. Please try again.');
      }
      setIsSubmitting(false);
      return;
    }

    // The raw QR token is returned exactly once (only its hash is stored
    // server-side), so cache it locally for the ticket / detail screens.
    saveQrToken(result.data.booking.id, result.data.qrToken, result.data.verifyUrl);

    try {
      confetti({
        particleCount: 80,
        spread: 70,
        origin: { y: 0.6 },
      });
    } catch (e) {
      // confetti library unavailable — ignore
    }

    onBookingSuccess(result.data.booking);
    setIsSubmitting(false);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 overflow-y-auto"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 16 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden my-auto flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >

        <div className="p-4 sm:p-6 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl border border-blue-200">
              <Ticket className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">Reserve Parking Spot</h2>
              <p className="text-xs text-slate-500 font-medium">{lot.name} • Stall {stall?.code || 'Auto-Assigned'}</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-200/60 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 sm:p-6 space-y-6 max-h-[75vh] overflow-y-auto">

          <div>
            <label className="text-xs font-extrabold text-slate-700 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-blue-600" /> Select Parking Duration
            </label>

            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
              {[1, 2, 3, 4, 8, 24].map((hrs) => (
                <button
                  key={hrs}
                  type="button"
                  onClick={() => setDurationHours(hrs)}
                  className={`p-2.5 rounded-xl border text-center transition-all cursor-pointer ${durationHours === hrs
                      ? 'bg-blue-600 text-white font-bold border-blue-600 shadow-md shadow-blue-500/20'
                      : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                    }`}
                >
                  <div className="text-sm font-bold">{hrs} {hrs === 1 ? 'Hour' : 'Hours'}</div>
                  <div className={`text-[10px] ${durationHours === hrs ? 'text-blue-100 font-semibold' : 'text-slate-500'}`}>
                    {lot.pricePerHour !== undefined ? formatINR(lot.pricePerHour * hrs) : 'N/A'}
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2.5">
              <label className="text-xs font-extrabold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                <Car className="w-4 h-4 text-blue-600" /> Vehicle Information
              </label>

              {availableVehicles.length > 0 && (
                <span className="text-[10px] text-blue-600 font-bold bg-blue-50 px-2 py-0.5 rounded-md border border-blue-200">
                  {availableVehicles.length} Saved Profile{availableVehicles.length > 1 ? 's' : ''}
                </span>
              )}
            </div>

            <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200 space-y-3">

              {availableVehicles.length > 0 && (
                <div>
                  <label className="text-[11px] text-slate-600 font-bold block mb-1">
                    Select Saved Vehicle Profile
                  </label>
                  <select
                    value={selectedVehicleProfileId}
                    onChange={(e) => handleVehicleProfileSelect(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-blue-300 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/30 cursor-pointer shadow-xs"
                  >
                    {availableVehicles.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.nickname || v.makeModel} — {v.vehiclePlate} ({v.makeModel}){v.isDefault ? ' [DEFAULT]' : ''}
                      </option>
                    ))}
                    <option value="custom">+ Enter Custom Vehicle</option>
                  </select>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] text-slate-500 block mb-1 font-semibold">License Plate Number</label>
                  <input
                    type="text"
                    value={vehicle.plateNumber}
                    onChange={(e) => {
                      setVehicle({ ...vehicle, plateNumber: e.target.value.toUpperCase() });
                      if (selectedVehicleProfileId !== 'custom') setSelectedVehicleProfileId('custom');
                    }}
                    placeholder="Enter plate number"
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm font-mono text-blue-600 font-bold uppercase focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                  />
                </div>

                <div>
                  <label className="text-[11px] text-slate-500 block mb-1 font-semibold">Vehicle Make & Model</label>
                  <input
                    type="text"
                    value={vehicle.makeModel}
                    onChange={(e) => {
                      setVehicle({ ...vehicle, makeModel: e.target.value });
                      if (selectedVehicleProfileId !== 'custom') setSelectedVehicleProfileId('custom');
                    }}
                    placeholder="Enter make and model"
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                  />
                </div>
              </div>

              {currentUser && vehicle.plateNumber && vehicle.makeModel && (
                <div className="pt-1">
                  <button
                    type="button"
                    onClick={handleSaveCurrentVehicleToAccount}
                    className="w-full py-1.5 px-3 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs"
                  >
                    <Plus className="w-3.5 h-3.5 text-blue-600" />
                    <span>Save {vehicle.plateNumber} to Profile for 1-Click Auto-Populate</span>
                  </button>
                </div>
              )}

              {saveSuccessMsg && (
                <div className="p-2 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 animate-fade-in">
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                  <span>{saveSuccessMsg}</span>
                </div>
              )}
            </div>
          </div>

          <div>
            <label className="text-xs font-extrabold text-slate-700 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-blue-600" /> Premium Services & Add-ons
            </label>

            <div className="space-y-2">
              {BOOKING_ADDONS.length === 0 ? (
                <div className="p-3 rounded-xl border border-dashed border-slate-300 bg-white text-xs text-slate-500 font-medium">
                  No add-ons are configured right now.
                </div>
              ) : (
                BOOKING_ADDONS.map((addon) => {
                  const isSelected = selectedAddonIds.includes(addon.id);
                  return (
                    <div
                      key={addon.id}
                      onClick={() => toggleAddon(addon.id)}
                      className={`p-3 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${isSelected
                          ? 'bg-blue-50/80 border-blue-300 text-blue-900'
                          : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                        }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={`w-5 h-5 rounded-md flex items-center justify-center border transition-all shrink-0 ${isSelected
                              ? 'bg-blue-600 border-blue-600 text-white'
                              : 'border-slate-300 bg-white'
                            }`}
                        >
                          {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-slate-900 truncate">{addon.name}</div>
                          <div className="text-[11px] text-slate-500 font-medium truncate">{addon.description}</div>
                        </div>
                      </div>
                      <span className="text-xs font-bold text-blue-600 shrink-0 ml-2">
                        +{formatINR(addon.price)}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div>
            <label className="text-xs font-extrabold text-slate-700 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
              <CreditCard className="w-4 h-4 text-blue-600" /> Payment Option
            </label>

            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'apple_pay', name: 'Apple Pay' },
                { id: 'card', name: 'Credit Card' },
                { id: 'park_pass', name: 'ParkPass Wallet' },
              ].map((pm) => (
                <button
                  key={pm.id}
                  type="button"
                  onClick={() => setPaymentMethod(pm.id as any)}
                  className={`p-2.5 rounded-xl border text-xs font-bold text-center transition-all cursor-pointer ${paymentMethod === pm.id
                      ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                >
                  {pm.name}
                </button>
              ))}
            </div>
          </div>

          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-2 text-xs">
            <div className="flex justify-between text-slate-600 font-medium">
              <span>Parking Base Rate ({durationHours}h x {lot.pricePerHour !== undefined ? formatINR(lot.pricePerHour) + '/h' : 'N/A'})</span>
              <span>{formatINR(basePrice)}</span>
            </div>
            {addonsPrice > 0 && (
              <div className="flex justify-between text-slate-600 font-medium">
                <span>Selected Add-ons</span>
                <span>+{formatINR(addonsPrice)}</span>
              </div>
            )}
            <div className="flex justify-between text-slate-600 font-medium">
              <span>Estimated Tax (8%)</span>
              <span>+{formatINR(tax)}</span>
            </div>

            <div className="pt-2 border-t border-slate-200 flex justify-between items-center text-sm font-extrabold">
              <span className="text-slate-900">Total Amount</span>
              <span className="text-blue-600 text-lg">{formatINR(totalPrice)}</span>
            </div>
          </div>
        </div>

        <div className="p-4 sm:p-6 bg-slate-50 border-t border-slate-200 space-y-3">
          {submitError ? (
            <div
              role="alert"
              className="flex items-start gap-2 text-xs font-semibold text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5"
            >
              <X className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{submitError}</span>
            </div>
          ) : null}

          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs text-slate-500 font-medium">
              <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>Guaranteed stall reservation & instant Gate QR Pass</span>
            </div>

            <button
              onClick={handleConfirmBooking}
              disabled={isSubmitting || !vehicle.plateNumber || !vehicle.makeModel}
              className="w-full sm:w-auto justify-center px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-extrabold rounded-xl text-sm shadow-md shadow-blue-500/20 transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {isSubmitting ? (
                <span>Processing...</span>
              ) : (
                <>
                  <Ticket className="w-4 h-4" />
                  <span>Pay {formatINR(totalPrice)} & Get Pass</span>
                </>
              )}
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};