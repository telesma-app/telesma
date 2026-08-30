<script lang="ts" module>
  export type LabTechnicalDataItem = {
    id: string;
    label: string;
    syntax: "json" | "hex" | "text";
    type: string;
    byteCount: number;
    source: string;
  };
</script>

<script lang="ts">
  import { ChevronDown, Copy } from "@lucide/svelte";

  import { copyToClipboard } from "$lib/clipboard";
  import { Button, buttonVariants } from "$lib/components/ui/button";
  import * as Collapsible from "$lib/components/ui/collapsible";
  import { ScrollArea } from "$lib/components/ui/scroll-area";
  import * as Tabs from "$lib/components/ui/tabs";
  import JsonCode from "$lib/components/shared/JsonCode.svelte";

  import { m } from "../../../paraglide/messages.js";

  type Props = {
    items: LabTechnicalDataItem[];
  };

  let { items }: Props = $props();

  let selectedID = $state("");

  let selectedItem = $derived(items.find((item) => item.id === selectedID) ?? items[0]);

  $effect(() => {
    if (!items.some((item) => item.id === selectedID)) {
      selectedID = items[0]?.id ?? "";
    }
  });

  async function copySelectedItem() {
    if (!selectedItem) return;

    await copyToClipboard(selectedItem.source, m.lab_value_copied({ label: selectedItem.label }));
  }
</script>

<Collapsible.Root class="lab-technical-data">
  <Collapsible.Trigger class={buttonVariants({ variant: "ghost", class: "lab-technical-trigger" })}>
    <span>{m.lab_technical_details()}</span>
    <ChevronDown class="lab-technical-chevron" data-icon="inline-end" aria-hidden="true" />
  </Collapsible.Trigger>
  <Collapsible.Content class="lab-technical-content">
    {#if selectedItem}
      <Tabs.Root
        value={selectedItem.id}
        onValueChange={(id) => (selectedID = id)}
        orientation="vertical"
        class="lab-technical-tabs"
      >
        <Tabs.List class="lab-technical-navigation" aria-label={m.lab_technical_details()}>
          {#each items as item (item.id)}
            <Tabs.Trigger value={item.id}>{item.label}</Tabs.Trigger>
          {/each}
        </Tabs.List>

        <Tabs.Content value={selectedItem.id} class="lab-technical-panel">
          <header class="lab-technical-panel-header">
            <div class="lab-technical-panel-title">
              <strong>{selectedItem.label}</strong>
              <span
                >{m.lab_type_and_size({
                  type: selectedItem.type,
                  count: selectedItem.byteCount,
                })}</span
              >
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              aria-label={m.lab_copy({ label: selectedItem.label })}
              disabled={!selectedItem.source}
              onclick={copySelectedItem}
            >
              <Copy data-icon="inline-start" aria-hidden="true" />
              {m.copy()}
            </Button>
          </header>

          <ScrollArea
            class="lab-technical-scroll"
            orientation="both"
            viewportProps={{
              role: "region",
              "aria-label": selectedItem.label,
              tabindex: 0,
            }}
          >
            {#if selectedItem.syntax === "json"}
              <JsonCode source={selectedItem.source} />
            {:else}
              <pre class="lab-technical-source">{selectedItem.source}</pre>
            {/if}
          </ScrollArea>
        </Tabs.Content>
      </Tabs.Root>
    {/if}
  </Collapsible.Content>
</Collapsible.Root>

<style>
  @layer composition {
    :global(.lab-technical-tabs) {
      display: grid;
      grid-template-columns: minmax(10rem, 13rem) minmax(0, 1fr);
      gap: var(--space-3);
      min-width: 0;
    }
  }

  @layer blocks {
    :global(.lab-technical-data) {
      min-width: 0;
      overflow: hidden;
      border: 1px solid var(--border);
    }

    :global(.lab-technical-trigger) {
      display: flex;
      align-items: center;
      justify-content: space-between;
      width: 100%;
      height: auto;
      border-radius: 0;
      padding: var(--space-3);
      text-align: left;
    }

    :global(.lab-technical-chevron) {
      transition: transform 120ms ease;
    }

    :global(.lab-technical-content) {
      min-width: 0;
      padding: var(--space-3);
      border-top: 1px solid var(--border);
    }

    :global(.lab-technical-navigation) {
      align-self: start;
      width: 100%;
    }

    :global(.lab-technical-tabs [data-slot="tabs-trigger"]) {
      height: auto;
      min-width: 0;
      min-height: 2.25rem;
      padding-inline: var(--space-3);
      white-space: normal;
      text-align: left;
    }

    :global(.lab-technical-panel) {
      --json-code-font-size: 0.78rem;
      --json-code-line-height: 1.55;

      display: grid;
      grid-template-rows: auto minmax(0, 1fr);
      min-width: 0;
      overflow: hidden;
      border: 1px solid var(--border);
    }

    .lab-technical-panel-header {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-2);
      min-width: 0;
      padding: var(--space-2) var(--space-3);
      border-bottom: 1px solid var(--border);
      background: var(--card);
    }

    .lab-technical-panel-title {
      display: grid;
      gap: var(--space-1);
      min-width: 0;
    }

    .lab-technical-panel-title > strong {
      overflow: hidden;
      font-size: 0.75rem;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .lab-technical-panel-title > span {
      color: var(--muted-foreground);
      font-size: 0.68rem;
    }

    :global(.lab-technical-scroll),
    :global(.lab-technical-scroll > [data-slot="scroll-area-viewport"]) {
      width: 100%;
      max-width: 100%;
      max-height: min(24rem, 48dvh);
      min-width: 0;
    }

    :global(.lab-technical-scroll) {
      background: var(--muted);
    }

    :global(.lab-technical-scroll [data-slot="scroll-area-viewport"] > div) {
      min-width: 100%;
    }

    .lab-technical-source {
      width: 100%;
      min-width: 0;
      margin: 0;
      padding: var(--space-3);
      font-family: var(--font-mono);
      font-size: 0.78rem;
      line-height: 1.55;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }

    @container workspace (max-width: 54rem) {
      :global(.lab-technical-tabs) {
        grid-template-columns: minmax(0, 1fr);
      }
    }
  }

  @layer exceptions {
    :global(.lab-technical-data[data-state="open"] .lab-technical-chevron) {
      transform: rotate(180deg);
    }
  }
</style>
