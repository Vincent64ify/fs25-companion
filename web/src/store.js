// @ts-check
// Key/value store with subscriptions. Every topic is a key ("hello",
// "player", ...) holding the latest envelope's data; the connection adds a
// few keys of its own ("connection", "mapAssets", "protocolError").

/** @typedef {(value: any, key: string) => void} Listener */

export function createStore() {
  /** @type {Map<string, any>} */
  const values = new Map();
  /** @type {Map<string, Set<Listener>>} */
  const listeners = new Map();
  let lastTopicAt = 0;

  /** @param {string} key */
  function notify(key) {
    for (const fn of listeners.get(key) || []) {
      try {
        fn(values.get(key), key);
      } catch (e) {
        console.error(`listener for ${key} failed`, e);
      }
    }
    for (const fn of listeners.get("*") || []) fn(values.get(key), key);
  }

  return {
    /** @param {string} key */
    get: (key) => values.get(key),

    /** @param {string} key @param {any} value */
    set(key, value) {
      values.set(key, value);
      notify(key);
    },

    /**
     * Call fn(value) now and on every change of key ("*": any key).
     * @param {string} key
     * @param {Listener} fn
     * @returns {() => void} unsubscribe
     */
    subscribe(key, fn) {
      if (!listeners.has(key)) listeners.set(key, new Set());
      listeners.get(key)?.add(fn);
      if (key !== "*") fn(values.get(key), key);
      return () => listeners.get(key)?.delete(fn);
    },

    /**
     * A snapshot replaces every topic (a new game session drops old ones).
     * @param {Record<string, import("./types.js").Envelope>} envelopes
     * @param {string[]} topicKeys keys the previous snapshot/updates set
     */
    replaceTopics(envelopes, topicKeys) {
      const changed = new Set(topicKeys);
      for (const key of topicKeys) values.delete(key);
      for (const [topic, envelope] of Object.entries(envelopes)) {
        values.set(topic, envelope.data);
        changed.add(topic);
      }
      if (Object.keys(envelopes).length) lastTopicAt = Date.now();
      for (const key of changed) notify(key);
    },

    /** @param {import("./types.js").Envelope} envelope */
    applyUpdate(envelope) {
      lastTopicAt = Date.now();
      values.set(envelope.topic, envelope.data);
      notify(envelope.topic);
    },

    /** ms timestamp of the last topic data, 0 if none */
    lastTopicAt: () => lastTopicAt,
  };
}

/** @typedef {ReturnType<typeof createStore>} Store */
