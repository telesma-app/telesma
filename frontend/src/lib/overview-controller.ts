import { get } from "svelte/store";
import { m } from "../paraglide/messages.js";
import { api } from "$lib/api.js";
import {
  errorLoadState,
  idleLoadState,
  loadingLoadState,
  readyLoadState,
} from "$lib/load-state.js";
import { overviewBioSensor, resetOverviewDeviceState } from "$lib/features/overview/state.js";
import {
  authenticatorGetInfo,
  selectedSelector,
  selectedEndpointId,
  selectedDeviceEndpoints,
  selectedDevice,
  authenticatorStatus,
} from "$lib/features/authenticator/state.js";
import { activeScreen } from "$lib/features/workbench/state.js";
import { failureMessage, runtimeFailureFrom } from "$lib/failure.js";
import { setStatusOutcome } from "$lib/workbench-state";
import { completeOperation, runOperation } from "$lib/operation-lifecycle.js";

export function invalidateOverviewCache() {
  authenticatorGetInfo.set(idleLoadState());
  resetOverviewDeviceState();
}

export async function maybeLoadOverview() {
  if (!get(selectedSelector)) return;
  if (get(activeScreen) === "lab") {
    if (get(authenticatorStatus).state === "ready" && get(authenticatorGetInfo).state === "idle") {
      await loadGetInfo();
    }
  } else if (get(activeScreen) === "overview") {
    void loadOverviewBioSensor();
    if (
      get(selectedDeviceEndpoints).some(
        (endpoint) =>
          endpoint.sources.yubico.state === "not-requested" ||
          endpoint.sources.token2.state === "not-requested",
      )
    ) {
      await loadOverview();
    } else {
      void loadOverviewMetadata(get(selectedEndpointId));
    }
  }
}

export async function loadGetInfo() {
  authenticatorGetInfo.set(loadingLoadState());
  const attempt = await runOperation({
    label: m.overview_inspection(),
    call: () => api.getInfo({}),
    onRuntimeFailure: (error) => authenticatorGetInfo.set(errorLoadState(error)),
  });
  if (!attempt.ok) return;
  const envelope = attempt.envelope;
  authenticatorGetInfo.set(
    envelope.error ? errorLoadState(envelope.error, envelope) : readyLoadState(envelope),
  );
  completeOperation(m.overview_inspection(), envelope);
}

export async function loadOverview() {
  const deviceId = get(selectedSelector);
  const attachmentId = get(selectedEndpointId);
  if (!deviceId) return;
  try {
    await api.readSources({ deviceId });
    void loadOverviewMetadata(attachmentId);
  } catch (error) {
    reportSourceRuntimeFailure(attachmentId, m.source_read_failed(), error);
  }
}

async function loadOverviewBioSensor() {
  const info = get(selectedDevice)?.sources.getInfo.data;
  if (
    info &&
    get(authenticatorStatus).state === "ready" &&
    (info.options?.bioEnroll === true || info.options?.uvBioEnroll === true)
  ) {
    overviewBioSensor.set(loadingLoadState());
    const attempt = await runOperation({
      label: m.security_bio_sensor_operation(),
      call: () => api.bioSensorInfo({}),
      onRuntimeFailure: (error) => overviewBioSensor.set(errorLoadState(error)),
    });
    if (attempt.ok) {
      const bio = attempt.envelope;
      overviewBioSensor.set(bio.error ? errorLoadState(bio.error, bio) : readyLoadState(bio));
      completeOperation(m.security_bio_sensor_operation(), bio, { summarize: false });
    }
  }
}

export async function loadOverviewMetadata(attachmentId: string, refresh = false) {
  try {
    await api.refreshMetadata({ attachmentId, refresh });
  } catch (error) {
    reportSourceRuntimeFailure(attachmentId, m.metadata_service(), error);
  }
}

function reportSourceRuntimeFailure(attachmentId: string, title: string, cause: unknown) {
  setStatusOutcome({
    tone: "error",
    title,
    message: `${attachmentId}: ${failureMessage(runtimeFailureFrom(cause))}`,
  });
}
