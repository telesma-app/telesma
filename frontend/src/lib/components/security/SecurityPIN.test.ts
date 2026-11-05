import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  PINStatus,
  RetryState,
  StateValue,
} from "../../../../bindings/github.com/telesma-app/kit/model/config";

import { setAppLocale } from "$lib/i18n";

import SecurityPIN from "$lib/components/security/SecurityPIN.svelte";

function unsetPIN(minPINLength = 4) {
  return new PINStatus({
    state: StateValue.StateNotConfigured,
    supported: true,
    configured: false,
    protocolSupported: true,
    minPINLength,
    maxPINLength: 63,
    retries: new RetryState({ state: StateValue.StateUnknown }),
  });
}

describe("SecurityPIN", () => {
  beforeEach(() => {
    setAppLocale("en");
  });

  afterEach(() => {
    cleanup();
  });

  it("keeps a blank dialog open after failure and closes after a successful retry", async () => {
    const user = userEvent.setup();
    let finishOperation!: (result: boolean) => void;
    const submittedPINs: string[] = [];
    const onSetPIN = vi.fn(({ newPIN }: { newPIN: string }) => {
      submittedPINs.push(newPIN);
      if (submittedPINs.length > 1) return true;

      return new Promise<boolean>((resolve) => {
        finishOperation = resolve;
      });
    });

    render(SecurityPIN, {
      props: {
        pin: unsetPIN(),
        disabled: false,
        onSetPIN,
        onChangePIN: vi.fn(async () => true),
      },
    });

    await fireEvent.click(screen.getByRole("button", { name: "Set PIN" }));
    await user.type(screen.getByLabelText("New PIN"), "123456");
    await user.type(screen.getByLabelText("Confirm new PIN"), "123456");
    await fireEvent.click(screen.getAllByRole("button", { name: "Set PIN" })[1]);

    expect(onSetPIN).toHaveBeenCalledOnce();
    expect(submittedPINs).toEqual(["123456"]);
    expect(screen.getByLabelText("New PIN")).toHaveValue("");
    expect(screen.getByLabelText("Confirm new PIN")).toHaveValue("");

    await act(async () => {
      finishOperation(false);
      await Promise.resolve();
    });
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByLabelText("New PIN")).toHaveValue("");
    expect(screen.getByLabelText("Confirm new PIN")).toHaveValue("");

    await user.type(screen.getByLabelText("New PIN"), "654321");
    await user.type(screen.getByLabelText("Confirm new PIN"), "654321");
    await fireEvent.click(screen.getAllByRole("button", { name: "Set PIN" })[1]);

    expect(submittedPINs).toEqual(["123456", "654321"]);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(document.body.style.overflow).not.toBe("hidden"));
  });

  it("clears PIN fields when the dialog closes", async () => {
    const user = userEvent.setup();

    render(SecurityPIN, {
      props: {
        pin: unsetPIN(),
        disabled: false,
        onSetPIN: vi.fn(async () => true),
        onChangePIN: vi.fn(async () => true),
      },
    });

    await fireEvent.click(screen.getByRole("button", { name: "Set PIN" }));
    await user.type(screen.getByLabelText("New PIN"), "123456");
    await user.type(screen.getByLabelText("Confirm new PIN"), "123456");
    await fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    await fireEvent.click(screen.getByRole("button", { name: "Set PIN" }));

    expect(screen.getByLabelText("New PIN")).toHaveValue("");
    expect(screen.getByLabelText("Confirm new PIN")).toHaveValue("");
  });

  it("applies the reported minimum length to both new PIN fields", async () => {
    render(SecurityPIN, {
      props: {
        pin: unsetPIN(6),
        disabled: false,
        onSetPIN: vi.fn(async () => true),
        onChangePIN: vi.fn(async () => true),
      },
    });

    await fireEvent.click(screen.getByRole("button", { name: "Set PIN" }));

    expect(screen.getByLabelText("New PIN")).toHaveAttribute("minlength", "6");
    expect(screen.getByLabelText("Confirm new PIN")).toHaveAttribute("minlength", "6");
  });

  it("clears secrets on Escape and restores focus to the trigger", async () => {
    const user = userEvent.setup();

    render(SecurityPIN, {
      props: {
        pin: unsetPIN(),
        disabled: false,
        onSetPIN: vi.fn(async () => false),
        onChangePIN: vi.fn(async () => false),
      },
    });

    const trigger = screen.getByRole("button", { name: "Set PIN" });

    await fireEvent.click(trigger);
    await user.type(screen.getByLabelText("New PIN"), "escape-secret");
    await user.type(screen.getByLabelText("Confirm new PIN"), "escape-secret");
    await user.keyboard("{Escape}");

    await waitFor(() => expect(screen.queryByLabelText("New PIN")).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();

    await fireEvent.click(trigger);
    expect(screen.getByLabelText("New PIN")).toHaveValue("");
    expect(screen.getByLabelText("Confirm new PIN")).toHaveValue("");
  });
});
