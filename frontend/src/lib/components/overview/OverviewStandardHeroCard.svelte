<script lang="ts">
  import { Award, BadgeCheck, HardDrive, ScanFace, ShieldCheck, Touchpad } from "@lucide/svelte";

  import StatusBadge from "$lib/components/shared/StatusBadge.svelte";
  import { Badge } from "$lib/components/ui/badge";
  import * as Card from "$lib/components/ui/card";
  import type {
    OverviewHeroPresentation,
    OverviewMDSState,
    OverviewStandardFactId,
    OverviewStandardPresentation,
  } from "$lib/overview-rules";

  import { m } from "../../../paraglide/messages.js";

  let {
    hero,
    presentation,
  }: {
    hero: OverviewHeroPresentation;
    presentation: OverviewStandardPresentation;
  } = $props();

  function mdsTone(state: OverviewMDSState) {
    if (state === "error") return "warn" as const;

    if (state === "found") return "ok" as const;

    return "neutral" as const;
  }
</script>

{#snippet factIcon(id: OverviewStandardFactId)}
  {#if id === "presence"}
    <Touchpad size={16} />
  {:else if id === "owner-verification"}
    <ScanFace size={16} />
  {:else if id === "passkeys"}
    <HardDrive size={16} />
  {:else if id === "certification"}
    <Award size={16} />
  {:else}
    <BadgeCheck size={16} />
  {/if}
{/snippet}

<Card.Root class="standard-hero-card" aria-label={hero.title}>
  <Card.Header>
    <div class="standard-device-identity">
      <div class="standard-device-icon">
        {#if hero.iconSrc}
          <img src={hero.iconSrc} alt="" />
        {:else}
          <ShieldCheck size={26} strokeWidth={2.1} />
        {/if}
      </div>

      <div class="standard-device-copy">
        <Card.Title class="standard-device-title"><h2>{hero.title}</h2></Card.Title>
        <div class="standard-device-meta cluster">
          {#if hero.serialNumber}
            <Badge variant="secondary">S/N {hero.serialNumber}</Badge>
          {/if}
          {#if hero.versionBadge}
            <Badge variant="secondary">{hero.versionBadge}</Badge>
          {/if}
          <StatusBadge label={hero.mdsStateLabel} tone={mdsTone(hero.mdsState)} />
          {#if presentation.transports}
            <span>{presentation.transports}</span>
          {/if}
        </div>

        {#if hero.subtitle}
          <Card.Description>{hero.subtitle}</Card.Description>
        {/if}
      </div>
    </div>
  </Card.Header>

  <Card.Content>
    <div class="standard-summary">
      <div class="standard-summary-copy">
        <div class="standard-summary-heading">
          <span class="standard-eyebrow">{m.overview_standard_eyebrow()}</span>
          <h3>{presentation.title}</h3>
        </div>
        <p>{presentation.description}</p>
      </div>

      <dl class="standard-facts">
        {#each presentation.facts as fact (fact.id)}
          <div data-tone={fact.tone}>
            <dt>
              {@render factIcon(fact.id)}
              <span>{fact.label}</span>
            </dt>
            <dd>{fact.value}</dd>
          </div>
        {/each}
      </dl>
    </div>
  </Card.Content>
</Card.Root>

<style>
  @layer blocks {
    :global(.standard-hero-card) {
      min-width: 0;
    }

    .standard-device-identity {
      display: grid;
      grid-template-columns: 56px minmax(0, 1fr);
      gap: var(--space-3);
      align-items: center;
      min-width: 0;
    }

    .standard-device-icon {
      display: grid;
      place-items: center;
      width: 56px;
      height: 56px;
      overflow: hidden;
      border: 1px solid var(--border);
      background: var(--muted);
      color: var(--muted-foreground);
    }

    .standard-device-icon img {
      width: 100%;
      height: 100%;
      object-fit: contain;
      padding: var(--space-2);
    }

    .standard-device-copy {
      display: grid;
      gap: var(--space-1);
      min-width: 0;
    }

    :global(.standard-device-title) {
      overflow: hidden;
      font-size: 1.2rem;
      line-height: 1.15;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    :global(.standard-device-title h2) {
      margin: 0;
      font: inherit;
    }

    .standard-device-meta {
      --cluster-space: var(--space-2);
      color: var(--muted-foreground);
      font-size: 0.75rem;
    }

    .standard-summary {
      display: grid;
      grid-template-columns: minmax(0, 1.15fr) minmax(22rem, 0.85fr);
      gap: var(--space-6);
      align-items: start;
    }

    .standard-summary-copy,
    .standard-summary-heading {
      display: grid;
    }

    .standard-summary-copy {
      gap: var(--space-4);
      max-width: 44rem;
    }

    .standard-summary-heading {
      gap: var(--space-2);
    }

    .standard-eyebrow {
      color: var(--primary);
      font-size: 0.72rem;
      font-weight: 800;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }

    .standard-summary-copy h3,
    .standard-summary-copy p,
    .standard-facts,
    .standard-facts dd {
      margin: 0;
    }

    .standard-summary-copy h3 {
      font-size: 1.1rem;
      line-height: 1.35;
    }

    .standard-summary-copy p {
      color: var(--muted-foreground);
      line-height: 1.55;
    }

    .standard-facts {
      display: grid;
    }

    .standard-facts > div {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: var(--space-4);
      align-items: center;
      border-bottom: 1px solid var(--border);
      padding-block: var(--space-2);
    }

    .standard-facts > div:first-child {
      padding-block-start: 0;
    }

    .standard-facts > div:last-child {
      border-bottom: 0;
      padding-block-end: 0;
    }

    .standard-facts dt {
      display: flex;
      gap: var(--space-2);
      align-items: center;
      min-width: 0;
      color: var(--muted-foreground);
    }

    .standard-facts dd {
      max-width: 22rem;
      font-weight: 700;
      text-align: end;
    }

    @container workspace (max-width: 48rem) {
      .standard-summary {
        grid-template-columns: minmax(0, 1fr);
      }
    }

    @container workspace (max-width: 30rem) {
      .standard-device-identity {
        grid-template-columns: 44px minmax(0, 1fr);
      }

      .standard-device-icon {
        width: 44px;
        height: 44px;
      }

      .standard-facts > div {
        grid-template-columns: minmax(0, 1fr);
        gap: var(--space-1);
      }

      .standard-facts dd {
        text-align: start;
      }
    }
  }

  @layer exceptions {
    .standard-facts > div[data-tone="warning"] dd {
      color: var(--warning-foreground);
    }

    .standard-facts > div[data-tone="muted"] dd {
      color: var(--muted-foreground);
    }
  }
</style>
