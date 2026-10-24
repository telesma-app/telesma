<script lang="ts">
  import { tick } from "svelte";

  import type { EndpointReport } from "../../../../bindings/github.com/telesma-app/kit/model/report";
  import type { CredentialVerificationMaterial } from "../../../../bindings/github.com/telesma-app/kit/model/webauthn";
  import type { GetInfoEnvelope } from "../../../../bindings/telesma/service";

  import type { GetAssertionDraft, LabState } from "$lib/features/lab/state";
  import { validateGetAssertionDraft } from "$lib/lab-input";
  import type { LoadState } from "$lib/load-state";

  import { m } from "../../../paraglide/messages.js";

  import GetAssertionConfigure from "$lib/components/lab/GetAssertionConfigure.svelte";
  import GetAssertionResult from "$lib/components/lab/GetAssertionResult.svelte";
  import GetAssertionReview from "$lib/components/lab/GetAssertionReview.svelte";
  import LabOperationStep from "$lib/components/lab/LabOperationStep.svelte";
  import LabValidationIssues from "$lib/components/lab/LabValidationIssues.svelte";

  type Props = {
    lab: LabState;
    inspection: LoadState<GetInfoEnvelope>;
    device: EndpointReport;
    disabled?: boolean;
    fillDemoDisabled?: boolean;
    onDraftChange: (patch: Partial<GetAssertionDraft>) => void;
    onRegenerateChallenge: () => void;
    onPreview: () => void | Promise<boolean>;
    onConfirm: () => void | Promise<boolean>;
    onRetry: () => void | Promise<boolean>;
    onEdit: () => void;
    onNewRun: () => void;
    onVerificationMaterialChange: (entries: CredentialVerificationMaterial[]) => void;
    onRetryVerification: () => void;
    onRetryInspection: () => void;
    onFillDemoValues: () => void;
  };

  let {
    lab,
    inspection,
    device,
    disabled = false,
    fillDemoDisabled = false,
    onDraftChange,
    onRegenerateChallenge,
    onPreview,
    onConfirm,
    onRetry,
    onEdit,
    onNewRun,
    onVerificationMaterialChange,
    onRetryVerification,
    onRetryInspection,
    onFillDemoValues,
  }: Props = $props();

  let draft = $derived(lab.getDraft);

  let step = $derived(lab.getStep);

  let phase = $derived(step.phase);

  let preview = $derived.by(() => {
    if (
      step.phase === "review" ||
      step.phase === "executing" ||
      step.phase === "success" ||
      (step.phase === "error" && step.failedPhase === "executing")
    )
      return step.previewValue;

    return null;
  });

  let validation = $derived(validateGetAssertionDraft(draft));

  let extensionCount = $derived(
    Object.values(draft.extensions).filter((extension) => extension.included).length,
  );

  let showConfigure = $derived(
    phase === "editing" ||
      phase === "previewing" ||
      (step.phase === "error" && step.failedPhase === "previewing"),
  );

  async function handlePreview() {
    if (!validation.valid) {
      await tick();
      document.querySelector<HTMLElement>("#lab-get-configure [aria-invalid='true']")?.focus();

      return;
    }

    await onPreview();
  }
</script>

{#snippet content()}
  {#if showConfigure}
    <section
      id="lab-get-configure"
      class="lab-configure-stage"
      aria-labelledby="lab-get-assertion-heading"
    >
      <LabValidationIssues issues={validation.errors} severity="error" />

      <LabValidationIssues issues={validation.warnings} severity="warning" />

      <GetAssertionConfigure
        {draft}
        disabled={disabled || phase === "previewing"}
        errors={validation.errors}
        warnings={validation.warnings}
        {inspection}
        {onDraftChange}
        {onRegenerateChallenge}
        onPrimary={handlePreview}
        {onRetryInspection}
      />
    </section>
  {:else if step.phase === "success"}
    <GetAssertionResult
      preview={step.previewValue}
      result={step.value}
      verification={lab.getVerification}
      verificationMaterial={lab.getDraft.verificationMaterial}
      {onVerificationMaterialChange}
      {onRetryVerification}
    />
  {:else if preview}
    <GetAssertionReview {preview} />
  {/if}
{/snippet}

<LabOperationStep
  id="lab-get-command"
  headingId="lab-get-assertion-heading"
  title={m.lab_get_assertion()}
  description={m.lab_get_assertion_description()}
  {step}
  {device}
  {disabled}
  {fillDemoDisabled}
  errorCount={validation.errors.length}
  warningCount={validation.warnings.length}
  {extensionCount}
  {content}
  onPreview={handlePreview}
  {onConfirm}
  {onRetry}
  {onEdit}
  {onNewRun}
  {onFillDemoValues}
/>
