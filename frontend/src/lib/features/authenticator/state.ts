import { derived, writable } from "svelte/store";

import type {
  DeviceReport,
  EndpointReport,
} from "../../../../bindings/github.com/telesma-app/kit/model/report";
import type { GetInfoEnvelope } from "../../../../bindings/telesma/service";

import { idleLoadState, type LoadState } from "$lib/load-state";
import type { AuthenticatorStatus } from "$lib/authenticator-model";

import { statusBar } from "$lib/features/workbench/state";

export type AuthenticatorSession = {
  devices: DeviceReport[];
  endpoints: EndpointReport[];
  selectedDeviceId: string;
  selectedAttachmentId: string;
  authenticator: AuthenticatorStatus;
};

export const authenticatorSession = writable<AuthenticatorSession>({
  devices: [],
  endpoints: [],
  selectedDeviceId: "",
  selectedAttachmentId: "",
  authenticator: { state: "idle" },
});

export const devices = derived(authenticatorSession, ($session) => $session.devices);

export const selectedSelector = derived(
  authenticatorSession,
  ($session) => $session.selectedDeviceId,
);

export const selectedDevice = derived(
  authenticatorSession,
  ($session) =>
    $session.endpoints.find(
      (endpoint) => endpoint.attachment.id === $session.selectedAttachmentId,
    ) ?? null,
);

export const authenticatorStatus = derived(
  authenticatorSession,
  ($session) => $session.authenticator,
);

export const authenticatorGetInfo = writable<LoadState<GetInfoEnvelope>>(idleLoadState());

export const authenticatorBusy = derived(
  [authenticatorSession, statusBar],
  ([$session, $statusBar]) =>
    $session.authenticator.state === "opening" || Boolean($statusBar.activeOperation),
);

export function resetAuthenticatorDeviceState() {
  authenticatorGetInfo.set(idleLoadState());
}

export function resetAuthenticatorStateForTest() {
  authenticatorSession.set({
    devices: [],
    endpoints: [],
    selectedDeviceId: "",
    selectedAttachmentId: "",
    authenticator: { state: "idle" },
  });
  resetAuthenticatorDeviceState();
}

export const endpoints = derived(authenticatorSession, ($session) => $session.endpoints);
export const selectedEndpointId = derived(
  authenticatorSession,
  ($session) => $session.selectedAttachmentId,
);
export const selectedPhysicalDevice = derived(
  authenticatorSession,
  ($session) => $session.devices.find((device) => device.id === $session.selectedDeviceId) ?? null,
);
export const selectedDeviceEndpoints = derived(
  [authenticatorSession, selectedPhysicalDevice],
  ([$session, $device]) =>
    $device
      ? $session.endpoints.filter((endpoint) =>
          $device.endpointIds.includes(endpoint.attachment.id),
        )
      : [],
);
