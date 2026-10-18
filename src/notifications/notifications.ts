import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import type { Cycle } from '../db/types';
import { DEFAULT_PERIOD_LENGTH, displayEnd, predictNextPeriod } from '../logic/cycles';
import { addDaysISO, isValidISODate, todayISO } from '../logic/dates';

// Show notifications even when the app is in the foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

const CHANNEL_ID = 'period-reminders';
const NOTIFICATION_HOUR = 9;

const IDS = {
  cycleEnding: 'period-cycle-ending',
  nextPeriodEve: 'period-next-eve',
  nextPeriodDay: 'period-next-day',
} as const;

function isoToLocalDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d, NOTIFICATION_HOUR, 0, 0);
}

export async function requestNotificationPermission(): Promise<boolean> {
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === 'granted') return true;
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: 'Period reminders',
    importance: Notifications.AndroidImportance.DEFAULT,
  });
}

async function cancelPeriodNotifications(): Promise<void> {
  await Promise.all(
    Object.values(IDS).map(id =>
      Notifications.cancelScheduledNotificationAsync(id).catch(() => {}),
    ),
  );
}

async function scheduleIfFuture(
  id: string,
  title: string,
  body: string,
  iso: string,
): Promise<void> {
  const date = isoToLocalDate(iso);
  if (date.getTime() <= Date.now()) return;
  await Notifications.scheduleNotificationAsync({
    identifier: id,
    content: { title, body, sound: 'default' },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date,
      ...(Platform.OS === 'android' && { channelId: CHANNEL_ID }),
    },
  });
}

/** Cancels and recreates the three period-related scheduled notifications. No-op if permission is not granted. */
export async function rescheduleNotifications(cycles: Cycle[]): Promise<void> {
  const { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') return;

  await ensureAndroidChannel();
  await cancelPeriodNotifications();

  const today = todayISO();
  const valid = cycles.filter(
    c => isValidISODate(c.startDate) && (!c.endDate || isValidISODate(c.endDate)),
  );
  const prediction = predictNextPeriod(valid);
  const periodLength = prediction?.periodLength ?? DEFAULT_PERIOD_LENGTH;

  // Notify on the estimated last day of the current ongoing cycle
  const activeCycle = valid.find(c => !c.endDate && c.startDate <= today);
  if (activeCycle) {
    await scheduleIfFuture(
      IDS.cycleEnding,
      'Period ending today',
      'Your period may be ending today.',
      displayEnd(activeCycle, periodLength),
    );
  }

  // Notify the day before and on the day of the next predicted period
  if (prediction) {
    await scheduleIfFuture(
      IDS.nextPeriodEve,
      'Period expected tomorrow',
      'Your next period is expected to start tomorrow.',
      addDaysISO(prediction.startDate, -1),
    );
    await scheduleIfFuture(
      IDS.nextPeriodDay,
      'Period expected today',
      'Your next period may be starting today.',
      prediction.startDate,
    );
  }
}
