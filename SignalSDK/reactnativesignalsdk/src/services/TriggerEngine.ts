import { InboxNotification } from '../types';

export type TriggerEvent =
  | { type: 'session_start' }
  | { type: 'screen_load'; screenName: string }
  | { type: 'custom_event'; eventName: string };

type Evaluator = (notification: InboxNotification, event: TriggerEvent) => boolean;

// One entry per trigger_type. Adding a new trigger type means adding one evaluator
// here — no changes needed at any call site.
const EVALUATORS: Partial<Record<NonNullable<InboxNotification['trigger_type']>, Evaluator>> = {
  on_session_start: (_notification, event) => event.type === 'session_start',
  on_screen_load: (notification, event) =>
    event.type === 'screen_load' &&
    Array.isArray(notification.target_screens) &&
    notification.target_screens.includes(event.screenName),
  on_custom_event: (notification, event) =>
    event.type === 'custom_event' &&
    Array.isArray(notification.target_events) &&
    notification.target_events.includes(event.eventName),
};

export function findEligibleNotification(
  notifications: InboxNotification[],
  event: TriggerEvent,
  handledNotificationIds: string[],
): InboxNotification | undefined {
  const now = Date.now();

  return notifications.find((notification) => {
    if (handledNotificationIds.includes(notification.notification_id)) return false;
    if (notification.expires_at && new Date(notification.expires_at).getTime() < now) return false;
    if (!notification.media?.image_url) return false;

    const evaluator = notification.trigger_type ? EVALUATORS[notification.trigger_type] : undefined;
    return evaluator ? evaluator(notification, event) : false;
  });
}
