'use client'

import { useState, useCallback, useEffect, type ChangeEvent, type FormEvent } from 'react'
import {
  ArrowLeft,
  Car,
  CircleAlert,
  Cpu,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  Mail,
  RefreshCw,
  ShieldCheck,
  User,
  CheckCircle2,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { encryptE2EEData } from '../../utils/crypto'
import { signUpWithEmail, signInWithEmail, saveProfile, getAuthErrorMessage, resendVerificationEmail } from '../../lib/auth'
import type { UserAccount } from '../../types'

interface LoginPageProps {
  mode?: 'signin' | 'signup'
  onLoginSuccess?: (account: UserAccount) => void
  redirectTo?: string
}

interface FieldErrors {
  name?: string
  email?: string
  password?: string
  vehiclePlate?: string
  vehicleModel?: string
}

export function LoginPage({ mode = 'signin', onLoginSuccess, redirectTo = '/' }: LoginPageProps) {
  const navigate = useNavigate()
  const isSignup = mode === 'signup'

  const [showPassword, setShowPassword] = useState(false)
  const [formData, setFormData] = useState(() => {
    let rememberedEmail = ''
    let rememberedFlag = false
    try {
      rememberedEmail = mode === 'signin' ? localStorage.getItem('parksmart_remember_email') || '' : ''
      rememberedFlag = localStorage.getItem('parksmart_remember_me') === 'true'
    } catch {
      /* ignore */
    }
    return {
      name: '',
      email: rememberedEmail,
      password: '',
      vehiclePlate: '',
      vehicleModel: '',
      rememberMe: rememberedFlag && Boolean(rememberedEmail),
    }
  })

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isEncrypting, setIsEncrypting] = useState(false)
  const [cryptoStatus, setCryptoStatus] = useState('')
  const [errorMsg, setErrorMsg] = useState('')
  const [infoMsg, setInfoMsg] = useState('')
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [touchedFields, setTouchedFields] = useState<Record<string, boolean>>({})
  const [accountCreatedNeedsVerification, setAccountCreatedNeedsVerification] = useState(false)
  const [emailNotConfirmed, setEmailNotConfirmed] = useState(false)
  const [resendCooldown, setResendCooldown] = useState(0)
  const [isResending, setIsResending] = useState(false)
  const [resendSuccess, setResendSuccess] = useState('')

  useEffect(() => {
    if (resendCooldown <= 0) return
    const timer = setTimeout(() => setResendCooldown((c) => c - 1), 1000)
    return () => clearTimeout(timer)
  }, [resendCooldown])

  const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }))
    if (fieldErrors[name as keyof FieldErrors]) {
      setFieldErrors((prev) => ({ ...prev, [name]: undefined }))
    }
    setErrorMsg('')
    setEmailNotConfirmed(false)
    setResendSuccess('')
  }

  const handleBlur = (e: ChangeEvent<HTMLInputElement>) => {
    const { name } = e.target
    setTouchedFields((prev) => ({ ...prev, [name]: true }))
  }

  const validateForm = useCallback((): FieldErrors => {
    const errors: FieldErrors = {}

    if (isSignup && !formData.name.trim()) {
      errors.name = 'Full name is required.'
    }

    if (!formData.email.trim()) {
      errors.email = 'Email is required.'
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email.trim())) {
      errors.email = 'Please enter a valid email address.'
    }

    if (!formData.password) {
      errors.password = 'Passphrase is required.'
    } else if (isSignup && formData.password.length < 8) {
      errors.password = 'Passphrase must be at least 8 characters.'
    }

    if (isSignup && !formData.vehiclePlate.trim()) {
      errors.vehiclePlate = 'License plate is required.'
    }

    if (isSignup && !formData.vehicleModel.trim()) {
      errors.vehicleModel = 'Vehicle model is required.'
    }

    return errors
  }, [formData, isSignup])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setErrorMsg('')
    setInfoMsg('')
    setEmailNotConfirmed(false)
    setResendSuccess('')

    const errors = validateForm()
    setFieldErrors(errors)
    setTouchedFields({ name: true, email: true, password: true, vehiclePlate: true, vehicleModel: true })

    if (Object.keys(errors).length > 0) return
    if (isSubmitting || isEncrypting) return

    const email = formData.email.trim().toLowerCase()
    const password = formData.password

    try {
      setIsSubmitting(true)
      setIsEncrypting(true)

      if (isSignup) {
        setCryptoStatus('Creating secure account...')

        const vaultPayload = JSON.stringify({
          email,
          name: formData.name.trim(),
          vehiclePlate: formData.vehiclePlate.trim().toUpperCase(),
          vehicleModel: formData.vehicleModel.trim(),
          createdAt: new Date().toISOString(),
        })

        setCryptoStatus('Encrypting Vault Payload using AES-GCM-256...')
        const { cipherText, iv, salt } = await encryptE2EEData(vaultPayload, password)

        const result = await signUpWithEmail(email, password, {
          name: formData.name.trim(),
          vehiclePlate: formData.vehiclePlate.trim().toUpperCase(),
          vehicleModel: formData.vehicleModel.trim(),
        })

        if (result.error) {
          const friendlyMsg = getAuthErrorMessage(result.error)
          setErrorMsg(friendlyMsg)
          if (friendlyMsg.includes('already exists')) {
            setFieldErrors((prev) => ({ ...prev, email: 'An account with this email already exists.' }))
          }
          setIsEncrypting(false)
          setCryptoStatus('')
          setIsSubmitting(false)
          return
        }

        if (result.requiresEmailConfirmation || !result.user) {
          setCryptoStatus('')
          setInfoMsg('Account created! Check your email to confirm your account, then sign in.')
          setAccountCreatedNeedsVerification(true)
          setIsEncrypting(false)
          setIsSubmitting(false)
          return
        }

        const newAccount: UserAccount = {
          ...result.user,
          isE2EEEnabled: true,
          e2eeSaltHex: salt,
          e2eeIvHex: iv,
          encryptedVaultCipher: cipherText,
        }
        saveProfile(newAccount)
        localStorage.setItem('parksmart_current_user', JSON.stringify(newAccount))

        onLoginSuccess?.(newAccount)
        navigate(redirectTo)
      } else {
        setCryptoStatus('Signing in securely...')

        const result = await signInWithEmail(email, password)

        if (result.error) {
          const friendlyMsg = getAuthErrorMessage(result.error)
          if (friendlyMsg === 'EMAIL_NOT_CONFIRMED') {
            setEmailNotConfirmed(true)
            setErrorMsg('')
          } else {
            setErrorMsg(friendlyMsg)
          }
          setIsEncrypting(false)
          setCryptoStatus('')
          setIsSubmitting(false)
          return
        }

        const account = result.user as UserAccount
        localStorage.setItem('parksmart_current_user', JSON.stringify(account))

        if (formData.rememberMe) {
          localStorage.setItem('parksmart_remember_email', email)
          localStorage.setItem('parksmart_remember_me', 'true')
        } else {
          localStorage.removeItem('parksmart_remember_email')
          localStorage.setItem('parksmart_remember_me', 'false')
        }

        onLoginSuccess?.(account)
        navigate(redirectTo)
      }
    } catch (err: unknown) {
      console.error(`${isSignup ? 'Registration' : 'Authentication'} error:`, err)
      setErrorMsg(getAuthErrorMessage(err))
    } finally {
      setIsEncrypting(false)
      setCryptoStatus('')
      setIsSubmitting(false)
    }
  }

  const handleForgotPassword = () => {
    setInfoMsg(
      'Password reset is coming soon. Your master passphrase encrypts your vault locally and cannot be recovered, so keep it safe.'
    )
  }

  const handleResendVerification = async () => {
    if (resendCooldown > 0 || isResending) return

    const email = formData.email.trim().toLowerCase()
    if (!email) {
      setErrorMsg('Please enter your email address to resend the verification.')
      return
    }

    setIsResending(true)
    setResendSuccess('')
    setErrorMsg('')

    try {
      const result = await resendVerificationEmail(email)
      if (result.success) {
        setResendSuccess('Verification email sent! Check your inbox (and spam folder).')
        setResendCooldown(60)
      } else {
        setErrorMsg(result.error || 'Failed to send verification email. Please try again later.')
      }
    } catch {
      setErrorMsg('Failed to send verification email. Please try again later.')
    } finally {
      setIsResending(false)
    }
  }

  const handleGoToSignIn = () => {
    setAccountCreatedNeedsVerification(false)
    setErrorMsg('')
    setInfoMsg('')
    navigate('/auth/signin')
  }

  const inputBase = 'w-full py-3 rounded-xl outline-none transition-all duration-200'
  const inputLight = 'bg-[#EEF4FF] border border-gray-200 text-[#172033] placeholder-[#667085] focus:border-[var(--color-accent,#2563eb)] focus:ring-2 focus:ring-[var(--color-accent,#2563eb)]/20 hover:border-gray-300'
  const inputDark = 'dark:bg-slate-900 dark:border-gray-700 dark:text-white dark:placeholder-gray-500 dark:focus:border-[var(--color-accent,#2563eb)] dark:hover:border-gray-600'
  const inputIconPadding = 'pl-12'
  const inputNoIcon = 'px-4'

  if (accountCreatedNeedsVerification) {
    return (
      <div className="h-screen w-screen bg-transparent flex">
        <div className="hidden lg:flex flex-1 relative overflow-hidden">
          <div className="absolute top-6 left-6 z-10">
            <button onClick={() => navigate('/')} className="w-10 h-10 bg-black/20 backdrop-blur-sm rounded-full flex items-center justify-center hover:bg-black/30 transition-all" title="Back to home">
              <ArrowLeft className="w-5 h-5 text-white" />
            </button>
          </div>
          <div className="absolute inset-0">
            <img src="https://images.unsplash.com/photo-1519641471654-76ce0107ad1b?auto=format&fit=crop&w=1920&q=80" alt="Parking garage at dusk" className="w-full h-full object-cover" />
          </div>
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-900/40 to-slate-900/30" />
          <div className="absolute bottom-0 left-0 right-0 p-10 text-white">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[var(--color-accent,#2563eb)] to-purple-600 flex items-center justify-center">
                <Car className="w-5 h-5 text-white" />
              </div>
              <span className="text-xl font-extrabold tracking-tight">ParkSmart</span>
            </div>
            <h2 className="text-3xl font-bold tracking-tight mb-2">Find &amp; Book Parking Instantly</h2>
            <p className="text-white/70 text-sm max-w-md">Smart parking solutions with end-to-end encrypted security. Your data stays yours.</p>
          </div>
        </div>

        <div className="flex-1 flex items-center justify-center bg-white dark:bg-slate-950 overflow-y-auto">
          <div className="w-full max-w-md p-8 py-10">
            <div className="flex flex-col items-center text-center mb-8">
              <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mb-4">
                <CheckCircle2 className="w-8 h-8 text-green-600 dark:text-green-400" />
              </div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Account Created</h1>
              <p className="text-gray-600 dark:text-gray-400 text-sm leading-relaxed">
                Your account has been created successfully. Please check your email to verify your account, then sign in.
              </p>
            </div>

            <div className="flex items-start gap-3 p-4 bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/30 rounded-xl text-blue-700 dark:text-blue-400 text-sm mb-6">
              <KeyRound className="w-5 h-5 mt-0.5 shrink-0" />
              <span>If you don&apos;t see the email, check your spam folder. The verification link will expire after 24 hours.</span>
            </div>

            <button
              onClick={handleGoToSignIn}
              className="w-full bg-black dark:bg-white dark:text-black text-white py-3 px-4 rounded-xl font-medium hover:bg-gray-800 dark:hover:bg-gray-200 transition-colors flex items-center justify-center gap-2"
            >
              Go to Sign In
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="h-screen w-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-800 flex">
      {/* Left Panel - Image Section */}
      <div className="hidden lg:flex flex-1 relative overflow-hidden">
        <div className="absolute top-6 left-6 z-10">
          <button
            onClick={() => navigate('/')}
            className="w-10 h-10 bg-black/20 backdrop-blur-sm rounded-full flex items-center justify-center hover:bg-black/30 transition-all"
            title="Back to home"
          >
            <ArrowLeft className="w-5 h-5 text-white" />
          </button>
        </div>
        <div className="absolute inset-0">
          <img
            src="https://images.unsplash.com/photo-1519641471654-76ce0107ad1b?auto=format&fit=crop&w=1920&q=80"
            alt="Parking garage at dusk"
            className="w-full h-full object-cover"
          />
        </div>
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-900/40 to-slate-900/30" />
        <div className="absolute bottom-0 left-0 right-0 p-10 text-white">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[var(--color-accent,#2563eb)] to-purple-600 flex items-center justify-center">
              <Car className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-extrabold tracking-tight">ParkSmart</span>
          </div>
          <h2 className="text-3xl font-bold tracking-tight mb-2">
            Find &amp; Book Parking Instantly
          </h2>
          <p className="text-white/70 text-sm max-w-md">
            Smart parking solutions with end-to-end encrypted security. Your data stays yours.
          </p>
        </div>
      </div>

      {/* Right Panel - Form Section */}
      <div className="flex-1 flex items-center justify-center bg-white dark:bg-slate-950 overflow-y-auto">
        <div className="w-full max-w-md p-8 py-10">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
              {isSignup ? 'Create your account' : 'Welcome Back'}
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
              {isSignup ? (
                <>
                  Already have an account?{' '}
                  <button
                    onClick={() => navigate('/auth/signin')}
                    className="text-blue-600 hover:text-blue-700 font-medium cursor-pointer"
                  >
                    Sign in
                  </button>
                </>
              ) : (
                <>
                  Don&apos;t have an account?{' '}
                  <button
                    onClick={() => navigate('/auth/signup')}
                    className="text-blue-600 hover:text-blue-700 font-medium cursor-pointer"
                  >
                    Sign up
                  </button>
                </>
              )}
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5" noValidate>
            {/* Full Name (signup only) */}
            {isSignup && (
              <div>
                <label htmlFor="signup-name" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  Full Name
                </label>
                <div className="relative">
                  <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#667085] dark:text-gray-500 pointer-events-none" />
                  <input
                    id="signup-name"
                    type="text"
                    name="name"
                    value={formData.name}
                    onChange={handleInputChange}
                    onBlur={handleBlur}
                    placeholder="e.g. Rohit Sarkar"
                    autoComplete="name"
                    className={`${inputBase} ${inputIconPadding} pr-4 ${inputLight} ${inputDark} ${fieldErrors.name && touchedFields.name ? 'border-red-400 bg-red-50/50 dark:border-red-500/50 dark:bg-red-950/20' : ''}`}
                    required
                  />
                </div>
                {fieldErrors.name && touchedFields.name && (
                  <p className="mt-1.5 text-xs text-red-600 dark:text-red-400">{fieldErrors.name}</p>
                )}
              </div>
            )}

            {/* Email */}
            <div>
              <label htmlFor="signup-email" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#667085] dark:text-gray-500 pointer-events-none" />
                <input
                  id="signup-email"
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleInputChange}
                  onBlur={handleBlur}
                  placeholder="you@example.com"
                  autoComplete="email"
                  className={`${inputBase} ${inputIconPadding} pr-4 ${inputLight} ${inputDark} ${fieldErrors.email && touchedFields.email ? 'border-red-400 bg-red-50/50 dark:border-red-500/50 dark:bg-red-950/20' : ''}`}
                  required
                />
              </div>
              {fieldErrors.email && touchedFields.email && (
                <p className="mt-1.5 text-xs text-red-600 dark:text-red-400">{fieldErrors.email}</p>
              )}
            </div>

            {/* Password */}
            <div>
              <label htmlFor="signup-password" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                {isSignup ? 'Master Passphrase' : 'Password'}
              </label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#667085] dark:text-gray-500 pointer-events-none" />
                <input
                  id="signup-password"
                  type={showPassword ? 'text' : 'password'}
                  name="password"
                  value={formData.password}
                  onChange={handleInputChange}
                  onBlur={handleBlur}
                  placeholder={isSignup ? 'At least 8 characters' : 'Enter your password'}
                  autoComplete={isSignup ? 'new-password' : 'current-password'}
                  minLength={isSignup ? 8 : undefined}
                  className={`${inputBase} ${inputIconPadding} pr-12 ${inputLight} ${inputDark} ${fieldErrors.password && touchedFields.password ? 'border-red-400 bg-red-50/50 dark:border-red-500/50 dark:bg-red-950/20' : ''}`}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 hover:bg-gray-200/60 dark:hover:bg-gray-700/60 rounded-lg transition-colors"
                  title={showPassword ? 'Hide passphrase' : 'Show passphrase'}
                  aria-label={showPassword ? 'Hide passphrase' : 'Show passphrase'}
                >
                  {showPassword ? (
                    <EyeOff className="w-5 h-5 text-[#667085] dark:text-gray-400" />
                  ) : (
                    <Eye className="w-5 h-5 text-[#667085] dark:text-gray-400" />
                  )}
                </button>
              </div>
              {fieldErrors.password && touchedFields.password && (
                <p className="mt-1.5 text-xs text-red-600 dark:text-red-400">{fieldErrors.password}</p>
              )}
            </div>

            {/* Vehicle Details (signup only) */}
            {isSignup && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="signup-plate" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                    License Plate
                  </label>
                  <div className="relative">
                    <Car className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#667085] dark:text-gray-500 pointer-events-none" />
                    <input
                      id="signup-plate"
                      type="text"
                      name="vehiclePlate"
                      value={formData.vehiclePlate}
                      onChange={handleInputChange}
                      onBlur={handleBlur}
                      placeholder="WB 12 AB 3456"
                      autoComplete="off"
                      className={`${inputBase} ${inputIconPadding} pr-4 ${inputLight} ${inputDark} uppercase ${fieldErrors.vehiclePlate && touchedFields.vehiclePlate ? 'border-red-400 bg-red-50/50 dark:border-red-500/50 dark:bg-red-950/20' : ''}`}
                      required
                    />
                  </div>
                  {fieldErrors.vehiclePlate && touchedFields.vehiclePlate && (
                    <p className="mt-1.5 text-xs text-red-600 dark:text-red-400">{fieldErrors.vehiclePlate}</p>
                  )}
                </div>
                <div>
                  <label htmlFor="signup-model" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                    Vehicle Model
                  </label>
                  <input
                    id="signup-model"
                    type="text"
                    name="vehicleModel"
                    value={formData.vehicleModel}
                    onChange={handleInputChange}
                    onBlur={handleBlur}
                    placeholder="e.g. Swift VXi"
                    autoComplete="off"
                    className={`${inputBase} px-4 ${inputLight} ${inputDark} ${fieldErrors.vehicleModel && touchedFields.vehicleModel ? 'border-red-400 bg-red-50/50 dark:border-red-500/50 dark:bg-red-950/20' : ''}`}
                    required
                  />
                  {fieldErrors.vehicleModel && touchedFields.vehicleModel && (
                    <p className="mt-1.5 text-xs text-red-600 dark:text-red-400">{fieldErrors.vehicleModel}</p>
                  )}
                </div>
              </div>
            )}

            {/* Remember Me + Forgot Password (signin only) */}
            {!isSignup && (
              <div className="flex items-center justify-between">
                <label className="flex items-center space-x-2 text-sm text-gray-600 dark:text-gray-400 cursor-pointer">
                  <input
                    type="checkbox"
                    name="rememberMe"
                    checked={formData.rememberMe}
                    onChange={handleInputChange}
                    className="w-4 h-4 text-blue-600 border-gray-300 dark:border-gray-700 rounded"
                  />
                  <span>Remember me</span>
                </label>
                <button
                  type="button"
                  onClick={handleForgotPassword}
                  className="text-sm text-blue-600 hover:text-blue-700 font-medium cursor-pointer"
                >
                  Forgot password?
                </button>
              </div>
            )}

            {/* Form-level Error */}
            {errorMsg && (
              <div className="flex items-start gap-3 p-3.5 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-xl text-sm" role="alert">
                <CircleAlert className="w-4 h-4 mt-0.5 shrink-0 text-red-500 dark:text-red-400" />
                <span className="text-red-700 dark:text-red-400">{errorMsg}</span>
              </div>
            )}

            {/* Email not confirmed */}
            {emailNotConfirmed && (
              <div className="p-3.5 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 rounded-xl text-sm">
                <div className="flex items-start gap-3 mb-3">
                  <CircleAlert className="w-4 h-4 mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
                  <div>
                    <p className="font-medium text-amber-800 dark:text-amber-300">Email not confirmed</p>
                    <p className="text-amber-700 dark:text-amber-400 mt-1">
                      Please check your inbox and confirm your email address before signing in.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleResendVerification}
                  disabled={resendCooldown > 0 || isResending}
                  className="w-full py-2 px-3 bg-white dark:bg-slate-800 border border-amber-300 dark:border-amber-600 rounded-lg text-sm font-medium text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isResending ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Sending...
                    </>
                  ) : resendCooldown > 0 ? (
                    `Resend in ${resendCooldown}s`
                  ) : (
                    'Resend Verification Email'
                  )}
                </button>
              </div>
            )}

            {/* Resend success */}
            {resendSuccess && (
              <div className="flex items-start gap-3 p-3.5 bg-green-50 dark:bg-green-500/10 border border-green-200 dark:border-green-500/30 rounded-xl text-sm" role="status">
                <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0 text-green-600 dark:text-green-400" />
                <span className="text-green-700 dark:text-green-400">{resendSuccess}</span>
              </div>
            )}

            {/* Info message */}
            {infoMsg && (
              <div className="flex items-start gap-3 p-3.5 bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/30 rounded-xl text-sm" role="status">
                <KeyRound className="w-4 h-4 mt-0.5 shrink-0 text-blue-500 dark:text-blue-400" />
                <span className="text-blue-700 dark:text-blue-400">{infoMsg}</span>
              </div>
            )}

            {/* Crypto progress */}
            {isEncrypting && (
              <div className="flex items-center gap-3 p-3 bg-[var(--color-accent)]/10 border border-[var(--color-accent)]/30 rounded-xl">
                <Cpu className="w-5 h-5 text-[var(--color-accent)] animate-spin" />
                <span className="text-[var(--color-accent)] text-sm">{cryptoStatus || 'Processing...'}</span>
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={isSubmitting || isEncrypting}
              className="w-full bg-black dark:bg-white dark:text-black text-white py-3 px-4 rounded-xl font-medium hover:bg-gray-800 dark:hover:bg-gray-200 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isSubmitting || isEncrypting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  {isSignup ? 'Creating Account...' : 'Signing in...'}
                </>
              ) : isSignup ? (
                'Create Account'
              ) : (
                'Sign In'
              )}
            </button>
          </form>

          {/* Security Badge */}
          <div className="flex items-center justify-center gap-2 text-gray-400 dark:text-gray-500 text-xs mt-8">
            <ShieldCheck className="w-4 h-4" />
            <span>Protected by AES-256-GCM encryption</span>
          </div>
        </div>
      </div>
    </div>
  )
}

export function SignInPage(props: Omit<LoginPageProps, 'mode'>) {
  return <LoginPage {...props} mode="signin" />
}

export function SignUpPage(props: Omit<LoginPageProps, 'mode'>) {
  return <LoginPage {...props} mode="signup" />
}
