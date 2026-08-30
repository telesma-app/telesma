<script lang="ts">
  import { RefreshCw } from "@lucide/svelte";

  import JsonEditor from "$lib/components/shared/JsonEditor.svelte";
  import * as Field from "$lib/components/ui/field";
  import { Input } from "$lib/components/ui/input";
  import * as InputGroup from "$lib/components/ui/input-group";
  import { Switch } from "$lib/components/ui/switch";
  import * as ToggleGroup from "$lib/components/ui/toggle-group";
  import type { LabClientDataMode } from "$lib/features/lab/state";
  import { formatJSON } from "$lib/json-source";
  import { buildClientDataJSON, type LabClientDataOperation } from "$lib/lab-input";

  import { m } from "../../../paraglide/messages.js";

  type Props = {
    id: string;
    operation: LabClientDataOperation;
    mode: LabClientDataMode;
    origin: string;
    challenge: string;
    crossOrigin: boolean;
    topOrigin: string;
    rawValue: string;
    disabled?: boolean;
    originInvalid?: boolean;
    challengeInvalid?: boolean;
    topOriginInvalid?: boolean;
    rawInvalid?: boolean;
    onModeChange: (value: LabClientDataMode, generatedRawValue?: string) => void;
    onOriginChange: (value: string) => void;
    onChallengeChange: (value: string) => void;
    onCrossOriginChange: (value: boolean) => void;
    onTopOriginChange: (value: string) => void;
    onRegenerateChallenge: () => void;
    onRawChange: (value: string) => void;
    onPrimary: () => unknown | Promise<unknown>;
  };

  let {
    id,
    operation,
    mode,
    origin,
    challenge,
    crossOrigin,
    topOrigin,
    rawValue,
    disabled = false,
    originInvalid = false,
    challengeInvalid = false,
    topOriginInvalid = false,
    rawInvalid = false,
    onModeChange,
    onOriginChange,
    onChallengeChange,
    onCrossOriginChange,
    onTopOriginChange,
    onRegenerateChallenge,
    onRawChange,
    onPrimary,
  }: Props = $props();

  let clientDataType = $derived(operation === "create" ? "webauthn.create" : "webauthn.get");

  let generatedValue = $derived(
    buildClientDataJSON(operation, {
      origin,
      challenge,
      crossOrigin,
      topOrigin,
    }),
  );
  let generatedEditorValue = $derived(formatJSON(generatedValue)!);

  function handleModeChange(next: string | string[]) {
    if (Array.isArray(next) || !next) return;

    if (next === "raw") onModeChange(next, generatedEditorValue);
    else if (next === "builder") onModeChange(next);
  }

  function handleSingleLineKeydown(event: KeyboardEvent) {
    if (event.key !== "Enter" || event.isComposing || disabled) return;

    event.preventDefault();
    void onPrimary();
  }
</script>

<Field.Set class="lab-client-data" data-disabled={disabled}>
  <Field.Legend class="sr-only">{m.lab_client_data()}</Field.Legend>
  <Field.Group>
    <Field.Field>
      <ToggleGroup.Root
        type="single"
        value={mode}
        variant="outline"
        size="sm"
        class="lab-client-data-mode"
        aria-label={m.lab_client_data()}
        {disabled}
        onValueChange={handleModeChange}
      >
        <ToggleGroup.Item value="builder">{m.lab_client_data_builder()}</ToggleGroup.Item>
        <ToggleGroup.Item value="raw">{m.lab_client_data_raw()}</ToggleGroup.Item>
      </ToggleGroup.Root>
      <Field.Description>
        {mode === "raw" ? m.lab_raw_description() : m.lab_builder_description()}
      </Field.Description>
    </Field.Field>

    {#if mode === "builder"}
      <Field.Group class="lab-client-data-grid">
        <Field.Field>
          <Field.Label for={`${id}-type`}>{m.lab_client_data_type()}</Field.Label>
          <output id={`${id}-type`} class="lab-client-data-fixed">{clientDataType}</output>
        </Field.Field>

        <Field.Field orientation="horizontal" data-disabled={disabled}>
          <Field.Content>
            <Field.Label for={`${id}-cross-origin`}>{m.lab_client_data_cross_origin()}</Field.Label>
            <Field.Description>{m.lab_cross_origin_description()}</Field.Description>
          </Field.Content>
          <Switch
            id={`${id}-cross-origin`}
            checked={crossOrigin}
            {disabled}
            onCheckedChange={onCrossOriginChange}
          />
        </Field.Field>

        <Field.Field data-disabled={disabled} data-invalid={originInvalid}>
          <Field.Label for={`${id}-origin`}>{m.lab_origin()}</Field.Label>
          <Input
            id={`${id}-origin`}
            value={origin}
            {disabled}
            aria-invalid={originInvalid}
            oninput={(event) => onOriginChange(event.currentTarget.value)}
            onkeydown={handleSingleLineKeydown}
          />
        </Field.Field>

        <Field.Field data-disabled={disabled} data-invalid={challengeInvalid}>
          <Field.Label for={`${id}-challenge`}>{m.lab_challenge()}</Field.Label>
          <InputGroup.Root>
            <InputGroup.Input
              id={`${id}-challenge`}
              value={challenge}
              spellcheck="false"
              {disabled}
              aria-invalid={challengeInvalid}
              oninput={(event) => onChallengeChange(event.currentTarget.value)}
              onkeydown={handleSingleLineKeydown}
            />
            <InputGroup.Addon align="inline-end">
              <InputGroup.Button size="sm" {disabled} onclick={onRegenerateChallenge}>
                <RefreshCw aria-hidden="true" />
                {m.lab_regenerate()}
              </InputGroup.Button>
            </InputGroup.Addon>
          </InputGroup.Root>
        </Field.Field>

        {#if crossOrigin}
          <Field.Field
            class="lab-client-data-wide"
            data-disabled={disabled}
            data-invalid={topOriginInvalid}
          >
            <Field.Label for={`${id}-top-origin`}>{m.lab_top_origin()}</Field.Label>
            <Input
              id={`${id}-top-origin`}
              value={topOrigin}
              {disabled}
              aria-invalid={topOriginInvalid}
              oninput={(event) => onTopOriginChange(event.currentTarget.value)}
              onkeydown={handleSingleLineKeydown}
            />
            <Field.Description>{m.lab_top_origin_description()}</Field.Description>
          </Field.Field>
        {/if}
      </Field.Group>
    {/if}

    <Field.Field
      data-disabled={disabled || mode === "builder"}
      data-invalid={mode === "raw" && rawInvalid}
    >
      <Field.Label id={`${id}-json-label`}>
        {mode === "builder" ? m.lab_generated_client_data() : m.lab_raw_client_data()}
      </Field.Label>
      <JsonEditor
        id={`${id}-json`}
        labelledBy={`${id}-json-label`}
        value={mode === "builder" ? generatedEditorValue : rawValue}
        minLines={8}
        disabled={disabled || mode === "builder"}
        invalid={mode === "raw" && rawInvalid}
        onChange={onRawChange}
      />
      {#if mode === "builder"}
        <Field.Description>{m.lab_generated_client_data_description()}</Field.Description>
      {/if}
    </Field.Field>
  </Field.Group>
</Field.Set>

<style>
  @layer blocks {
    :global(.lab-client-data) {
      container: lab-client-data / inline-size;
      min-width: 0;
    }

    :global(.lab-client-data-mode) {
      width: 100%;
    }

    :global(.lab-client-data-mode [data-slot="toggle-group-item"]) {
      flex: 1 1 50%;
    }

    :global(.lab-client-data-grid) {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: var(--space-3);
      min-width: 0;
    }

    :global(.lab-client-data-wide) {
      grid-column: span 2;
    }

    .lab-client-data-fixed {
      display: flex;
      align-items: center;
      block-size: 2rem;
      padding-inline: var(--space-2);
      border: 1px solid var(--border);
      background: var(--muted);
      font-family: var(--font-mono);
      font-size: 0.76rem;
    }

    :global(.lab-client-data [data-slot="input-group"]) {
      min-width: 0;
    }

    @container lab-client-data (max-width: 84rem) {
      :global(.lab-client-data-grid) {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }

    @container lab-client-data (max-width: 42rem) {
      :global(.lab-client-data-grid) {
        grid-template-columns: minmax(0, 1fr);
      }

      :global(.lab-client-data-wide) {
        grid-column: auto;
      }
    }
  }
</style>
