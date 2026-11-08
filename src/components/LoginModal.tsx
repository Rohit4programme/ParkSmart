import React, { useState, useEffect, useRef } from 'react';
import { UserAccount } from '../types';
import {
  encryptE2EEData,
  decryptE2EEData,
} from '../utils/crypto';
import {
  signUpWithEmail,
  signInWithEmail,
  signInWithOAuth,
  saveProfile,
  getAuthErrorMessage,
} from '../lib/auth';
import {
  Lock,
  ShieldCheck,
  KeyRound,
  User,
  Mail,
  Car,
  X,
  CheckCircle2,
  Cpu,
  Eye,
  EyeOff,
  LogOut,
  RefreshCw,
  Copy,
  Check,
  Plus,
  Trash2,
  Star,
  Edit2,
  Info,
  MapPin,
  Navigation,
  CreditCard,
  Shield,
  Smartphone,
  Calendar,
  QrCode,
  Wallet,
  Cloud,
  Gauge,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { VehicleProfile, SpotType } from '../types';

interface Props {
  user: UserAccount | null;
  onLoginSuccess: (account: UserAccount) => void;
  onLogout: () => void;
  onClose: () => void;
  canClose?: boolean;
  isOpen?: boolean;
}

const floatingIcons = [
  { Icon: Car, delay: 0, duration: 7, x: '10%', y: '20%' },
  { Icon: MapPin, delay: 1.2, duration: 8, x: '75%', y: '15%' },
  { Icon: Navigation, delay: 0.5, duration: 6, x: '85%', y: '45%' },
  { Icon: CreditCard, delay: 2, duration: 9, x: '15%', y: '70%' },
  { Icon: Shield, delay: 1.8, duration: 7.5, x: '70%', y: '75%' },
  { Icon: Smartphone, delay: 0.8, duration: 8.5, x: '25%', y: '40%' },
  { Icon: Calendar, delay: 2.5, duration: 6.5, x: '60%', y: '25%' },
  { Icon: QrCode, delay: 1.5, duration: 7, x: '40%', y: '80%' },
  { Icon: Wallet, delay: 0.3, duration: 9, x: '90%', y: '60%' },
  { Icon: Cloud, delay: 2.2, duration: 8, x: '5%', y: '50%' },
  { Icon: Gauge, delay: 1, duration: 7.5, x: '50%', y: '10%' },
  { Icon: KeyRound, delay: 0.7, duration: 6, x: '35%', y: '55%' },
];

export const LoginModal: React.FC<Props> = (props) => {
  const isOpen = props.isOpen !== undefined ? props.isOpen : true;
  return (
    <AnimatePresence>
      {isOpen && <LoginModalContent {...props} />}
    </AnimatePresence>
  );
};

const LoginModalContent: React.FC<Props> = ({
  user,
  onLoginSuccess,
  onLogout,
  onClose,
  canClose = true,
}) => {
  const [activeTab, setActiveTab] = useState<'login' | 'register'>('login');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [vehiclePlate, setVehiclePlate] = useState('');
  const [vehicleModel, setVehicleModel] = useState('');

  const [showPassword, setShowPassword] = useState(false);
  const [isEncrypting, setIsEncrypting] = useState(false);
  const [cryptoStatus, setCryptoStatus] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [infoMsg, setInfoMsg] = useState<string>('');

  const [decryptedVaultData, setDecryptedVaultData] = useState<string | null>(null);
  const [isDecryptingVault, setIsDecryptingVault] = useState(false);
  const [vaultPassphraseInput, setVaultPassphraseInput] = useState('');
  const [copiedKey, setCopiedKey] = useState(false);

  const [profileTab, setProfileTab] = useState<'vehicles' | 'vault'>('vehicles');

  const [isAddingVehicle, setIsAddingVehicle] = useState(false);
  const [newVehNickname, setNewVehNickname] = useState('');
  const [newVehPlate, setNewVehPlate] = useState('');
  const [newVehModel, setNewVehModel] = useState('');
  const [newVehColor, setNewVehColor] = useState('Pearl White');
  const [newVehType, setNewVehType] = useState<SpotType>('ev');
  const [newVehIsDefault, setNewVehIsDefault] = useState(false);

  const [editingVehId, setEditingVehId] = useState<string | null>(null);
  const [editVehNickname, setEditVehNickname] = useState('');
  const [editVehPlate, setEditVehPlate] = useState('');
  const [editVehModel, setEditVehModel] = useState('');
  const [editVehColor, setEditVehColor] = useState('');
  const [editVehType, setEditVehType] = useState<SpotType>('standard');

  const startEditVehicle = (v: VehicleProfile) => {
    setEditingVehId(v.id);
    setEditVehNickname(v.nickname || '');
    setEditVehPlate(v.vehiclePlate);
    setEditVehModel(v.makeModel);
    setEditVehColor(v.color || 'Pearl White');
    setEditVehType(v.type || 'standard');
  };

  const handleSaveEditVehicle = () => {
    if (!user || !editingVehId || !editVehPlate || !editVehModel) return;

    const existing = user.vehicles && user.vehicles.length > 0 ? user.vehicles : [];
    const updatedVehicles = existing.map((v) => {
      if (v.id === editingVehId) {
        return {
          ...v,
          nickname: editVehNickname || editVehModel,
          makeModel: editVehModel,
          vehiclePlate: editVehPlate.trim().toUpperCase(),
          type: editVehType,
          color: editVehColor,
        };
      }
      return v;
    });

    const editedObj = updatedVehicles.find((v) => v.id === editingVehId);
    const updatedUser: UserAccount = {
      ...user,
      vehicles: updatedVehicles,
      vehiclePlate: editedObj?.isDefault ? editedObj.vehiclePlate : user.vehiclePlate,
      vehicleModel: editedObj?.isDefault ? editedObj.makeModel : user.vehicleModel,
    };

    localStorage.setItem('parksmart_current_user', JSON.stringify(updatedUser));
    if (user.email) {
      localStorage.setItem(`parksmart_user_${user.email.trim().toLowerCase()}`, JSON.stringify(updatedUser));
    }
    onLoginSuccess(updatedUser);
    setEditingVehId(null);
  };

  const handleAddVehicleProfile = () => {
    if (!user || !newVehPlate || !newVehModel) return;

    const existingVehicles: VehicleProfile[] =
      user.vehicles && user.vehicles.length > 0
        ? user.vehicles
        : user.vehiclePlate && user.vehicleModel
        ? [
            {
              id: 'veh_default',
              nickname: 'Primary Vehicle',
              makeModel: user.vehicleModel,
              vehiclePlate: user.vehiclePlate,
              type: 'standard' as SpotType,
              color: 'Black',
              isDefault: true,
            }
          ]
        : [];

    const isFirst = existingVehicles.length === 0;
    const shouldBeDefault = isFirst || newVehIsDefault;

    let updatedVehicles = existingVehicles;
    if (shouldBeDefault) {
      updatedVehicles = updatedVehicles.map((v) => ({ ...v, isDefault: false }));
    }

    const newProfile: VehicleProfile = {
      id: `veh_${Date.now()}`,
      nickname: newVehNickname || newVehModel,
      makeModel: newVehModel,
      vehiclePlate: newVehPlate.trim().toUpperCase(),
      type: newVehType,
      color: newVehColor || 'Pearl White',
      isDefault: shouldBeDefault,
    };

    updatedVehicles = [...updatedVehicles, newProfile];

    const updatedUser: UserAccount = {
      ...user,
      vehicles: updatedVehicles,
      vehiclePlate: newProfile.isDefault ? newProfile.vehiclePlate : user.vehiclePlate,
      vehicleModel: newProfile.isDefault ? newProfile.makeModel : user.vehicleModel,
    };

    localStorage.setItem('parksmart_current_user', JSON.stringify(updatedUser));
    if (user.email) {
      localStorage.setItem(`parksmart_user_${user.email.trim().toLowerCase()}`, JSON.stringify(updatedUser));
    }
    onLoginSuccess(updatedUser);

    setIsAddingVehicle(false);
    setNewVehNickname('');
    setNewVehPlate('');
    setNewVehModel('');
    setNewVehIsDefault(false);
  };

  const handleRemoveVehicleProfile = (vehId: string) => {
    if (!user || !user.vehicles) return;
    const updatedVehicles = user.vehicles.filter((v) => v.id !== vehId);
    
    let defaultPlate = user.vehiclePlate;
    let defaultModel = user.vehicleModel;
    if (updatedVehicles.length > 0 && !updatedVehicles.some((v) => v.isDefault)) {
      updatedVehicles[0].isDefault = true;
      defaultPlate = updatedVehicles[0].vehiclePlate;
      defaultModel = updatedVehicles[0].makeModel;
    }

    const updatedUser: UserAccount = {
      ...user,
      vehicles: updatedVehicles,
      vehiclePlate: defaultPlate,
      vehicleModel: defaultModel,
    };

    localStorage.setItem('parksmart_current_user', JSON.stringify(updatedUser));
    if (user.email) {
      localStorage.setItem(`parksmart_user_${user.email.trim().toLowerCase()}`, JSON.stringify(updatedUser));
    }
    onLoginSuccess(updatedUser);
  };

  const handleSetDefaultVehicleProfile = (vehId: string) => {
    if (!user || !user.vehicles) return;
    let selectedVeh: VehicleProfile | undefined;
    const updatedVehicles = user.vehicles.map((v) => {
      if (v.id === vehId) {
        selectedVeh = v;
        return { ...v, isDefault: true };
      }
      return { ...v, isDefault: false };
    });

    const updatedUser: UserAccount = {
      ...user,
      vehicles: updatedVehicles,
      vehiclePlate: selectedVeh ? selectedVeh.vehiclePlate : user.vehiclePlate,
      vehicleModel: selectedVeh ? selectedVeh.makeModel : user.vehicleModel,
    };

    localStorage.setItem('parksmart_current_user', JSON.stringify(updatedUser));
    if (user.email) {
      localStorage.setItem(`parksmart_user_${user.email.trim().toLowerCase()}`, JSON.stringify(updatedUser));
    }
    onLoginSuccess(updatedUser);
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setInfoMsg('');
    if (!email || !password || !name) {
      setErrorMsg('Please complete all required fields.');
      return;
    }

    try {
      setIsEncrypting(true);
      setCryptoStatus('Creating secure account...');

      const vaultPayload = JSON.stringify({
        email: email.trim(),
        name: name.trim(),
        vehiclePlate: vehiclePlate.trim().toUpperCase(),
        vehicleModel: vehicleModel.trim(),
        createdAt: new Date().toISOString(),
      });

      // Optional client-side E2EE vault for the user's own profile data.
      setCryptoStatus('Encrypting Vault Payload using AES-GCM-256...');
      const { cipherText, iv, salt } = await encryptE2EEData(vaultPayload, password);

      const result = await signUpWithEmail(email.trim(), password, {
        name: name.trim(),
        vehiclePlate: vehiclePlate.trim().toUpperCase(),
        vehicleModel: vehicleModel.trim(),
      });

      if (result.error) {
        setErrorMsg(getAuthErrorMessage(result.error));
        return;
      }

      if (result.requiresEmailConfirmation) {
        setCryptoStatus('');
        setErrorMsg('');
        setInfoMsg('Account created! Check your email to confirm your account, then sign in.');
        return;
      }

      const newAccount: UserAccount = {
        ...(result.user as UserAccount),
        isE2EEEnabled: true,
        e2eeSaltHex: salt,
        e2eeIvHex: iv,
        encryptedVaultCipher: cipherText,
      };
      saveProfile(newAccount);
      localStorage.setItem('parksmart_current_user', JSON.stringify(newAccount));

      onLoginSuccess(newAccount);
    } catch (err: unknown) {
      console.error('Registration error:', err);
      setErrorMsg(getAuthErrorMessage(err));
    } finally {
      setIsEncrypting(false);
      setCryptoStatus('');
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setInfoMsg('');

    if (!email || !password) {
      setErrorMsg('Please enter email and passphrase.');
      return;
    }

    try {
      setIsEncrypting(true);
      setCryptoStatus('Signing in securely...');

      const result = await signInWithEmail(email.trim(), password);

      if (result.error) {
        setErrorMsg(getAuthErrorMessage(result.error));
        setIsEncrypting(false);
        setCryptoStatus('');
        return;
      }

      const account = result.user as UserAccount;
      localStorage.setItem('parksmart_current_user', JSON.stringify(account));

      onLoginSuccess(account);
    } catch (err: unknown) {
      setErrorMsg(getAuthErrorMessage(err));
    } finally {
      setIsEncrypting(false);
      setCryptoStatus('');
    }
  };

  const handleDecryptVault = async () => {
    if (!user || !user.encryptedVaultCipher || !user.e2eeIvHex || !user.e2eeSaltHex) return;
    if (!vaultPassphraseInput) {
      setErrorMsg('Enter your master passphrase to unlock vault.');
      return;
    }

    try {
      setIsDecryptingVault(true);
      setErrorMsg('');
      const decrypted = await decryptE2EEData(
        user.encryptedVaultCipher,
        user.e2eeIvHex,
        user.e2eeSaltHex,
        vaultPassphraseInput
      );
      setDecryptedVaultData(decrypted);
    } catch (err) {
      setErrorMsg('Decryption failed! Incorrect master passphrase.');
      setDecryptedVaultData(null);
    } finally {
      setIsDecryptingVault(false);
    }
  };

  const savedVehicles: VehicleProfile[] =
    user?.vehicles && user.vehicles.length > 0
      ? user.vehicles
      : user?.vehiclePlate && user?.vehicleModel
      ? [
          {
            id: 'veh_primary',
            nickname: 'Primary Vehicle',
            makeModel: user.vehicleModel,
            vehiclePlate: user.vehiclePlate,
            type: 'standard' as SpotType,
            color: 'Black',
            isDefault: true,
          }
        ]
      : [];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
      className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden"
      onClick={() => { if (canClose) onClose(); }}
    >
      {/* Animated Background */}
      <div className="absolute inset-0 bg-gradient-to-br from-slate-100 via-slate-50 to-cyan-50 dark:from-[#0a0e1a] dark:via-[#0F172A] dark:to-[#0d1f2d]">
        {/* Gradient Orbs */}
        <motion.div
          className="absolute w-[600px] h-[600px] rounded-full bg-gradient-to-r from-teal-500/15 to-cyan-500/10 blur-[120px]"
          animate={{
            x: [0, 100, -50, 0],
            y: [0, -80, 60, 0],
          }}
          transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
          style={{ top: '10%', left: '20%' }}
        />
        <motion.div
          className="absolute w-[500px] h-[500px] rounded-full bg-gradient-to-r from-[#0F172A]/40 to-teal-600/10 blur-[100px]"
          animate={{
            x: [0, -80, 40, 0],
            y: [0, 60, -40, 0],
          }}
          transition={{ duration: 15, repeat: Infinity, ease: "linear" }}
          style={{ bottom: '10%', right: '10%' }}
        />
        <motion.div
          className="absolute w-[400px] h-[400px] rounded-full bg-gradient-to-r from-cyan-400/8 to-teal-500/8 blur-[80px]"
          animate={{
            x: [0, 60, -30, 0],
            y: [0, -40, 80, 0],
          }}
          transition={{ duration: 18, repeat: Infinity, ease: "linear" }}
          style={{ top: '50%', left: '50%' }}
        />

        {/* Grid Pattern */}
        <div className="absolute inset-0 opacity-[0.03]" style={{
          backgroundImage: `linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)`,
          backgroundSize: '60px 60px'
        }} />

        {/* Floating Icons */}
        {floatingIcons.map(({ Icon, delay, duration, x, y }, i) => (
          <motion.div
            key={i}
            className="absolute text-teal-500/15 dark:text-teal-400/10"
            style={{ left: x, top: y }}
            animate={{
              y: [0, -20, 0],
              opacity: [0.1, 0.25, 0.1],
              scale: [1, 1.1, 1],
              rotate: [0, 5, -5, 0],
            }}
            transition={{
              duration,
              delay,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          >
            <Icon className="w-8 h-8" strokeWidth={1.5} />
          </motion.div>
        ))}
      </div>

      {/* Main Content */}
      <div className="relative z-10 w-full max-w-6xl mx-auto flex flex-col lg:flex-row items-center gap-8 p-4 sm:p-6 min-h-screen">
        {/* Left Panel - Illustration (Desktop only) */}
        <motion.div
          initial={{ opacity: 0, x: -40 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.7, delay: 0.2 }}
          className="hidden lg:flex flex-1 flex-col items-center justify-center text-center"
        >
          <div className="relative mb-8">
            {/* Main Illustration */}
            <motion.div
              animate={{ y: [0, -10, 0] }}
              transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
              className="relative"
            >
              <div className="w-64 h-64 rounded-3xl bg-gradient-to-br from-[#0F172A] to-[#1a2744] backdrop-blur-xl border border-teal-500/20 flex items-center justify-center shadow-2xl">
                <div className="relative">
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 30, repeat: Infinity, ease: "linear" }}
                    className="absolute -inset-8 border border-dashed border-teal-400/30 rounded-full"
                  />
                  <img src="/assets/logo.svg" alt="ParkSmart" className="w-28 h-28" />
                  <motion.div
                    className="absolute -top-2 -right-2 w-8 h-8 bg-emerald-500 rounded-full flex items-center justify-center"
                    animate={{ scale: [1, 1.2, 1] }}
                    transition={{ duration: 2, repeat: Infinity }}
                  >
                    <Check className="w-5 h-5 text-white" />
                  </motion.div>
                </div>
              </div>

              {/* Floating Elements */}
              <motion.div
                animate={{ x: [0, 10, 0], y: [0, -5, 0] }}
                transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                className="absolute -top-4 -right-8 p-3 bg-[#0F172A]/90 backdrop-blur-md rounded-2xl border border-teal-500/20 shadow-lg"
              >
                <Car className="w-6 h-6 text-teal-400" />
              </motion.div>

              <motion.div
                animate={{ x: [0, -8, 0], y: [0, 8, 0] }}
                transition={{ duration: 4, repeat: Infinity, ease: "easeInOut", delay: 1 }}
                className="absolute -bottom-4 -left-8 p-3 bg-[#0F172A]/90 backdrop-blur-md rounded-2xl border border-teal-500/20 shadow-lg"
              >
                <Navigation className="w-6 h-6 text-teal-400" />
              </motion.div>

              <motion.div
                animate={{ x: [0, 6, 0], y: [0, -6, 0] }}
                transition={{ duration: 3.5, repeat: Infinity, ease: "easeInOut", delay: 0.5 }}
                className="absolute top-1/2 -right-12 p-3 bg-[#0F172A]/90 backdrop-blur-md rounded-2xl border border-teal-500/20 shadow-lg"
              >
                <CreditCard className="w-6 h-6 text-teal-400" />
              </motion.div>
            </motion.div>
          </div>

          {/* Text Content */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.5 }}
          >
            <h1 className="text-4xl font-bold text-slate-900 dark:text-white mb-4 tracking-tight">
              Find & Book <span className="text-transparent bg-clip-text bg-gradient-to-r from-teal-400 to-cyan-400">Parking</span> Instantly
            </h1>
            <p className="text-slate-500 dark:text-white/60 text-lg max-w-md">
              Smart parking solutions with end-to-end encrypted security. Your data stays yours.
            </p>
          </motion.div>

          {/* Stats */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.7 }}
            className="flex gap-8 mt-8"
          >
            {[
              { value: '50K+', label: 'Parking Spots' },
              { value: '100%', label: 'Encrypted' },
              { value: '24/7', label: 'Available' },
            ].map((stat, i) => (
              <div key={i} className="text-center">
                <div className="text-2xl font-bold text-slate-900 dark:text-white">{stat.value}</div>
                <div className="text-sm text-slate-500 dark:text-white/50">{stat.label}</div>
              </div>
            ))}
          </motion.div>
        </motion.div>

        {/* Right Panel - Login Card */}
        <motion.div
          initial={{ opacity: 0, y: 30, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="w-full max-w-[460px] lg:w-[460px]"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="bg-white/90 dark:bg-white/10 backdrop-blur-2xl rounded-3xl border border-slate-200/80 dark:border-white/20 shadow-2xl overflow-hidden">
            {/* Card Header */}
            <div className="p-6 pb-0">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#0F172A] to-teal-600 flex items-center justify-center">
                    <img src="/assets/logo.svg" alt="ParkSmart" className="w-6 h-6" />
                  </div>
                  <div>
                    <h2 className="text-slate-900 dark:text-white font-bold text-lg">ParkSmart</h2>
                    <p className="text-slate-500 dark:text-white/50 text-xs">Smart Parking</p>
                  </div>
                </div>
                {canClose && (
                  <button
                    onClick={onClose}
                    className="p-2 text-slate-400 dark:text-white/50 hover:text-slate-600 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10 rounded-xl transition-all"
                  >
                    <X className="w-5 h-5" />
                  </button>
                )}
              </div>

              {user ? (
                <div>
                  <h3 className="text-2xl font-bold text-slate-900 dark:text-white mb-1">Welcome back!</h3>
                  <p className="text-slate-500 dark:text-white/60 text-sm">Manage your encrypted vault and vehicles</p>
                </div>
              ) : (
                <div>
                  <h3 className="text-2xl font-bold text-slate-900 dark:text-white mb-1">
                    {activeTab === 'login' ? 'Welcome back' : 'Create account'}
                  </h3>
                  <p className="text-slate-500 dark:text-white/60 text-sm">
                    {activeTab === 'login' ? 'Sign in to access your encrypted vault' : 'Start your secure parking journey'}
                  </p>
                </div>
              )}
            </div>

            {/* Card Content */}
            <div className="p-6">
              {user ? (
                <UserProfileSection
                  user={user}
                  onLogout={onLogout}
                  profileTab={profileTab}
                  setProfileTab={setProfileTab}
                  savedVehicles={savedVehicles}
                  isAddingVehicle={isAddingVehicle}
                  setIsAddingVehicle={setIsAddingVehicle}
                  newVehNickname={newVehNickname}
                  setNewVehNickname={setNewVehNickname}
                  newVehPlate={newVehPlate}
                  setNewVehPlate={setNewVehPlate}
                  newVehModel={newVehModel}
                  setNewVehModel={setNewVehModel}
                  newVehType={newVehType}
                  setNewVehType={setNewVehType}
                  newVehIsDefault={newVehIsDefault}
                  setNewVehIsDefault={setNewVehIsDefault}
                  handleAddVehicleProfile={handleAddVehicleProfile}
                  editingVehId={editingVehId}
                  startEditVehicle={startEditVehicle}
                  editVehNickname={editVehNickname}
                  setEditVehNickname={setEditVehNickname}
                  editVehPlate={editVehPlate}
                  setEditVehPlate={setEditVehPlate}
                  editVehModel={editVehModel}
                  setEditVehModel={setEditVehModel}
                  editVehType={editVehType}
                  setEditVehType={setEditVehType}
                  handleSaveEditVehicle={handleSaveEditVehicle}
                  setEditingVehId={setEditingVehId}
                  handleSetDefaultVehicleProfile={handleSetDefaultVehicleProfile}
                  handleRemoveVehicleProfile={handleRemoveVehicleProfile}
                  vaultPassphraseInput={vaultPassphraseInput}
                  setVaultPassphraseInput={setVaultPassphraseInput}
                  handleDecryptVault={handleDecryptVault}
                  isDecryptingVault={isDecryptingVault}
                  decryptedVaultData={decryptedVaultData}
                  errorMsg={errorMsg}
                />
              ) : (
                <AuthForm
                  activeTab={activeTab}
                  setActiveTab={setActiveTab}
                  email={email}
                  setEmail={setEmail}
                  password={password}
                  setPassword={setPassword}
                  name={name}
                  setName={setName}
                  vehiclePlate={vehiclePlate}
                  setVehiclePlate={setVehiclePlate}
                  vehicleModel={vehicleModel}
                  setVehicleModel={setVehicleModel}
                  showPassword={showPassword}
                  setShowPassword={setShowPassword}
                  isEncrypting={isEncrypting}
                  cryptoStatus={cryptoStatus}
                  errorMsg={errorMsg}
                  infoMsg={infoMsg}
                  handleLogin={handleLogin}
                  handleRegister={handleRegister}
                />
              )}
            </div>

            {/* Security Badge */}
            {!user && (
              <div className="px-6 pb-6">
                <div className="flex items-center justify-center gap-2 text-slate-400 dark:text-white/40 text-xs">
                  <ShieldCheck className="w-4 h-4" />
                  <span>Protected by AES-256-GCM encryption</span>
                </div>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
};

// Auth Form Component
const AuthForm: React.FC<{
  activeTab: 'login' | 'register';
  setActiveTab: (tab: 'login' | 'register') => void;
  email: string;
  setEmail: (v: string) => void;
  password: string;
  setPassword: (v: string) => void;
  name: string;
  setName: (v: string) => void;
  vehiclePlate: string;
  setVehiclePlate: (v: string) => void;
  vehicleModel: string;
  setVehicleModel: (v: string) => void;
  showPassword: boolean;
  setShowPassword: (v: boolean) => void;
  isEncrypting: boolean;
  cryptoStatus: string;
  errorMsg: string;
  infoMsg: string;
  handleLogin: (e: React.FormEvent) => void;
  handleRegister: (e: React.FormEvent) => void;
}> = ({
  activeTab,
  setActiveTab,
  email,
  setEmail,
  password,
  setPassword,
  name,
  setName,
  vehiclePlate,
  setVehiclePlate,
  vehicleModel,
  setVehicleModel,
  showPassword,
  setShowPassword,
  isEncrypting,
  cryptoStatus,
  errorMsg,
  infoMsg,
  handleLogin,
  handleRegister,
}) => {
  return (
    <div className="space-y-5">
      {/* Tab Toggle */}
      <div className="flex gap-2 p-1 bg-slate-100 dark:bg-white/5 rounded-2xl">
        <button
          onClick={() => setActiveTab('login')}
          className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all ${
            activeTab === 'login'
              ? 'bg-white dark:bg-[var(--color-accent)] text-slate-900 dark:text-white shadow-lg'
              : 'text-slate-500 dark:text-white/60 hover:text-slate-700 dark:hover:text-white hover:bg-white/50 dark:hover:bg-white/10'
          }`}
        >
          Sign In
        </button>
        <button
          onClick={() => setActiveTab('register')}
          className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all ${
            activeTab === 'register'
              ? 'bg-white dark:bg-[var(--color-accent)] text-slate-900 dark:text-white shadow-lg'
              : 'text-slate-500 dark:text-white/60 hover:text-slate-700 dark:hover:text-white hover:bg-white/50 dark:hover:bg-white/10'
          }`}
        >
          Create Account
        </button>
      </div>

      {/* Form */}
      <form onSubmit={activeTab === 'login' ? handleLogin : handleRegister} className="space-y-4">
        {activeTab === 'register' && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
          >
            <div className="relative">
              <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 dark:text-white/40" />
              <input
                type="text"
                required
                placeholder="Full name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full pl-12 pr-4 py-3.5 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-white/40 focus:outline-none focus:border-[var(--color-accent)] focus:bg-white dark:focus:bg-white/10 transition-all"
              />
            </div>
          </motion.div>
        )}

        <div className="relative">
          <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 dark:text-white/40" />
          <input
            type="email"
            required
            placeholder="Email address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full pl-12 pr-4 py-3.5 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-white/40 focus:outline-none focus:border-[var(--color-accent)] focus:bg-white dark:focus:bg-white/10 transition-all"
          />
        </div>

        <div className="relative">
          <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 dark:text-white/40" />
          <input
            type={showPassword ? 'text' : 'password'}
            required
            placeholder="Master passphrase"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full pl-12 pr-12 py-3.5 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-white/40 focus:outline-none focus:border-[var(--color-accent)] focus:bg-white dark:focus:bg-white/10 transition-all"
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 dark:text-white/40 hover:text-slate-600 dark:hover:text-white transition-colors"
          >
            {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
          </button>
        </div>

        {activeTab === 'register' && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="grid grid-cols-2 gap-3"
          >
            <div className="relative">
              <Car className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 dark:text-white/40" />
              <input
                type="text"
                placeholder="License plate"
                value={vehiclePlate}
                onChange={(e) => setVehiclePlate(e.target.value)}
                className="w-full pl-12 pr-4 py-3.5 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-white/40 focus:outline-none focus:border-[var(--color-accent)] focus:bg-white dark:focus:bg-white/10 transition-all uppercase"
              />
            </div>
            <input
              type="text"
              placeholder="Vehicle model"
              value={vehicleModel}
              onChange={(e) => setVehicleModel(e.target.value)}
              className="w-full px-4 py-3.5 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-white/40 focus:outline-none focus:border-[var(--color-accent)] focus:bg-white dark:focus:bg-white/10 transition-all"
            />
          </motion.div>
        )}

        {activeTab === 'login' && (
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-slate-500 dark:text-white/60 text-sm cursor-pointer">
              <input type="checkbox" className="w-4 h-4 rounded bg-slate-100 dark:bg-white/5 border-slate-300 dark:border-white/20 text-[var(--color-accent)] focus:ring-[var(--color-accent)]" />
              Remember me
            </label>
            <button type="button" className="text-[var(--color-accent)] text-sm hover:opacity-80 transition-opacity">
              Forgot password?
            </button>
          </div>
        )}

        {errorMsg && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-3 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-xl text-red-600 dark:text-red-400 text-sm"
          >
            {errorMsg}
          </motion.div>
        )}

        {infoMsg && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-3 bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/30 rounded-xl text-blue-600 dark:text-blue-400 text-sm"
          >
            {infoMsg}
          </motion.div>
        )}

        {isEncrypting && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="p-3 bg-[var(--color-accent)]/10 border border-[var(--color-accent)]/30 rounded-xl flex items-center gap-3"
          >
            <Cpu className="w-5 h-5 text-[var(--color-accent)] animate-spin" />
            <span className="text-[var(--color-accent)] text-sm">{cryptoStatus || 'Processing...'}</span>
          </motion.div>
        )}

        <button
          type="submit"
          disabled={isEncrypting}
          className="w-full py-3.5 bg-gradient-to-r from-[var(--color-accent)] to-purple-600 hover:from-[var(--color-accent-hover)] hover:to-purple-700 disabled:from-slate-300 disabled:to-slate-400 dark:disabled:from-white/20 dark:disabled:to-white/20 text-white font-semibold rounded-xl transition-all transform hover:scale-[1.02] hover:shadow-lg hover:shadow-[var(--color-accent)]/25 disabled:scale-100 disabled:shadow-none"
        >
          {isEncrypting ? (
            <span className="flex items-center justify-center gap-2">
              <RefreshCw className="w-5 h-5 animate-spin" />
              Processing...
            </span>
          ) : activeTab === 'login' ? (
            'Sign In'
          ) : (
            'Create Account'
          )}
        </button>
      </form>

      {/* Divider */}
      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-slate-200 dark:border-white/10"></div>
        </div>
        <div className="relative flex justify-center text-sm">
          <span className="px-4 bg-transparent text-slate-400 dark:text-white/40">or continue with</span>
        </div>
      </div>

      {/* Social Login */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { name: 'Google', icon: 'G', provider: 'google' as const },
          { name: 'GitHub', icon: '⌘', provider: 'github' as const },
        ].map((p) => (
          <button
            key={p.name}
            type="button"
            onClick={async () => {
              const { error } = await signInWithOAuth(p.provider);
              if (error) alert(error);
            }}
            className="py-3 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl text-slate-700 dark:text-white/70 font-medium text-sm hover:bg-slate-100 dark:hover:bg-white/10 hover:text-slate-900 dark:hover:text-white transition-all cursor-pointer"
          >
            {p.icon}
          </button>
        ))}
        {[
          { name: 'Apple', icon: '' },
          { name: 'X', icon: 'X' },
        ].map((p) => (
          <button
            key={p.name}
            disabled
            className="py-3 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl text-slate-400 dark:text-white/40 font-medium text-sm hover:bg-slate-100 dark:hover:bg-white/10 hover:text-slate-600 dark:hover:text-white/60 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            title={`${p.name} (coming soon)`}
          >
            {p.icon || p.name.charAt(0)}
          </button>
        ))}
      </div>
    </div>
  );
};

// User Profile Section Component
const UserProfileSection: React.FC<{
  user: UserAccount;
  onLogout: () => void;
  profileTab: 'vehicles' | 'vault';
  setProfileTab: (tab: 'vehicles' | 'vault') => void;
  savedVehicles: VehicleProfile[];
  isAddingVehicle: boolean;
  setIsAddingVehicle: (v: boolean) => void;
  newVehNickname: string;
  setNewVehNickname: (v: string) => void;
  newVehPlate: string;
  setNewVehPlate: (v: string) => void;
  newVehModel: string;
  setNewVehModel: (v: string) => void;
  newVehType: SpotType;
  setNewVehType: (v: SpotType) => void;
  newVehIsDefault: boolean;
  setNewVehIsDefault: (v: boolean) => void;
  handleAddVehicleProfile: () => void;
  editingVehId: string | null;
  startEditVehicle: (v: VehicleProfile) => void;
  editVehNickname: string;
  setEditVehNickname: (v: string) => void;
  editVehPlate: string;
  setEditVehPlate: (v: string) => void;
  editVehModel: string;
  setEditVehModel: (v: string) => void;
  editVehType: SpotType;
  setEditVehType: (v: SpotType) => void;
  handleSaveEditVehicle: () => void;
  setEditingVehId: (v: string | null) => void;
  handleSetDefaultVehicleProfile: (v: string) => void;
  handleRemoveVehicleProfile: (v: string) => void;
  vaultPassphraseInput: string;
  setVaultPassphraseInput: (v: string) => void;
  handleDecryptVault: () => void;
  isDecryptingVault: boolean;
  decryptedVaultData: string | null;
  errorMsg: string;
}> = ({
  user,
  onLogout,
  profileTab,
  setProfileTab,
  savedVehicles,
  isAddingVehicle,
  setIsAddingVehicle,
  newVehNickname,
  setNewVehNickname,
  newVehPlate,
  setNewVehPlate,
  newVehModel,
  setNewVehModel,
  newVehType,
  setNewVehType,
  newVehIsDefault,
  setNewVehIsDefault,
  handleAddVehicleProfile,
  editingVehId,
  startEditVehicle,
  editVehNickname,
  setEditVehNickname,
  editVehPlate,
  setEditVehPlate,
  editVehModel,
  setEditVehModel,
  editVehType,
  setEditVehType,
  handleSaveEditVehicle,
  setEditingVehId,
  handleSetDefaultVehicleProfile,
  handleRemoveVehicleProfile,
  vaultPassphraseInput,
  setVaultPassphraseInput,
  handleDecryptVault,
  isDecryptingVault,
  decryptedVaultData,
  errorMsg,
}) => {
  return (
    <div className="space-y-5">
      {/* User Card */}
      <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-white/5 rounded-2xl border border-slate-200 dark:border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[var(--color-accent)] to-purple-600 flex items-center justify-center text-white font-bold text-lg">
            {user.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <h4 className="text-slate-900 dark:text-white font-semibold flex items-center gap-2">
              {user.name}
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            </h4>
            <p className="text-slate-500 dark:text-white/50 text-sm">{user.email}</p>
            {user.vehiclePlate && (
              <p className="text-slate-400 dark:text-white/40 text-xs mt-0.5">
                <span className="text-[var(--color-accent)] font-mono">{user.vehiclePlate}</span> • {user.vehicleModel}
              </p>
            )}
          </div>
        </div>
        <button
          onClick={onLogout}
          className="p-2 text-slate-400 dark:text-white/50 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-xl transition-all"
        >
          <LogOut className="w-5 h-5" />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 p-1 bg-slate-100 dark:bg-white/5 rounded-xl">
        <button
          onClick={() => setProfileTab('vehicles')}
          className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2 ${
            profileTab === 'vehicles'
              ? 'bg-white dark:bg-white/10 text-slate-900 dark:text-white shadow-sm'
              : 'text-slate-500 dark:text-white/50 hover:text-slate-700 dark:hover:text-white'
          }`}
        >
          <Car className="w-4 h-4" />
          Vehicles ({savedVehicles.length})
        </button>
        <button
          onClick={() => setProfileTab('vault')}
          className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2 ${
            profileTab === 'vault'
              ? 'bg-white dark:bg-white/10 text-slate-900 dark:text-white shadow-sm'
              : 'text-slate-500 dark:text-white/50 hover:text-slate-700 dark:hover:text-white'
          }`}
        >
          <KeyRound className="w-4 h-4" />
          Vault
        </button>
      </div>

      {/* Content */}
      {profileTab === 'vehicles' ? (
        <VehicleProfiles
          user={user}
          savedVehicles={savedVehicles}
          isAddingVehicle={isAddingVehicle}
          setIsAddingVehicle={setIsAddingVehicle}
          newVehNickname={newVehNickname}
          setNewVehNickname={setNewVehNickname}
          newVehPlate={newVehPlate}
          setNewVehPlate={setNewVehPlate}
          newVehModel={newVehModel}
          setNewVehModel={setNewVehModel}
          newVehType={newVehType}
          setNewVehType={setNewVehType}
          newVehIsDefault={newVehIsDefault}
          setNewVehIsDefault={setNewVehIsDefault}
          handleAddVehicleProfile={handleAddVehicleProfile}
          editingVehId={editingVehId}
          startEditVehicle={startEditVehicle}
          editVehNickname={editVehNickname}
          setEditVehNickname={setEditVehNickname}
          editVehPlate={editVehPlate}
          setEditVehPlate={setEditVehPlate}
          editVehModel={editVehModel}
          setEditVehModel={setEditVehModel}
          editVehType={editVehType}
          setEditVehType={setEditVehType}
          handleSaveEditVehicle={handleSaveEditVehicle}
          setEditingVehId={setEditingVehId}
          handleSetDefaultVehicleProfile={handleSetDefaultVehicleProfile}
          handleRemoveVehicleProfile={handleRemoveVehicleProfile}
        />
      ) : (
        <VaultSection
          user={user}
          vaultPassphraseInput={vaultPassphraseInput}
          setVaultPassphraseInput={setVaultPassphraseInput}
          handleDecryptVault={handleDecryptVault}
          isDecryptingVault={isDecryptingVault}
          decryptedVaultData={decryptedVaultData}
          errorMsg={errorMsg}
        />
      )}
    </div>
  );
};

// Vehicle Profiles Component
const VehicleProfiles: React.FC<{
  user: UserAccount;
  savedVehicles: VehicleProfile[];
  isAddingVehicle: boolean;
  setIsAddingVehicle: (v: boolean) => void;
  newVehNickname: string;
  setNewVehNickname: (v: string) => void;
  newVehPlate: string;
  setNewVehPlate: (v: string) => void;
  newVehModel: string;
  setNewVehModel: (v: string) => void;
  newVehType: SpotType;
  setNewVehType: (v: SpotType) => void;
  newVehIsDefault: boolean;
  setNewVehIsDefault: (v: boolean) => void;
  handleAddVehicleProfile: () => void;
  editingVehId: string | null;
  startEditVehicle: (v: VehicleProfile) => void;
  editVehNickname: string;
  setEditVehNickname: (v: string) => void;
  editVehPlate: string;
  setEditVehPlate: (v: string) => void;
  editVehModel: string;
  setEditVehModel: (v: string) => void;
  editVehType: SpotType;
  setEditVehType: (v: SpotType) => void;
  handleSaveEditVehicle: () => void;
  setEditingVehId: (v: string | null) => void;
  handleSetDefaultVehicleProfile: (v: string) => void;
  handleRemoveVehicleProfile: (v: string) => void;
}> = ({
  user,
  savedVehicles,
  isAddingVehicle,
  setIsAddingVehicle,
  newVehNickname,
  setNewVehNickname,
  newVehPlate,
  setNewVehPlate,
  newVehModel,
  setNewVehModel,
  newVehType,
  setNewVehType,
  newVehIsDefault,
  setNewVehIsDefault,
  handleAddVehicleProfile,
  editingVehId,
  startEditVehicle,
  editVehNickname,
  setEditVehNickname,
  editVehPlate,
  setEditVehPlate,
  editVehModel,
  setEditVehModel,
  editVehType,
  setEditVehType,
  handleSaveEditVehicle,
  setEditingVehId,
  handleSetDefaultVehicleProfile,
  handleRemoveVehicleProfile,
}) => {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-slate-500 dark:text-white/50 text-sm">Manage your saved vehicles</p>
        <button
          onClick={() => setIsAddingVehicle(!isAddingVehicle)}
          className="px-3 py-1.5 bg-[var(--color-accent)]/10 text-[var(--color-accent)] rounded-lg text-sm font-medium hover:bg-[var(--color-accent)]/20 transition-all flex items-center gap-1"
        >
          <Plus className="w-4 h-4" />
          Add
        </button>
      </div>

      {/* Add Vehicle Form */}
      <AnimatePresence>
        {isAddingVehicle && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="p-4 bg-slate-50 dark:bg-white/5 rounded-xl border border-slate-200 dark:border-white/10 space-y-3">
              <input
                type="text"
                placeholder="License plate"
                value={newVehPlate}
                onChange={(e) => setNewVehPlate(e.target.value.toUpperCase())}
                className="w-full px-4 py-2.5 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-white/40 text-sm focus:outline-none focus:border-[var(--color-accent)] transition-all uppercase font-mono"
              />
              <input
                type="text"
                placeholder="Make & model"
                value={newVehModel}
                onChange={(e) => setNewVehModel(e.target.value)}
                className="w-full px-4 py-2.5 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-white/40 text-sm focus:outline-none focus:border-[var(--color-accent)] transition-all"
              />
              <input
                type="text"
                placeholder="Nickname (optional)"
                value={newVehNickname}
                onChange={(e) => setNewVehNickname(e.target.value)}
                className="w-full px-4 py-2.5 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-white/40 text-sm focus:outline-none focus:border-[var(--color-accent)] transition-all"
              />
              <select
                value={newVehType}
                onChange={(e) => setNewVehType(e.target.value as SpotType)}
                className="w-full px-4 py-2.5 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg text-slate-900 dark:text-white text-sm focus:outline-none focus:border-[var(--color-accent)] transition-all"
              >
                <option value="standard">Standard</option>
                <option value="ev">Electric Vehicle</option>
                <option value="suv">SUV / Truck</option>
                <option value="compact">Compact</option>
                <option value="disabled">Accessible</option>
              </select>
              <label className="flex items-center gap-2 text-slate-500 dark:text-white/60 text-sm">
                <input
                  type="checkbox"
                  checked={newVehIsDefault}
                  onChange={(e) => setNewVehIsDefault(e.target.checked)}
                  className="w-4 h-4 rounded bg-slate-100 dark:bg-white/5 border-slate-300 dark:border-white/20 text-[var(--color-accent)]"
                />
                Set as default
              </label>
              <button
                onClick={handleAddVehicleProfile}
                disabled={!newVehPlate || !newVehModel}
                className="w-full py-2.5 bg-gradient-to-r from-[var(--color-accent)] to-purple-600 text-white font-semibold rounded-lg text-sm disabled:opacity-50 transition-all"
              >
                Save Vehicle
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Vehicle List */}
      <div className="space-y-2 max-h-60 overflow-y-auto">
        {savedVehicles.length === 0 ? (
          <div className="p-4 text-center text-slate-400 dark:text-white/40 text-sm border border-dashed border-slate-300 dark:border-white/20 rounded-xl">
            No vehicles saved yet
          </div>
        ) : (
          savedVehicles.map((v) => (
            <div
              key={v.id}
              className={`p-3 rounded-xl border transition-all ${
                v.isDefault
                  ? 'bg-[var(--color-accent)]/10 border-[var(--color-accent)]/30'
                  : 'bg-slate-50 dark:bg-white/5 border-slate-200 dark:border-white/10'
              }`}
            >
              {editingVehId === v.id ? (
                <div className="space-y-2">
                  <input
                    type="text"
                    value={editVehPlate}
                    onChange={(e) => setEditVehPlate(e.target.value.toUpperCase())}
                    className="w-full px-3 py-2 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg text-slate-900 dark:text-white text-sm font-mono"
                    placeholder="Plate"
                  />
                  <input
                    type="text"
                    value={editVehModel}
                    onChange={(e) => setEditVehModel(e.target.value)}
                    className="w-full px-3 py-2 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg text-slate-900 dark:text-white text-sm"
                    placeholder="Model"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={handleSaveEditVehicle}
                      className="flex-1 py-2 bg-[var(--color-accent)] text-white rounded-lg text-sm font-medium"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => setEditingVehId(null)}
                      className="px-4 py-2 bg-slate-100 dark:bg-white/10 text-slate-700 dark:text-white rounded-lg text-sm"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${v.isDefault ? 'bg-[var(--color-accent)]' : 'bg-slate-100 dark:bg-white/10'}`}>
                      <Car className="w-4 h-4 text-white" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-slate-900 dark:text-white font-medium text-sm">{v.nickname || v.makeModel}</span>
                        {v.isDefault && (
                          <span className="px-1.5 py-0.5 bg-[var(--color-accent)]/20 text-[var(--color-accent)] text-[10px] font-bold rounded">DEFAULT</span>
                        )}
                      </div>
                      <p className="text-slate-400 dark:text-white/40 text-xs font-mono">{v.vehiclePlate} • {v.makeModel}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => startEditVehicle(v)}
                      className="p-1.5 text-slate-400 dark:text-white/40 hover:text-slate-600 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10 rounded-lg transition-all"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    {!v.isDefault && (
                      <button
                        onClick={() => handleSetDefaultVehicleProfile(v.id)}
                        className="p-1.5 text-slate-400 dark:text-white/40 hover:text-[var(--color-accent)] hover:bg-[var(--color-accent)]/10 rounded-lg transition-all"
                      >
                        <Star className="w-4 h-4" />
                      </button>
                    )}
                    {(user.vehicles?.length || 0) > 1 && (
                      <button
                        onClick={() => handleRemoveVehicleProfile(v.id)}
                        className="p-1.5 text-slate-400 dark:text-white/40 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg transition-all"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};

// Vault Section Component
const VaultSection: React.FC<{
  user: UserAccount;
  vaultPassphraseInput: string;
  setVaultPassphraseInput: (v: string) => void;
  handleDecryptVault: () => void;
  isDecryptingVault: boolean;
  decryptedVaultData: string | null;
  errorMsg: string;
}> = ({
  user,
  vaultPassphraseInput,
  setVaultPassphraseInput,
  handleDecryptVault,
  isDecryptingVault,
  decryptedVaultData,
  errorMsg,
}) => {
  return (
    <div className="space-y-4">
      <div className="p-4 bg-slate-50 dark:bg-white/5 rounded-xl border border-slate-200 dark:border-white/10">
        <div className="flex items-center justify-between mb-3">
          <span className="text-slate-500 dark:text-white/60 text-sm font-medium">Encrypted Payload</span>
          <span className="text-slate-400 dark:text-white/30 text-xs font-mono">AES-256-GCM</span>
        </div>
        <div className="p-3 bg-slate-900/5 dark:bg-black/30 rounded-lg font-mono text-xs text-emerald-600 dark:text-emerald-400 break-all max-h-20 overflow-y-auto">
          {user.encryptedVaultCipher || '0x4f82a9...encrypted'}
        </div>
      </div>

      <div className="space-y-3">
        <div className="relative">
          <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 dark:text-white/40" />
          <input
            type="password"
            placeholder="Enter master passphrase"
            value={vaultPassphraseInput}
            onChange={(e) => setVaultPassphraseInput(e.target.value)}
            className="w-full pl-12 pr-4 py-3 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-white/40 text-sm focus:outline-none focus:border-[var(--color-accent)] transition-all"
          />
        </div>
        <button
          onClick={handleDecryptVault}
          disabled={isDecryptingVault || !vaultPassphraseInput}
          className="w-full py-3 bg-gradient-to-r from-[var(--color-accent)] to-purple-600 text-white font-semibold rounded-xl text-sm disabled:opacity-50 transition-all flex items-center justify-center gap-2"
        >
          {isDecryptingVault ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin" />
              Decrypting...
            </>
          ) : (
            <>
              <KeyRound className="w-4 h-4" />
              Decrypt Vault
            </>
          )}
        </button>
      </div>

      {errorMsg && (
        <div className="p-3 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-xl text-red-600 dark:text-red-400 text-sm">
          {errorMsg}
        </div>
      )}

      {decryptedVaultData && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-4 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 rounded-xl"
        >
          <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 text-sm font-medium mb-2">
            <Check className="w-4 h-4" />
            Decrypted Successfully
          </div>
          <pre className="font-mono text-xs text-slate-700 dark:text-white/80 whitespace-pre-wrap bg-slate-900/5 dark:bg-black/30 p-3 rounded-lg overflow-auto max-h-40">
            {JSON.stringify(JSON.parse(decryptedVaultData), null, 2)}
          </pre>
        </motion.div>
      )}
    </div>
  );
};

export default LoginModal;
