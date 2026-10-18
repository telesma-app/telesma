import { cleanup, render, screen, waitFor, within } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  LogEntry,
  LogJournalBatch,
  LogJournalRecord,
  LogOutcome,
  LogPayload,
} from "../../../../bindings/github.com/telesma-app/kit/model";
import {
  Category,
  Code,
  CTAPDetail,
  Failure,
} from "../../../../bindings/github.com/telesma-app/kit/model/failure";
import { LogCursor } from "../../../../bindings/telesma/service";
import { api } from "$lib/api";
import { logController } from "$lib/features/logs/state.svelte.js";
import { setAppLocale } from "$lib/i18n.js";

import LogWorkbench from "$lib/components/logs/LogWorkbench.svelte";

function appendEntry(sequence: number, values: Partial<LogEntry> = {}) {
  const timestamp = new Date(Date.UTC(2026, 6, 15, 10, 0, sequence)).toISOString();

  logController.append(
    new LogJournalRecord({
      sequence,
      entry: new LogEntry({
        timestamp,
        outcome: LogOutcome.LogOutcomeSucceeded,
        command: "authenticatorGetInfo",
        commandCode: 0x04,
        ...values,
      }),
    }),
  );
}

function layoutRect(element: HTMLElement) {
  const height = element.hasAttribute("data-index") ? 64 : 800;

  return {
    x: 0,
    y: 0,
    top: 0,
    right: 1_200,
    bottom: height,
    left: 0,
    width: 1_200,
    height,
    toJSON: () => ({}),
  } as DOMRect;
}

describe("LogWorkbench", () => {
  beforeEach(() => {
    setAppLocale("en");
    logController.clear();
    logController.setQuery("");
    logController.setFilters({ outcome: "all" });
    vi.spyOn(api, "clearLogs").mockResolvedValue(new LogCursor({ sequence: 1 }));
    vi.spyOn(api, "readLogs").mockResolvedValue(new LogJournalBatch({ cursor: 1 }));
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
      this: HTMLElement,
    ) {
      return layoutRect(this);
    });
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(function (
      this: HTMLElement,
    ) {
      return this.hasAttribute("data-index") ? 64 : 800;
    });
    vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(1_200);
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(800);
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(1_200);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    logController.clear();
  });

  it("shows the empty state before any CTAP or runtime activity", () => {
    render(LogWorkbench);
    expect(screen.getByText("No log entries yet")).toBeInTheDocument();
  });

  it("shows CTAP diagnostics, redaction, search, and clear confirmation", async () => {
    const user = userEvent.setup();

    appendEntry(1, {
      command: "authenticatorClientPIN",
      commandCode: 0x06,
      subCommand: "getPinUvAuthTokenUsingPinWithPermissions",
      subCommandCode: 0x09,
      request: new LogPayload({
        cborDiagnostic: `{1: 1, 6: "[REDACTED]"}`,
        originalBytes: 70_000,
        storedBytes: 25,
        truncated: true,
      }),
      response: new LogPayload({
        cborDiagnostic: `{2: 8, 5: "[REDACTED]"}`,
        originalBytes: 35,
        storedBytes: 26,
        truncated: false,
      }),
      redactedFields: ["request.PinHashEnc", "response.PinUvAuthToken"],
    });
    render(LogWorkbench);

    expect(
      screen.getAllByText(
        "CTAP command: authenticatorClientPIN · getPinUvAuthTokenUsingPinWithPermissions",
      ).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getByText(
        "Sensitive fields were redacted: request.PinHashEnc, response.PinUvAuthToken",
      ),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Request" }));
    expect(
      screen.getByText(
        "CBOR diagnostic notation was truncated to 25 bytes. The original CBOR message was 70000 bytes.",
      ),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(
        screen.getByRole("region", { name: "Diagnostic CBOR" }).querySelector("pre")?.textContent,
      ).toBe(`{1: 1, 6: "[REDACTED]"}`),
    );
    expect(screen.getByRole("button", { name: "Copy payload" })).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Response" }));
    await waitFor(() =>
      expect(
        screen.getByRole("tabpanel", { name: "Response" }).querySelector("pre")?.textContent,
      ).toBe(`{2: 8, 5: "[REDACTED]"}`),
    );

    await user.type(screen.getByRole("searchbox"), "no-match");
    expect(screen.getByText("No matching log entries")).toBeInTheDocument();
    await user.clear(screen.getByRole("searchbox"));

    await user.click(screen.getByRole("button", { name: "Clear logs" }));
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Clear log" }));
    expect(screen.getByText("No log entries yet")).toBeInTheDocument();
  });

  it("shows retained transport diagnostics", async () => {
    const user = userEvent.setup();

    appendEntry(1, {
      outcome: LogOutcome.LogOutcomeFailed,
      errorMessage: "transport read: io: read/write on closed pipe",
    });
    render(LogWorkbench);

    await user.click(screen.getByRole("tab", { name: "Response" }));
    expect(screen.getByText("transport read: io: read/write on closed pipe")).toBeInTheDocument();
  });

  it("shows diagnostic failures with the typed CTAP failure", async () => {
    const user = userEvent.setup();

    appendEntry(1, {
      outcome: LogOutcome.LogOutcomeFailed,
      request: new LogPayload({
        diagnosticError: "diagnostic schema unavailable",
        originalBytes: 4,
        storedBytes: 0,
        truncated: false,
      }),
      error: new Failure({
        code: Code.CodeCTAPCBORInvalid,
        category: Category.CategoryTransportFailure,
        ctap: new CTAPDetail({
          command: "authenticatorGetInfo",
          commandCode: 0x04,
          status: "CTAP2_ERR_INVALID_CBOR",
          statusCode: 0x12,
        }),
      }),
    });
    render(LogWorkbench);

    await user.click(screen.getByRole("tab", { name: "Request" }));
    expect(screen.getByText("CBOR diagnostic unavailable")).toBeInTheDocument();
    expect(screen.getByText("diagnostic schema unavailable")).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Response" }));
    expect(
      screen.getByText("CTAP_CBOR_INVALID · CTAP2_ERR_INVALID_CBOR (0x12)"),
    ).toBeInTheDocument();
  });

  it("opens a detail sheet and navigates the filtered journal on narrow layouts", async () => {
    const user = userEvent.setup();

    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(800);
    appendEntry(1, { command: "authenticatorGetInfo" });
    appendEntry(2, { command: "authenticatorClientPIN" });
    render(LogWorkbench);

    await user.click(screen.getByRole("button", { name: "CTAP command: authenticatorClientPIN" }));

    const dialog = screen.getByRole("dialog", { name: "CTAP command: authenticatorClientPIN" });

    expect(within(dialog).getByText("Log entry 2 of 2")).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "Previous log entry" }));
    expect(within(dialog).getByText("Log entry 1 of 2")).toBeInTheDocument();

    await user.keyboard("{Alt>}{ArrowDown}{/Alt}");
    expect(within(dialog).getByText("Log entry 2 of 2")).toBeInTheDocument();
  });

  it("navigates the desktop detail panel with Alt+ArrowUp and Alt+ArrowDown", async () => {
    const user = userEvent.setup();

    appendEntry(1, { command: "authenticatorGetInfo" });
    appendEntry(2, { command: "authenticatorClientPIN" });
    render(LogWorkbench);

    expect(screen.getByText("Log entry 2 of 2")).toBeInTheDocument();
    await user.keyboard("{Alt>}{ArrowUp}{/Alt}");
    expect(screen.getByText("Log entry 1 of 2")).toBeInTheDocument();
    await user.keyboard("{Alt>}{ArrowDown}{/Alt}");
    expect(screen.getByText("Log entry 2 of 2")).toBeInTheDocument();
  });

  it("filters directly by CTAP outcome", async () => {
    appendEntry(1, { command: "authenticatorGetInfo" });
    appendEntry(2, {
      command: "authenticatorClientPIN",
      outcome: LogOutcome.LogOutcomeFailed,
    });
    render(LogWorkbench);

    logController.setFilters({ outcome: LogOutcome.LogOutcomeFailed });
    await waitFor(() => {
      expect(
        screen.queryByRole("button", { name: "CTAP command: authenticatorGetInfo" }),
      ).not.toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "CTAP command: authenticatorClientPIN" }),
      ).toBeInTheDocument();
    });
  });

  it("reports when the runtime retention boundary was crossed", () => {
    logController.applyBatch(
      new LogJournalBatch({
        entries: [
          new LogJournalRecord({
            sequence: 1,
            entry: new LogEntry({
              timestamp: "2026-07-15T10:00:00.000Z",
              outcome: LogOutcome.LogOutcomeSucceeded,
              command: "authenticatorGetInfo",
            }),
          }),
        ],
        cursor: 1,
        truncated: true,
      }),
    );

    render(LogWorkbench);
    expect(screen.getByText("Earlier log entries are no longer available")).toBeInTheDocument();
  });

  it("renders only the visible window for a large journal", async () => {
    for (let sequence = 1; sequence <= 200; sequence += 1) appendEntry(sequence);

    const { container } = render(LogWorkbench);

    await waitFor(() => {
      const renderedRows = container.querySelectorAll(".log-virtual-row");

      expect(renderedRows.length).toBeGreaterThan(0);
      expect(renderedRows.length).toBeLessThan(200);
    });
  });

  it("always scrolls the virtual journal to the newest record", async () => {
    appendEntry(1);

    const { container } = render(LogWorkbench);
    const viewport = container.querySelector<HTMLElement>("[data-slot='scroll-area-viewport']")!;
    const scrollTo = vi.fn();

    viewport.scrollTo = scrollTo;

    appendEntry(2);
    await waitFor(() => {
      expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ behavior: "auto" }));
    });
  });
});
