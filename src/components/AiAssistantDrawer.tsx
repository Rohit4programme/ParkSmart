import React, { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { SpotType, AiRecommendationRequest, AiRecommendation, ParkingLot } from '../types';
import {
  Sparkles,
  X,
  Car,
  Clock,
  MapPin,
  Zap,
  CheckCircle2,
  Brain,
  ChevronRight,
  ShieldCheck,
  DollarSign,
  Accessibility,
} from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  parkingLots: ParkingLot[];
  onSelectRecommendedLot: (lotId: string, stallCode: string) => void;
}

export const AiAssistantDrawer: React.FC<Props> = (props) => {
  return (
    <AnimatePresence>
      {props.isOpen && <AiAssistantDrawerContent {...props} />}
    </AnimatePresence>
  );
};

const AiAssistantDrawerContent: React.FC<Props> = ({
  isOpen,
  onClose,
  parkingLots,
  onSelectRecommendedLot,
}) => {

  const [input, setInput] = useState<AiRecommendationRequest>({
    vehicleType: 'standard',
    durationHours: 1,
    destination: '',
    maxBudget: undefined,
    needsEvCharging: false,
    needsAccessible: false,
    preferredSpotTrait: 'nearest_exit',
  });

  const [isLoading, setIsLoading] = useState(false);
  const [recommendation, setRecommendation] = useState<AiRecommendation | null>(null);

  const handleRunAiAnalysis = async () => {
    if (parkingLots.length === 0) {
      alert('No parking inventory is available for AI analysis.');
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch('/api/parking/recommend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...input, parkingLots }),
      });

      const data = await res.json();
      if (data.success && data.recommendation) {
        setRecommendation(data.recommendation);
      } else {
        alert('AI recommendation unavailable: ' + (data.error || 'Check server connection'));
      }
    } catch (err: any) {
      console.error(err);
      alert('Error querying AI assistant');
    } finally {
      setIsLoading(false);
    }
  };

  const recommendedLot = parkingLots.find((l) => l.id === recommendation?.recommendedLotId);
  const isRecommendedBookable = recommendedLot?.isBookable === true;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex justify-end"
      onClick={onClose}
    >
      <motion.div
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', damping: 28, stiffness: 300 }}
        className="w-full max-w-lg bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 h-full flex flex-col shadow-2xl overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >

        <div className="p-4 sm:p-6 bg-gradient-to-r from-blue-50 to-indigo-50 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-600 text-white rounded-xl shadow-xs">
              <Brain className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-extrabold text-slate-900 flex items-center gap-2">
                Gemini AI Smart Spot Finder
                <span className="px-2 py-0.5 rounded-full text-[10px] bg-blue-600 text-white font-extrabold uppercase tracking-wide">
                  Live
                </span>
              </h2>
              <p className="text-xs text-slate-500 font-medium">Personalized parking recommendation engine</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-200/60 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 sm:p-6 space-y-5 flex-1 overflow-y-auto bg-slate-50/50">

          <div>
            <label className="text-xs font-extrabold text-slate-700 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
              <MapPin className="w-4 h-4 text-blue-600" /> Destination Address or Landmark
            </label>
            <input
              type="text"
              value={input.destination}
              onChange={(e) => setInput({ ...input, destination: e.target.value })}
              className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/30"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-extrabold text-slate-700 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                <Car className="w-4 h-4 text-blue-600" /> Vehicle Type
              </label>
              <select
                value={input.vehicleType}
                onChange={(e) => setInput({ ...input, vehicleType: e.target.value as SpotType })}
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/30"
              >
                <option value="ev">Electric Vehicle (EV)</option>
                <option value="standard">Standard Sedan</option>
                <option value="suv">Large SUV / Truck</option>
                <option value="compact">Compact Car</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-extrabold text-slate-700 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-blue-600" /> Duration (Hours)
              </label>
              <input
                type="number"
                min={1}
                max={24}
                value={input.durationHours}
                onChange={(e) => setInput({ ...input, durationHours: parseInt(e.target.value) || 1 })}
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/30"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-extrabold text-slate-700 uppercase tracking-wider mb-1.5 block">
              Spot Priority Preference
            </label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { id: 'nearest_exit', label: 'Closest to Exit Gate' },
                { id: 'widest_space', label: 'Extra Wide Stall' },
                { id: 'cheapest', label: 'Lowest Rate ₹/hr' },
                { id: 'highest_security', label: '24/7 Patrol & Security' },
              ].map((pref) => (
                <button
                  key={pref.id}
                  type="button"
                  onClick={() => setInput({ ...input, preferredSpotTrait: pref.id as any })}
                  className={`p-2.5 rounded-xl border text-xs text-left transition-all cursor-pointer font-bold ${input.preferredSpotTrait === pref.id
                      ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100'
                    }`}
                >
                  {pref.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap gap-3 pt-1">
            <label className="flex items-center gap-2 text-xs text-slate-700 font-medium cursor-pointer">
              <input
                type="checkbox"
                checked={input.needsEvCharging}
                onChange={(e) => setInput({ ...input, needsEvCharging: e.target.checked })}
                className="w-4 h-4 rounded accent-blue-600"
              />
              <span className="flex items-center gap-1">
                <Zap className="w-3.5 h-3.5 text-blue-600" /> Must have High-Speed EV Charger
              </span>
            </label>

            <label className="flex items-center gap-2 text-xs text-slate-700 font-medium cursor-pointer">
              <input
                type="checkbox"
                checked={input.needsAccessible}
                onChange={(e) => setInput({ ...input, needsAccessible: e.target.checked })}
                className="w-4 h-4 rounded accent-blue-600"
              />
              <span className="flex items-center gap-1">
                <Accessibility className="w-3.5 h-3.5 text-indigo-600" /> Accessible / Handicap Space
              </span>
            </label>
          </div>

          <button
            onClick={handleRunAiAnalysis}
            disabled={isLoading || parkingLots.length === 0}
            className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-extrabold rounded-xl text-sm shadow-md shadow-blue-500/20 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {isLoading ? (
              <span className="flex items-center gap-2">
                <Brain className="w-4 h-4 animate-spin text-white" /> Gemini is analyzing parking lots...
              </span>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                <span>Ask AI for Optimal Spot</span>
              </>
            )}
          </button>

          {parkingLots.length === 0 && (
            <div className="p-3 rounded-xl border border-dashed border-slate-300 bg-white text-xs text-slate-500 font-medium">
              No parking inventory is available yet. Add a live data source before requesting AI recommendations.
            </div>
          )}

          {recommendation && (
            <div className="bg-white border-2 border-blue-500 rounded-2xl p-4 space-y-3 shadow-xl animate-fade-in">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <span className="text-xs font-bold text-blue-600 uppercase tracking-wider flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-blue-600" /> AI Match Recommendation
                </span>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-blue-600 text-white font-mono">
                  {recommendation.matchScorePercent}% Match
                </span>
              </div>

              <div>
                <h3 className="text-base font-bold text-slate-900">{recommendation.headline}</h3>
                <p className="text-xs text-slate-600 mt-1 leading-relaxed font-medium">
                  {recommendation.explanation}
                </p>
              </div>

              <div className="space-y-1.5 bg-slate-50 p-3 rounded-xl border border-slate-200">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                  Why this spot:
                </span>
                {recommendation.keyBenefits.map((benefit, idx) => (
                  <div key={idx} className="flex items-center gap-2 text-xs text-slate-700 font-medium">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-600" />
                    <span>{benefit}</span>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                <div>
                  <span className="text-[10px] text-slate-500 block font-semibold">Recommended Stall:</span>
                  <span className="font-mono font-extrabold text-blue-600 text-sm">
                    Stall {recommendation.recommendedStallCode}
                  </span>
                </div>

                <button
                  onClick={() => {
                    onSelectRecommendedLot(
                      recommendation.recommendedLotId,
                      recommendation.recommendedStallCode
                    );
                    onClose();
                  }}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs shadow-md shadow-blue-500/20 transition-all flex items-center gap-1 cursor-pointer"
                >
                  <span>{isRecommendedBookable ? `Go to Stall ${recommendation.recommendedStallCode}` : 'View on Map'}</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
};
