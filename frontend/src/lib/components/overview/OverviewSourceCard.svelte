<script lang="ts">
  import * as Card from "$lib/components/ui/card";
  import * as Alert from "$lib/components/ui/alert";
  import { Badge } from "$lib/components/ui/badge";
  import type { SourcePanel } from "$lib/overview-sources";
  let { panel, advanced = false }: { panel: SourcePanel; advanced?: boolean } = $props();
</script>

<Card.Root size="sm" class="source-card" aria-label={panel.title}>
  <Card.Header>
    <Card.Title role="heading" aria-level={2}>{panel.title}</Card.Title>
    <Card.Description>{panel.description}</Card.Description>
    <Card.Action
      ><Badge variant={panel.failed ? "destructive" : "outline"}>{panel.status}</Badge></Card.Action
    >
  </Card.Header>
  <Card.Content class="source-content">
    {#if panel.message}
      <Alert.Root variant={panel.failed ? "destructive" : "default"}>
        <Alert.Description>{panel.message}</Alert.Description>
      </Alert.Root>
    {/if}
    <dl class="source-facts">
      {#each panel.facts as item (item.source)}
        <div class="source-fact">
          <dt>{item.label}</dt>
          <dd data-text-selectable="true">{item.value}</dd>
          {#if item.status}<dd><Badge variant="outline">{item.status}</Badge></dd>{/if}
          {#if item.message}<dd class="source-note">{item.message}</dd>{/if}
          {#if advanced}
            <dd class="source-path">
              <code>{item.source}</code>{#if item.endpoint}<br />{item.endpoint}{/if}
            </dd>
          {/if}
        </div>
      {/each}
    </dl>
  </Card.Content>
</Card.Root>

<style>
  @layer blocks {
    :global(.source-card),
    :global(.source-content) {
      min-width: 0;
    }
    :global(.source-content) {
      display: grid;
      gap: var(--space-3);
    }
    .source-facts {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(min(15rem, 100%), 1fr));
      gap: var(--space-4);
      margin: 0;
    }
    .source-fact {
      display: grid;
      align-content: start;
      gap: var(--space-1);
      min-width: 0;
    }
    .source-fact dt,
    .source-note,
    .source-path {
      color: var(--muted-foreground);
      font-size: 0.75rem;
    }
    .source-fact dd {
      margin: 0;
      overflow-wrap: anywhere;
    }
  }
</style>
