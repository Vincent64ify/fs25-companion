// @ts-check
// Every widget by id: the names themes use in their layouts.

import * as vehicle from "./vehicle.js";
import * as farm from "./farm.js";
import { implementsWidget } from "./implements.js";
import { alerts, connection, protocolError } from "./status.js";
import { loadCard, targetCard, vehicleBand } from "./vehicleScreen.js";
import { implementCard, implementDetails, rigBand } from "./implementScreen.js";
import { combineCard, harvestBand, headerCard } from "./harvesterScreen.js";
import { fullscreen } from "./screen.js";

/** @type {Record<string, import("./widget.js").CreateWidget>} */
export const WIDGETS = {
  ...vehicle,
  ...farm,
  implements: implementsWidget,
  connection,
  protocolError,
  alerts,
  vehicleBand,
  loadCard,
  targetCard,
  rigBand,
  implementCard,
  implementDetails,
  harvestBand,
  combineCard,
  headerCard,
  fullscreen,
};

/**
 * @param {string} id
 * @param {import("../store.js").Store} store
 * @param {import("./widget.js").WidgetOptions} [opts]
 */
export function createWidget(id, store, opts) {
  const create = WIDGETS[id];
  if (!create) throw new Error(`no widget "${id}"`);
  return create(store, opts);
}
