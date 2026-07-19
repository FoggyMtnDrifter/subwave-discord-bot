/**
 * logger.js — Minimal structured logger.
 * Wraps console with a named prefix and ISO timestamps.
 */

export function createLogger(name) {
  const prefix = `[${name}]`;

  return {
    info: (...args) => console.log(new Date().toISOString(), prefix, ...args),
    warn: (...args) => console.warn(new Date().toISOString(), prefix, ...args),
    error: (...args) => console.error(new Date().toISOString(), prefix, ...args),
  };
}
