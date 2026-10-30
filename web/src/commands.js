// @ts-check
// Commands to the game (docs/PLAN.md, Controls): a control sends
// {"type":"command","id":"<unique>","action":"lights.toggle"} over the
// viewer's WebSocket, and the backend answers with
// {"type":"command_ack","id","ok","reason"} once the mod ran it. The new
// state follows as the cab topic. No answer within the timeout counts as
// a failure.

/** @typedef {{ok: boolean, reason?: string}} CommandResult */
/** @typedef {{count: number, last?: number, median?: number, max?: number}} RoundTrips ms, tap to the mod's answer */

// 10 s: a tool command waits until the tools moved (specs/0003 revision 2):
// for Lower all, while the tractor's combo runs (2 s on the T7.300) and 1 s
// more, at most 8 s in the mod
export const COMMAND_TIMEOUT_MS = 10000;
/** how many answered commands the round-trip readout keeps */
export const ROUND_TRIPS_KEPT = 30;

/**
 * @param {(msg: object) => boolean} transmit sends one message; false when
 *   it can't (not connected)
 * @param {{timeoutMs?: number, prefix?: string, now?: () => number}} [opts] prefix
 *   keeps ids unique per page; now: the clock, ms
 */
export function createCommander(transmit, opts = {}) {
  const timeoutMs = opts.timeoutMs ?? COMMAND_TIMEOUT_MS;
  const prefix = opts.prefix ?? Math.random().toString(36).slice(2, 8);
  const now = opts.now ?? (() => performance.now());
  let seq = 0;
  /** @type {Map<string, {resolve: (r: CommandResult) => void, timer: ReturnType<typeof setTimeout>, sent: number}>} */
  const pending = new Map();
  /** @type {number[]} the last answered commands' round trips, ms */
  const trips = [];

  /** @param {string} id @param {CommandResult} result @param {boolean} [answered] the mod's answer */
  function settle(id, result, answered = false) {
    const p = pending.get(id);
    if (!p) return;
    pending.delete(id);
    clearTimeout(p.timer);
    if (answered) {
      trips.push(now() - p.sent);
      if (trips.length > ROUND_TRIPS_KEPT) trips.shift();
    }
    p.resolve(result);
  }

  return {
    /**
     * @param {string} action "lights.toggle"
     * @param {number} [value] for actions that carry one ("cruise.set": km/h)
     * @returns {Promise<CommandResult>}
     */
    send(action, value) {
      const id = `${prefix}-${++seq}`;
      return new Promise((resolve) => {
        const timer = setTimeout(() => settle(id, { ok: false, reason: "no answer" }), timeoutMs);
        pending.set(id, { resolve, timer, sent: now() });
        const msg = value === undefined ? { type: "command", id, action } : { type: "command", id, action, value };
        if (!transmit(msg)) {
          settle(id, { ok: false, reason: "not connected" });
        }
      });
    },

    /** @param {{id?: unknown, ok?: unknown, reason?: unknown}} msg a command_ack */
    ack(msg) {
      if (typeof msg.id !== "string") return;
      settle(msg.id, msg.ok === true ? { ok: true }
        : { ok: false, reason: typeof msg.reason === "string" ? msg.reason : "failed" }, true);
    },

    /**
     * The round trips of the last answered commands (Settings readout).
     * @returns {RoundTrips}
     */
    roundTrips() {
      if (!trips.length) return { count: 0 };
      const sorted = [...trips].sort((a, b) => a - b);
      const mid = sorted.length >> 1;
      const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
      return { count: trips.length, last: trips[trips.length - 1], median, max: sorted[sorted.length - 1] };
    },

    /** commands still waiting for their answer */
    pending: () => pending.size,
  };
}
