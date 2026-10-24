// @ts-check
// Commands to the game (docs/PLAN.md, Controls): a control sends
// {"type":"command","id":"<unique>","action":"lights.toggle"} over the
// viewer's WebSocket, and the backend answers with
// {"type":"command_ack","id","ok","reason"} once the mod ran it. The new
// state follows as the cab topic. No answer within the timeout counts as
// a failure.

/** @typedef {{ok: boolean, reason?: string}} CommandResult */

export const COMMAND_TIMEOUT_MS = 2000;

/**
 * @param {(msg: object) => boolean} transmit sends one message; false when
 *   it can't (not connected)
 * @param {{timeoutMs?: number, prefix?: string}} [opts] prefix keeps ids
 *   unique per page
 */
export function createCommander(transmit, opts = {}) {
  const timeoutMs = opts.timeoutMs ?? COMMAND_TIMEOUT_MS;
  const prefix = opts.prefix ?? Math.random().toString(36).slice(2, 8);
  let seq = 0;
  /** @type {Map<string, {resolve: (r: CommandResult) => void, timer: ReturnType<typeof setTimeout>}>} */
  const pending = new Map();

  /** @param {string} id @param {CommandResult} result */
  function settle(id, result) {
    const p = pending.get(id);
    if (!p) return;
    pending.delete(id);
    clearTimeout(p.timer);
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
        pending.set(id, { resolve, timer });
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
        : { ok: false, reason: typeof msg.reason === "string" ? msg.reason : "failed" });
    },

    /** commands still waiting for their answer */
    pending: () => pending.size,
  };
}
