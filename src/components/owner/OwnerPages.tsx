import React from 'react';
import PageShell from '../PageShell';
import NotificationsBell from '../NotificationsBell';
import VerifyBookingPanel from './VerifyBookingPanel';
import VerificationResultPanel from './VerificationResultPanel';
import VerificationHistoryPanel from './VerificationHistoryPanel';
import ParkingSessionsPanel from './ParkingSessionsPanel';

const shellActions = <NotificationsBell />;

/** `/owner/verify` — camera scanner + manual code entry. */
export const VerifyPage: React.FC = () => (
  <PageShell
    title="Verify Booking"
    subtitle="Scan a driver's QR pass at your gate"
    backTo="/"
    backLabel="Back to ParkSmart"
    actions={shellActions}
  >
    <VerifyBookingPanel />
  </PageShell>
);

/** `/owner/verification-result` — server verdict + gate actions. */
export const VerificationResultPage: React.FC = () => (
  <PageShell
    title="Verification Result"
    subtitle="Server-side verdict for the scanned pass"
    backTo="/owner/verify"
    backLabel="Back to scanner"
    actions={shellActions}
  >
    <VerificationResultPanel />
  </PageShell>
);

/** `/owner/verification-history` — audit trail with date filters. */
export const VerificationHistoryPage: React.FC = () => (
  <PageShell
    title="Verification History"
    subtitle="Audit trail for your parking locations"
    backTo="/"
    backLabel="Back to ParkSmart"
    actions={shellActions}
  >
    <VerificationHistoryPanel />
  </PageShell>
);

/** `/owner/parking-sessions` — active sessions with check-out. */
export const ParkingSessionsPage: React.FC = () => (
  <PageShell
    title="Active Parking Sessions"
    subtitle="Vehicles currently checked in"
    backTo="/"
    backLabel="Back to ParkSmart"
    actions={shellActions}
  >
    <ParkingSessionsPanel />
  </PageShell>
);
