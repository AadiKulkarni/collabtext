/**
 * Lamport (logical) clock for assigning operation timestamps.
 *
 * WHY not wall-clock (`Date.now()`): wall clocks are not monotonic across
 * machines (NTP skew, timezone, sleeping laptops) and do not encode causality.
 * If operation A causally preceded B on some replica, wall time can still
 * report B's stamp as earlier than A's. Lamport clocks guarantee: if A
 * causally preceded B, then timestamp(A) < timestamp(B). That causal order is
 * what Identifier total-ordering and conflict resolution rely on.
 */

export class LogicalClock {
  private time = 0;

  /** Advance the local counter for a newly generated local operation. */
  tick(): number {
    this.time += 1;
    return this.time;
  }

  /**
   * Incorporate a remote operation's timestamp.
   * Sets local time to max(local, remote) + 1 so subsequent local ticks
   * remain strictly after everything we have observed.
   */
  observe(remoteTimestamp: number): void {
    this.time = Math.max(this.time, remoteTimestamp) + 1;
  }

  /** Current counter value (useful in tests). */
  current(): number {
    return this.time;
  }
}
