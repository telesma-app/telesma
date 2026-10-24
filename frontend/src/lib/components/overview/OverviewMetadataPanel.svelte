<script module lang="ts">
  import { Copy, ExternalLink, RefreshCw } from "@lucide/svelte";
</script>

<script lang="ts">
  import { copyToClipboard } from "$lib/clipboard";
  import { Button } from "$lib/components/ui/button";
  import * as Card from "$lib/components/ui/card";
  import { openExternalLink } from "$lib/external-links";
  import type { OverviewHeroFact, OverviewHeroPresentation } from "$lib/overview-rules";

  import { m } from "../../../paraglide/messages.js";

  let {
    hero,
    loading = false,
    onRefresh = () => {},
  }: {
    hero: OverviewHeroPresentation;
    loading?: boolean;
    onRefresh?: () => void | Promise<void>;
  } = $props();

  function factTone(fact: OverviewHeroFact) {
    if (fact.placeholder || fact.tone === "muted") return "muted";

    if (fact.tone === "success") return "success";

    if (fact.tone === "warning") return "warning";

    if (fact.tone === "error") return "error";

    return "";
  }
</script>

{#snippet factRow(fact: OverviewHeroFact)}
  <div class="fact-row">
    <dt>{fact.label}</dt>
    <dd data-tone={factTone(fact)}>
      {#if fact.href && !fact.placeholder}
        <a
          href={fact.href}
          target="_blank"
          rel="noreferrer"
          title={fact.href}
          onclick={(event) => openExternalLink(event, fact.href!)}
        >
          <span>{fact.value}</span>
          <ExternalLink size={11} />
        </a>
      {:else}
        {fact.value}
      {/if}
    </dd>
  </div>
{/snippet}

{#snippet factSection(title: string, facts: OverviewHeroFact[])}
  <section class="fact-section">
    <h3>{title}</h3>

    <dl>
      {#each facts as fact (fact.label)}
        {@render factRow(fact)}
      {/each}
    </dl>
  </section>
{/snippet}

<Card.Root class="mds-card" aria-label={m.metadata_service()}>
  <Card.Header>
    <Card.Title>{m.metadata_service()}</Card.Title>
    <Card.Description>{hero.mdsDescription}</Card.Description>
    <Card.Action>
      <Button
        variant="outline"
        type="button"
        onclick={onRefresh}
        disabled={loading || !hero.aaguidAvailable}
      >
        <RefreshCw data-icon="inline-start" class={loading ? "u-spin" : undefined} />
        {loading ? m.mds_refreshing() : m.mds_refresh()}
      </Button>
    </Card.Action>
  </Card.Header>

  <Card.Content class="mds-content">
    {#if hero.mdsName}<p>{m.source_mds_description()}: {hero.mdsName}</p>{/if}
    {#if hero.mdsRefreshMessage}<p role="status">{hero.mdsRefreshMessage}</p>{/if}
    {#if hero.aaguidAvailable}
      <section class="aaguid-section">
        <div class="aaguid-header cluster">
          <span>{m.mds_aaguid()}</span>
          <Button
            variant="ghost"
            size="icon-xs"
            type="button"
            onclick={() => void copyToClipboard(hero.aaguid, m.aaguid_copied())}
            aria-label={m.copy_label({ label: "AAGUID" })}
          >
            <Copy />
          </Button>
        </div>
        <code title={hero.aaguid}>{hero.aaguid}</code>
      </section>
    {/if}

    {@const statusFacts = hero.mdsStatusFacts.filter(
      (fact) => !fact.placeholder && fact.value !== m.not_reported(),
    )}
    {#if statusFacts.length}{@render factSection(m.mds_latest_status_report(), statusFacts)}{/if}
    {@const blobFacts = hero.mdsBlobFacts.filter(
      (fact) => !fact.placeholder && fact.value !== m.not_reported(),
    )}
    {#if blobFacts.length}{@render factSection(m.mds_metadata_blob(), blobFacts)}{/if}
    <p>{m.mds_device_authentication_scope()}</p>
  </Card.Content>
</Card.Root>

<style>
  @layer blocks {
    :global(.mds-card) {
      min-width: 0;
    }

    :global(.mds-content) {
      display: grid;
      align-content: start;
      gap: var(--space-4);
      min-width: 0;
    }

    h3,
    .aaguid-header {
      color: var(--muted-foreground);
      font-size: 0.75rem;
      font-weight: 700;
      text-transform: uppercase;
    }

    h3 {
      margin: 0;
    }

    .aaguid-section,
    .fact-section {
      display: grid;
      gap: var(--space-2);
      min-width: 0;
      border-top: 1px solid var(--border);
      padding-top: var(--space-3);
    }

    .fact-row {
      display: grid;
      grid-template-columns: minmax(8rem, 0.75fr) minmax(0, 1.25fr);
      gap: var(--space-3);
      align-items: baseline;
    }

    .aaguid-header {
      --cluster-justify: space-between;
      --cluster-space: var(--space-3);
    }

    code {
      display: block;
      min-width: 0;
      overflow: hidden;
      color: var(--foreground);
      font-size: 0.75rem;
      font-weight: 700;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    dl {
      display: grid;
      margin: 0;
    }

    .fact-row {
      border-top: 1px solid var(--border);
      padding: var(--space-2) 0;
    }

    .fact-row:first-child {
      border-top: 0;
    }

    dt,
    dd {
      margin: 0;
      min-width: 0;
      font-size: 0.75rem;
    }

    dt {
      color: var(--muted-foreground);
    }

    dd {
      color: var(--foreground);
      font-weight: 700;
      text-align: right;
      overflow-wrap: break-word;
      white-space: pre-line;
    }

    dd a {
      display: inline-flex;
      max-width: 100%;
      align-items: center;
      justify-content: flex-end;
      gap: var(--space-1);
    }

    dd a span {
      overflow-wrap: anywhere;
    }
  }

  @layer exceptions {
    dd[data-tone="muted"] {
      color: var(--muted-foreground);
    }

    dd[data-tone="success"] {
      color: var(--primary);
    }

    dd[data-tone="warning"] {
      color: var(--chart-3);
    }

    dd[data-tone="error"] {
      color: var(--destructive);
    }
  }
</style>
