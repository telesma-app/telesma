<script lang="ts">
  import OverviewCapabilityMatrix from "$lib/components/overview/OverviewCapabilityMatrix.svelte";
  import OverviewHeroCard from "$lib/components/overview/OverviewHeroCard.svelte";
  import OverviewMDSObservations from "$lib/components/overview/OverviewMDSObservations.svelte";
  import OverviewStandardCapabilities from "$lib/components/overview/OverviewStandardCapabilities.svelte";
  import OverviewStandardHeroCard from "$lib/components/overview/OverviewStandardHeroCard.svelte";
  import OverviewVendorPassport from "$lib/components/overview/OverviewVendorPassport.svelte";
  import JsonDisclosure from "$lib/components/shared/JsonDisclosure.svelte";
  import * as Alert from "$lib/components/ui/alert";
  import { Button } from "$lib/components/ui/button";
  import {
    selectedDevice,
    selectedSelector,
    selectedEndpointId,
    selectedDeviceEndpoints,
  } from "$lib/features/authenticator";
  import { overviewBioSensor, loadOverview, loadOverviewMetadata } from "$lib/features/overview";
  import { buildOverviewPresentation } from "$lib/overview-presentation";
  import { advancedMode } from "$lib/preferences";
  import { m } from "../paraglide/messages.js";

  let overview = $derived(
    buildOverviewPresentation({
      selectedSelector: $selectedSelector,
      selectedDevice: $selectedDevice,
      endpoints: $selectedDeviceEndpoints,
      overviewBioSensorState: $overviewBioSensor,
    }),
  );

  async function refreshMDS() {
    await loadOverviewMetadata($selectedEndpointId, true);
  }
</script>

{#if overview.selector}
  {#key $selectedEndpointId}
    <section class="overview-screen flow">
      {#if $advancedMode || !overview.standard}
        <OverviewHeroCard
          hero={overview.hero}
          signalGroups={overview.signalGroups}
          mdsLoading={overview.mdsLoading}
          onRefreshMDS={refreshMDS}
        />

        {#if overview.vendorPassport}
          <OverviewVendorPassport presentation={overview.vendorPassport} />
        {/if}

        {#if overview.infoFailure}
          <Alert.Root>
            <Alert.Title>FIDO GetInfo</Alert.Title>
            <Alert.Description>
              <p>{overview.infoFailure}</p>
              <Button variant="outline" disabled={overview.loading} onclick={loadOverview}>
                {overview.loading ? m.source_loading() : m.reload_overview()}
              </Button>
            </Alert.Description>
          </Alert.Root>
        {/if}

        {#if overview.info}
          <OverviewCapabilityMatrix
            groups={overview.overviewGroups}
            warningCount={overview.warningCount}
          />
        {/if}

        {#if overview.bioFailure}
          <Alert.Root>
            <Alert.Title>{m.biometrics()}</Alert.Title>
            <Alert.Description>{overview.bioFailure}</Alert.Description>
          </Alert.Root>
        {/if}

        <OverviewMDSObservations observations={overview.mdsObservations} />

        {#if $advancedMode}<JsonDisclosure value={overview.report} />{/if}
      {:else}
        <OverviewStandardHeroCard hero={overview.hero} presentation={overview.standard} />

        <OverviewStandardCapabilities presentation={overview.standard} />

        <OverviewMDSObservations observations={overview.mdsObservations} />
      {/if}
    </section>
  {/key}
{/if}

<style>
  @layer blocks {
    .overview-screen {
      min-width: 0;
      --flow-space: var(--space-4);
    }
  }
</style>
