import React, { useState } from 'react';
import { MapPin, Key, X, ExternalLink, Info, CheckCircle } from 'lucide-react';

interface Props {
  hasValidKey: boolean;
}

export const GoogleMapsKeyBanner: React.FC<Props> = ({ hasValidKey }) => {
  const [dismissed, setDismissed] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);

  if (hasValidKey) {
    return null;
  }

  if (dismissed && !showInstructions) {
    return (
      <button
        onClick={() => setShowInstructions(true)}
        className="fixed bottom-4 left-4 z-40 bg-slate-900/90 text-slate-200 border border-slate-700/80 px-3 py-2 rounded-full text-xs font-medium shadow-lg backdrop-blur-md hover:bg-slate-800 transition-all flex items-center gap-2 cursor-pointer"
      >
        <Key className="w-3.5 h-3.5 text-amber-400" />
        <span>Add Google Maps Key</span>
      </button>
    );
  }

  return (
    <div className="bg-gradient-to-r from-amber-500/10 via-amber-500/15 to-orange-500/10 border-b border-amber-500/20 px-4 py-2.5 relative backdrop-blur-md">
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-sm">
        <div className="flex items-center gap-2.5 text-amber-200 font-medium">
          <span className="p-1 bg-amber-500/20 rounded-lg text-amber-400 shrink-0">
            <Key className="w-4 h-4" />
          </span>
          <div>
            <span className="font-semibold text-amber-300">Interactive Map Enabled: </span>
            <span className="text-amber-100/90">
              Interactive vector map mode active. Add a Google Maps API Key to unlock satellite view & real-time Google Places.
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
          <button
            onClick={() => setShowInstructions(!showInstructions)}
            className="px-3 py-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <Info className="w-3.5 h-3.5" />
            <span>{showInstructions ? 'Hide Setup' : 'How to Add Key'}</span>
          </button>

          <button
            onClick={() => setDismissed(true)}
            className="p-1 text-amber-400/70 hover:text-amber-200 rounded-lg transition-colors cursor-pointer"
            title="Dismiss notification"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {showInstructions && (
        <div className="max-w-7xl mx-auto mt-3 p-4 bg-slate-900/95 border border-amber-500/30 rounded-xl text-slate-200 shadow-2xl text-xs space-y-3">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <h4 className="font-semibold text-amber-400 text-sm flex items-center gap-2">
              <Key className="w-4 h-4" />
              How to add GOOGLE_MAPS_PLATFORM_KEY
            </h4>
            <a
              href="https://console.cloud.google.com/google/maps-apis/start"
              target="_blank"
              rel="noopener noreferrer"
              className="text-amber-400 hover:underline flex items-center gap-1"
            >
              Get Free Key <ExternalLink className="w-3 h-3" />
            </a>
          </div>

          <ol className="list-decimal pl-5 space-y-2 text-slate-300">
            <li>
              Obtain an API key from <a href="https://console.cloud.google.com/google/maps-apis/start" target="_blank" rel="noopener noreferrer" className="text-amber-400 underline">Google Maps Platform Console</a>.
            </li>
            <li>
              Set the <code className="bg-slate-800 text-amber-300 px-1.5 py-0.5 rounded font-mono">GOOGLE_MAPS_PLATFORM_KEY</code> environment variable in your <code className="bg-slate-800 text-amber-300 px-1.5 py-0.5 rounded font-mono">.env.local</code> file.
            </li>
            <li>
              Restart the application server to apply your key!
            </li>
          </ol>

          <div className="flex items-center gap-2 text-emerald-400 bg-emerald-500/10 p-2 rounded-lg border border-emerald-500/20">
            <CheckCircle className="w-4 h-4 shrink-0" />
            <span>The app falls back to the built-in vector map until a Google Maps key is configured.</span>
          </div>
        </div>
      )}
    </div>
  );
};
