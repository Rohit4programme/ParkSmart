/**
 * Driver notifications (spec §39).
 *
 * The app previously had no notification mechanism, so this store provides a
 * minimal, backend-driven inbox: the server pushes check-in / check-out /
 * booking messages for a user id and the header bell reads them.
 */
import { randomUUID } from 'node:crypto';
import { ParkSmartNotification } from '../types';
import { readJsonFile, writeJsonFile } from './storage';

const STORE_FILE = 'notifications.json';
const MAX_PER_USER = 50;
const MAX_TOTAL = 2000;

let notifications: ParkSmartNotification[] | null = null;

function ensureLoaded(): ParkSmartNotification[] {
  if (notifications) return notifications;
  const rows = readJsonFile<ParkSmartNotification[]>(STORE_FILE, []);
  notifications = Array.isArray(rows) ? rows : [];
  return notifications;
}

function persist(): void {
  writeJsonFile(STORE_FILE, ensureLoaded());
}

export interface CreateNotificationInput {
  userId: string | null | undefined;
  type: ParkSmartNotification['type'];
  title: string;
  body: string;
  bookingId?: string;
}

export function createNotification(input: CreateNotificationInput): ParkSmartNotification | null {
  if (!input.userId) return null; // anonymous bookings cannot be notified
  const list = ensureLoaded();
  const entry: ParkSmartNotification = {
    id: randomUUID(),
    userId: input.userId,
    type: input.type,
    title: input.title,
    body: input.body,
    read: false,
    createdAt: new Date().toISOString(),
    ...(input.bookingId ? { bookingId: input.bookingId } : {}),
  };
  list.push(entry);

  // Bounded per user + globally.
  const forUser = list.filter((n) => n.userId === entry.userId);
  if (forUser.length > MAX_PER_USER) {
    const removeIds = new Set(forUser.slice(0, forUser.length - MAX_PER_USER).map((n) => n.id));
    for (let i = list.length - 1; i >= 0; i -= 1) {
      if (removeIds.has(list[i].id)) list.splice(i, 1);
    }
  }
  if (list.length > MAX_TOTAL) {
    list.splice(0, list.length - MAX_TOTAL);
  }

  try {
    persist();
  } catch (err) {
    console.error('[notifications] Failed to persist notification:', err);
  }
  return entry;
}

export function listNotifications(userId: string, limit = 50): ParkSmartNotification[] {
  const list = ensureLoaded();
  return list
    .filter((n) => n.userId === userId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, Math.min(Math.max(limit, 1), 200));
}

export function unreadCount(userId: string): number {
  return ensureLoaded().filter((n) => n.userId === userId && !n.read).length;
}

export function markAllRead(userId: string): number {
  const list = ensureLoaded();
  let changed = 0;
  for (const n of list) {
    if (n.userId === userId && !n.read) {
      n.read = true;
      changed += 1;
    }
  }
  if (changed > 0) persist();
  return changed;
}

/** Test helper: clear in-memory notifications (does not touch disk). */
export function resetNotifications(): void {
  notifications = [];
}
