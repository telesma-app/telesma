<script lang="ts">
  import ChevronDownIcon from "@lucide/svelte/icons/chevron-down";
  import FactoryIcon from "@lucide/svelte/icons/factory";

  import { Badge } from "$lib/components/ui/badge";
  import { buttonVariants } from "$lib/components/ui/button";
  import * as Card from "$lib/components/ui/card";
  import * as Collapsible from "$lib/components/ui/collapsible";
  import { Separator } from "$lib/components/ui/separator";
  import type { OverviewVendorPassportPresentation } from "$lib/overview-rules";

  import { m } from "../../../paraglide/messages.js";

  let { presentation }: { presentation: OverviewVendorPassportPresentation } = $props();

  let detailsOpen = $state(false);
</script>

<Card.Root
  size="sm"
  class="vendor-passport"
  aria-label={presentation.vendor ? m.group_vendor_details() : m.source_attachment_title()}
>
  <Card.Header class="vendor-passport-header">
    <div class="vendor-passport-heading">
      <span class="vendor-passport-icon" aria-hidden="true">
        <FactoryIcon size={18} />
      </span>
      <div class="vendor-passport-copy">
        <Card.Title role="heading" aria-level={2}
          >{presentation.vendor
            ? m.group_vendor_details()
            : m.source_attachment_title()}</Card.Title
        >
        {#if presentation.vendor}<Card.Description>{presentation.vendor}</Card.Description>{/if}
      </div>
    </div>
    <Card.Action>
      <Badge variant="outline">{presentation.transport}</Badge>
    </Card.Action>
  </Card.Header>

  <Card.Content class="vendor-passport-content">
    {#if presentation.coreFacts.length}
      <dl class="vendor-passport-core">
        {#each presentation.coreFacts as fact (fact.source)}
          <div>
            <dt>{fact.label}</dt>
            <dd data-text-selectable="true">{fact.value}</dd>
          </div>
        {/each}
      </dl>
    {/if}

    {#if presentation.scopeNote}
      <p class="vendor-passport-note">{presentation.scopeNote}</p>
    {/if}

    {#if presentation.summaryFacts.length}
      <Separator />
      <div class="vendor-passport-summary">
        {#each presentation.summaryFacts as fact (fact.source)}
          <section aria-labelledby={`vendor-summary-${fact.source}`}>
            <h3 id={`vendor-summary-${fact.source}`}>{fact.label}</h3>
            <p>{fact.value}</p>
          </section>
        {/each}
      </div>
    {/if}

    {#if presentation.detailFacts.length}
      <Collapsible.Root bind:open={detailsOpen} class="vendor-passport-disclosure">
        <Separator />
        <div class="vendor-passport-disclosure-header">
          <div>
            <h3>{m.overview_vendor_technical_details()}</h3>
            <Badge variant="outline">
              {m.items_count({ count: presentation.detailFacts.length })}
            </Badge>
          </div>
          <Collapsible.Trigger
            class={buttonVariants({ variant: "ghost", size: "sm" })}
            aria-label={detailsOpen
              ? m.overview_vendor_hide_details()
              : m.overview_vendor_show_details()}
          >
            {detailsOpen ? m.overview_vendor_hide_details() : m.overview_vendor_show_details()}
            <ChevronDownIcon data-icon="inline-end" aria-hidden="true" />
          </Collapsible.Trigger>
        </div>

        <Collapsible.Content class="vendor-passport-details">
          <dl>
            {#each presentation.detailFacts as fact (fact.source)}
              <div>
                <dt>{fact.label}</dt>
                <dd data-text-selectable="true">{fact.value}</dd>
              </div>
            {/each}
          </dl>
        </Collapsible.Content>
      </Collapsible.Root>
    {/if}
  </Card.Content>
</Card.Root>

<style>
  @layer blocks {
    :global(.vendor-passport) {
      min-width: 0;
    }

    :global(.vendor-passport-header) {
      grid-template-columns: minmax(0, 1fr) auto;
      grid-template-rows: auto;
      align-items: center;
    }

    .vendor-passport-heading {
      display: flex;
      gap: var(--space-3);
      align-items: center;
      min-width: 0;
    }

    .vendor-passport-icon {
      display: grid;
      flex: 0 0 auto;
      place-items: center;
      width: 2.25rem;
      height: 2.25rem;
      border: 1px solid var(--border);
      background: var(--muted);
      color: var(--muted-foreground);
    }

    .vendor-passport-copy {
      display: grid;
      gap: var(--space-1);
      min-width: 0;
    }

    .vendor-passport-copy :global([data-slot="card-title"]),
    .vendor-passport-copy :global([data-slot="card-description"]) {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    :global(.vendor-passport-content) {
      display: grid;
      gap: var(--space-3);
    }

    .vendor-passport-core {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 1px;
      overflow: hidden;
      margin: 0;
      border: 1px solid var(--border);
      background: var(--border);
    }

    .vendor-passport-core > div {
      display: grid;
      gap: var(--space-1);
      min-width: 0;
      padding: var(--space-3);
      background: var(--card);
    }

    .vendor-passport-core dt,
    .vendor-passport-summary h3,
    .vendor-passport-disclosure-header h3,
    .vendor-passport-note {
      color: var(--muted-foreground);
      font-size: 0.72rem;
    }

    .vendor-passport-core dd {
      overflow-wrap: anywhere;
      margin: 0;
      font-weight: 700;
    }

    .vendor-passport-note {
      margin: 0;
      color: var(--foreground);
    }

    .vendor-passport-summary {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: var(--space-4);
    }

    .vendor-passport-summary section {
      display: grid;
      gap: var(--space-1);
    }

    .vendor-passport-summary h3,
    .vendor-passport-summary p,
    .vendor-passport-disclosure-header h3 {
      margin: 0;
    }

    .vendor-passport-summary p {
      font-weight: 700;
      line-height: 1.5;
    }

    :global(.vendor-passport-disclosure) {
      display: grid;
      gap: var(--space-3);
      min-width: 0;
    }

    .vendor-passport-disclosure-header,
    .vendor-passport-disclosure-header > div {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2);
      align-items: center;
    }

    .vendor-passport-disclosure-header {
      justify-content: space-between;
    }

    :global(.vendor-passport-disclosure[data-state="open"] .vendor-passport-disclosure-header svg) {
      transform: rotate(180deg);
    }

    :global(.vendor-passport-details) dl {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 1px;
      overflow: hidden;
      margin: 0;
      border: 1px solid var(--border);
      background: var(--border);
    }

    :global(.vendor-passport-details) dl > div {
      display: grid;
      gap: var(--space-1);
      min-width: 0;
      padding: var(--space-3);
      background: var(--card);
    }

    :global(.vendor-passport-details) dt {
      color: var(--foreground);
      font-size: 0.8rem;
      font-weight: 600;
      line-height: 1.35;
    }

    :global(.vendor-passport-details) dd {
      overflow-wrap: anywhere;
      margin: 0;
      color: var(--muted-foreground);
      font-weight: 500;
      line-height: 1.4;
    }

    @media (max-width: 720px) {
      .vendor-passport-core,
      .vendor-passport-summary,
      :global(.vendor-passport-details) dl {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }
  }
</style>
