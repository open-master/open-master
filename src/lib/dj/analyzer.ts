import type { OpenClawEvent, WorkState, WorkStateInfo, MusicStyle } from './types';
import { WORK_STATE_MUSIC } from './types';

const EVENT_WINDOW_MS = 60_000;

interface EventWindow {
  events: OpenClawEvent[];
  lastUpdate: number;
}

const eventWindow: EventWindow = {
  events: [],
  lastUpdate: 0,
};

export function pushEvent(event: OpenClawEvent) {
  const now = Date.now();
  eventWindow.events.push(event);
  eventWindow.events = eventWindow.events.filter(
    (e) => now - e.timestamp < EVENT_WINDOW_MS
  );
  eventWindow.lastUpdate = now;
}

export function analyzeWorkStateHardcoded(): WorkStateInfo {
  const now = Date.now();
  const recent = eventWindow.events.filter(
    (e) => now - e.timestamp < EVENT_WINDOW_MS
  );

  const lastActive = recent
    .filter((e) => e.type === 'message.sent' || e.type === 'message.received')
    .at(-1);

  const lastCompleted = recent
    .filter((e) => e.type === 'conversation.ended')
    .at(-1);

  if (lastActive) {
    const activeIsNewer = !lastCompleted || lastActive.timestamp >= lastCompleted.timestamp;
    if (activeIsNewer && now - lastActive.timestamp < 20_000) {
      return { state: 'working', label: '工作中', since: lastActive.timestamp };
    }
  }

  if (lastCompleted && now - lastCompleted.timestamp < 90_000) {
    return {
      state: 'task_complete',
      label: '任务完成',
      since: lastCompleted.timestamp,
    };
  }

  return { state: 'idle', label: '空闲', since: now };
}

export function getMusicStyleForState(state: WorkState): MusicStyle {
  return WORK_STATE_MUSIC[state];
}

export function getEventWindow(): OpenClawEvent[] {
  return [...eventWindow.events];
}

export function clearEventWindow() {
  eventWindow.events = [];
  eventWindow.lastUpdate = 0;
}
