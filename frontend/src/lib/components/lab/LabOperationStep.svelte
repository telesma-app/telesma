<script lang="ts">
  import type { Snippet } from "svelte";
  import { Pencil, RotateCcw, Send, Sparkles, WandSparkles } from "@lucide/svelte";

  import type { EndpointReport } from "../../../../bindings/github.com/telesma-app/kit/model/report";

  import { confirmedFailureMessage } from "$lib/confirmed-operation-presentation";
  import * as Alert from "$lib/components/ui/alert";
  import { Badge } from "$lib/components/ui/badge";
  import { Button } from "$lib/components/ui/button";
  import * as Card from "$lib/components/ui/card";
  import { Separator } from "$lib/components/ui/separator";
  import { Spinner } from "$lib/components/ui/spinner";
  import type { LabGetStep, LabMakeStep } from "$lib/features/lab/state";
  import { deviceName } from "$lib/format";

  import { m } from "../../../paraglide/messages.js";

  import LabWorkflowSteps from "$lib/components/lab/LabWorkflowSteps.svelte";

  type Props = {
    id: string;
    headingId: string;
    title: string;
    description: string;
    device: EndpointReport;
    step: LabMakeStep | LabGetStep;
    disabled: boolean;
    errorCount: number;
    warningCount: number;
    extensionCount: number;
    fillDemoDisabled?: boolean;
    content: Snippet;
    onPreview: () => void | Promise<unknown>;
    onConfirm: () => void | Promise<unknown>;
    onRetry: () => void | Promise<unknown>;
    onEdit: () => void;
    onNewRun: () => void;
    onFillDemoValues: () => void;
    successLabel?: string;
    onSuccess?: () => void;
  };

  let {
    id,
    headingId,
    title,
    description,
    device,
    step,
    disabled,
    errorCount,
    warningCount,
    extensionCount,
    fillDemoDisabled = false,
    content,
    onPreview,
    onConfirm,
    onRetry,
    onEdit,
    onNewRun,
    onFillDemoValues,
    successLabel,
    onSuccess,
  }: Props = $props();

  let phase = $derived(step.phase);

  let ready = $derived(errorCount === 0);

  let failureMessage = $derived(step.phase === "error" ? confirmedFailureMessage(step) : null);

  let executionFailed = $derived(step.phase === "error" && step.failedPhase === "executing");

  let configurationVisible = $derived(
    phase === "editing" ||
      phase === "previewing" ||
      (step.phase === "error" && step.failedPhase === "previewing"),
  );

  function phaseLabel() {
    if (phase === "previewing") return m.lab_phase_previewing();

    if (phase === "review") return m.lab_phase_review();

    if (phase === "executing") return m.lab_phase_executing();

    if (phase === "success") return m.lab_phase_success();

    if (phase === "error") return m.lab_phase_error();

    return m.lab_phase_editing();
  }
</script>

{#snippet actions()}
  {#if phase === "editing"}
    <Button class="lab-command-action" type="button" {disabled} onclick={onPreview}>
      <WandSparkles data-icon="inline-start" aria-hidden="true" />{m.lab_preview()}
    </Button>
  {:else if phase === "previewing"}
    <Button class="lab-command-action" type="button" disabled>
      <Spinner data-icon="inline-start" aria-hidden="true" />{m.lab_preview()}
    </Button>
  {:else if phase === "review"}
    <Button class="lab-command-action" variant="outline" type="button" {disabled} onclick={onEdit}>
      <Pencil data-icon="inline-start" aria-hidden="true" />{m.lab_edit()}
    </Button>
    <Button class="lab-command-action" type="button" {disabled} onclick={onConfirm}>
      <Send data-icon="inline-start" aria-hidden="true" />{m.lab_execute()}
    </Button>
  {:else if phase === "executing"}
    <Button class="lab-command-action" type="button" disabled>
      <Spinner data-icon="inline-start" aria-hidden="true" />{m.lab_execute()}
    </Button>
  {:else if phase === "success"}
    <Button class="lab-command-action" variant="outline" type="button" {disabled} onclick={onEdit}>
      <Pencil data-icon="inline-start" aria-hidden="true" />{m.lab_edit()}
    </Button>
    <Button
      class="lab-command-action"
      variant={onSuccess ? "outline" : "default"}
      type="button"
      {disabled}
      onclick={onNewRun}
    >
      <RotateCcw data-icon="inline-start" aria-hidden="true" />{m.lab_new_run()}
    </Button>
    {#if onSuccess && successLabel}
      <Button class="lab-command-action" type="button" {disabled} onclick={onSuccess}>
        <Send data-icon="inline-start" aria-hidden="true" />{successLabel}
      </Button>
    {/if}
  {:else if phase === "error"}
    <Button class="lab-command-action" variant="outline" type="button" {disabled} onclick={onEdit}>
      <Pencil data-icon="inline-start" aria-hidden="true" />{m.lab_edit()}
    </Button>
    <Button class="lab-command-action" type="button" {disabled} onclick={onRetry}>
      {#if executionFailed}
        <Send data-icon="inline-start" aria-hidden="true" />{m.lab_retry()}
      {:else}
        <WandSparkles data-icon="inline-start" aria-hidden="true" />{m.lab_retry_preview()}
      {/if}
    </Button>
  {/if}
{/snippet}

<div class="lab-step-layout">
  {#if configurationVisible}
    <section class="lab-step-main" data-phase={phase} aria-labelledby={headingId}>
      <h2 id={headingId} class="sr-only">{title}</h2>

      {#if failureMessage}
        <Alert.Root variant="destructive" role="alert">
          <Alert.Title>{m.lab_request_failed()}</Alert.Title>
          <Alert.Description>{failureMessage}</Alert.Description>
        </Alert.Root>
      {/if}
      {@render content()}
    </section>
  {:else}
    <Card.Root class="lab-step-card" data-phase={phase}>
      <Card.Header>
        <Card.Title><h2 id={headingId}>{title}</h2></Card.Title>
        <Card.Description>{description}</Card.Description>
      </Card.Header>

      <Card.Content class="lab-step-content">
        {#if failureMessage}
          <Alert.Root variant="destructive" role="alert">
            <Alert.Title>{m.lab_request_failed()}</Alert.Title>
            <Alert.Description>{failureMessage}</Alert.Description>
          </Alert.Root>
        {/if}
        {@render content()}
      </Card.Content>
    </Card.Root>
  {/if}

  <aside class="lab-command-rail" aria-labelledby={`${id}-title`}>
    <Card.Root class="lab-command-center" data-phase={phase}>
      <Card.Header>
        <Card.Title><h3 id={`${id}-title`}>{m.lab_command_current_run()}</h3></Card.Title>
        <Card.Description>
          <span>{title}</span>
          <span aria-hidden="true">·</span>
          <span>{deviceName(device)}</span>
        </Card.Description>
        <Card.Action>
          <Badge variant={phase === "error" ? "destructive" : "outline"}>{phaseLabel()}</Badge>
        </Card.Action>
      </Card.Header>

      <Card.Content class="lab-command-content">
        <LabWorkflowSteps {step} orientation="vertical" />
        <Separator />

        <section class="lab-command-readiness" aria-labelledby={`${id}-readiness-title`}>
          <header>
            <h4 id={`${id}-readiness-title`}>{m.lab_command_readiness()}</h4>
            <Badge variant={ready ? "secondary" : "destructive"}>
              {ready ? m.lab_command_ready() : m.lab_command_needs_attention()}
            </Badge>
          </header>

          <dl>
            <div>
              <dt>{m.lab_validation_errors()}</dt>
              <dd>{errorCount}</dd>
            </div>

            <div>
              <dt>{m.lab_validation_warnings()}</dt>
              <dd>{warningCount}</dd>
            </div>

            <div>
              <dt>{m.lab_enabled_extensions()}</dt>
              <dd>{extensionCount}</dd>
            </div>
          </dl>
        </section>
      </Card.Content>

      <Card.Footer class="lab-command-actions">
        {@render actions()}
        <Button
          class="lab-command-action"
          variant="outline"
          type="button"
          disabled={fillDemoDisabled}
          onclick={onFillDemoValues}
        >
          <Sparkles data-icon="inline-start" aria-hidden="true" />
          {m.lab_fill_demo_values()}
        </Button>
      </Card.Footer>
    </Card.Root>
  </aside>
</div>

<style>
  @layer blocks {
    .lab-command-rail {
      position: sticky;
      top: var(--space-4);
      min-width: 0;
    }

    .lab-step-layout,
    .lab-step-main,
    :global(.lab-step-card) {
      min-width: 0;
    }

    .lab-step-main {
      display: grid;
      align-content: start;
      gap: var(--space-4);
    }

    :global(.lab-step-card [data-slot="card-title"] h2) {
      margin: 0;
      font: inherit;
    }

    :global(.lab-step-content),
    :global(.lab-step-content .lab-configure-stage),
    :global(.lab-step-main .lab-configure-stage) {
      display: grid;
      gap: var(--space-4);
      min-width: 0;
    }

    :global(.lab-command-center) {
      min-width: 0;
    }

    :global(.lab-command-center [data-slot="card-title"] h3) {
      margin: 0;
      font: inherit;
    }

    :global(.lab-command-center [data-slot="card-description"]) {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-1);
      min-width: 0;
    }

    :global(.lab-command-content),
    .lab-command-readiness,
    .lab-command-readiness header,
    .lab-command-readiness dl,
    .lab-command-readiness dl > div {
      min-width: 0;
    }

    :global(.lab-command-content),
    .lab-command-readiness,
    .lab-command-readiness dl {
      display: grid;
    }

    :global(.lab-command-content),
    .lab-command-readiness {
      gap: var(--space-3);
    }

    .lab-command-readiness header,
    .lab-command-readiness dl > div {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-2);
    }

    .lab-command-readiness h4 {
      margin: 0;
      font-size: 0.78rem;
    }

    .lab-command-readiness dl {
      gap: 0;
      margin: 0;
    }

    .lab-command-readiness dl > div {
      padding-block: var(--space-2);
      border-top: 1px solid var(--border);
    }

    .lab-command-readiness dt {
      color: var(--muted-foreground);
      font-size: 0.72rem;
    }

    .lab-command-readiness dd {
      margin: 0;
      font-variant-numeric: tabular-nums;
      font-weight: 700;
    }

    :global(.lab-command-actions) {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      gap: var(--space-2);
    }

    :global(.lab-command-action) {
      width: 100%;
    }

    @container workspace (max-width: 58rem) {
      .lab-command-rail {
        position: static;
      }
    }
  }
</style>
