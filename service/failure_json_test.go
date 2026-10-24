package service

import (
	"context"
	"encoding/json"
	"errors"
	"github.com/telesma-app/kit/model/report"
	"testing"

	"github.com/telesma-app/kit/model/failure"
	"github.com/telesma-app/kit/model/operation"
)

func TestGetAssertionFailureEnvelopeExactJSON(t *testing.T) {
	err := failure.Wrap(
		failure.CodeAssertionNotAllowed,
		errors.New("authenticator rejected the CTAP operation in its current state"),
		failure.WithOperation(string(operation.GetAssertion)),
		failure.WithPhase(failure.PhaseAuthenticatorCommand),
		failure.WithCTAP(&failure.CTAPDetail{
			Command:     "authenticatorGetAssertion",
			CommandCode: 2,
			Status:      "CTAP2_ERR_NOT_ALLOWED",
			StatusCode:  48,
		}),
	)
	envelope := GetAssertionEnvelope{
		OperationEnvelopeMeta: OperationEnvelopeMeta{
			OperationID: "operation-1",
			SelectionID: "selection-1",
			Kind:        operation.GetAssertion,
			Error:       failure.Snapshot(err),
		},
	}

	raw, marshalErr := json.Marshal(envelope)
	if marshalErr != nil {
		t.Fatalf("Marshal: %v", marshalErr)
	}

	want := `{"operationId":"operation-1","selectionId":"selection-1","kind":"webauthn.getAssertion","authenticatorClosed":false,"error":{"code":"ASSERTION_NOT_ALLOWED","category":"invalid-state","operation":"webauthn.getAssertion","phase":"authenticator-command","ctap":{"command":"authenticatorGetAssertion","commandCode":2,"status":"CTAP2_ERR_NOT_ALLOWED","statusCode":48}}}`

	if string(raw) != want {
		t.Fatalf("JSON = %s, want %s", raw, want)
	}
}

func TestDirectServiceErrorIsTypedAndMachineReadable(t *testing.T) {
	service := New()

	err := service.SetSelection(context.Background(), SelectionRequest{DeviceID: report.DeviceID("missing-device")})
	if err == nil {
		t.Fatal("SetSelection error = nil, want failure")
	}

	var typed *failure.Error

	if !errors.As(err, &typed) {
		t.Fatalf("SetSelection error type = %T, want *failure.Error", err)
	}

	if !failure.IsCode(err, failure.CodeDeviceNotFound) {
		t.Fatalf("SetSelection error = %v, want %s", err, failure.CodeDeviceNotFound)
	}
}
