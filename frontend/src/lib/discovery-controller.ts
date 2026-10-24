import { get } from "svelte/store";

import type { DiscoveryChangedEnvelope } from "../../bindings/telesma/service";
import { Mode } from "../../bindings/github.com/telesma-app/kit/transport";

import { m } from "../paraglide/messages.js";
import {
  selectAuthenticatorEndpoint,
  sessionUpdateApplied,
} from "$lib/authenticator-controller.js";
import { authenticatorSession } from "$lib/features/authenticator/state.js";
import { failureMessage } from "$lib/failure.js";
import { operationRecovery } from "$lib/operation-recovery.js";
import { applySessionSnapshot, setStatusOutcome } from "$lib/workbench-state.js";
import { loadActiveScreen } from "$lib/workbench-controller.js";

type DiscoveryTone = "error" | "info" | "warning";

function discoveryPresentation(
  envelope: DiscoveryChangedEnvelope,
  selectedDisconnected: boolean,
): { tone: DiscoveryTone; title: string; message: string } {
  if (envelope.snapshot.error) {
    return {
      tone: "error",
      title: m.discovery_issue(),
      message: failureMessage(envelope.snapshot.error),
    };
  }

  if (selectedDisconnected) {
    return {
      tone: "warning",
      title: m.selected_authenticator_disconnected(),
      message: m.selected_authenticator_disconnected_message(),
    };
  }

  return {
    tone: "info",
    title: m.authenticator_list_updated(),
    message: m.authenticators_found({ count: envelope.snapshot.devices.length }),
  };
}

export async function handleDiscoveryChanged(envelope: DiscoveryChangedEnvelope) {
  const previous = get(authenticatorSession);
  const previousAttachmentId = previous.selectedAttachmentId;
  const topologyChanged =
    previous.devices.length !== envelope.snapshot.devices.length ||
    previous.devices.some(
      (device) => !envelope.snapshot.devices.some((next) => next.id === device.id),
    );
  const selectedDisconnected =
    Boolean(previousAttachmentId) &&
    !envelope.snapshot.endpoints.some(
      (endpoint) => endpoint.attachment.id === previousAttachmentId,
    );

  const change = applySessionSnapshot(envelope.snapshot);
  sessionUpdateApplied();

  if (get(operationRecovery)) {
    const recoveryCard = envelope.snapshot.endpoints.find(
      (endpoint) =>
        endpoint.attachment.transport === Mode.ModeSmartCard &&
        envelope.snapshot.devices.some((device) =>
          device.endpointIds.includes(endpoint.attachment.id),
        ),
    );

    if (recoveryCard && recoveryCard.attachment.id !== envelope.snapshot.selectedAttachmentId) {
      await selectAuthenticatorEndpoint(recoveryCard.attachment.id);

      return;
    }
  }

  if (topologyChanged || change.boundaryChanged || change.becameReady || envelope.snapshot.error) {
    setStatusOutcome(discoveryPresentation(envelope, selectedDisconnected));
  }
  if (change.attachmentChanged || change.becameReady) await loadActiveScreen();
}
