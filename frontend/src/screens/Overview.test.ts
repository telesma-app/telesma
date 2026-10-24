import { cleanup, render, screen, within, waitFor } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  Info,
  Fact,
  FactID,
  FactState,
  FactValue,
  FactValueKind,
} from "../../bindings/github.com/telesma-app/kit/model/inspect";
import { Code } from "../../bindings/github.com/telesma-app/kit/model/failure";
import {
  GetInfoSource,
  YubicoSource,
  Token2Source,
  MDSSource,
  SourceState,
  SourceReason,
  DeviceReport,
} from "../../bindings/github.com/telesma-app/kit/model/report";
import { DeviceInfo } from "../../bindings/github.com/telesma-app/yubico";
import {
  LookupResult,
  MetadataStatement,
  PayloadEntry,
} from "../../bindings/github.com/telesma-app/mds/model";
import { setAppLocale } from "$lib/i18n";
import { setAdvancedMode } from "$lib/preferences";
import { failureForCode } from "$lib/test-support/failure";
import { testOverviewAssessment } from "$lib/test-support/overview-facts";
import { resetAppStateForTest, seedSelectionForTest } from "$lib/test-support/store-utils";
import { authenticatorSession } from "$lib/features/authenticator/state";
import { applySessionSnapshot } from "$lib/workbench-state";
import { testHIDDevice, testSmartCardDevice, testTopology } from "../test/device";
import Overview from "./Overview.svelte";

const controllerMocks = vi.hoisted(() => ({
  loadOverview: vi.fn(),
  loadOverviewMetadata: vi.fn(),
}));
vi.mock("$lib/features/overview", async (importOriginal) => ({
  ...(await importOriginal<typeof import("$lib/features/overview")>()),
  ...controllerMocks,
}));

function deviceWithInfo() {
  const device = testHIDDevice("token-1", "Observed USB product");
  device.sources.getInfo = new GetInfoSource({
    state: SourceState.SourceAvailable,
    data: new Info({
      aaguid: "00000000-0000-0000-0000-000000000001",
      assessment: testOverviewAssessment([
        new Fact({
          id: FactID.FactIDVersionFIDO21,
          state: FactState.FactStateSupported,
          value: new FactValue({ kind: FactValueKind.FactValueBoolean, boolean: true }),
        }),
      ]),
    }),
  });
  return device;
}

describe("Overview independent sources", () => {
  beforeEach(() => {
    setAppLocale("en");
    setAdvancedMode(true);
    resetAppStateForTest();
    vi.clearAllMocks();
  });
  afterEach(cleanup);
  it.each([false, true])(
    "shows descriptors and vendor values after failed CTAP (advanced=%s)",
    async (advanced) => {
      setAdvancedMode(advanced);
      const device = testHIDDevice("token-1", "Observed USB product");
      device.sources.getInfo = new GetInfoSource({
        state: SourceState.SourceFailed,
        error: failureForCode(Code.CodeTransportFailure),
      });
      device.sources.yubico = new YubicoSource({
        state: SourceState.SourcePartial,
        modelName: "YubiKey 5C Nano",
        data: new DeviceInfo({ serialNumber: 1234 }),
      });
      seedSelectionForTest("token-1", device, {
        state: "error",
        error: failureForCode(Code.CodeTransportFailure),
      });
      render(Overview);
      expect(screen.getByRole("heading", { name: "YubiKey 5C Nano" })).toBeVisible();
      expect(within(screen.getByLabelText("YubiKey 5C Nano")).getByText("S/N 1234")).toBeVisible();
      await userEvent.setup().click(screen.getByRole("button", { name: "Show technical details" }));
      expect(
        within(screen.getByLabelText("Vendor details")).getByText(
          /Communication with the authenticator failed/,
        ),
      ).toBeInTheDocument();
      expect(screen.queryByText("Capability matrix")).not.toBeInTheDocument();
    },
  );
  it("preserves CTAP capabilities when vendor reads fail", async () => {
    const device = deviceWithInfo();
    device.sources.yubico = new YubicoSource({
      state: SourceState.SourceFailed,
      error: failureForCode(Code.CodeTransportFailure),
      data: new DeviceInfo({ serialNumber: 1234 }),
    });
    seedSelectionForTest("token-1", device, { state: "ready", selectionId: "session-1" });
    render(Overview);
    expect(screen.getByText("Capability matrix")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Capability matrix" })).not.toBeInTheDocument();
    expect(screen.getByText("CTAP options")).toBeVisible();
    expect(
      within(screen.getByLabelText("Observed USB product")).getByText("S/N 1234"),
    ).toBeVisible();
    await userEvent.setup().click(screen.getByRole("button", { name: "Show technical details" }));
    expect(
      within(screen.getByLabelText("Vendor details")).getByText(
        /Communication with the authenticator failed/,
      ),
    ).toBeInTheDocument();
  });
  it("keeps previous MDS content visible while refresh is pending or fails", async () => {
    const device = deviceWithInfo();
    device.sources.mds = new MDSSource({
      state: SourceState.SourceAvailable,
      data: new LookupResult({
        found: true,
        entry: new PayloadEntry({
          metadataStatement: new MetadataStatement({ description: "Retained metadata" }),
        }),
      }),
    });
    seedSelectionForTest("token-1", device, { state: "ready", selectionId: "session-1" });
    device.sources.mds.state = SourceState.SourceLoading;
    render(Overview);
    expect(
      within(screen.getByLabelText("Metadata service")).getByText(/Retained metadata/),
    ).toBeInTheDocument();
    device.sources.mds.state = SourceState.SourceFailed;
    device.sources.mds.error = failureForCode(Code.CodeMDSFetchFailed);
    seedSelectionForTest("token-1", device, { state: "ready", selectionId: "session-1" });
    await waitFor(() =>
      expect(
        within(screen.getByLabelText("Metadata service")).getByText(/Retained metadata/),
      ).toBeInTheDocument(),
    );
    expect(screen.getByText(/does not authenticate/)).toBeInTheDocument();
  });
  it("requests refresh without claiming that cached metadata was updated", async () => {
    const device = deviceWithInfo();
    device.sources.mds = new MDSSource({
      state: SourceState.SourceAvailable,
      data: new LookupResult({
        cached: true,
        checkedAt: "2030-01-02T12:00:00Z",
      }),
    });
    seedSelectionForTest("token-1", device, { state: "ready", selectionId: "session-1" });
    render(Overview);
    expect(screen.queryByText("MDS data refreshed")).not.toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: "Refresh MDS" }));
    await waitFor(() =>
      expect(controllerMocks.loadOverviewMetadata).toHaveBeenCalledWith("token-1", true),
    );
  });

  it("omits inapplicable management cards in standard mode", () => {
    setAdvancedMode(false);
    const device = deviceWithInfo();
    device.sources.yubico = new YubicoSource({
      state: SourceState.SourceUnavailable,
      reason: SourceReason.ReasonAdapterMissing,
    });
    device.sources.token2 = new Token2Source({
      state: SourceState.SourceUnavailable,
      reason: SourceReason.ReasonAdapterMissing,
    });
    seedSelectionForTest("token-1", device, { state: "ready", selectionId: "session-1" });
    render(Overview);
    expect(screen.queryByRole("heading", { name: "Vendor details" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Yubico management" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Token2 management" })).not.toBeInTheDocument();
    expect(screen.getByText("Key capabilities")).toBeInTheDocument();
  });
  it("keeps USB-only devices compact without empty source or capability cards", () => {
    setAdvancedMode(false);
    seedSelectionForTest("token-1", testHIDDevice("token-1", "USB security key"), {
      state: "ready",
      selectionId: "session-1",
    });
    render(Overview);
    expect(screen.getByRole("heading", { name: "USB security key" })).toBeVisible();
    expect(within(screen.getByLabelText("USB security key")).getByText("USB · HID")).toBeVisible();
    expect(screen.getByLabelText("Connection and descriptors")).toBeVisible();
    expect(screen.queryByLabelText("Metadata service")).not.toBeInTheDocument();
    expect(screen.queryByText("Key capabilities")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Unknown" })).not.toBeInTheDocument();
  });

  it("keeps the standard summary and capabilities without raw JSON or source paths", () => {
    setAdvancedMode(false);
    seedSelectionForTest("token-1", deviceWithInfo(), { state: "ready", selectionId: "session-1" });
    render(Overview);
    expect(screen.getByText("Key capabilities")).toBeInTheDocument();
    expect(screen.queryByText("Capability matrix")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Raw JSON" })).not.toBeInTheDocument();
    expect(screen.queryByText("attachment.usb.product")).not.toBeInTheDocument();
  });

  it.each([false, true])(
    "preserves the open disclosure while identity is resolved (sibling=%s)",
    async (withSibling) => {
      const original = deviceWithInfo();
      const originalEndpoints = withSibling
        ? [original, testSmartCardDevice("card-1")]
        : [original];
      authenticatorSession.set({
        devices: originalEndpoints.map(
          (endpoint) =>
            new DeviceReport({
              id: `endpoint:${endpoint.attachment.id}`,
              endpointIds: [endpoint.attachment.id],
            }),
        ),
        endpoints: originalEndpoints,
        selectedDeviceId: "endpoint:token-1",
        selectedAttachmentId: "token-1",
        authenticator: { state: "ready", selectionId: "session-1" },
      });
      render(Overview);
      const hero = screen.getByLabelText("Observed USB product");
      const passport = screen.getByLabelText("Connection and descriptors");
      await userEvent.setup().click(screen.getByRole("button", { name: "Show technical details" }));

      const updated = deviceWithInfo();
      updated.sources.yubico = new YubicoSource({
        state: SourceState.SourceAvailable,
        modelName: "YubiKey 5C Nano",
        data: new DeviceInfo({ serialNumber: 1234 }),
      });
      const updatedEndpoints = withSibling ? [updated, testSmartCardDevice("card-1")] : [updated];
      applySessionSnapshot({
        devices: [
          new DeviceReport({
            id: "yubico:1234",
            endpointIds: updatedEndpoints.map((endpoint) => endpoint.attachment.id),
          }),
        ],
        endpoints: updatedEndpoints,
        selectedDeviceId: "yubico:1234",
        selectedAttachmentId: "token-1",
        selection: { id: "session-1", deviceId: "yubico:1234", attachmentId: "token-1" },
      });

      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Hide technical details" })).toBeVisible();
        expect(screen.getByLabelText("YubiKey 5C Nano")).toBe(hero);
        expect(screen.getByLabelText("Vendor details")).toBe(passport);
      });
    },
  );

  it("resets the disclosure when the selected endpoint changes", async () => {
    const original = deviceWithInfo();
    const replacement = testHIDDevice("token-2", "Replacement token");
    replacement.sources.getInfo = original.sources.getInfo;
    const endpoints = [original, replacement];
    authenticatorSession.set({
      ...testTopology(endpoints),
      selectedDeviceId: original.attachment.id,
      selectedAttachmentId: original.attachment.id,
      authenticator: { state: "ready", selectionId: "session-1" },
    });
    render(Overview);
    const hero = screen.getByLabelText("Observed USB product");
    await userEvent.setup().click(screen.getByRole("button", { name: "Show technical details" }));

    applySessionSnapshot({
      ...testTopology(endpoints),
      selectedDeviceId: replacement.attachment.id,
      selectedAttachmentId: replacement.attachment.id,
      selection: {
        id: "session-2",
        deviceId: replacement.attachment.id,
        attachmentId: replacement.attachment.id,
      },
    });

    await waitFor(() => {
      expect(screen.getByLabelText("Replacement token")).toBeVisible();
      expect(screen.getByRole("button", { name: "Show technical details" })).toHaveAttribute(
        "aria-expanded",
        "false",
      );
      expect(hero).not.toBeInTheDocument();
    });
  });
});
