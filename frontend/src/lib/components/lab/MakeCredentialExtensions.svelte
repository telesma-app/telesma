<script lang="ts">
  import {
    CredentialProtectionPolicy,
    ExtensionIdentifier,
    LargeBlobSupport,
  } from "../../../../bindings/github.com/telesma-app/ctap/extension";
  import type { InspectEnvelope } from "../../../../bindings/telesma/service";

  import * as Alert from "$lib/components/ui/alert";
  import { Button } from "$lib/components/ui/button";
  import * as Field from "$lib/components/ui/field";
  import * as Select from "$lib/components/ui/select";
  import { Switch } from "$lib/components/ui/switch";
  import * as ToggleGroup from "$lib/components/ui/toggle-group";
  import { inspectResult } from "$lib/ctapkit-results";
  import type { MakeCredentialExtensionsDraft } from "$lib/features/lab/state";
  import { authenticatorSupportsLabExtension } from "$lib/lab-extension-support";
  import type { LabValidationIssue } from "$lib/lab-input";
  import type { LoadState } from "$lib/load-state";

  import { m } from "../../../paraglide/messages.js";

  import LabAlgorithmEditor from "$lib/components/lab/LabAlgorithmEditor.svelte";
  import LabBinaryEditor from "$lib/components/lab/LabBinaryEditor.svelte";
  import LabExtensionItem, {
    type ExtensionStatus,
  } from "$lib/components/lab/LabExtensionItem.svelte";
  import LabFieldLabel from "$lib/components/lab/LabFieldLabel.svelte";
  import LabHMACEditor from "$lib/components/lab/LabHMACEditor.svelte";
  import LabPRFValuesEditor from "$lib/components/lab/LabPRFValuesEditor.svelte";

  type Props = {
    value: MakeCredentialExtensionsDraft;
    disabled?: boolean;
    inspection: LoadState<InspectEnvelope>;
    errors: LabValidationIssue[];
    onChange: (value: MakeCredentialExtensionsDraft) => void;
    onRetryInspection: () => void;
  };

  let {
    value,
    disabled = false,
    inspection,
    errors,
    onChange,
    onRetryInspection,
  }: Props = $props();

  function status(identifier: ExtensionIdentifier): ExtensionStatus {
    if (inspection.state !== "ready") return "unknown";

    const info = inspectResult(inspection.data)?.info;

    return info && authenticatorSupportsLabExtension(info, identifier)
      ? "supported"
      : "not-reported";
  }

  function hasError(prefix: string) {
    return errors.some((error) => error.field.startsWith(prefix));
  }

  function update<K extends keyof MakeCredentialExtensionsDraft>(
    key: K,
    next: MakeCredentialExtensionsDraft[K],
  ) {
    onChange({ ...value, [key]: next });
  }

  function include<K extends keyof MakeCredentialExtensionsDraft>(
    key: K,
    included: boolean,
    next: MakeCredentialExtensionsDraft[K],
  ) {
    update(key, { ...next, included });
  }

  function policyLabel(policy: CredentialProtectionPolicy) {
    if (policy === CredentialProtectionPolicy.CredentialProtectionPolicyUserVerificationRequired) {
      return "userVerificationRequired";
    }

    if (
      policy ===
      CredentialProtectionPolicy.CredentialProtectionPolicyUserVerificationOptionalWithCredentialIDList
    ) {
      return "userVerificationOptionalWithCredentialIDList";
    }

    return "userVerificationOptional";
  }

  function changePolicy(next: string | string[]) {
    if (Array.isArray(next)) return;

    if (!Object.values(CredentialProtectionPolicy).includes(next as CredentialProtectionPolicy))
      return;

    update("credentialProtection", {
      ...value.credentialProtection,
      policy: next as CredentialProtectionPolicy,
    });
  }

  function changeLargeBlobSupport(next: string | string[]) {
    if (Array.isArray(next) || !Object.values(LargeBlobSupport).includes(next as LargeBlobSupport))
      return;

    update("largeBlob", { ...value.largeBlob, support: next as LargeBlobSupport });
  }
</script>

{#if inspection.state === "error"}
  <Alert.Root variant="warning" role="status">
    <Alert.Title>{m.lab_unknown()}</Alert.Title>
    <Alert.Description>{m.lab_inspection_failed()}</Alert.Description>
    <Alert.Action>
      <Button type="button" size="sm" variant="outline" onclick={onRetryInspection}>
        {m.lab_inspection_retry()}
      </Button>
    </Alert.Action>
  </Alert.Root>
{/if}

<div class="lab-extension-grid">
  <section class="lab-extension-group" aria-labelledby="lab-make-webauthn-extensions-title">
    <header class="lab-extension-group-header">
      <h3 id="lab-make-webauthn-extensions-title">{m.lab_webauthn_client_extensions()}</h3>
      <p>{m.lab_webauthn_client_extensions_description()}</p>
    </header>

    <LabExtensionItem
      value="largeBlob"
      title="largeBlob"
      description={m.lab_extension_large_blob_create_description()}
      included={value.largeBlob.included}
      {disabled}
      status={status(ExtensionIdentifier.ExtensionIdentifierLargeBlob)}
      onInclude={(included) => include("largeBlob", included, value.largeBlob)}
    >
      <Field.Field>
        <LabFieldLabel
          forId="lab-ext-large-blob-support"
          label={m.support_mode()}
          helpText={m.lab_large_blob_support_tooltip()}
          helpLabel={m.lab_option_help({ label: `largeBlob: ${m.support_mode()}` })}
        />
        <ToggleGroup.Root
          id="lab-ext-large-blob-support"
          type="single"
          value={value.largeBlob.support}
          onValueChange={changeLargeBlobSupport}
          variant="outline"
          size="sm"
          {disabled}
        >
          <ToggleGroup.Item value={LargeBlobSupport.LargeBlobSupportPreferred}>
            {m.lab_large_blob_preferred()}
          </ToggleGroup.Item>
          <ToggleGroup.Item value={LargeBlobSupport.LargeBlobSupportRequired}>
            {m.lab_large_blob_required()}
          </ToggleGroup.Item>
        </ToggleGroup.Root>
      </Field.Field>
    </LabExtensionItem>

    <LabExtensionItem
      value="payment"
      title="payment"
      description={m.lab_extension_payment_description()}
      included={value.payment.included}
      {disabled}
      status={status(ExtensionIdentifier.ExtensionIdentifierThirdPartyPayment)}
      onInclude={(included) => include("payment", included, value.payment)}
    />

    <LabExtensionItem
      value="credentialProperties"
      title="credProps"
      description={m.lab_extension_cred_props_description()}
      included={value.credentialProperties.included}
      {disabled}
      status="client-side"
      onInclude={(included) =>
        include("credentialProperties", included, value.credentialProperties)}
    />

    <LabExtensionItem
      value="prf"
      title="prf"
      description={m.lab_extension_prf_description()}
      included={value.prf.included}
      {disabled}
      status={status(ExtensionIdentifier.ExtensionIdentifierHMACSecret)}
      onInclude={(included) => include("prf", included, value.prf)}
    >
      <Field.Field orientation="horizontal">
        <LabFieldLabel
          forId="lab-ext-prf-evaluate"
          label={m.lab_prf_evaluation()}
          helpText={m.lab_prf_evaluation_tooltip()}
          helpLabel={m.lab_option_help({ label: `prf: ${m.lab_prf_evaluation()}` })}
        />
        <Switch
          id="lab-ext-prf-evaluate"
          checked={value.prf.useEval}
          {disabled}
          onCheckedChange={(useEval) => update("prf", { ...value.prf, useEval })}
        />
      </Field.Field>

      {#if value.prf.useEval}
        <LabPRFValuesEditor
          id="lab-ext-prf"
          value={value.prf.eval}
          {disabled}
          invalidFirst={hasError("make.extensions.prf.first")}
          invalidSecond={hasError("make.extensions.prf.second")}
          onChange={(evalValue) => update("prf", { ...value.prf, eval: evalValue })}
        />
      {/if}
    </LabExtensionItem>

    <LabExtensionItem
      value="previewSign"
      title="previewSign"
      description={m.lab_extension_preview_sign_create_description()}
      included={value.previewSign.included}
      {disabled}
      status={status(ExtensionIdentifier.ExtensionIdentifierPreviewSign)}
      onInclude={(included) => include("previewSign", included, value.previewSign)}
    >
      <LabAlgorithmEditor
        id="lab-ext-preview-sign-algorithms"
        values={value.previewSign.algorithms}
        {disabled}
        invalid={hasError("make.extensions.previewSign.algorithms")}
        onChange={(algorithms) => update("previewSign", { ...value.previewSign, algorithms })}
      />
    </LabExtensionItem>
  </section>

  <section class="lab-extension-group" aria-labelledby="lab-make-ctap-extensions-title">
    <header class="lab-extension-group-header">
      <h3 id="lab-make-ctap-extensions-title">{m.lab_ctap_extensions()}</h3>
      <p>{m.lab_ctap_extensions_description()}</p>
    </header>

    <LabExtensionItem
      value="credentialProtection"
      title="credProtect"
      description={m.lab_extension_cred_protect_description()}
      included={value.credentialProtection.included}
      {disabled}
      status={status(ExtensionIdentifier.ExtensionIdentifierCredentialProtection)}
      onInclude={(included) =>
        include("credentialProtection", included, value.credentialProtection)}
    >
      <Field.Field>
        <LabFieldLabel
          forId="lab-ext-cred-protect-policy"
          label={m.lab_policy()}
          helpText={m.lab_cred_protect_policy_tooltip()}
          helpLabel={m.lab_option_help({ label: `credProtect: ${m.lab_policy()}` })}
        />
        <Select.Root
          type="single"
          value={value.credentialProtection.policy}
          onValueChange={changePolicy}
        >
          <Select.Trigger id="lab-ext-cred-protect-policy" {disabled}>
            {policyLabel(value.credentialProtection.policy)}
          </Select.Trigger>
          <Select.Content>
            <Select.Group>
              <Select.Item
                value={CredentialProtectionPolicy.CredentialProtectionPolicyUserVerificationOptional}
                label="userVerificationOptional">userVerificationOptional</Select.Item
              >
              <Select.Item
                value={CredentialProtectionPolicy.CredentialProtectionPolicyUserVerificationOptionalWithCredentialIDList}
                label="userVerificationOptionalWithCredentialIDList"
                >userVerificationOptionalWithCredentialIDList</Select.Item
              >
              <Select.Item
                value={CredentialProtectionPolicy.CredentialProtectionPolicyUserVerificationRequired}
                label="userVerificationRequired">userVerificationRequired</Select.Item
              >
            </Select.Group>
          </Select.Content>
        </Select.Root>
      </Field.Field>

      <Field.Field orientation="horizontal">
        <LabFieldLabel
          forId="lab-ext-cred-protect-enforce"
          label={m.lab_enforce()}
          helpText={m.lab_cred_protect_enforce_tooltip()}
          helpLabel={m.lab_option_help({ label: `credProtect: ${m.lab_enforce()}` })}
        />
        <Switch
          id="lab-ext-cred-protect-enforce"
          checked={value.credentialProtection.enforce}
          {disabled}
          onCheckedChange={(enforce) =>
            update("credentialProtection", {
              ...value.credentialProtection,
              enforce,
            })}
        />
      </Field.Field>
    </LabExtensionItem>

    <LabExtensionItem
      value="credentialBlob"
      title="credBlob"
      description={m.lab_extension_cred_blob_create_description()}
      included={value.credentialBlob.included}
      {disabled}
      status={status(ExtensionIdentifier.ExtensionIdentifierCredentialBlob)}
      onInclude={(included) => include("credentialBlob", included, value.credentialBlob)}
    >
      <LabBinaryEditor
        id="lab-ext-cred-blob"
        label={m.lab_binary_value()}
        draft={value.credentialBlob.payload}
        {disabled}
        invalid={hasError("make.extensions.credBlob")}
        onChange={(payload) => update("credentialBlob", { ...value.credentialBlob, payload })}
      />
    </LabExtensionItem>

    <LabExtensionItem
      value="hmacSecret"
      title="hmac-secret"
      description={m.lab_extension_hmac_secret_create_description()}
      included={value.hmacSecret.included}
      {disabled}
      status={status(ExtensionIdentifier.ExtensionIdentifierHMACSecret)}
      onInclude={(included) => include("hmacSecret", included, value.hmacSecret)}
    >
      <Field.Field orientation="horizontal">
        <LabFieldLabel
          forId="lab-ext-hmac-create-requested"
          label={m.lab_enabled()}
          helpText={m.lab_hmac_secret_create_tooltip()}
          helpLabel={m.lab_option_help({ label: `hmac-secret: ${m.lab_enabled()}` })}
        />
        <Switch
          id="lab-ext-hmac-create-requested"
          checked={value.hmacSecret.value}
          {disabled}
          onCheckedChange={(requested) =>
            update("hmacSecret", {
              ...value.hmacSecret,
              value: requested,
            })}
        />
      </Field.Field>
    </LabExtensionItem>

    <LabExtensionItem
      value="hmacSecretMC"
      title="hmac-secret-mc"
      description={m.lab_extension_hmac_secret_mc_description()}
      included={value.hmacSecretMC.included}
      {disabled}
      status={status(ExtensionIdentifier.ExtensionIdentifierHMACSecretMC)}
      onInclude={(included) => include("hmacSecretMC", included, value.hmacSecretMC)}
    >
      <LabHMACEditor
        id="lab-ext-hmac-mc"
        value={value.hmacSecretMC}
        {disabled}
        invalidSalt1={hasError("make.extensions.hmacSecretMC.salt1")}
        invalidSalt2={hasError("make.extensions.hmacSecretMC.salt2")}
        onChange={(next) => update("hmacSecretMC", next)}
      />
    </LabExtensionItem>

    <LabExtensionItem
      value="minPINLength"
      title="minPinLength"
      description={m.lab_extension_min_pin_length_description()}
      included={value.minPINLength.included}
      {disabled}
      status={status(ExtensionIdentifier.ExtensionIdentifierMinPinLength)}
      onInclude={(included) => include("minPINLength", included, value.minPINLength)}
    >
      <Field.Field orientation="horizontal">
        <LabFieldLabel
          forId="lab-ext-min-pin-requested"
          label={m.lab_enabled()}
          helpText={m.lab_min_pin_length_tooltip()}
          helpLabel={m.lab_option_help({ label: `minPinLength: ${m.lab_enabled()}` })}
        />
        <Switch
          id="lab-ext-min-pin-requested"
          checked={value.minPINLength.value}
          {disabled}
          onCheckedChange={(requested) =>
            update("minPINLength", { ...value.minPINLength, value: requested })}
        />
      </Field.Field>
    </LabExtensionItem>

    <LabExtensionItem
      value="pinComplexityPolicy"
      title="pinComplexityPolicy"
      description={m.lab_extension_pin_complexity_policy_description()}
      included={value.pinComplexityPolicy.included}
      {disabled}
      status={status(ExtensionIdentifier.ExtensionIdentifierPinComplexityPolicy)}
      onInclude={(included) => include("pinComplexityPolicy", included, value.pinComplexityPolicy)}
    >
      <Field.Field orientation="horizontal">
        <LabFieldLabel
          forId="lab-ext-pin-complexity-requested"
          label={m.lab_enabled()}
          helpText={m.lab_pin_complexity_policy_tooltip()}
          helpLabel={m.lab_option_help({ label: `pinComplexityPolicy: ${m.lab_enabled()}` })}
        />
        <Switch
          id="lab-ext-pin-complexity-requested"
          checked={value.pinComplexityPolicy.value}
          {disabled}
          onCheckedChange={(requested) =>
            update("pinComplexityPolicy", {
              ...value.pinComplexityPolicy,
              value: requested,
            })}
        />
      </Field.Field>
    </LabExtensionItem>
  </section>
</div>

<style>
  @layer blocks {
    .lab-extension-group-header {
      display: grid;
      gap: var(--space-1);
      padding: var(--space-3);
    }

    .lab-extension-group-header h3,
    .lab-extension-group-header p {
      margin: 0;
    }

    .lab-extension-group-header h3 {
      color: var(--muted-foreground);
      font-size: 0.68rem;
      letter-spacing: 0.06em;
      text-transform: uppercase;
    }

    .lab-extension-group-header p {
      color: var(--muted-foreground);
      font-size: 0.7rem;
    }

    :global(.lab-extension-grid) {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: var(--space-3);
    }

    .lab-extension-group {
      display: contents;
    }

    .lab-extension-group-header {
      grid-column: 1 / -1;
    }
  }

  @container workspace (max-width: 44rem) {
    @layer blocks {
      :global(.lab-extension-grid) {
        grid-template-columns: minmax(0, 1fr);
      }
    }
  }
</style>
