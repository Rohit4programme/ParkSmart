import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  Sun,
  Moon,
  Laptop,
  Palette,
  Map,
  Sparkles,
  Check,
  RotateCcw,
  Sliders,
  Eye,
  Zap,
} from 'lucide-react';
import { ThemeConfig, ThemeMode, AccentColor, MapStyleTheme, UiDensity } from '../types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  themeConfig: ThemeConfig;
  onChangeThemeConfig: (newConfig: ThemeConfig) => void;
  onResetTheme: () => void;
}

const ACCENT_PALETTES: { id: AccentColor; name: string; hex: string; bgClass: string; borderClass: string }[] = [
  { id: 'blue', name: 'ParkSmart Blue', hex: '#2563eb', bgClass: 'bg-blue-600', borderClass: 'border-blue-600' },
  { id: 'emerald', name: 'Cyber Emerald', hex: '#059669', bgClass: 'bg-emerald-600', borderClass: 'border-emerald-600' },
  { id: 'violet', name: 'Midnight Violet', hex: '#7c3aed', bgClass: 'bg-violet-600', borderClass: 'border-violet-600' },
  { id: 'amber', name: 'Sunset Amber', hex: '#d97706', bgClass: 'bg-amber-600', borderClass: 'border-amber-600' },
  { id: 'rose', name: 'Neon Rose', hex: '#e11d48', bgClass: 'bg-rose-600', borderClass: 'border-rose-600' },
  { id: 'slate', name: 'Monochrome Slate', hex: '#475569', bgClass: 'bg-slate-600', borderClass: 'border-slate-600' },
];

const MAP_STYLES: { id: MapStyleTheme; name: string; description: string }[] = [
  { id: 'standard', name: 'Auto Sync', description: 'Matches active light or dark theme' },
  { id: 'dark', name: 'Night Silver', description: 'Dark high-contrast navigation grid' },
  { id: 'cyberpunk', name: 'OLED Cyberpunk', description: 'Neon glowing parking lots on obsidian map' },
  { id: 'satellite', name: 'Hybrid Satellite', description: 'Photorealistic aerial imagery with vectors' },
];

const PRESETS: { name: string; config: ThemeConfig }[] = [
  {
    name: 'Classic ParkSmart',
    config: { mode: 'light', accent: 'blue', mapStyle: 'standard', density: 'comfortable', highContrast: false, reduceMotion: false },
  },
  {
    name: 'Cyberpunk Drive',
    config: { mode: 'dark', accent: 'emerald', mapStyle: 'cyberpunk', density: 'compact', highContrast: false, reduceMotion: false },
  },
  {
    name: 'Executive Midnight',
    config: { mode: 'dark', accent: 'violet', mapStyle: 'dark', density: 'comfortable', highContrast: false, reduceMotion: false },
  },
  {
    name: 'High Visibility Solar',
    config: { mode: 'light', accent: 'amber', mapStyle: 'standard', density: 'comfortable', highContrast: true, reduceMotion: false },
  },
];

export const ThemeCustomizerModal: React.FC<Props> = ({
  isOpen,
  onClose,
  themeConfig,
  onChangeThemeConfig,
  onResetTheme,
}) => {
  if (!isOpen) return null;

  const activeAccent = ACCENT_PALETTES.find((p) => p.id === themeConfig.accent) || ACCENT_PALETTES[0];

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5">
        
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-slate-950/70 backdrop-blur-md"
        />

        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 16 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="relative w-full max-w-xl bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[90vh]"
        >
          
          <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/80 dark:bg-slate-900/80 backdrop-blur-md">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white shadow-xs">
                <Palette className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
                  Theme & Visual Customizer
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                  Customize appearance, accent palettes, map styles, and visual density
                </p>
              </div>
            </div>

            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-all cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-6 overflow-y-auto space-y-6">
            
            <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 transition-all">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-extrabold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                  <Eye className="w-3.5 h-3.5" /> Live Preview
                </span>
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                  {themeConfig.mode.toUpperCase()} MODE • {activeAccent.name}
                </span>
              </div>

              <div className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center text-white font-extrabold text-sm shadow-xs ${activeAccent.bgClass}`}
                  >
                    P
                  </div>
                  <div>
                    <h4 className="text-sm font-black text-slate-900 dark:text-white">Central Garage Lot #4</h4>
                    <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                      12 Spots Free • INR 4.50/hr
                    </p>
                  </div>
                </div>

                <button
                  className={`px-3 py-1.5 rounded-xl text-xs font-extrabold text-white shadow-xs transition-all ${activeAccent.bgClass}`}
                >
                  Reserve Spot
                </button>
              </div>
            </div>

            <div>
              <label className="text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2.5 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-500" /> One-Click Presets
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {PRESETS.map((preset) => (
                  <button
                    key={preset.name}
                    onClick={() => onChangeThemeConfig(preset.config)}
                    className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800/50 dark:hover:bg-slate-800 text-left transition-all cursor-pointer flex flex-col justify-between"
                  >
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-200 line-clamp-1">
                      {preset.name}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2.5">
                <label className="text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Appearance Mode
                </label>
              </div>

              <div className="grid grid-cols-3 gap-2 mb-3">
                {(
                  [
                    { id: 'light', label: 'Light', icon: Sun },
                    { id: 'dark', label: 'Dark', icon: Moon },
                    { id: 'system', label: 'System', icon: Laptop },
                  ] as const
                ).map((modeItem) => {
                  const Icon = modeItem.icon;
                  const isSelected = themeConfig.mode === modeItem.id;
                  return (
                    <button
                      key={modeItem.id}
                      onClick={() => onChangeThemeConfig({ ...themeConfig, mode: modeItem.id })}
                      className={`py-3 px-3 rounded-2xl border text-xs font-extrabold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                        isSelected
                          ? 'border-blue-600 bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 ring-2 ring-blue-500/20 shadow-xs'
                          : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      <span>{modeItem.label}</span>
                      {isSelected && <Check className="w-3.5 h-3.5 ml-auto text-blue-600 dark:text-blue-400" />}
                    </button>
                  );
                })}
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 shrink-0">
                    <Laptop className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <h4 className="text-xs font-extrabold text-slate-900 dark:text-white flex items-center gap-1.5">
                      Sync with System
                      {themeConfig.mode === 'system' && (
                        <span className="px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300">
                          Active
                        </span>
                      )}
                    </h4>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                      Automatically respect OS-level dark/light mode preferences (System standard:{' '}
                      <span className="font-bold text-slate-700 dark:text-slate-300">
                        {typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches
                          ? 'Dark'
                          : 'Light'}
                      </span>
                      )
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    onChangeThemeConfig({
                      ...themeConfig,
                      mode:
                        themeConfig.mode === 'system'
                          ? typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches
                            ? 'dark'
                            : 'light'
                          : 'system',
                    })
                  }
                  className={`w-11 h-6 rounded-full transition-colors relative p-0.5 cursor-pointer shrink-0 ${
                    themeConfig.mode === 'system' ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-700'
                  }`}
                  title="Toggle Sync with System OS Preference"
                >
                  <div
                    className={`w-5 h-5 rounded-full bg-white shadow-md transform transition-transform ${
                      themeConfig.mode === 'system' ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            </div>

            <div>
              <label className="text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2.5 flex items-center gap-1.5">
                <Palette className="w-3.5 h-3.5 text-blue-600" /> Accent Color Palette
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                {ACCENT_PALETTES.map((palette) => {
                  const isSelected = themeConfig.accent === palette.id;
                  return (
                    <button
                      key={palette.id}
                      onClick={() => onChangeThemeConfig({ ...themeConfig, accent: palette.id })}
                      className={`p-2.5 rounded-2xl border text-xs font-bold flex items-center gap-2.5 transition-all cursor-pointer ${
                        isSelected
                          ? 'border-slate-900 dark:border-white bg-slate-100 dark:bg-slate-800 ring-2 ring-blue-500/30 shadow-xs'
                          : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/30 hover:bg-slate-100 dark:hover:bg-slate-800'
                      }`}
                    >
                      <div
                        className={`w-5 h-5 rounded-full flex items-center justify-center text-white shrink-0 ${palette.bgClass}`}
                      >
                        {isSelected && <Check className="w-3 h-3" />}
                      </div>
                      <span className="text-slate-800 dark:text-slate-200 font-extrabold truncate">
                        {palette.name}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2.5 flex items-center gap-1.5">
                <Map className="w-3.5 h-3.5 text-emerald-600" /> Map Style Theme
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {MAP_STYLES.map((mapStyle) => {
                  const isSelected = themeConfig.mapStyle === mapStyle.id;
                  return (
                    <button
                      key={mapStyle.id}
                      onClick={() => onChangeThemeConfig({ ...themeConfig, mapStyle: mapStyle.id })}
                      className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                        isSelected
                          ? 'border-blue-600 bg-blue-50/80 dark:bg-blue-950/60 ring-2 ring-blue-500/20'
                          : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/30 hover:bg-slate-100 dark:hover:bg-slate-800'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-extrabold text-slate-900 dark:text-white">
                          {mapStyle.name}
                        </span>
                        {isSelected && <Check className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />}
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-1 font-medium">
                        {mapStyle.description}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-3">
              <label className="text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                <Sliders className="w-3.5 h-3.5 text-purple-600" /> Accessibility & Layout Density
              </label>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800">
                <div>
                  <h4 className="text-xs font-extrabold text-slate-900 dark:text-white">Interface Layout Density</h4>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                    Choose compact spacing for data-dense monitoring
                  </p>
                </div>
                <div className="flex items-center gap-1 bg-white dark:bg-slate-900 p-1 rounded-xl border border-slate-200 dark:border-slate-700 shrink-0">
                  <button
                    type="button"
                    onClick={() => onChangeThemeConfig({ ...themeConfig, density: 'comfortable' })}
                    className={`px-2.5 py-1 rounded-lg text-xs font-extrabold transition-all cursor-pointer ${
                      themeConfig.density === 'comfortable'
                        ? 'bg-blue-600 text-white shadow-2xs'
                        : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    Comfortable
                  </button>
                  <button
                    type="button"
                    onClick={() => onChangeThemeConfig({ ...themeConfig, density: 'compact' })}
                    className={`px-2.5 py-1 rounded-lg text-xs font-extrabold transition-all cursor-pointer ${
                      themeConfig.density === 'compact'
                        ? 'bg-blue-600 text-white shadow-2xs'
                        : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    Compact
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800">
                <div>
                  <h4 className="text-xs font-extrabold text-slate-900 dark:text-white">
                    High Contrast Structural Borders
                  </h4>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                    Enhances readability in direct sunlight or high brightness
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onChangeThemeConfig({ ...themeConfig, highContrast: !themeConfig.highContrast })}
                  className={`w-11 h-6 rounded-full transition-colors relative p-0.5 cursor-pointer shrink-0 ${
                    themeConfig.highContrast ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-700'
                  }`}
                >
                  <div
                    className={`w-5 h-5 rounded-full bg-white shadow-md transform transition-transform ${
                      themeConfig.highContrast ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            </div>
          </div>

          <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/80 backdrop-blur-md flex items-center justify-between gap-3">
            <button
              onClick={onResetTheme}
              className="px-3.5 py-2 text-xs font-bold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset Defaults</span>
            </button>

            <button
              onClick={onClose}
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-extrabold transition-all shadow-sm cursor-pointer flex items-center gap-1.5"
            >
              <Check className="w-4 h-4" />
              <span>Done</span>
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
