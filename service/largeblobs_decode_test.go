package service

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/telesma-app/kit/model/failure"
	"github.com/telesma-app/kit/model/largeblobs"
)

func TestDecodeLargeBlobSuccess(t *testing.T) {
	envelope := New().DecodeLargeBlob(context.Background(), LargeBlobDecodeRequest{
		RawHex: "68656c6c6f",
		Mode:   largeblobs.DecodeModeUTF8,
	})
	if envelope.Error != nil {
		t.Fatalf("DecodeLargeBlob envelope error = %#v", envelope.Error)
	}

	if envelope.Result == nil ||
		envelope.Result.Mode != largeblobs.DecodeModeUTF8 ||
		envelope.Result.Text != "hello" {
		t.Fatalf("DecodeLargeBlob result = %#v, want UTF-8 hello", envelope.Result)
	}
}

func TestDecodeLargeBlobInvalidHexUsesOnlyTypedInternalError(t *testing.T) {
	envelope := New().DecodeLargeBlob(context.Background(), LargeBlobDecodeRequest{
		RawHex: "not-hex",
		Mode:   largeblobs.DecodeModeUTF8,
	})
	if envelope.Result != nil {
		t.Fatalf("DecodeLargeBlob result = %#v, want nil", envelope.Result)
	}

	if envelope.Error == nil || envelope.Error.Code != failure.CodeInternalError {
		t.Fatalf("DecodeLargeBlob envelope error = %#v, want %s", envelope.Error, failure.CodeInternalError)
	}

	if envelope.Error.Phase != failure.PhaseDecode {
		t.Fatalf("DecodeLargeBlob failure phase = %q, want %q", envelope.Error.Phase, failure.PhaseDecode)
	}
}

func TestLargeBlobDecodeEnvelopeJSONUsesExclusiveResultOrError(t *testing.T) {
	tests := []struct {
		name     string
		envelope LargeBlobDecodeEnvelope
		want     string
	}{
		{
			name: "result",
			envelope: LargeBlobDecodeEnvelope{
				Result: &largeblobs.DecodeResult{
					Mode: largeblobs.DecodeModeUTF8,
					Text: "hello",
				},
			},
			want: `{"result":{"mode":"utf8","text":"hello"}}`,
		},
		{
			name: "error",
			envelope: LargeBlobDecodeEnvelope{
				Error: failure.Snapshot(failure.New(
					failure.CodeInternalError,
					failure.WithPhase(failure.PhaseDecode),
				)),
			},
			want: `{"error":{"code":"INTERNAL_ERROR","category":"internal","phase":"decode"}}`,
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			raw, err := json.Marshal(test.envelope)
			if err != nil {
				t.Fatalf("Marshal: %v", err)
			}

			if string(raw) != test.want {
				t.Fatalf("JSON = %s, want %s", raw, test.want)
			}
		})
	}
}
