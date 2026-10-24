import { get } from "svelte/store";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { Code } from "../../bindings/github.com/telesma-app/kit/model/failure";
import { Kind as OperationKind } from "../../bindings/github.com/telesma-app/kit/model/operation";
import { Mode } from "../../bindings/github.com/telesma-app/kit/transport";
import { DeviceReport } from "../../bindings/github.com/telesma-app/kit/model/report";
import type {
  AuthenticatorSessionSnapshot,
  DiscoveryChangedEnvelope,
} from "../../bindings/telesma/service";

import { api } from "$lib/api.js";
import { m } from "../paraglide/messages.js";
import {
  bootstrapAuthenticatorSession,
  selectAuthenticatorSession,
} from "$lib/authenticator-controller.js";
import { handleDiscoveryChanged } from "$lib/discovery-controller.js";
import { authenticatorSession } from "$lib/features/authenticator/state.js";
import { labState } from "$lib/features/lab/state.js";
import { statusBar } from "$lib/features/workbench/state.js";
import {
  cancelOperationRecovery,
  offerOperationRecovery,
  operationRecovery,
} from "$lib/operation-recovery.js";
import { failureForCode } from "$lib/test-support/failure.js";
import {
  resetAppStateForTest,
  seedDevicesForTest,
  seedSelectionForTest,
} from "$lib/test-support/store-utils.js";
import { authenticatorStatus, devices, selectedSelector } from "$lib/test-support/stores.js";
import { testHIDDevice, testSmartCardDevice, testTopology } from "../test/device.js";

function envelope(
  snapshot: Omit<AuthenticatorSessionSnapshot, "devices" | "selectedDeviceId">,
): DiscoveryChangedEnvelope {
  return {
    snapshot: {
      ...snapshot,
      ...testTopology(snapshot.endpoints),
      selectedDeviceId: snapshot.selectedAttachmentId,
    },
  };
}

describe("discovery controller", () => {
  beforeEach(() => {
    resetAppStateForTest();
    vi.restoreAllMocks();
    vi.spyOn(api, "readSources").mockRejectedValue(new Error("unavailable in this test"));
    vi.spyOn(api, "getInfo").mockResolvedValue({
      operationId: "inspect-1",
      selectionId: "selection-1",
      kind: OperationKind.GetInfo,
      authenticatorClosed: false,
      error: failureForCode(Code.CodeTransportFailure),
    });
  });

  it("applies the manager-owned session and resets per-device state", async () => {
    const first = testHIDDevice("token-1", "First");
    const second = testHIDDevice("token-2", "Second");

    seedDevicesForTest([first]);
    seedSelectionForTest(first.attachment.id, first, {
      state: "ready",
      selectionId: "selection-1",
    });
    labState.update((state) => ({
      ...state,
      makeDraft: { ...state.makeDraft, rpID: "discard.example" },
    }));

    await handleDiscoveryChanged(
      envelope({
        endpoints: [first, second],
        selectedAttachmentId: second.attachment.id,
        selection: {
          id: "selection-2",
          attachmentId: second.attachment.id,
          deviceId: second.attachment.id,
        },
      }),
    );

    expect(get(devices)).toEqual(testTopology([first, second]).devices);
    expect(get(selectedSelector)).toBe(second.attachment.id);
    expect(get(authenticatorStatus)).toEqual({ state: "ready", selectionId: "selection-2" });
    expect(get(labState).makeDraft.rpID).toBe("example.com");
  });

  it("completes bootstrap only after the initial manager event", async () => {
    const device = testHIDDevice("token-1", "Token");

    vi.spyOn(api, "discover").mockResolvedValue(undefined);
    let completed = false;
    const bootstrap = bootstrapAuthenticatorSession().then(() => {
      completed = true;
    });

    await Promise.resolve();
    expect(completed).toBe(false);

    await handleDiscoveryChanged(
      envelope({
        endpoints: [device],
        selectedAttachmentId: device.attachment.id,
        selection: {
          id: "selection-1",
          attachmentId: device.attachment.id,
          deviceId: device.attachment.id,
        },
      }),
    );
    await bootstrap;

    expect(completed).toBe(true);
    expect(get(selectedSelector)).toBe(device.attachment.id);
  });

  it("keeps state and does not reload for an unchanged manager update", async () => {
    const original = testHIDDevice("token-1", "Original");
    const updated = testHIDDevice("token-1", "Updated");

    seedDevicesForTest([original]);
    seedSelectionForTest(original.attachment.id, original, {
      state: "ready",
      selectionId: "selection-1",
    });
    labState.update((state) => ({
      ...state,
      getDraft: { ...state.getDraft, rpID: "kept.example" },
    }));

    statusBar.update((state) => ({
      ...state,
      lastOutcome: { tone: "success", title: "User action completed", message: "Preserve this" },
    }));
    await handleDiscoveryChanged(
      envelope({
        endpoints: [updated],
        selectedAttachmentId: updated.attachment.id,
        selection: {
          id: "selection-1",
          attachmentId: updated.attachment.id,
          deviceId: updated.attachment.id,
        },
      }),
    );

    expect(api.readSources).not.toHaveBeenCalled();
    expect(get(devices)).toEqual(testTopology([updated]).devices);
    expect(get(statusBar).lastOutcome?.title).toBe("User action completed");
    expect(get(labState).getDraft.rpID).toBe("kept.example");
    expect(api.getInfo).not.toHaveBeenCalled();
  });

  it.each([false, true])(
    "keeps the selected runtime when physical identity changes (sibling=%s)",
    async (withSibling) => {
      const device = testHIDDevice("hid-1", "Token");
      const endpoints = withSibling ? [device, testSmartCardDevice("card-1")] : [device];
      authenticatorSession.set({
        devices: endpoints.map(
          (endpoint) =>
            new DeviceReport({
              id: `endpoint:${endpoint.attachment.id}`,
              endpointIds: [endpoint.attachment.id],
            }),
        ),
        endpoints,
        selectedDeviceId: "endpoint:hid-1",
        selectedAttachmentId: "hid-1",
        authenticator: { state: "ready", selectionId: "selection-1" },
      });
      labState.update((state) => ({
        ...state,
        getDraft: { ...state.getDraft, rpID: "kept.example" },
      }));

      await handleDiscoveryChanged({
        snapshot: {
          devices: [
            new DeviceReport({
              id: "yubico:1234",
              endpointIds: endpoints.map((endpoint) => endpoint.attachment.id),
            }),
          ],
          endpoints,
          selectedDeviceId: "yubico:1234",
          selectedAttachmentId: "hid-1",
          selection: { id: "selection-1", deviceId: "yubico:1234", attachmentId: "hid-1" },
        },
      });

      expect(get(selectedSelector)).toBe("yubico:1234");
      expect(get(authenticatorStatus)).toEqual({ state: "ready", selectionId: "selection-1" });
      expect(get(labState).getDraft.rpID).toBe("kept.example");
      expect(get(statusBar).lastOutcome).toMatchObject({
        tone: "info",
        title: m.authenticator_list_updated(),
      });
      expect(api.readSources).not.toHaveBeenCalled();
      expect(api.getInfo).not.toHaveBeenCalled();
    },
  );

  it.each([false, true])(
    "reports selected endpoint removal and resets its state (fallback=%s)",
    async (withFallback) => {
      const original = testHIDDevice("token-1", "Original");
      const replacement = testHIDDevice("token-2", "Replacement");
      seedSelectionForTest(original.attachment.id, original, {
        state: "ready",
        selectionId: "selection-1",
      });
      labState.update((state) => ({
        ...state,
        getDraft: { ...state.getDraft, rpID: "discard.example" },
      }));
      vi.mocked(api.readSources).mockResolvedValue(undefined);
      vi.spyOn(api, "refreshMetadata").mockResolvedValue(undefined);

      await handleDiscoveryChanged(
        envelope({
          endpoints: withFallback ? [replacement] : [],
          selectedAttachmentId: withFallback ? replacement.attachment.id : "",
          ...(withFallback
            ? {
                selection: {
                  id: "selection-2",
                  deviceId: replacement.attachment.id,
                  attachmentId: replacement.attachment.id,
                },
              }
            : {}),
        }),
      );

      expect(get(labState).getDraft.rpID).toBe("example.com");
      expect(get(statusBar).lastOutcome).toMatchObject({
        tone: "warning",
        title: m.selected_authenticator_disconnected(),
      });
      expect(get(selectedSelector)).toBe(withFallback ? replacement.attachment.id : "");
      expect(api.readSources).toHaveBeenCalledTimes(withFallback ? 1 : 0);
    },
  );

  it("loads the active screen when a local opening state becomes ready", async () => {
    const device = testHIDDevice("token-1", "Token");

    seedDevicesForTest([device]);
    authenticatorSession.set({
      ...testTopology([device]),
      selectedDeviceId: device.attachment.id,
      selectedAttachmentId: device.attachment.id,
      authenticator: { state: "opening" },
    });

    await handleDiscoveryChanged(
      envelope({
        endpoints: [device],
        selectedAttachmentId: device.attachment.id,
        selection: {
          id: "selection-1",
          attachmentId: device.attachment.id,
          deviceId: device.attachment.id,
        },
      }),
    );

    expect(api.readSources).toHaveBeenCalledOnce();
  });

  it("clears runtime state on handle loss while retaining the viewed attachment", async () => {
    const device = testHIDDevice();
    seedSelectionForTest(device.attachment.id, device, {
      state: "ready",
      selectionId: "session-1",
    });
    labState.update((state) => ({
      ...state,
      makeDraft: { ...state.makeDraft, rpID: "discard.example" },
    }));
    await handleDiscoveryChanged(
      envelope({ endpoints: [device], selectedAttachmentId: device.attachment.id }),
    );
    expect(get(selectedSelector)).toBe(device.attachment.id);
    expect(get(authenticatorStatus).state).toBe("idle");
    expect(get(labState).makeDraft.rpID).toBe("example.com");
    expect(api.readSources).not.toHaveBeenCalled();
  });

  it("clears device state when the manager reopens the same attachment", async () => {
    const device = testHIDDevice("token-1", "Token");

    seedDevicesForTest([device]);
    seedSelectionForTest(device.attachment.id, device, {
      state: "ready",
      selectionId: "selection-1",
    });
    labState.update((state) => ({
      ...state,
      getDraft: { ...state.getDraft, rpID: "discard.example" },
    }));

    await handleDiscoveryChanged(
      envelope({
        endpoints: [device],
        selectedAttachmentId: device.attachment.id,
        selection: {
          id: "selection-2",
          attachmentId: device.attachment.id,
          deviceId: device.attachment.id,
        },
      }),
    );

    expect(get(labState).getDraft.rpID).toBe("example.com");
  });

  it("keeps smart-card recovery on the frontend", async () => {
    const original = testSmartCardDevice("card-1");
    const replacement = testSmartCardDevice("card-2");
    const hid = testHIDDevice("token-1", "HID");

    seedDevicesForTest([original]);
    seedSelectionForTest(original.attachment.id, original, {
      state: "ready",
      selectionId: "selection-1",
    });
    void offerOperationRecovery("Make credential", failureForCode(Code.CodeUserPresenceRequired));
    vi.spyOn(api, "setEndpointSelection").mockResolvedValue(undefined);

    await handleDiscoveryChanged(
      envelope({
        endpoints: [hid, replacement],
        selectedAttachmentId: hid.attachment.id,
        selection: {
          id: "selection-2",
          attachmentId: hid.attachment.id,
          deviceId: hid.attachment.id,
        },
      }),
    );

    expect(api.setEndpointSelection).toHaveBeenCalledWith({
      attachmentId: replacement.attachment.id,
    });
    expect(get(selectedSelector)).toBe(hid.attachment.id);

    await handleDiscoveryChanged(
      envelope({
        endpoints: [hid, replacement],
        selectedAttachmentId: replacement.attachment.id,
        selection: {
          id: "selection-3",
          attachmentId: replacement.attachment.id,
          deviceId: replacement.attachment.id,
        },
      }),
    );

    expect(get(selectedSelector)).toBe(replacement.attachment.id);
    expect(get(operationRecovery)?.canRetry).toBe(true);

    cancelOperationRecovery();
  });

  it.each([false, true])(
    "selects the PCSC endpoint of a grouped device once after HID fallback (open fails=%s)",
    async (openFails) => {
      const hid = testHIDDevice("hid-1", "Key");
      const card = testSmartCardDevice("card-1");
      const deviceId = "yubico:1234";
      seedSelectionForTest(card.attachment.id, card, {
        state: "ready",
        selectionId: "selection-card-original",
      });
      void offerOperationRecovery("Make credential", failureForCode(Code.CodeUserPresenceRequired));
      vi.spyOn(api, "setEndpointSelection").mockResolvedValue(undefined);
      vi.spyOn(api, "setSelection").mockResolvedValue(undefined);

      const fallback: AuthenticatorSessionSnapshot = {
        devices: [new DeviceReport({ id: deviceId, endpointIds: [hid.attachment.id] })],
        endpoints: [hid],
        selectedDeviceId: deviceId,
        selectedAttachmentId: hid.attachment.id,
        selection: { id: "selection-hid", deviceId, attachmentId: hid.attachment.id },
      };
      await handleDiscoveryChanged({ snapshot: fallback });

      const reconnected: AuthenticatorSessionSnapshot = {
        ...fallback,
        devices: [
          new DeviceReport({
            id: deviceId,
            endpointIds: [hid.attachment.id, card.attachment.id],
          }),
        ],
        endpoints: [hid, card],
      };
      await handleDiscoveryChanged({ snapshot: reconnected });

      expect(api.setEndpointSelection).toHaveBeenCalledExactlyOnceWith({
        attachmentId: card.attachment.id,
      });
      expect(api.setSelection).not.toHaveBeenCalled();

      await handleDiscoveryChanged({
        snapshot: {
          ...reconnected,
          selectedAttachmentId: card.attachment.id,
          selection: openFails
            ? null
            : { id: "selection-card-new", deviceId, attachmentId: card.attachment.id },
          error: openFails ? failureForCode(Code.CodeTransportFailure) : null,
        },
      });

      expect(api.setEndpointSelection).toHaveBeenCalledTimes(1);
      expect(get(selectedSelector)).toBe(deviceId);
      expect(get(operationRecovery)?.canRetry).toBe(!openFails);
      cancelOperationRecovery();
    },
  );

  it("waits for physical device publication before selecting a recovery card", async () => {
    const original = testSmartCardDevice("card-1");
    const replacement = testSmartCardDevice("card-2");
    const hid = testHIDDevice("token-1", "HID");
    seedSelectionForTest(original.attachment.id, original, {
      state: "ready",
      selectionId: "selection-1",
    });
    void offerOperationRecovery("Make credential", failureForCode(Code.CodeUserPresenceRequired));
    vi.spyOn(api, "setEndpointSelection").mockResolvedValue(undefined);

    await handleDiscoveryChanged({
      snapshot: {
        devices: testTopology([hid]).devices,
        endpoints: [hid, replacement],
        selectedDeviceId: hid.attachment.id,
        selectedAttachmentId: hid.attachment.id,
        selection: {
          id: "selection-2",
          deviceId: hid.attachment.id,
          attachmentId: hid.attachment.id,
        },
      },
    });

    expect(api.setEndpointSelection).not.toHaveBeenCalled();
    expect(get(operationRecovery)?.canRetry).toBe(false);

    await handleDiscoveryChanged(
      envelope({
        endpoints: [hid, replacement],
        selectedAttachmentId: hid.attachment.id,
        selection: {
          id: "selection-2",
          deviceId: hid.attachment.id,
          attachmentId: hid.attachment.id,
        },
      }),
    );

    expect(api.setEndpointSelection).toHaveBeenCalledExactlyOnceWith({
      attachmentId: replacement.attachment.id,
    });
    cancelOperationRecovery();
  });

  it("keeps a typed device-manager failure in the session", async () => {
    const error = failureForCode(Code.CodeTransportFailure);

    await handleDiscoveryChanged(envelope({ endpoints: [], selectedAttachmentId: "", error }));

    expect(get(authenticatorStatus)).toEqual({ state: "error", error });
  });

  it("keeps all devices visible when none can be opened", async () => {
    const device = testHIDDevice("token-1", "Unavailable token");
    const error = failureForCode(Code.CodeTransportFailure);

    await handleDiscoveryChanged(
      envelope({ endpoints: [device], selectedAttachmentId: "", error }),
    );

    expect(get(devices)).toEqual(testTopology([device]).devices);
    expect(get(selectedSelector)).toBe("");
    expect(get(authenticatorStatus)).toEqual({ state: "error", error });
  });

  it("restores the generated session after a bridge failure", async () => {
    const first = testHIDDevice("token-1", "First");
    const second = testHIDDevice("token-2", "Second");

    seedDevicesForTest([first, second]);
    seedSelectionForTest(first.attachment.id, first, {
      state: "ready",
      selectionId: "selection-1",
    });
    vi.spyOn(api, "setSelection").mockRejectedValue(new Error("bridge unavailable"));

    await selectAuthenticatorSession(second.attachment.id);

    expect(get(selectedSelector)).toBe(first.attachment.id);
    expect(get(authenticatorStatus)).toEqual({
      state: "ready",
      selectionId: "selection-1",
    });
  });

  it("applies the manager fallback after a manual open failure", async () => {
    const first = testHIDDevice("token-1", "First");
    const second = testHIDDevice("token-2", "Second");
    const error = failureForCode(Code.CodeTransportFailure);

    seedDevicesForTest([first, second]);
    seedSelectionForTest(first.attachment.id, first, {
      state: "ready",
      selectionId: "selection-1",
    });
    vi.spyOn(api, "setSelection").mockResolvedValue(undefined);

    await selectAuthenticatorSession(second.attachment.id);

    expect(get(selectedSelector)).toBe(first.attachment.id);
    expect(get(authenticatorStatus)).toEqual({
      state: "ready",
      selectionId: "selection-1",
    });

    await handleDiscoveryChanged(
      envelope({
        endpoints: [first, second],
        selectedAttachmentId: first.attachment.id,
        selection: {
          id: "selection-2",
          attachmentId: first.attachment.id,
          deviceId: first.attachment.id,
        },
        error,
      }),
    );

    expect(get(selectedSelector)).toBe(first.attachment.id);
    expect(get(authenticatorStatus)).toEqual({
      state: "ready",
      selectionId: "selection-2",
    });
  });

  it("reports a manager error while retaining a ready fallback", async () => {
    const device = testHIDDevice("token-1", "Token");
    const error = failureForCode(Code.CodeTransportFailure);

    statusBar.update((state) => ({
      ...state,
      lastOutcome: { tone: "success", title: "Authenticator ready" },
    }));
    await handleDiscoveryChanged(
      envelope({
        endpoints: [device],
        selectedAttachmentId: device.attachment.id,
        selection: {
          id: "selection-1",
          attachmentId: device.attachment.id,
          deviceId: device.attachment.id,
        },
        error,
      }),
    );

    expect(get(authenticatorStatus)).toEqual({ state: "ready", selectionId: "selection-1" });
    expect(get(statusBar).lastOutcome?.tone).toBe("error");
  });

  it("recognizes smart-card attachments from the manager snapshot", () => {
    const card = testSmartCardDevice("card-1");

    expect(card.attachment.transport).toBe(Mode.ModeSmartCard);
  });
});
