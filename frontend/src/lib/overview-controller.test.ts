import { get } from "svelte/store";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Info } from "../../bindings/github.com/telesma-app/kit/model/inspect";
import {
  MDSSource,
  SourceState,
  YubicoSource,
  Token2Source,
} from "../../bindings/github.com/telesma-app/kit/model/report";
import { GetInfoEnvelope } from "../../bindings/telesma/service";
import { Kind } from "../../bindings/github.com/telesma-app/kit/model/operation";
import { api } from "$lib/api";
import { loadOverview, loadOverviewMetadata, maybeLoadOverview } from "$lib/overview-controller";
import { authenticatorGetInfo, selectedDevice } from "$lib/features/authenticator/state";
import { statusBar } from "$lib/features/workbench/state";
import {
  resetAppStateForTest,
  seedSelectionForTest,
  seedActiveScreenForTest,
} from "$lib/test-support/store-utils";
import { testHIDDevice } from "../test/device";

describe("Overview source controller", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    resetAppStateForTest();
    seedSelectionForTest("token-1", testHIDDevice(), {
      state: "ready",
      selectionId: "selection-1",
    });
  });
  it("loads only GetInfo for Lab", async () => {
    seedActiveScreenForTest("lab");
    vi.spyOn(api, "getInfo").mockResolvedValue(
      new GetInfoEnvelope({
        operationId: "get-info",
        selectionId: "selection-1",
        kind: Kind.GetInfo,
        result: new Info(),
      }),
    );
    const sources = vi.spyOn(api, "readSources");
    const metadata = vi.spyOn(api, "refreshMetadata");
    const lookup = vi.spyOn(api, "lookupMDS");
    await maybeLoadOverview();
    expect(api.getInfo).toHaveBeenCalledOnce();
    expect(sources).not.toHaveBeenCalled();
    expect(metadata).not.toHaveBeenCalled();
    expect(lookup).not.toHaveBeenCalled();
    expect(get(authenticatorGetInfo).state).toBe("ready");
  });
  it("completes local reads without waiting for the initial cache-first MDS lookup", async () => {
    let finish!: () => void;
    vi.spyOn(api, "readSources").mockResolvedValue(undefined);
    vi.spyOn(api, "refreshMetadata").mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    statusBar.update((state) => ({
      ...state,
      lastOutcome: { tone: "success", title: "Prior operation", message: "Keep" },
    }));
    await loadOverview();
    expect(api.refreshMetadata).toHaveBeenCalledWith({ attachmentId: "token-1", refresh: false });
    expect(get(statusBar).lastOutcome?.title).toBe("Prior operation");
    finish();
    await Promise.resolve();
  });
  it("leaves metadata loading for B intact when a pending lookup for A completes", async () => {
    let finish!: () => void;
    vi.spyOn(api, "refreshMetadata").mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const lookupA = loadOverviewMetadata("token-1", true);
    const deviceB = testHIDDevice("token-2", "B");
    deviceB.sources.mds = new MDSSource({ state: SourceState.SourceLoading });
    seedSelectionForTest("token-2", deviceB, { state: "ready", selectionId: "selection-2" });
    finish();
    await lookupA;
    expect(get(selectedDevice)).toBe(deviceB);
    expect(get(selectedDevice)!.sources.mds.state).toBe(SourceState.SourceLoading);
    expect(get(selectedDevice)!.sources.mds.data).toBeUndefined();
  });
  it("keeps a pending local read and its following MDS request bound to A after selecting B", async () => {
    let finish!: () => void;
    vi.spyOn(api, "readSources").mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    vi.spyOn(api, "refreshMetadata").mockResolvedValue(undefined);
    const readA = loadOverview();
    const deviceB = testHIDDevice("token-2", "B");
    deviceB.sources.yubico = new YubicoSource({ state: SourceState.SourceLoading });
    deviceB.sources.token2 = new Token2Source({ state: SourceState.SourceLoading });
    seedSelectionForTest("token-2", deviceB, { state: "ready", selectionId: "selection-2" });
    finish();
    await readA;
    expect(get(selectedDevice)).toBe(deviceB);
    expect(get(selectedDevice)!.sources.yubico.state).toBe(SourceState.SourceLoading);
    expect(api.refreshMetadata).toHaveBeenCalledWith({ attachmentId: "token-1", refresh: false });
  });
  it("reports a bridge failure for A without replacing B's source state", async () => {
    let fail!: (cause: Error) => void;
    vi.spyOn(api, "refreshMetadata").mockReturnValue(
      new Promise((_, reject) => {
        fail = reject;
      }),
    );
    const lookupA = loadOverviewMetadata("token-1", true);
    const deviceB = testHIDDevice("token-2", "B");
    deviceB.sources.mds = new MDSSource({ state: SourceState.SourceLoading });
    seedSelectionForTest("token-2", deviceB, { state: "ready", selectionId: "selection-2" });
    fail(new Error("bridge offline"));
    await lookupA;
    expect(get(selectedDevice)!.sources.mds.state).toBe(SourceState.SourceLoading);
    expect(get(statusBar).lastOutcome?.message).toContain("token-1:");
  });
});
