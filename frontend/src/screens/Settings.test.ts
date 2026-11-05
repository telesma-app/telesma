import { cleanup, render, screen, waitFor } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ApplicationConfig,
  ApplicationConfigSnapshot,
  ApplicationInfo,
} from "../../bindings/telesma/appconfig";
import { initializeApplicationConfig } from "$lib/i18n";

const applicationServiceMocks = vi.hoisted(() => ({
  GetApplicationInfo: vi.fn(),
  LoadApplicationConfig: vi.fn(),
  SaveApplicationConfig: vi.fn(),
}));

vi.mock("../../bindings/telesma/appconfig/service", () => applicationServiceMocks);

import Settings from "./Settings.svelte";

describe("Settings", () => {
  beforeEach(async () => {
    applicationServiceMocks.GetApplicationInfo.mockResolvedValue(
      new ApplicationInfo({ version: "1.2.3" }),
    );
    applicationServiceMocks.LoadApplicationConfig.mockResolvedValue(
      new ApplicationConfigSnapshot({
        config: new ApplicationConfig({
          locale: "en",
          advancedMode: false,
          passkeyDirectoryEnabled: false,
        }),
        exists: true,
      }),
    );
    applicationServiceMocks.SaveApplicationConfig.mockResolvedValue(undefined);
    await initializeApplicationConfig();
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    document.body.style.pointerEvents = "";
  });

  it("changes the app locale from the settings screen", async () => {
    const user = userEvent.setup();

    render(Settings);

    await user.click(screen.getByRole("combobox", { name: "Language" }));
    await user.click(screen.getByText("Russian"));

    await waitFor(() =>
      expect(applicationServiceMocks.SaveApplicationConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          locale: "ru",
          advancedMode: false,
          passkeyDirectoryEnabled: false,
        }),
      ),
    );
    expect(document.documentElement.lang).toBe("ru");
  });

  it("persists Advanced Mode changes", async () => {
    const user = userEvent.setup();

    render(Settings);

    const advancedMode = screen.getByRole("switch", { name: "Advanced Mode" });

    expect(advancedMode).not.toBeChecked();

    await user.click(advancedMode);

    expect(advancedMode).toBeChecked();
    await waitFor(() =>
      expect(applicationServiceMocks.SaveApplicationConfig).toHaveBeenCalledWith(
        expect.objectContaining({ locale: "en", advancedMode: true }),
      ),
    );
  });

  it("explains and persists the opt-in Passkey Directory setting", async () => {
    const user = userEvent.setup();

    render(Settings);

    const directory = screen.getByRole("switch", { name: "Passkey Directory" });

    expect(directory).not.toBeChecked();
    expect(screen.getByText(/RP IDs, usernames, credential IDs/)).toBeInTheDocument();
    expect(screen.getByText(/IP address and standard HTTP request metadata/)).toBeInTheDocument();

    await user.click(directory);

    expect(directory).toBeChecked();
    await waitFor(() =>
      expect(applicationServiceMocks.SaveApplicationConfig).toHaveBeenCalledWith(
        expect.objectContaining({ passkeyDirectoryEnabled: true }),
      ),
    );
  });

  it("shows the embedded application version", async () => {
    render(Settings);

    expect(await screen.findByText("1.2.3")).toBeInTheDocument();
  });
});
