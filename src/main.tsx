import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import {BrowserRouter, Routes, Route} from 'react-router-dom';
import App from './App.tsx';
import {SignInPage, SignUpPage} from './components/ui/sign-in-page';
import BookingHistoryPage from './components/bookings/BookingHistoryPage';
import BookingDetailsPage from './components/bookings/BookingDetailsPage';
import BookingQrPage from './components/bookings/BookingQrPage';
import {
  ParkingSessionsPage,
  VerificationHistoryPage,
  VerificationResultPage,
  VerifyPage,
} from './components/owner/OwnerPages';
import VerifyLandingPage from './components/VerifyLandingPage';
import { VideoBackground } from './components/VideoBackground';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      {/* Page background: the supplied MP4, mounted once, at z-index 0.
          Every route below sits in the `z-10` wrapper, so the video and its
          scrim can never cover or block the UI. */}
      <VideoBackground />
      <div className="relative z-10">
        <Routes>
          <Route path="/" element={<App />} />
          <Route path="/auth/signin" element={<SignInPage />} />
          <Route path="/auth/signup" element={<SignUpPage />} />

          {/* Driver: booking history, details and QR ticket */}
          <Route path="/user/bookings" element={<BookingHistoryPage />} />
          <Route path="/user/bookings/:id" element={<BookingDetailsPage />} />
          <Route path="/user/bookings/:id/qr" element={<BookingQrPage />} />

          {/* Owner: verification, result, history and live sessions */}
          <Route path="/owner/verify" element={<VerifyPage />} />
          <Route path="/owner/verification-result" element={<VerificationResultPage />} />
          <Route path="/owner/verification-history" element={<VerificationHistoryPage />} />
          <Route path="/owner/parking-sessions" element={<ParkingSessionsPage />} />

          {/* What happens when a driver opens their own QR image */}
          <Route path="/verify/booking/:token" element={<VerifyLandingPage />} />

          <Route path="*" element={<App />} />
        </Routes>
      </div>
    </BrowserRouter>
  </StrictMode>,
);
