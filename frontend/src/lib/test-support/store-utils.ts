import { testTopology } from "../../test/device.js";
import { Code, type Failure } from "../../../bindings/github.com/telesma-app/kit/model/failure";
import type { EndpointReport } from "../../../bindings/github.com/telesma-app/kit/model/report";
import type {
  BioSensorEnvelope,
  CredentialsEnvelope,
  GetInfoEnvelope,
  InteractionPrompt,
  LargeBlobListEnvelope,
} from "../../../bindings/telesma/service";

import {
  resetInteractionStateForTest,
  pendingInteraction,
} from "$lib/features/interaction/state.js";
import { resetLabStateForTest } from "$lib/features/lab/state.js";
import {
  completeLargeBlobsInventoryLoad,
  emptyLargeBlobsInventoryState,
  largeBlobsInventoryState,
  resetLargeBlobsStateForTest,
} from "$lib/features/largeblobs/state.js";
import {
  errorLoadState,
  idleLoadState,
  overviewBioSensor,
  readyLoadState,
  resetOverviewDeviceState,
} from "$lib/features/overview/state.js";
import {
  completePasskeysInventoryLoad,
  emptyPasskeysInventoryState,
  passkeysInventoryState,
  resetPasskeysStateForTest,
} from "$lib/features/passkeys/state.js";
import { credentialsReport } from "$lib/ctapkit-results.js";
import {
  authenticatorSession,
  authenticatorGetInfo,
  resetAuthenticatorStateForTest,
} from "$lib/features/authenticator/state.js";
import { resetSecurityDeviceState } from "$lib/features/security/state.js";
import { cancelOperationRecovery } from "$lib/operation-recovery.js";
import { activeScreen, resetWorkbenchStateForTest } from "$lib/features/workbench/state.js";
import type { AuthenticatorStatus } from "$lib/authenticator-model.js";
import type { ActiveScreen } from "$lib/features/workbench";

export function resetAppStateForTest() {
  cancelOperationRecovery();
  resetAuthenticatorStateForTest();
  resetWorkbenchStateForTest();
  resetInteractionStateForTest();
  resetOverviewDeviceState();
  resetPasskeysStateForTest();
  resetLargeBlobsStateForTest();
  resetLabStateForTest();
  resetSecurityDeviceState();
}

export function seedActiveScreenForTest(screen: ActiveScreen) {
  activeScreen.set(screen);
}

export function seedDevicesForTest(items: EndpointReport[]) {
  authenticatorSession.update((session) => ({ ...session, ...testTopology(items) }));
}

export function seedSelectionForTest(
  selector: string,
  device: EndpointReport | null,
  authenticator: AuthenticatorStatus,
) {
  authenticatorSession.update((session) => {
    const endpoints = device
      ? [
          ...session.endpoints.filter(
            (candidate) => candidate.attachment.id !== device.attachment.id,
          ),
          device,
        ]
      : session.endpoints;
    return {
      ...testTopology(endpoints),
      selectedDeviceId: selector,
      selectedAttachmentId: selector,
      authenticator,
    };
  });
}

export function seedPendingInteractionForTest(prompt: InteractionPrompt | null) {
  pendingInteraction.set(prompt);
}

export function seedGetInfoEnvelopeForTest(envelope: GetInfoEnvelope | null) {
  if (!envelope) {
    authenticatorGetInfo.set(idleLoadState());

    return;
  }

  authenticatorGetInfo.set(
    envelope.error ? errorLoadState(envelope.error, envelope) : readyLoadState(envelope),
  );
}

export function seedOverviewBioSensorEnvelopeForTest(envelope: BioSensorEnvelope | null) {
  overviewBioSensor.set(envelope ? readyLoadState(envelope) : idleLoadState());
}

export function seedPasskeysEnvelopeForTest(
  envelope: CredentialsEnvelope | null,
  error?: Failure | null,
) {
  if (error) {
    passkeysInventoryState.set({
      ...emptyPasskeysInventoryState(),
      phase: "error",
      report: envelope?.result ?? null,
    });

    return;
  }

  if (!envelope) {
    passkeysInventoryState.set(emptyPasskeysInventoryState());

    return;
  }

  const report = credentialsReport(envelope);

  if (report) {
    completePasskeysInventoryLoad(report, "2026-06-22T00:00:00.000Z");

    return;
  }

  passkeysInventoryState.set({
    ...emptyPasskeysInventoryState(),
    phase:
      envelope.error?.code === Code.CodeCredentialManagementUnsupported ? "unsupported" : "error",
  });
}

export function seedLargeBlobsEnvelopeForTest(
  envelope: LargeBlobListEnvelope | null,
  error?: Failure | null,
) {
  if (error) {
    largeBlobsInventoryState.set({
      ...emptyLargeBlobsInventoryState(),
      phase: "error",
      report: envelope?.result ?? null,
    });

    return;
  }

  if (!envelope) {
    largeBlobsInventoryState.set(emptyLargeBlobsInventoryState());

    return;
  }

  if (envelope.result) {
    completeLargeBlobsInventoryLoad(envelope.result, "2026-06-22T00:00:00.000Z");

    return;
  }

  largeBlobsInventoryState.set({
    ...emptyLargeBlobsInventoryState(),
    phase: envelope.error?.code === Code.CodeLargeBlobUnsupported ? "unsupported" : "error",
  });
}
