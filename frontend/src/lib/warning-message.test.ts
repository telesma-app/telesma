import { afterEach, describe, expect, it } from "vitest";

import { Severity, Warning } from "../../bindings/github.com/telesma-app/kit/model/safety";

import { setAppLocale } from "$lib/i18n";

import { warningMessage } from "$lib/warning-message.js";

describe("warningMessage", () => {
  afterEach(() => setAppLocale("en"));

  it("localizes known ctapkit warning codes without exposing the code", () => {
    setAppLocale("ru");

    expect(
      warningMessage(
        new Warning({
          severity: Severity.SeverityWarning,
          code: "webauthn.make_credential.mutation",
          message: "backend fallback",
        }),
      ),
    ).toBe("На этом аутентификаторе может быть создан новый ключ доступа.");
  });

  it("preserves the ctapkit message for unknown future warning codes", () => {
    expect(
      warningMessage(
        new Warning({
          severity: Severity.SeverityWarning,
          code: "future.warning",
          message: "Future warning message",
        }),
      ),
    ).toBe("Future warning message");
  });

  it("localizes WebAuthn capability warnings while preserving execution semantics", () => {
    setAppLocale("ru");

    expect(
      warningMessage(
        new Warning({
          severity: Severity.SeverityWarning,
          code: "webauthn.extension.hmac_secret_mc.not_advertised",
          message: "backend fallback",
        }),
      ),
    ).toBe(
      "Аутентификатор не объявил hmac-secret-mc; отправка всё равно разрешена, а ответ устройства остаётся определяющим.",
    );

    expect(
      warningMessage(
        new Warning({
          severity: Severity.SeverityWarning,
          code: "webauthn.extension.prf.not_advertised",
          message: "prf is not advertised by this authenticator; execution is still allowed.",
        }),
      ),
    ).toBe(
      "Аутентификатор не объявил prf; отправка всё равно разрешена, а ответ устройства остаётся определяющим.",
    );

    expect(
      warningMessage(
        new Warning({
          severity: Severity.SeverityWarning,
          code: "webauthn.extension.preview_sign.not_advertised",
          message: "backend fallback",
        }),
      ),
    ).toBe(
      "Аутентификатор не объявил previewSign; отправка всё равно разрешена, а ответ устройства остаётся определяющим.",
    );
  });
});
