/** A restriction is active until lifted or past its expiry. */
export function isRestrictionActive(r: { lifted_at: string | null; expires_at: string | null }, now: Date = new Date()) {
  return !r.lifted_at && (!r.expires_at || new Date(r.expires_at) > now);
}
