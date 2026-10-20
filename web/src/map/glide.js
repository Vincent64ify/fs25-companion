// @ts-check
// Smooth motion between pose updates. A marker glides from where it is
// shown to each new pose over the time since the previous update, so the
// player (10 Hz) and the vehicles (2 Hz) both move continuously. A jump
// longer than teleportM (a reset, a teleport) is shown at once.

/** @typedef {{x: number, z: number, heading: number}} Pose */

/** @param {number} a @param {number} b @param {number} k */
const lerp = (a, b, k) => a + (b - a) * k;

/** shortest way round: 350 -> 10 turns 20 degrees, not 340 */
export function lerpHeading(/** @type {number} */ a, /** @type {number} */ b, /** @type {number} */ k) {
  const d = ((b - a + 540) % 360) - 180;
  return (a + d * k + 360) % 360;
}

/**
 * @param {{maxGlideMs?: number, teleportM?: number}} [options]
 */
export function createGlide({ maxGlideMs = 500, teleportM = 150 } = {}) {
  /** @type {Pose|null} */ let from = null;
  /** @type {Pose|null} */ let to = null;
  let startedAt = 0;
  let glideMs = 0;
  let lastAt = 0;

  /** @param {number} now @returns {Pose|null} */
  function at(now) {
    if (!to) return null;
    if (!from || glideMs <= 0) return to;
    const k = Math.min(1, (now - startedAt) / glideMs);
    return {
      x: lerp(from.x, to.x, k),
      z: lerp(from.z, to.z, k),
      heading: lerpHeading(from.heading, to.heading, k),
    };
  }

  return {
    at,
    /**
     * A new pose; a missing heading keeps the shown one.
     * @param {{x: number, z: number, heading?: number}} p
     * @param {number} now performance.now()
     */
    push(p, now) {
      const current = at(now);
      const next = { x: p.x, z: p.z, heading: typeof p.heading === "number" ? p.heading : current?.heading ?? 0 };
      const jump = current ? Math.hypot(next.x - current.x, next.z - current.z) : Infinity;
      from = jump < teleportM ? current : null;
      to = next;
      glideMs = Math.min(maxGlideMs, now - lastAt);
      startedAt = lastAt = now;
    },
    clear() {
      from = to = null;
    },
  };
}

/**
 * Show a pose on a marker whose icon's first child is the rotating element.
 * Returns the pose to remember as shown; only what changed is touched.
 * @param {any} marker L.Marker
 * @param {Pose} pose
 * @param {Pose|null} shown what the marker shows now (null: nothing yet)
 * @param {(x: number, z: number) => [number, number]} toLatLng
 */
export function showPose(marker, pose, shown, toLatLng) {
  if (!shown || shown.x !== pose.x || shown.z !== pose.z) {
    marker.setLatLng(toLatLng(pose.x, pose.z));
  }
  const el = marker.getElement()?.firstElementChild;
  // no element while the marker's layer is hidden: rotate once it's back
  if (!el) return { ...pose, heading: NaN };
  if (!shown || shown.heading !== pose.heading) {
    el.style.transform = `rotate(${pose.heading}deg)`;
  }
  return pose;
}
