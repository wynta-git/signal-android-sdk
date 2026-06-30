import { ApiLogEntry } from '../types';

let callback: ((entry: ApiLogEntry) => void) | null = null;

export function setApiLogCallback(cb: ((entry: ApiLogEntry) => void) | null | undefined) {
  callback = cb ?? null;
}

export function fireApiLog(entry: ApiLogEntry) {
  if (callback) {
    callback(entry);
  }
}
