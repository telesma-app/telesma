<script lang="ts">
  import type {
    CredentialVerificationMaterial,
    GetAssertionPreview,
    GetAssertionResult as GetAssertionResultDTO,
    GetAssertionVerification,
  } from "../../../../bindings/github.com/telesma-app/kit/model/webauthn";

  import { Badge } from "$lib/components/ui/badge";
  import * as Tabs from "$lib/components/ui/tabs";
  import type { LabVerificationState } from "$lib/features/lab/state";
  import { base64ToHex, base64ToUTF8 } from "$lib/lab-input";
  import { sanitizedJson } from "$lib/redaction";

  import { m } from "../../../paraglide/messages.js";

  import LabHexValue from "$lib/components/lab/LabHexValue.svelte";
  import LabSecretValue from "$lib/components/lab/LabSecretValue.svelte";
  import LabTechnicalDataViewer, {
    type LabTechnicalDataItem,
  } from "$lib/components/lab/LabTechnicalDataViewer.svelte";
  import LabVerificationMaterialEditor from "$lib/components/lab/LabVerificationMaterialEditor.svelte";
  import LabVerificationRoute from "$lib/components/lab/LabVerificationRoute.svelte";

  type Props = {
    preview: GetAssertionPreview;
    result: GetAssertionResultDTO;
    verification?: LabVerificationState<GetAssertionVerification>;
    verificationMaterial?: CredentialVerificationMaterial[];
    onVerificationMaterialChange?: (entries: CredentialVerificationMaterial[]) => void;
    onRetryVerification?: () => void;
  };

  let {
    preview,
    result,
    verification = { phase: "idle" },
    verificationMaterial = [],
    onVerificationMaterialChange = () => undefined,
    onRetryVerification = () => undefined,
  }: Props = $props();

  let assertions = $derived(result.assertions ?? []);

  let selectedValue = $state("");

  let selectedAssertion = $derived(
    assertions.find((assertion) => String(assertion.index) === selectedValue) ?? assertions[0],
  );

  let clientExtensions = $derived(selectedAssertion?.extensionResults?.client);

  let authenticatorExtensions = $derived(selectedAssertion?.extensionResults?.authenticator);

  let hasWebAuthnOutputs = $derived(
    Boolean(clientExtensions?.prf || clientExtensions?.largeBlob || clientExtensions?.previewSign),
  );

  let hasCTAPOutputs = $derived(
    Boolean(
      clientExtensions?.getCredBlob ||
      clientExtensions?.["hmac-secret"] ||
      authenticatorExtensions?.thirdPartyPayment !== undefined,
    ),
  );

  let hasExtensionOutputs = $derived(hasWebAuthnOutputs || hasCTAPOutputs);

  let technicalDetails = $derived.by((): LabTechnicalDataItem[] => {
    if (!selectedAssertion) return [];

    const clientDataJSON = base64ToUTF8(preview.input.clientDataJSON);
    const resultJSON = sanitizedJson(result) ?? "null";

    const details: LabTechnicalDataItem[] = [
      {
        id: "client-data-json",
        label: m.lab_client_data(),
        syntax: "json",
        type: "UTF-8 JSON",
        byteCount: utf8ByteCount(clientDataJSON),
        source: clientDataJSON,
      },
      {
        id: "signature",
        label: m.lab_signature(),
        syntax: "hex",
        type: "signature",
        byteCount: hexByteCount(selectedAssertion.signatureHex),
        source: selectedAssertion.signatureHex,
      },
      {
        id: "authenticator-data",
        label: m.lab_authenticator_data(),
        syntax: "hex",
        type: "WebAuthn binary",
        byteCount: hexByteCount(selectedAssertion.authenticatorDataHex),
        source: selectedAssertion.authenticatorDataHex,
      },
    ];

    if (clientExtensions?.previewSign) {
      details.push({
        id: "preview-sign-signature",
        label: m.lab_preview_sign_signature(),
        syntax: "hex",
        type: "signature",
        byteCount: hexByteCount(clientExtensions.previewSign.signatureHex),
        source: clientExtensions.previewSign.signatureHex,
      });
    }

    details.push({
      id: "result",
      label: m.lab_result(),
      syntax: "json",
      type: "JSON",
      byteCount: utf8ByteCount(resultJSON),
      source: resultJSON,
    });

    return details;
  });

  function booleanLabel(value: boolean) {
    return value ? m.lab_true() : m.lab_false();
  }

  function nullableBooleanLabel(value: boolean | null | undefined) {
    return value === null || value === undefined ? m.lab_not_reported() : booleanLabel(value);
  }

  function hexByteCount(value: string) {
    return Math.floor(value.length / 2);
  }

  function utf8ByteCount(value: string) {
    return new TextEncoder().encode(value).byteLength;
  }

  function changeAssertion(next: string | string[]) {
    if (!Array.isArray(next)) selectedValue = next;
  }
</script>

<section class="lab-assertion-result" aria-labelledby="lab-assertion-result-title">
  <header class="lab-assertion-result-header">
    <h3 id="lab-assertion-result-title">{m.lab_assertion_result()}</h3>
    <Badge variant={assertions.length ? "secondary" : "outline"}>
      {m.lab_assertions_count({ count: assertions.length })}
    </Badge>
  </header>

  {#if !selectedAssertion}
    <p class="lab-no-assertions">{m.lab_no_assertions()}</p>
  {:else}
    {#if assertions.length > 1}
      <Tabs.Root
        value={selectedValue || String(selectedAssertion.index)}
        onValueChange={changeAssertion}
        class="lab-assertion-selector"
      >
        <Tabs.List aria-label={m.lab_assertion_result()}>
          {#each assertions as assertion (assertion.index)}
            <Tabs.Trigger value={String(assertion.index)}>
              {m.lab_assertion_heading({ index: assertion.index })}
            </Tabs.Trigger>
          {/each}
        </Tabs.List>
      </Tabs.Root>
    {/if}

    <dl class="lab-assertion-fields">
      <div class="lab-result-wide">
        <dt>{m.lab_credential_id()}</dt>
        <dd>
          <LabHexValue
            label={m.lab_credential_id()}
            value={base64ToHex(selectedAssertion.credential.id)}
          />
        </dd>
      </div>

      <div>
        <dt>{m.lab_user_id()}</dt>
        <dd>
          {#if selectedAssertion.user}
            <LabHexValue label={m.lab_user_id()} value={base64ToHex(selectedAssertion.user.id)} />
          {:else}
            {m.lab_not_reported()}
          {/if}
        </dd>
      </div>

      <div>
        <dt>{m.lab_number_of_credentials()}</dt>
        <dd>{selectedAssertion.numberOfCredentials ?? m.lab_not_reported()}</dd>
      </div>

      <div>
        <dt>{m.lab_user_selected()}</dt>
        <dd>
          <Badge variant="outline">{nullableBooleanLabel(selectedAssertion.userSelected)}</Badge>
        </dd>
      </div>

      <div>
        <dt>{m.lab_sign_count()}</dt>
        <dd>{selectedAssertion.signCount}</dd>
      </div>

      <div>
        <dt>{m.lab_user_present()}</dt>
        <dd><Badge variant="outline">{booleanLabel(selectedAssertion.userPresent)}</Badge></dd>
      </div>

      <div>
        <dt>{m.lab_user_verified()}</dt>
        <dd><Badge variant="outline">{booleanLabel(selectedAssertion.userVerified)}</Badge></dd>
      </div>
    </dl>

    <section class="lab-extension-results" aria-labelledby="lab-get-extension-results-title">
      <h4 id="lab-get-extension-results-title">{m.lab_extension_outputs()}</h4>

      {#if hasExtensionOutputs}
        {#if hasWebAuthnOutputs}
          <section
            class="lab-extension-result-group"
            aria-labelledby="lab-get-webauthn-outputs-title"
          >
            <h5 id="lab-get-webauthn-outputs-title">{m.lab_webauthn_extension_outputs()}</h5>

            <dl class="lab-extension-result-list">
              {#if clientExtensions?.prf}
                {#if clientExtensions.prf.results}
                  <div>
                    <dt>prf · first</dt>
                    <dd>
                      {#key clientExtensions.prf.results.first}<LabSecretValue
                          valueHex={base64ToHex(clientExtensions.prf.results.first)}
                        />{/key}
                    </dd>
                  </div>

                  {#if clientExtensions.prf.results.second !== undefined && clientExtensions.prf.results.second !== null}
                    <div>
                      <dt>prf · second</dt>
                      <dd>
                        {#key clientExtensions.prf.results.second}<LabSecretValue
                            valueHex={base64ToHex(clientExtensions.prf.results.second)}
                          />{/key}
                      </dd>
                    </div>
                  {/if}
                {:else}
                  <div>
                    <dt>prf · results</dt>
                    <dd>{m.lab_not_reported()}</dd>
                  </div>
                {/if}
              {/if}

              {#if clientExtensions?.largeBlob}
                {#if clientExtensions.largeBlob.blobHex !== undefined && clientExtensions.largeBlob.blobHex !== null}
                  <div>
                    <dt>largeBlob · blob</dt>
                    <dd>
                      <LabHexValue label="largeBlob" value={clientExtensions.largeBlob.blobHex} />
                    </dd>
                  </div>
                {/if}

                {#if clientExtensions.largeBlob.written !== undefined && clientExtensions.largeBlob.written !== null}
                  <div>
                    <dt>largeBlob · written</dt>
                    <dd>{booleanLabel(clientExtensions.largeBlob.written)}</dd>
                  </div>
                {/if}
              {/if}

              {#if clientExtensions?.previewSign}
                <div class="lab-result-wide">
                  <dt>previewSign · signature</dt>
                  <dd>
                    <LabHexValue
                      label={m.lab_preview_sign_signature()}
                      value={clientExtensions.previewSign.signatureHex}
                    />
                  </dd>
                </div>
              {/if}
            </dl>
          </section>
        {/if}

        {#if hasCTAPOutputs}
          <section class="lab-extension-result-group" aria-labelledby="lab-get-ctap-outputs-title">
            <h5 id="lab-get-ctap-outputs-title">{m.lab_ctap_extension_outputs()}</h5>

            <dl class="lab-extension-result-list">
              {#if clientExtensions?.getCredBlob}
                <div>
                  <dt>credBlob</dt>
                  <dd>
                    <LabHexValue label="credBlob" value={clientExtensions.getCredBlob.valueHex} />
                  </dd>
                </div>
              {/if}

              {#if clientExtensions?.["hmac-secret"]}
                <div>
                  <dt>hmac-secret · output1</dt>
                  <dd>
                    {#key clientExtensions["hmac-secret"].output1Hex}<LabSecretValue
                        valueHex={clientExtensions["hmac-secret"].output1Hex}
                      />{/key}
                  </dd>
                </div>

                {#if clientExtensions["hmac-secret"].output2Hex}
                  <div>
                    <dt>hmac-secret · output2</dt>
                    <dd>
                      {#key clientExtensions["hmac-secret"].output2Hex}<LabSecretValue
                          valueHex={clientExtensions["hmac-secret"].output2Hex}
                        />{/key}
                    </dd>
                  </div>
                {/if}
              {/if}

              {#if authenticatorExtensions?.thirdPartyPayment !== undefined && authenticatorExtensions.thirdPartyPayment !== null}
                <div>
                  <dt>thirdPartyPayment</dt>
                  <dd>{booleanLabel(authenticatorExtensions.thirdPartyPayment)}</dd>
                </div>
              {/if}
            </dl>
          </section>
        {/if}
      {:else}
        <p>{m.lab_no_extension_outputs()}</p>
      {/if}
    </section>

    <LabVerificationMaterialEditor
      entries={verificationMaterial}
      onChange={onVerificationMaterialChange}
    />

    <LabVerificationRoute mode="get" state={verification} {onRetryVerification} />

    <LabTechnicalDataViewer items={technicalDetails} />
  {/if}
</section>

<style>
  @layer blocks {
    .lab-assertion-result,
    .lab-extension-results,
    .lab-extension-result-group {
      display: grid;
      gap: var(--space-3);
      min-width: 0;
    }

    .lab-assertion-result-header {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-2);
    }

    .lab-assertion-result h3,
    .lab-assertion-result h4,
    .lab-assertion-result h5 {
      margin: 0;
      font-size: 0.9rem;
    }

    :global(.lab-assertion-selector [data-slot="tabs-list"]) {
      width: 100%;
    }

    .lab-no-assertions {
      margin: 0;
      padding: var(--space-4);
      border: 1px dashed var(--border);
      color: var(--muted-foreground);
      text-align: center;
    }

    .lab-assertion-fields,
    .lab-extension-result-list {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 1px;
      min-width: 0;
      margin: 0;
      overflow: hidden;
      border: 1px solid var(--border);
      background: var(--border);
    }

    .lab-assertion-fields > div,
    .lab-extension-result-list > div {
      display: grid;
      align-content: start;
      gap: var(--space-1);
      min-width: 0;
      padding: var(--space-3);
      background: var(--card);
    }

    .lab-assertion-fields dt,
    .lab-extension-result-list dt {
      color: var(--muted-foreground);
      font-size: 0.7rem;
    }

    .lab-assertion-fields dd,
    .lab-extension-result-list dd {
      min-width: 0;
      margin: 0;
      overflow-wrap: anywhere;
      font-size: 0.78rem;
    }

    .lab-result-wide {
      grid-column: 1 / -1;
    }

    .lab-extension-results > p {
      margin: 0;
      padding: var(--space-3);
      border: 1px dashed var(--border);
      color: var(--muted-foreground);
      font-size: 0.75rem;
    }

    @media (max-width: 42rem) {
      .lab-assertion-fields,
      .lab-extension-result-list {
        grid-template-columns: minmax(0, 1fr);
      }

      .lab-result-wide {
        grid-column: auto;
      }
    }
  }
</style>
