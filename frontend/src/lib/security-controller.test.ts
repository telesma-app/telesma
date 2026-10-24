import { testTopology } from "../test/device.js";
import {
  DescriptorState,
  GetInfoSource,
  SourceState,
} from "../../bindings/github.com/telesma-app/kit/model/report";
import { USBReport } from "../../bindings/github.com/telesma-app/kit/model/report";
import { get } from "svelte/store";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Kind as OperationKind } from "../../bindings/github.com/telesma-app/kit/model/operation";
import {
  AlwaysUVTarget,
  AuthenticatorConfigOperation,
  BioMutationOperation,
  PINMutationOperation,
  PINMutationResult,
  PINOutput,
  StateValue,
} from "../../bindings/github.com/telesma-app/kit/model/config";
import {
  FactID,
  FactOrigin,
  FactState,
  FactValue,
  FactValueKind,
  Info,
} from "../../bindings/github.com/telesma-app/kit/model/inspect";
import { Code } from "../../bindings/github.com/telesma-app/kit/model/failure";
import { EndpointReport } from "../../bindings/github.com/telesma-app/kit/model/report";
import { PreviewMode } from "../../bindings/github.com/telesma-app/kit/model/safety";
import {
  type ActiveSelection,
  type AuthenticatorConfigEnvelope,
  type BioEnrollEnvelope,
  type BioListEnvelope,
  type BioMutationEnvelope,
  type BioSensorEnvelope,
  type ConfigStatusEnvelope,
  type PINChangeRequest,
  PINEnvelope,
  type PINSetRequest,
  type ResetFactoryEnvelope,
} from "../../bindings/telesma/service";
import { Mode } from "../../bindings/github.com/telesma-app/kit/transport";
import { testSmartCardDevice } from "../test/device.js";

import { api } from "$lib/api";
import { handleDiscoveryChanged } from "$lib/discovery-controller.js";
import { errorLoadState, overviewBioSensor } from "$lib/features/overview/state";
import { failureForCode } from "$lib/test-support/failure";
import {
  completeSecurityResourceLoad,
  securityEnrollments,
  securityMutation,
  securitySensor,
  securityStatus,
} from "$lib/features/security/state";
import {
  authenticatorGetInfo,
  devices,
  selectedSelector,
  selectedDevice,
  selectedDeviceEndpoints,
  authenticatorStatus,
} from "$lib/features/authenticator/state";
import { statusBar } from "$lib/features/workbench/state";
import { setAppLocale } from "$lib/i18n";
import { operationRecovery } from "$lib/operation-recovery.js";
import { buildOverviewPresentation } from "$lib/overview-presentation";
import { testOverviewAssessment, testOverviewFact } from "$lib/test-support/overview-facts";
import {
  beginAlwaysUVChange,
  beginBioEnrollment,
  beginBioRename,
  beginEnterpriseAttestation,
  beginFactoryReset,
  beginLongTouchForReset,
  beginPINPolicyChange,
  changeAuthenticatorPIN,
  confirmSecurityMutation,
  loadSecurityEnrollments,
  loadSecurityStatus,
  maybeLoadSecurity,
  restartSecurityPreview,
  setAuthenticatorPIN,
} from "$lib/security-controller";
import {
  reloadSecurity,
  restartSecurityPreview as restartSecurityPreviewWithRecovery,
} from "$lib/features/security";
import {
  resetAppStateForTest,
  seedActiveScreenForTest,
  seedDevicesForTest,
  seedSelectionForTest,
} from "$lib/test-support/store-utils";

const TOKEN = device("token-1");

function device(id: string): EndpointReport {
  return new EndpointReport({
    attachment: {
      id,
      transport: Mode.ModeHID,
      usb: new USBReport({
        product: { state: DescriptorState.DescriptorRead, value: id },
        vendorId: { state: DescriptorState.DescriptorRead, value: 1 },
        productId: { state: DescriptorState.DescriptorRead, value: 2 },
      }),
    },
  });
}

function snapshot(
  item: EndpointReport,
  selectionId = `authenticator-${item.attachment.id}`,
): ActiveSelection {
  return {
    id: selectionId,
    deviceId: item.attachment.id,
    attachmentId: item.attachment.id,
  };
}

function statusEnvelope(
  options: {
    item?: EndpointReport;
    selectionId?: string;
    bioSupported?: boolean;
    bioConfigured?: boolean | null;
    enterpriseConfigured?: boolean | null;
    alwaysUVConfigured?: boolean | null;
    minPINLength?: number;
    maxPINLength?: number;
    maxRPIDs?: number;
    longTouchConfigured?: boolean | null;
  } = {},
): ConfigStatusEnvelope {
  const item = options.item ?? TOKEN;
  const bioSupported = options.bioSupported ?? false;
  const minPINLength = options.minPINLength ?? 4;
  const maxPINLength = options.maxPINLength ?? 63;

  return {
    operationId: "status-1",
    selectionId: options.selectionId ?? "authenticator-1",
    kind: OperationKind.ConfigStatus,
    result: {
      device: item,
      pin: {
        state: StateValue.StateConfigured,
        supported: true,
        configured: true,
        protocolSupported: true,
        minPINLength,
        maxPINLength,
        retries: { state: StateValue.StateConfigured, remaining: 8 },
      },
      uv: {
        state: StateValue.StateConfigured,
        supported: true,
        configured: true,
        retries: { state: StateValue.StateConfigured, remaining: 5 },
      },
      bio: {
        state: bioSupported ? StateValue.StateSupported : StateValue.StateUnsupported,
        supported: bioSupported,
        configured: options.bioConfigured ?? false,
        uvBioEnroll: {
          state: bioSupported ? StateValue.StateSupported : StateValue.StateUnsupported,
          supported: bioSupported,
          configured: options.bioConfigured ?? false,
        },
      },
      authenticatorConfig: {
        state: StateValue.StateSupported,
        supported: true,
        uvAcfg: { state: StateValue.StateSupported, supported: true },
        enterpriseAttestation: {
          state:
            options.enterpriseConfigured === true
              ? StateValue.StateConfigured
              : StateValue.StateNotConfigured,
          supported: options.enterpriseConfigured !== null,
          configured: options.enterpriseConfigured ?? false,
        },
        alwaysUv: {
          state: StateValue.StateSupported,
          supported: true,
          configured: options.alwaysUVConfigured ?? false,
        },
        setMinPINLength: { state: StateValue.StateSupported, supported: true },
        longTouchForReset: {
          state:
            options.longTouchConfigured === true
              ? StateValue.StateConfigured
              : StateValue.StateNotConfigured,
          supported: options.longTouchConfigured !== null,
          configured: options.longTouchConfigured ?? false,
        },
        vendorPrototype: { state: StateValue.StateUnsupported, supported: false },
      },
      resetHints: { longTouchForReset: StateValue.StateUnknown },
      limits: {
        minPINLength,
        maxPINLength,
        maxRPIDsForSetMinPINLength: options.maxRPIDs ?? 3,
      },
    },
  } as unknown as ConfigStatusEnvelope;
}

function bioSensorEnvelope(item = TOKEN, selectionId = "authenticator-1"): BioSensorEnvelope {
  return {
    operationId: "sensor-1",
    selectionId,
    kind: OperationKind.BioSensorInfo,
    result: {
      device: item,
      supported: true,
      previewOnly: false,
      maxCaptureSamplesRequiredForEnroll: 4,
      maxTemplateFriendlyName: 32,
    },
  } as unknown as BioSensorEnvelope;
}

function bioListEnvelope(item = TOKEN, selectionId = "authenticator-1"): BioListEnvelope {
  return {
    operationId: "bio-list-1",
    selectionId,
    kind: OperationKind.BioList,
    result: {
      device: item,
      supported: true,
      previewOnly: false,
      enrollments: [{ templateIDHex: "cafe", friendlyName: "Index finger" }],
    },
  } as unknown as BioListEnvelope;
}

function pinErrorEnvelope(kind: OperationKind): PINEnvelope {
  return {
    operationId: `pin-error-${kind}`,
    selectionId: "authenticator-1",
    kind,
    error: failureForCode(Code.CodeTransportFailure),
  } as PINEnvelope;
}

function authenticatorConfigEnvelope(
  operation: AuthenticatorConfigOperation,
  phase: "preview" | "result",
  error = false,
): AuthenticatorConfigEnvelope {
  const kind =
    operation === AuthenticatorConfigOperation.AuthenticatorConfigEnterprise
      ? OperationKind.EnableEnterpriseAttestation
      : operation === AuthenticatorConfigOperation.AuthenticatorConfigAlwaysUV
        ? OperationKind.SetAlwaysUV
        : operation === AuthenticatorConfigOperation.AuthenticatorConfigLongTouch
          ? OperationKind.EnableLongTouchForReset
          : OperationKind.SetMinPINLength;

  return {
    operationId: `${phase}-${operation}`,
    selectionId: "authenticator-1",
    kind,
    error: error ? failureForCode(Code.CodeTransportFailure) : undefined,
    result: {
      preview: {
        operation,
        device: TOKEN,
        authenticatorConfig: statusEnvelope().result!.authenticatorConfig,
        mode: phase === "preview" ? PreviewMode.PreviewModeDryRun : PreviewMode.PreviewModeExecute,
      },
      result:
        phase === "result"
          ? {
              operation,
              attachmentId: TOKEN.attachment.id,
              state: StateValue.StateConfigured,
            }
          : null,
    },
  } as unknown as AuthenticatorConfigEnvelope;
}

function bioEnrollPreviewEnvelope(): BioEnrollEnvelope {
  return {
    operationId: "bio-preview-1",
    selectionId: "authenticator-1",
    kind: OperationKind.BioEnroll,
    result: {
      preview: {
        device: TOKEN,
        previewOnly: false,
        timeoutMilliseconds: 60_000,
        mode: PreviewMode.PreviewModeDryRun,
      },
      result: null,
    },
  } as unknown as BioEnrollEnvelope;
}

function bioEnrollErrorEnvelope(): BioEnrollEnvelope {
  return {
    operationId: "bio-error-1",
    selectionId: "authenticator-1",
    kind: OperationKind.BioEnroll,
    error: failureForCode(Code.CodeBioInteractionTimeout),
  } as unknown as BioEnrollEnvelope;
}

function bioRenamePreviewEnvelope(friendlyName: string): BioMutationEnvelope {
  return {
    operationId: "bio-rename-preview-1",
    selectionId: "authenticator-1",
    kind: OperationKind.BioRename,
    result: {
      preview: {
        operation: BioMutationOperation.BioMutationRename,
        device: TOKEN,
        previewOnly: false,
        templateIDHex: "cafe",
        friendlyName,
        mode: PreviewMode.PreviewModeDryRun,
      },
      result: null,
    },
  } as unknown as BioMutationEnvelope;
}

function invalidAuthenticatorStatusEnvelope(): ConfigStatusEnvelope {
  return {
    operationId: "status-invalid-authenticator",
    selectionId: "authenticator-1",
    kind: OperationKind.ConfigStatus,
    authenticatorClosed: false,
    error: failureForCode(Code.CodeAuthenticatorClosed),
  } as ConfigStatusEnvelope;
}

function resetEnvelope(phase: "preview" | "result"): ResetFactoryEnvelope {
  return {
    operationId: `reset-${phase}-1`,
    selectionId: "authenticator-1",
    kind: OperationKind.ResetFactory,
    result: {
      preview: {
        device: TOKEN,
        resetHints: { longTouchForReset: StateValue.StateUnknown },
        mode: phase === "preview" ? PreviewMode.PreviewModeDryRun : PreviewMode.PreviewModeExecute,
      },
      result: phase === "result" ? { attachmentId: TOKEN.attachment.id, reset: true } : null,
    },
  } as unknown as ResetFactoryEnvelope;
}

function seedReadyStatus(envelope = statusEnvelope()) {
  completeSecurityResourceLoad(securityStatus, envelope);
}

beforeEach(() => {
  setAppLocale("en");
  resetAppStateForTest();
  seedDevicesForTest([TOKEN]);
  seedSelectionForTest(TOKEN.attachment.id, TOKEN, {
    state: "ready",
    selectionId: "authenticator-1",
  });
  vi.spyOn(api, "readSources").mockResolvedValue(undefined);
  vi.spyOn(api, "refreshMetadata").mockResolvedValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("security controller loading", () => {
  it("auto-loads only for an active Security screen with a ready selected authenticator", async () => {
    const configStatus = vi.spyOn(api, "configStatus").mockResolvedValue(statusEnvelope());
    const bioSensorInfo = vi.spyOn(api, "bioSensorInfo").mockResolvedValue(bioSensorEnvelope());

    expect(await maybeLoadSecurity()).toBe(false);

    seedActiveScreenForTest("security");
    seedSelectionForTest(TOKEN.attachment.id, TOKEN, { state: "idle" });
    expect(await maybeLoadSecurity()).toBe(false);

    seedSelectionForTest("", null, {
      state: "ready",
      selectionId: "authenticator-1",
    });
    expect(await maybeLoadSecurity()).toBe(false);

    seedSelectionForTest(TOKEN.attachment.id, TOKEN, {
      state: "ready",
      selectionId: "authenticator-1",
    });
    expect(await maybeLoadSecurity()).toBe(true);
    expect(await maybeLoadSecurity()).toBe(false);

    expect(configStatus).toHaveBeenCalledTimes(1);
    expect(configStatus).toHaveBeenCalledWith({});
    expect(bioSensorInfo).not.toHaveBeenCalled();
  });

  it("loads ConfigStatus before sensor info only when biometrics are supported", async () => {
    seedActiveScreenForTest("security");

    const enrollments = bioListEnvelope();
    const configStatus = vi.spyOn(api, "configStatus").mockResolvedValue(
      statusEnvelope({
        bioSupported: true,
        bioConfigured: true,
      }),
    );
    const bioSensorInfo = vi.spyOn(api, "bioSensorInfo").mockResolvedValue(bioSensorEnvelope());
    const bioList = vi.spyOn(api, "bioList").mockResolvedValue(enrollments);

    expect(await maybeLoadSecurity()).toBe(true);

    expect(configStatus).toHaveBeenCalledWith({});
    expect(bioSensorInfo).toHaveBeenCalledWith({});
    expect(configStatus.mock.invocationCallOrder[0]).toBeLessThan(
      bioSensorInfo.mock.invocationCallOrder[0],
    );
    expect(get(securityStatus).phase).toBe("ready");
    expect(get(securitySensor).phase).toBe("ready");
    expect(bioList).not.toHaveBeenCalled();

    expect(await loadSecurityEnrollments()).toBe(true);
    expect(bioList).toHaveBeenCalledWith({});
    expect(get(securityEnrollments).lastSuccessfulEnvelope).toBe(enrollments);
  });

  it("treats unconfigured biometrics as an empty explicit list without calling BioList", async () => {
    seedReadyStatus(statusEnvelope({ bioSupported: true, bioConfigured: false }));

    const bioList = vi.spyOn(api, "bioList").mockResolvedValue(bioListEnvelope());

    expect(await loadSecurityEnrollments()).toBe(true);

    expect(bioList).not.toHaveBeenCalled();
    expect(get(securityEnrollments)).toMatchObject({
      phase: "idle",
      lastSuccessfulEnvelope: null,
      responseEnvelope: null,
      runtimeError: null,
    });
  });

  it("keeps thrown status failures separate from generated envelopes", async () => {
    vi.spyOn(api, "configStatus").mockRejectedValue(new Error("Wails bridge unavailable"));

    expect(await loadSecurityStatus()).toBe(false);
    expect(get(securityStatus)).toMatchObject({
      phase: "error",
      lastSuccessfulEnvelope: null,
      responseEnvelope: null,
      runtimeError: failureForCode(Code.CodeInternalError),
    });
  });
});

describe("security controller mutations", () => {
  it("refreshes the Overview GetInfo source after setting a PIN", async () => {
    const [previous, updated] = [false, true].map((configured) => {
      const item = device("token-1");
      item.sources.getInfo = new GetInfoSource({
        state: SourceState.SourceAvailable,
        data: new Info({
          options: { clientPin: configured },
          assessment: testOverviewAssessment([
            testOverviewFact(
              FactID.FactIDClientPIN,
              "options.clientPin",
              configured ? FactState.FactStateConfigured : FactState.FactStateNotConfigured,
              FactOrigin.FactOriginReported,
              new FactValue({ kind: FactValueKind.FactValueBoolean, boolean: configured }),
            ),
          ]),
        }),
      });
      return item;
    });
    seedActiveScreenForTest("security");
    seedSelectionForTest(previous.attachment.id, previous, {
      state: "ready",
      selectionId: "authenticator-1",
    });
    const overviewPIN = () =>
      buildOverviewPresentation({
        selectedSelector: get(selectedSelector),
        selectedDevice: get(selectedDevice),
        endpoints: get(selectedDeviceEndpoints),
        overviewBioSensorState: get(overviewBioSensor),
      }).standard?.capabilities.find((item) => item.id === "pin");
    vi.spyOn(api, "setPIN").mockResolvedValue(
      new PINEnvelope({
        operationId: "set-pin",
        selectionId: "authenticator-1",
        kind: OperationKind.SetPIN,
        result: new PINOutput({
          result: new PINMutationResult({
            operation: PINMutationOperation.PINMutationSet,
            attachmentId: previous.attachment.id,
            pinState: StateValue.StateConfigured,
          }),
        }),
      }),
    );
    vi.spyOn(api, "configStatus").mockResolvedValue(statusEnvelope({ item: updated }));
    vi.mocked(api.readSources).mockImplementation(async () => {
      await handleDiscoveryChanged({
        snapshot: {
          ...testTopology([updated]),
          selectedDeviceId: updated.attachment.id,
          selectedAttachmentId: updated.attachment.id,
          selection: snapshot(updated, "authenticator-1"),
        },
      });
    });

    expect(overviewPIN()).toMatchObject({ value: "PIN not set", tone: "warning" });

    expect(await setAuthenticatorPIN({ newPIN: "set-secret-123" })).toBe(true);

    expect(api.readSources).toHaveBeenCalledWith({ deviceId: previous.attachment.id });
    expect(get(selectedDevice)?.sources.getInfo.data).toBe(updated.sources.getInfo.data);
    expect(overviewPIN()).toMatchObject({ value: "PIN set", tone: "positive" });
  });

  it("keeps a successful PIN mutation when refreshing sources fails", async () => {
    vi.spyOn(api, "setPIN").mockResolvedValue(
      new PINEnvelope({
        operationId: "set-pin",
        selectionId: "authenticator-1",
        kind: OperationKind.SetPIN,
        result: new PINOutput({
          result: new PINMutationResult({
            operation: PINMutationOperation.PINMutationSet,
            attachmentId: TOKEN.attachment.id,
            pinState: StateValue.StateConfigured,
          }),
        }),
      }),
    );
    vi.spyOn(api, "configStatus").mockResolvedValue(statusEnvelope());
    vi.mocked(api.readSources).mockRejectedValue(new Error("Wails bridge unavailable"));

    expect(await setAuthenticatorPIN({ newPIN: "set-secret-123" })).toBe(true);

    expect(get(statusBar).lastOutcome).toMatchObject({
      tone: "error",
      title: "Could not read device sources",
      message: "token-1: The operation failed because of an internal error.",
    });
  });

  it("does not retain or replay PIN input through card recovery", async () => {
    const card = testSmartCardDevice();

    seedDevicesForTest([card]);
    seedSelectionForTest(card.attachment.id, card, {
      state: "ready",
      selectionId: "authenticator-card-1",
    });

    const denied = pinErrorEnvelope(OperationKind.SetPIN);

    denied.error = failureForCode(Code.CodeUserPresenceRequired);

    const setPIN = vi.spyOn(api, "setPIN").mockResolvedValue(denied);
    const input = { newPIN: "set-secret-123" };

    await expect(setAuthenticatorPIN(input)).resolves.toBe(false);

    expect(setPIN).toHaveBeenCalledOnce();
    expect(input.newPIN).toBe("");
    expect(setPIN.mock.calls[0][0].newPIN).toBe("");
    expect(get(operationRecovery)).toBeNull();
  });

  it("sends exact PIN requests without retaining secrets", async () => {
    let sentSetPINRequest: PINSetRequest | null = null;
    let sentChangePINRequest: PINChangeRequest | null = null;
    const setPIN = vi.spyOn(api, "setPIN").mockImplementation((request) => {
      sentSetPINRequest = { ...request };

      return Promise.resolve(pinErrorEnvelope(OperationKind.SetPIN));
    });
    const changePIN = vi.spyOn(api, "changePIN").mockImplementation((request) => {
      sentChangePINRequest = { ...request };

      return Promise.resolve(pinErrorEnvelope(OperationKind.ChangePIN));
    });

    expect(await setAuthenticatorPIN({ newPIN: "set-secret-123" })).toBe(false);
    expect(sentSetPINRequest).toEqual({
      newPIN: "set-secret-123",
    });
    expect(setPIN.mock.calls[0][0].newPIN).toBe("");

    expect(
      await changeAuthenticatorPIN({
        currentPIN: "old-secret-456",
        newPIN: "new-secret-789",
      }),
    ).toBe(false);
    expect(sentChangePINRequest).toEqual({
      currentPIN: "old-secret-456",
      newPIN: "new-secret-789",
    });
    expect(changePIN.mock.calls[0][0]).toMatchObject({ currentPIN: "", newPIN: "" });
    expect(get(securityMutation)).toEqual({ kind: "idle", operation: { phase: "idle" } });

    const persistedState = JSON.stringify({
      mutation: get(securityMutation),
      status: get(securityStatus),
      sensor: get(securitySensor),
      enrollments: get(securityEnrollments),
      statusBar: get(statusBar),
    });

    expect(persistedState).not.toContain("set-secret-123");
    expect(persistedState).not.toContain("old-secret-456");
    expect(persistedState).not.toContain("new-secret-789");
  });

  it("previews and then executes the exact Always UV request", async () => {
    seedReadyStatus(statusEnvelope({ alwaysUVConfigured: false }));

    const staleOverviewFailure = failureForCode(Code.CodeTransportFailure);

    authenticatorGetInfo.set(errorLoadState(staleOverviewFailure));
    overviewBioSensor.set(errorLoadState(staleOverviewFailure));

    const setAlwaysUV = vi
      .spyOn(api, "setAlwaysUV")
      .mockResolvedValueOnce(
        authenticatorConfigEnvelope(
          AuthenticatorConfigOperation.AuthenticatorConfigAlwaysUV,
          "preview",
        ),
      )
      .mockResolvedValueOnce(
        authenticatorConfigEnvelope(
          AuthenticatorConfigOperation.AuthenticatorConfigAlwaysUV,
          "result",
        ),
      );

    vi.spyOn(api, "configStatus").mockResolvedValue(statusEnvelope({ alwaysUVConfigured: true }));

    expect(await beginAlwaysUVChange(AlwaysUVTarget.AlwaysUVTargetEnable)).toBe(true);
    expect(get(securityMutation)).toMatchObject({
      kind: "alwaysUv",
      operation: { phase: "review" },
    });
    expect(setAlwaysUV.mock.calls[0][0]).toEqual({
      target: AlwaysUVTarget.AlwaysUVTargetEnable,
      dryRun: true,
    });

    expect(await confirmSecurityMutation()).toBe(true);
    expect(setAlwaysUV.mock.calls[1][0]).toEqual({
      target: AlwaysUVTarget.AlwaysUVTargetEnable,
      dryRun: false,
    });
    expect(get(securityMutation)).toEqual({ kind: "idle", operation: { phase: "idle" } });

    const refreshedStatus = get(securityStatus).lastSuccessfulEnvelope!;

    expect(refreshedStatus.result!.authenticatorConfig.alwaysUv.configured).toBe(true);
    expect(get(authenticatorGetInfo).state).toBe("idle");
    expect(get(overviewBioSensor).state).toBe("idle");
  });

  it("normalizes, previews, and then executes the exact PIN policy request", async () => {
    seedReadyStatus(statusEnvelope({ minPINLength: 4, maxPINLength: 63, maxRPIDs: 3 }));

    const setMinPINLength = vi
      .spyOn(api, "setMinPINLength")
      .mockResolvedValueOnce(
        authenticatorConfigEnvelope(
          AuthenticatorConfigOperation.AuthenticatorConfigMinPINLength,
          "preview",
        ),
      )
      .mockResolvedValueOnce(
        authenticatorConfigEnvelope(
          AuthenticatorConfigOperation.AuthenticatorConfigMinPINLength,
          "result",
        ),
      );

    vi.spyOn(api, "configStatus").mockResolvedValue(statusEnvelope({ minPINLength: 6 }));

    const draft = {
      minPINLength: " 6 ",
      rpIDs: " example.test\nexample.test\n second.test ",
      forceChangePin: true,
      pinComplexityPolicy: true,
    };

    expect(await beginPINPolicyChange(draft)).toBe(true);
    expect(setMinPINLength.mock.calls[0][0]).toEqual({
      newMinPINLength: 6,
      minPinLengthRPIDs: ["example.test", "second.test"],
      forceChangePin: true,
      pinComplexityPolicy: true,
      dryRun: true,
    });

    expect(await confirmSecurityMutation()).toBe(true);
    expect(setMinPINLength.mock.calls[1][0]).toEqual({
      newMinPINLength: 6,
      minPinLengthRPIDs: ["example.test", "second.test"],
      forceChangePin: true,
      pinComplexityPolicy: true,
      dryRun: false,
    });
  });

  it("omits the optional minimum when changing only RP and boolean PIN policy fields", async () => {
    seedReadyStatus(statusEnvelope({ minPINLength: 4, maxPINLength: 63 }));

    const setMinPINLength = vi
      .spyOn(api, "setMinPINLength")
      .mockResolvedValue(
        authenticatorConfigEnvelope(
          AuthenticatorConfigOperation.AuthenticatorConfigMinPINLength,
          "preview",
        ),
      );

    expect(
      await beginPINPolicyChange({
        minPINLength: "",
        rpIDs: "example.test",
        forceChangePin: true,
        pinComplexityPolicy: false,
      }),
    ).toBe(true);
    expect(setMinPINLength).toHaveBeenCalledWith({
      minPinLengthRPIDs: ["example.test"],
      forceChangePin: true,
      pinComplexityPolicy: false,
      dryRun: true,
    });
  });

  it("treats both an omitted and unchanged minimum-only request as no change", async () => {
    seedReadyStatus(statusEnvelope({ minPINLength: 4, maxPINLength: 63 }));

    const setMinPINLength = vi.spyOn(api, "setMinPINLength");
    const baseDraft = {
      rpIDs: "",
      forceChangePin: false,
      pinComplexityPolicy: false,
    };

    expect(await beginPINPolicyChange({ ...baseDraft, minPINLength: "" })).toBe(false);
    expect(get(securityMutation)).toMatchObject({
      operation: { phase: "editing", validationError: "no-change" },
    });
    expect(await beginPINPolicyChange({ ...baseDraft, minPINLength: "4" })).toBe(false);
    expect(get(securityMutation)).toMatchObject({
      operation: { phase: "editing", validationError: "no-change" },
    });
    expect(setMinPINLength).not.toHaveBeenCalled();
  });

  it("previews and executes enabling long touch for reset", async () => {
    seedReadyStatus(statusEnvelope({ longTouchConfigured: false }));

    const enableLongTouch = vi
      .spyOn(api, "enableLongTouchForReset")
      .mockResolvedValueOnce(
        authenticatorConfigEnvelope(
          AuthenticatorConfigOperation.AuthenticatorConfigLongTouch,
          "preview",
        ),
      )
      .mockResolvedValueOnce(
        authenticatorConfigEnvelope(
          AuthenticatorConfigOperation.AuthenticatorConfigLongTouch,
          "result",
        ),
      );

    vi.spyOn(api, "configStatus").mockResolvedValue(statusEnvelope({ longTouchConfigured: true }));

    expect(await beginLongTouchForReset()).toBe(true);
    expect(enableLongTouch.mock.calls[0][0]).toEqual({
      dryRun: true,
    });

    expect(await confirmSecurityMutation()).toBe(true);
    expect(enableLongTouch.mock.calls[1][0]).toEqual({
      dryRun: false,
    });
  });

  it("previews and executes enabling enterprise attestation", async () => {
    seedReadyStatus(statusEnvelope({ enterpriseConfigured: false }));

    const enableEnterpriseAttestation = vi
      .spyOn(api, "enableEnterpriseAttestation")
      .mockResolvedValueOnce(
        authenticatorConfigEnvelope(
          AuthenticatorConfigOperation.AuthenticatorConfigEnterprise,
          "preview",
        ),
      )
      .mockResolvedValueOnce(
        authenticatorConfigEnvelope(
          AuthenticatorConfigOperation.AuthenticatorConfigEnterprise,
          "result",
        ),
      );

    vi.spyOn(api, "configStatus").mockResolvedValue(statusEnvelope({ enterpriseConfigured: true }));

    expect(await beginEnterpriseAttestation()).toBe(true);
    expect(enableEnterpriseAttestation.mock.calls[0][0]).toEqual({
      dryRun: true,
    });

    expect(await confirmSecurityMutation()).toBe(true);
    expect(enableEnterpriseAttestation.mock.calls[1][0]).toEqual({
      dryRun: false,
    });
  });

  it("rejects a minimum above the effective maximum", async () => {
    seedReadyStatus(statusEnvelope({ maxPINLength: 63 }));

    const setMinPINLength = vi.spyOn(api, "setMinPINLength");

    expect(
      await beginPINPolicyChange({
        minPINLength: "64",
        rpIDs: "",
        forceChangePin: false,
        pinComplexityPolicy: false,
      }),
    ).toBe(false);
    expect(get(securityMutation)).toMatchObject({
      kind: "pinPolicy",
      operation: {
        phase: "editing",
        validationError: "min-pin-length-too-large",
      },
    });
    expect(setMinPINLength).not.toHaveBeenCalled();
  });

  it("restarts a failed preview through the original preview action", async () => {
    seedReadyStatus(statusEnvelope({ alwaysUVConfigured: false }));

    const previewFailure = authenticatorConfigEnvelope(
      AuthenticatorConfigOperation.AuthenticatorConfigAlwaysUV,
      "preview",
      true,
    );
    const secondPreview = authenticatorConfigEnvelope(
      AuthenticatorConfigOperation.AuthenticatorConfigAlwaysUV,
      "preview",
    );
    const setAlwaysUV = vi
      .spyOn(api, "setAlwaysUV")
      .mockResolvedValueOnce(previewFailure)
      .mockResolvedValueOnce(secondPreview);

    expect(await beginAlwaysUVChange(AlwaysUVTarget.AlwaysUVTargetEnable)).toBe(false);
    expect(get(securityMutation)).toMatchObject({
      kind: "alwaysUv",
      operation: {
        phase: "error",
        failedPhase: "previewing",
        responseEnvelope: previewFailure,
      },
    });

    expect(await restartSecurityPreview()).toBe(true);
    expect(setAlwaysUV).toHaveBeenCalledTimes(2);
    expect(setAlwaysUV.mock.calls[1][0]).toEqual(setAlwaysUV.mock.calls[0][0]);
    expect(get(securityMutation)).toMatchObject({
      kind: "alwaysUv",
      operation: { phase: "review" },
    });
  });

  it("reconfirms after any execution failure without rebuilding the preview", async () => {
    seedReadyStatus(statusEnvelope({ alwaysUVConfigured: false }));

    const executionFailure = authenticatorConfigEnvelope(
      AuthenticatorConfigOperation.AuthenticatorConfigAlwaysUV,
      "preview",
    );

    executionFailure.error = failureForCode(Code.CodeTransportFailure);

    const setAlwaysUV = vi
      .spyOn(api, "setAlwaysUV")
      .mockResolvedValueOnce(
        authenticatorConfigEnvelope(
          AuthenticatorConfigOperation.AuthenticatorConfigAlwaysUV,
          "preview",
        ),
      )
      .mockResolvedValueOnce(executionFailure)
      .mockResolvedValueOnce(
        authenticatorConfigEnvelope(
          AuthenticatorConfigOperation.AuthenticatorConfigAlwaysUV,
          "result",
        ),
      );

    vi.spyOn(api, "configStatus").mockResolvedValue(statusEnvelope({ alwaysUVConfigured: true }));

    expect(await beginAlwaysUVChange(AlwaysUVTarget.AlwaysUVTargetEnable)).toBe(true);
    expect(await confirmSecurityMutation()).toBe(false);

    expect(await confirmSecurityMutation()).toBe(true);
    expect(setAlwaysUV).toHaveBeenCalledTimes(3);
    expect(setAlwaysUV.mock.calls[1][0]).toMatchObject({ dryRun: false });
    expect(setAlwaysUV.mock.calls[2][0]).toMatchObject({ dryRun: false });
  });

  it("retains an atomic biometric enrollment failure without a result", async () => {
    seedReadyStatus(statusEnvelope({ bioSupported: true, bioConfigured: true }));

    const failure = bioEnrollErrorEnvelope();

    vi.spyOn(api, "bioEnroll")
      .mockResolvedValueOnce(bioEnrollPreviewEnvelope())
      .mockResolvedValueOnce(failure);

    expect(await beginBioEnrollment()).toBe(true);
    expect(await confirmSecurityMutation()).toBe(false);

    const mutation = get(securityMutation);

    expect(mutation).toMatchObject({
      kind: "bioEnroll",
      operation: {
        phase: "error",
        failedPhase: "executing",
        responseEnvelope: failure,
        runtimeError: null,
      },
    });
    if (mutation.kind !== "bioEnroll" || mutation.operation.phase !== "error") return;

    expect(mutation.operation.responseEnvelope).toBe(failure);
    expect(mutation.operation.responseEnvelope?.error?.code).toBe(Code.CodeBioInteractionTimeout);
    expect(mutation.operation.responseEnvelope?.result).toBeUndefined();
  });

  it("validates biometric friendly names by UTF-8 bytes and permits an empty name", async () => {
    seedReadyStatus(statusEnvelope({ bioSupported: true, bioConfigured: true }));

    const sensorEnvelope = bioSensorEnvelope();

    sensorEnvelope.result!.maxTemplateFriendlyName = 4;
    completeSecurityResourceLoad(securitySensor, sensorEnvelope);

    const bioRename = vi.spyOn(api, "bioRename").mockResolvedValue(bioRenamePreviewEnvelope(""));

    expect(await beginBioRename("cafe", "ééé")).toBe(false);
    expect(get(securityMutation)).toEqual({ kind: "idle", operation: { phase: "idle" } });
    expect(bioRename).not.toHaveBeenCalled();

    expect(await beginBioRename("cafe", "")).toBe(true);
    expect(bioRename).toHaveBeenCalledWith({
      templateIDHex: "cafe",
      friendlyName: "",
      dryRun: true,
    });
  });
});

describe("factory reset lifecycle", () => {
  it("applies the backend-selected session after reset", async () => {
    const replacements = [device("token-a"), device("token-b")];

    seedActiveScreenForTest("security");
    vi.spyOn(api, "resetFactory")
      .mockResolvedValueOnce(resetEnvelope("preview"))
      .mockResolvedValueOnce(resetEnvelope("result"));

    const reconnectSelection = vi.spyOn(api, "reconnectSelection").mockImplementation(async () => {
      await handleDiscoveryChanged({
        snapshot: {
          ...testTopology(replacements),
          selectedDeviceId: replacements[0].attachment.id,
          selectedAttachmentId: replacements[0].attachment.id,
          selection: snapshot(replacements[0]),
        },
      });
    });

    vi.spyOn(api, "configStatus").mockResolvedValue(
      statusEnvelope({
        item: replacements[0],
        selectionId: "authenticator-token-a",
      }),
    );

    expect(await beginFactoryReset()).toBe(true);
    expect(await confirmSecurityMutation()).toBe(true);

    expect(reconnectSelection).toHaveBeenCalledOnce();
    expect(get(devices)).toEqual(testTopology(replacements).devices);
    expect(get(selectedSelector)).toBe(replacements[0].attachment.id);
    expect(get(authenticatorStatus)).toMatchObject({
      state: "ready",
      selectionId: "authenticator-token-a",
    });
  });

  it("applies a fresh authenticator when reconnect reports a cleanup warning", async () => {
    const replacement = device("token-after-close-warning");

    seedActiveScreenForTest("security");
    vi.spyOn(api, "resetFactory")
      .mockResolvedValueOnce(resetEnvelope("preview"))
      .mockResolvedValueOnce(resetEnvelope("result"));

    const reconnectSelection = vi.spyOn(api, "reconnectSelection").mockImplementation(async () => {
      await handleDiscoveryChanged({
        snapshot: {
          ...testTopology([replacement]),
          selectedDeviceId: replacement.attachment.id,
          selectedAttachmentId: replacement.attachment.id,
          selection: snapshot(replacement, "fresh-authenticator"),
        },
      });

      throw failureForCode(Code.CodeInternalError);
    });
    vi.spyOn(api, "configStatus").mockResolvedValue(
      statusEnvelope({
        item: replacement,
        selectionId: "fresh-authenticator",
      }),
    );

    expect(await beginFactoryReset()).toBe(true);
    expect(await confirmSecurityMutation()).toBe(true);

    expect(reconnectSelection).toHaveBeenCalledOnce();
    expect(get(authenticatorStatus)).toMatchObject({
      state: "ready",
      selectionId: "fresh-authenticator",
    });
    expect(get(statusBar).lastOutcome).toMatchObject({
      tone: "warning",
      message: "The operation failed because of an internal error.",
    });
  });
});
