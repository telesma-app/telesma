import { DescriptorState } from "../../bindings/github.com/telesma-app/kit/model/report";
import { USBReport } from "../../bindings/github.com/telesma-app/kit/model/report";
import { get } from "svelte/store";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { InteractionKind, OperationStage } from "../../bindings/github.com/telesma-app/kit/model";
import { Kind as OperationKind } from "../../bindings/github.com/telesma-app/kit/model/operation";
import { Code } from "../../bindings/github.com/telesma-app/kit/model/failure";
import { EndpointReport } from "../../bindings/github.com/telesma-app/kit/model/report";
import type {
  CredentialsEnvelope,
  InteractionPrompt,
  OperationEventEnvelope,
} from "../../bindings/telesma/service";
import { InteractionAnswer } from "../../bindings/telesma/service";
import { Mode } from "../../bindings/github.com/telesma-app/kit/transport";

import { pendingInteraction } from "$lib/features/interaction/state.js";
import { failureForCode } from "$lib/test-support/failure.js";
import { statusBar as mutableStatusBar } from "$lib/features/workbench/state.js";
import { setAppLocale } from "$lib/i18n.js";
import {
  resetAppStateForTest,
  seedPendingInteractionForTest,
  seedSelectionForTest,
} from "$lib/test-support/store-utils.js";
import {
  authenticatorStatus,
  pendingInteraction as readonlyPendingInteraction,
  statusBar,
} from "$lib/test-support/stores.js";
import {
  setStatusOperation,
  summarizeEnvelope,
  summarizeOperationFailure,
} from "$lib/workbench-state.js";

const serviceMocks = vi.hoisted(() => ({
  CancelOperation: vi.fn(),
  ResolveInteraction: vi.fn(),
}));

vi.mock("../../bindings/telesma/service/service", () => serviceMocks);

const token = new EndpointReport({
  attachment: {
    id: "token-1",
    transport: Mode.ModeHID,
    usb: new USBReport({
      product: { state: DescriptorState.DescriptorRead, value: "Test key" },
      vendorId: { state: DescriptorState.DescriptorRead, value: 1 },
      productId: { state: DescriptorState.DescriptorRead, value: 2 },
    }),
  },
});

function seedAuthenticator() {
  seedSelectionForTest("token-1", token, {
    state: "ready",
    selectionId: "authenticator-1",
  });
}

function seedOperation() {
  setStatusOperation({
    operationId: "operation-1",
    selectionId: "authenticator-1",
    label: "Inventory",
  });
  seedPendingInteractionForTest({
    operationId: "operation-1",
    selectionId: "authenticator-1",
    interactionId: "interaction-1",
    request: { kind: InteractionKind.InteractionKindTouch },
  } as InteractionPrompt);
}

describe("operation controller", () => {
  beforeEach(() => {
    setAppLocale("en");
    vi.clearAllMocks();
    resetAppStateForTest();
  });

  it("keeps an accepted cancellation active until the terminal envelope", async () => {
    seedAuthenticator();
    seedOperation();
    serviceMocks.CancelOperation.mockResolvedValue(true);

    const { cancelActiveOperation } = await import("$lib/operation-controller.js");

    await expect(cancelActiveOperation()).resolves.toBe("accepted");

    expect(serviceMocks.CancelOperation).toHaveBeenCalledWith({ operationId: "operation-1" });
    expect(get(statusBar).activeOperation).toMatchObject({
      operationId: "operation-1",
      cancelPending: false,
      cancelRequested: true,
    });
    expect(get(authenticatorStatus).state).toBe("ready");
    expect(get(readonlyPendingInteraction)).toBeNull();
  });

  it("retains progress received while cancellation is pending", async () => {
    let accept!: () => void;

    seedAuthenticator();
    seedOperation();
    serviceMocks.CancelOperation.mockImplementation(
      () =>
        new Promise<boolean>((resolve) => {
          accept = () => resolve(true);
        }),
    );

    const { cancelActiveOperation } = await import("$lib/operation-controller.js");
    const cancellation = cancelActiveOperation();

    setStatusOperation({
      operationId: "operation-1",
      selectionId: "authenticator-1",
      label: "Inventory",
      stage: OperationStage.OperationStageEnumeratingCredentials,
    });
    accept();

    await expect(cancellation).resolves.toBe("accepted");
    expect(get(statusBar).activeOperation).toMatchObject({
      stage: "enumerating-credentials",
      cancelPending: false,
      cancelRequested: true,
    });
  });

  it("finishes stale UI activity and reports when the operation already ended", async () => {
    seedAuthenticator();
    seedOperation();
    serviceMocks.CancelOperation.mockResolvedValue(false);

    const { cancelActiveOperation } = await import("$lib/operation-controller.js");

    await expect(cancelActiveOperation()).resolves.toBe("already-finished");

    expect(get(statusBar).activeOperation).toBeNull();
    expect(get(authenticatorStatus).state).toBe("ready");
    expect(get(statusBar).lastOutcome).toMatchObject({
      tone: "info",
      title: "Operation already finished",
    });
  });

  it("preserves the operation and interaction after a thrown cancel failure", async () => {
    seedAuthenticator();
    seedOperation();
    serviceMocks.CancelOperation.mockRejectedValue(new Error("bridge offline"));

    const { cancelActiveOperation } = await import("$lib/operation-controller.js");

    await expect(cancelActiveOperation()).resolves.toBe("failed");

    expect(get(statusBar).activeOperation).toMatchObject({
      operationId: "operation-1",
      cancelPending: false,
      cancelError: failureForCode(Code.CodeInternalError),
    });
    expect(get(readonlyPendingInteraction)?.interactionId).toBe("interaction-1");
    expect(get(statusBar).lastOutcome).toMatchObject({
      tone: "error",
      title: "Could not cancel operation",
    });
  });

  it("presents canceled operation errors as informational", () => {
    seedAuthenticator();
    seedOperation();

    summarizeOperationFailure("Credential inventory", failureForCode(Code.CodeOperationCanceled));

    expect(get(statusBar).activeOperation).toBeNull();
    expect(get(statusBar).lastOutcome).toMatchObject({
      tone: "info",
      title: "Credential inventory canceled",
    });
  });

  it("presents a canceled generated envelope as informational", () => {
    seedAuthenticator();
    seedOperation();

    summarizeEnvelope("Credential inventory", {
      operationId: "operation-1",
      selectionId: "authenticator-1",
      kind: OperationKind.ListCredentials,
      authenticatorClosed: false,
      error: failureForCode(Code.CodeOperationCanceled),
    } as CredentialsEnvelope);

    expect(get(statusBar).lastOutcome).toMatchObject({
      tone: "info",
      title: "Credential inventory canceled",
    });
  });

  it("presents an uncategorized runtime failure in the status bar", () => {
    seedAuthenticator();
    seedOperation();

    summarizeOperationFailure("Credential inventory", failureForCode(Code.CodeInternalError));

    expect(get(statusBar).lastOutcome).toMatchObject({
      tone: "error",
      title: "Credential inventory failed",
      message: "The operation failed because of an internal error.",
    });
  });

  it("reports a timed-out operation in the status bar", () => {
    seedAuthenticator();
    seedOperation();

    summarizeOperationFailure("Credential inventory", failureForCode(Code.CodeOperationTimeout));

    expect(get(statusBar).lastOutcome).toMatchObject({
      tone: "error",
      message: "The operation timed out.",
    });
  });
});

describe("runtime operation events", () => {
  beforeEach(() => {
    setAppLocale("en");
    resetAppStateForTest();
    seedAuthenticator();
  });

  it("captures operation ids and determinate progress from progress events", async () => {
    const { handleOperationProgress } = await import("$lib/event-controller.js");

    handleOperationProgress({
      operationId: "operation-1",
      selectionId: "authenticator-1",
      event: {
        stage: "capturing-bio-sample",
        completed: 1,
        total: 3,
        sampleStatus: "good",
      },
    } as OperationEventEnvelope);

    expect(get(statusBar).activeOperation).toMatchObject({
      operationId: "operation-1",
      completed: 1,
      total: 3,
      sampleStatus: "good",
    });
    expect(get(authenticatorStatus)).toMatchObject({ state: "ready" });
  });

  it("captures an operation id from an interaction before any progress event", async () => {
    const { handleInteractionRequested } = await import("$lib/interaction-controller.js");

    handleInteractionRequested({
      operationId: "operation-2",
      selectionId: "authenticator-1",
      interactionId: "interaction-2",
      request: { kind: InteractionKind.InteractionKindTouch, message: "Touch the key" },
    } as InteractionPrompt);

    expect(get(mutableStatusBar).activeOperation).toMatchObject({
      operationId: "operation-2",
      stage: "interaction-required",
    });
    expect(get(pendingInteraction)?.interactionId).toBe("interaction-2");
  });
});

describe("interaction bridge", () => {
  beforeEach(() => {
    setAppLocale("en");
    vi.clearAllMocks();
    resetAppStateForTest();
    seedAuthenticator();
    seedOperation();
  });

  it("forwards a PIN once and clears it before the bridge settles", async () => {
    let settle!: (accepted: boolean) => void;
    let forwardedPIN = "";

    serviceMocks.ResolveInteraction.mockImplementation(
      (answer: InteractionAnswer) =>
        new Promise<boolean>((resolve) => {
          forwardedPIN = answer.pin ?? "";
          settle = resolve;
        }),
    );

    const { answerPendingInteraction } = await import("$lib/interaction-controller.js");
    const answer = new InteractionAnswer({
      interactionId: "interaction-1",
      pin: "123456",
    });
    const resolution = answerPendingInteraction(answer);

    expect(forwardedPIN).toBe("123456");
    expect(answer.pin).toBe("");

    settle(true);
    await expect(resolution).resolves.toBe(true);
    expect(get(readonlyPendingInteraction)).toBeNull();
  });
});
