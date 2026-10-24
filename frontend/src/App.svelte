<script lang="ts">
  import { Events } from "@wailsio/runtime";
  import { onMount } from "svelte";

  import InteractionModal from "$lib/components/interaction/InteractionModal.svelte";
  import OperationRecoveryDialog from "$lib/components/operation/OperationRecoveryDialog.svelte";
  import EmptyState from "$lib/components/shared/EmptyState.svelte";
  import AppSidebar from "$lib/components/shell/AppSidebar.svelte";
  import NoAuthenticatorState from "$lib/components/shell/NoAuthenticatorState.svelte";
  import ShellStatusBar from "$lib/components/shell/ShellStatusBar.svelte";
  import { ScrollArea } from "$lib/components/ui/scroll-area";
  import { Toaster } from "$lib/components/ui/sonner";
  import { WindowControls, WindowTitlebar } from "$lib/components/window-controls";
  import { handleDiscoveryChanged } from "$lib/discovery-controller.js";
  import { handleOperationProgress } from "$lib/event-controller.js";
  import {
    authenticatorStatus,
    devices,
    endpoints,
    selectedDevice,
    selectedDeviceEndpoints,
    selectedSelector,
    shutdownWorkbench,
  } from "$lib/features/authenticator";
  import {
    answerPendingInteraction,
    handleInteractionRequested,
    pendingInteraction,
  } from "$lib/features/interaction";
  import {
    activeScreen,
    bootstrap,
    navigateToScreen,
    selectToken,
    statusBar,
  } from "$lib/features/workbench";
  import { syncLogJournal } from "$lib/logs-controller.js";
  import { cancelActiveOperation } from "$lib/operation-controller.js";
  import { currentLocale } from "$lib/i18n";
  import { failureMessage } from "$lib/failure.js";
  import { deviceName } from "$lib/format.js";
  import {
    cancelOperationRecovery,
    operationRecovery,
    retryOperationRecovery,
  } from "$lib/operation-recovery.js";
  import {
    buildInteractionModalPresentation,
    buildShellStatusPresentation,
    buildSidebarPresentation,
  } from "$lib/shell-presentation";
  import { toggleMaximizeWindow } from "$lib/window-controller.js";
  import {
    detectWindowPlatform,
    resolveWindowPlatform,
    windowPlatform,
  } from "$lib/window-platform";
  import { m } from "./paraglide/messages.js";
  import Lab from "./screens/Lab.svelte";
  import LargeBlobs from "./screens/LargeBlobs.svelte";
  import Logs from "./screens/Logs.svelte";
  import Overview from "./screens/Overview.svelte";
  import Passkeys from "./screens/Passkeys.svelte";
  import Security from "./screens/Security.svelte";
  import Settings from "./screens/Settings.svelte";

  let refreshing = $state(false);

  let initialized = $state(false);

  let windowActive = $state(true);

  let isMacOS = $derived($windowPlatform === "macos");

  let noDevices = $derived(initialized && !refreshing && $devices.length === 0);

  let opening = $derived($authenticatorStatus.state === "opening");

  let sessionUnavailable = $derived(
    initialized &&
      $devices.length > 0 &&
      !$selectedSelector &&
      $authenticatorStatus.state === "error",
  );

  let sessionErrorMessage = $derived(
    $authenticatorStatus.error ? failureMessage($authenticatorStatus.error) : "",
  );

  let sidebarPresentation = $derived(
    buildSidebarPresentation({
      activeScreen: $activeScreen,
      devices: $devices,
      endpoints: $endpoints,
      selectedSelector: $selectedSelector,
      busy: refreshing || $authenticatorStatus.state === "opening",
    }),
  );

  let shellStatusPresentation = $derived(
    buildShellStatusPresentation({
      authenticatorStatus: $authenticatorStatus,
      selectedDevice: $selectedDevice,
      endpoints: $selectedDeviceEndpoints,
      statusBar: $statusBar,
    }),
  );

  let interactionModalPresentation = $derived(
    $pendingInteraction ? buildInteractionModalPresentation($pendingInteraction) : null,
  );

  async function syncWindowPlatform() {
    const detected = detectWindowPlatform();

    if (detected !== null) {
      $windowPlatform = detected;

      return;
    }

    $windowPlatform = null;
    try {
      const resolved = await resolveWindowPlatform();

      if (resolved !== null) {
        $windowPlatform = resolved;
      }
    } catch {
      // WindowRuntimeReady retries detection without rendering the wrong platform chrome.
    }
  }

  function handleTitlebarDoubleClick(event: MouseEvent) {
    if (!(event.target instanceof Element)) return;

    if (!event.target.closest('[data-window-titlebar-region="true"]')) return;

    if (
      event.target.closest(
        'button, a, input, select, textarea, [role="button"], [contenteditable="true"]',
      )
    )
      return;

    event.preventDefault();
    void toggleMaximizeWindow();
  }

  onMount(() => {
    let disposed = false;
    const handleWindowFocus = () => (windowActive = true);
    const handleWindowBlur = () => (windowActive = false);

    windowActive = document.hasFocus();
    window.addEventListener("focus", handleWindowFocus);
    window.addEventListener("blur", handleWindowBlur);
    window.addEventListener("dblclick", handleTitlebarDoubleClick);

    const offRuntimeReady = Events.On(Events.Types.Common.WindowRuntimeReady, () => {
      void syncWindowPlatform();
    });
    const offProgress = Events.On("ctapkit:operation-event", (event) => {
      handleOperationProgress(event.data);
    });

    const offInteraction = Events.On("ctapkit:interaction-requested", (event) => {
      handleInteractionRequested(event.data);
    });

    const offDiscovery = Events.On("ctapkit:discovery-changed", (event) => {
      void handleDiscoveryChanged(event.data);
    });

    const offLogsChanged = Events.On("ctapkit:logs-changed", () => {
      void syncLogJournal();
    });

    refreshing = true;
    void syncWindowPlatform();
    void syncLogJournal();

    bootstrap().finally(() => {
      if (disposed) return;

      refreshing = false;
      initialized = true;
    });

    return () => {
      disposed = true;
      window.removeEventListener("focus", handleWindowFocus);
      window.removeEventListener("blur", handleWindowBlur);
      window.removeEventListener("dblclick", handleTitlebarDoubleClick);
      offRuntimeReady();
      offProgress();
      offInteraction();
      offDiscovery();
      offLogsChanged();
      cancelOperationRecovery();
      void shutdownWorkbench();
    };
  });
</script>

{#if $windowPlatform}
  {#key $currentLocale}
    <div
      class="app-shell"
      data-platform={$windowPlatform}
      data-window-active={windowActive ? "true" : "false"}
    >
      <AppSidebar
        presentation={sidebarPresentation}
        nativeWindowTitlebar={isMacOS}
        onNavigate={(screen) => void navigateToScreen(screen)}
        onSelectToken={(selector) => void selectToken(selector)}
      />

      <section class="app-workspace">
        <header class="app-header">
          <WindowTitlebar>
            <div
              class="titlebar-content"
              data-native-window-controls={isMacOS ? "true" : undefined}
            >
              <h1 class="titlebar-screen-title">{sidebarPresentation.activeScreenLabel}</h1>

              <div class="titlebar-drag-space" aria-hidden="true"></div>

              {#if !isMacOS}
                <WindowControls />
              {/if}
            </div>
          </WindowTitlebar>
        </header>

        <main class="main-view">
          {#if $activeScreen === "logs"}
            <div class="main-view-content" data-fill="true">
              <Logs />
            </div>
          {:else}
            <ScrollArea class="main-view-scroll">
              <div class="main-view-content">
                {#if $activeScreen === "settings"}
                  <Settings />
                {:else if noDevices}
                  <NoAuthenticatorState screenLabel={sidebarPresentation.activeScreenLabel} />
                {:else if $activeScreen === "overview"}
                  <Overview />
                {:else if opening}
                  <EmptyState
                    title={m.authenticator_opening()}
                    message={$selectedDevice
                      ? deviceName($selectedDevice, $selectedDeviceEndpoints)
                      : ""}
                    variant="workspace"
                  />
                {:else if sessionUnavailable}
                  <EmptyState
                    title={m.token_selection_issue()}
                    message={sessionErrorMessage}
                    variant="workspace"
                  />
                {:else if $activeScreen === "large-blobs"}
                  <LargeBlobs />
                {:else if $activeScreen === "passkeys"}
                  <Passkeys />
                {:else if $activeScreen === "lab"}
                  <Lab />
                {:else if $activeScreen === "security"}
                  <Security />
                {:else}
                  <Overview />
                {/if}
              </div>
            </ScrollArea>
          {/if}
        </main>

        <ShellStatusBar
          presentation={shellStatusPresentation}
          onCancel={() => void cancelActiveOperation()}
        />
      </section>

      <InteractionModal
        presentation={interactionModalPresentation}
        onAnswer={async (answer) => {
          await answerPendingInteraction(answer);
        }}
      />

      <OperationRecoveryDialog
        presentation={$operationRecovery}
        onCancel={cancelOperationRecovery}
        onRetry={retryOperationRecovery}
      />
    </div>
  {/key}
{:else}
  <div class="app-platform-pending" aria-hidden="true"></div>
{/if}

<Toaster
  position="bottom-right"
  richColors
  expand
  closeButton
  duration={8_000}
  offset={{ bottom: "3.5rem", right: "2rem" }}
  mobileOffset={{ bottom: "3.25rem", right: "1rem" }}
/>

<style>
  @layer blocks {
    .app-platform-pending {
      height: 100dvh;
      background: var(--background);
    }

    .app-shell {
      --sidebar-inline-size: 14rem;
      --sidebar-background: var(--sidebar);
      --sidebar-backdrop-filter: none;
      --topbar-background: var(--card);
      --topbar-border: var(--window-border);
      --statusbar-background: var(--card);
      display: grid;
      grid-template-columns: var(--sidebar-inline-size) minmax(0, 1fr);
      min-width: 0;
      height: 100dvh;
      overflow: hidden;
      border-radius: 0;
      background: var(--window-surface);
      color: var(--foreground);
    }
    .app-workspace {
      container: workspace-shell / inline-size;
      display: grid;
      grid-template-rows: var(--shell-titlebar-block-size) minmax(0, 1fr) auto;
      min-width: 0;
      min-height: 0;
    }
    .app-header {
      z-index: 10;
      min-width: 0;
      border-bottom: 1px solid var(--topbar-border);
      background: var(--topbar-background);
    }
    .titlebar-content {
      display: grid;
      grid-template-columns: minmax(0, 38rem) minmax(2rem, 1fr) auto;
      align-items: stretch;
      height: var(--shell-titlebar-block-size);
      min-width: 0;
      padding: 0 0 0 var(--space-4);
    }
    .titlebar-drag-space {
      min-width: 0;
      height: 100%;
      --wails-non-client-region: caption;
      --wails-draggable: drag;
    }
    .titlebar-screen-title {
      display: flex;
      align-items: center;
      min-width: 0;
      overflow: hidden;
      font-size: 0.88rem;
      font-weight: 600;
      margin: 0;
      text-overflow: ellipsis;
      white-space: nowrap;
      --wails-non-client-region: caption;
      --wails-draggable: drag;
    }
    .main-view {
      container: workspace / inline-size;
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      min-width: 0;
      min-height: 0;
      overflow: hidden;
      background: var(--workspace-surface);
    }
    :global(.main-view-scroll) {
      height: 100%;
      min-width: 0;
      min-height: 0;
    }
    .main-view-content {
      width: 100%;
      max-width: 72rem;
      min-width: 0;
      min-height: 100%;
      margin-inline: auto;
      padding: var(--space-4);
    }
    @container workspace-shell (max-width: 48rem) {
      .titlebar-content {
        grid-template-columns: minmax(0, 1fr) auto;
        padding-left: var(--space-3);
      }

      .titlebar-drag-space {
        display: none;
      }
    }
  }

  @layer exceptions {
    .app-shell[data-platform="windows"],
    .app-shell[data-platform="linux"] {
      --sidebar-background: color-mix(in srgb, var(--sidebar) 40%, transparent);
      --sidebar-backdrop-filter: blur(24px) saturate(1.2);
    }

    .app-shell[data-platform="linux"] {
      border: 1px solid var(--window-border);
      background-clip: padding-box;
    }

    .app-shell[data-platform="macos"] {
      --sidebar-background: transparent;
      background: var(--window-tint);
    }

    .app-shell[data-platform="macos"][data-window-active="false"] {
      --sidebar-background: color-mix(in srgb, var(--sidebar) 88%, transparent);
    }

    .titlebar-content[data-native-window-controls="true"] {
      grid-template-columns: minmax(0, 38rem) minmax(2rem, 1fr);
      padding-right: var(--space-4);
    }

    .main-view-content[data-fill="true"] {
      max-width: none;
      height: 100%;
      margin-inline: 0;
      overflow: hidden;
    }

    @container workspace-shell (max-width: 48rem) {
      .titlebar-content[data-native-window-controls="true"] {
        grid-template-columns: minmax(0, 1fr);
        padding-right: var(--space-3);
      }
    }
  }
</style>
