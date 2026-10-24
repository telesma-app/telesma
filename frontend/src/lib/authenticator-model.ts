import type { Failure } from "../../bindings/github.com/telesma-app/kit/model/failure";
import type { SelectionID } from "../../bindings/telesma/service";
import type {
  EndpointReport,
  DeviceReport,
} from "../../bindings/github.com/telesma-app/kit/model/report";

export type AuthenticatorState = "idle" | "opening" | "ready" | "error";

export type AuthenticatorStatus = {
  selectionId?: SelectionID;
  state: AuthenticatorState;
  error?: Failure | null;
};

export function reportForSelector(devices: DeviceReport[], selector: string) {
  const requestedSelector = selector.trim();

  if (!requestedSelector) return null;

  return devices.find((device) => device.id === requestedSelector) ?? null;
}

export function idleAuthenticatorStatus(
  state: AuthenticatorState = "idle",
  error?: Failure | null,
): AuthenticatorStatus {
  const status: AuthenticatorStatus = { state };

  if (error) status.error = error;

  return status;
}
