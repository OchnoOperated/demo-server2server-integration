/* eslint-disable no-undef */
/**
 * socket.js
 * Thin wrapper around socket.io client.
 * Import this if you want to listen to hub events from any page.
 *
 * Usage:
 *   import { onHubEvent } from '/js/socket.js';
 *   onHubEvent((event) => console.log(event));
 *
 * If webhooks are disabled server-side the callback is simply never called.
 */

let _socket = null;
const _listeners = [];

async function connect() {
  // Check if the server has webhooks enabled before bothering to connect
  const res = await fetch('/webhook/status').then((r) => r.json()).catch(() => null);
  if (!res?.enabled) return;

  _socket = io(); // socket.io client injected via <script> in HTML

  _socket.on('connect', () => {
    console.log('[socket] Connected:', _socket.id);
  });

  _socket.on('hub:event', (event) => {
    for (const fn of _listeners) {
      fn(event);
    }
  });

  _socket.on('disconnect', () => {
    console.log('[socket] Disconnected');
  });
}

/**
 * Register a callback for incoming hub events.
 * Safe to call before connect() resolves.
 */
export function onHubEvent(fn) {
  _listeners.push(fn);
}

/**
 * Returns true if the socket is currently connected.
 */
export function isConnected() {
  return _socket?.connected ?? false;
}

// Auto-connect on import
connect();