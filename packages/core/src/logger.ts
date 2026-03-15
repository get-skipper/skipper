/**
 * Skipper logger — output is suppressed unless SKIPPER_DEBUG=1 (or any truthy value).
 */

function isEnabled(): boolean {
  return Boolean(process.env.SKIPPER_DEBUG);
}

export function log(message: string): void {
  if (isEnabled()) console.log(message);
}

export function warn(message: string): void {
  if (isEnabled()) console.warn(message);
}

export function error(message: string): void {
  if (isEnabled()) console.error(message);
}
