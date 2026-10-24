import { writable } from "svelte/store";
import type { BioSensorEnvelope } from "../../../../bindings/telesma/service";
import { idleLoadState, type LoadState } from "$lib/load-state";
export {
  errorLoadState,
  idleLoadState,
  loadingLoadState,
  readyLoadState,
  type LoadState,
} from "$lib/load-state";

export const overviewBioSensor = writable<LoadState<BioSensorEnvelope>>(idleLoadState());

export function resetOverviewDeviceState() {
  overviewBioSensor.set(idleLoadState());
}
