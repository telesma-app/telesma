package service

import (
	"encoding/hex"
	"testing"
	"uuid"

	"github.com/fxamacker/cbor/v2"
	ctapattestation "github.com/telesma-app/ctap/attestation"
	appwebauthn "github.com/telesma-app/kit/model/webauthn"
	mdsmodel "github.com/telesma-app/mds/model"
)

func TestAssessMakeCredentialAttestationMarksNoneNotApplicable(t *testing.T) {
	aaguid := uuid.MustParse("eabb46cc-e241-80bf-ae9e-96fa6d2975cf")
	raw, err := cbor.Marshal(ctapattestation.Object{
		Format:    ctapattestation.AttestationStatementFormatIdentifierNone,
		AuthData:  []byte{1},
		Statement: map[string]any{},
	})

	if err != nil {
		t.Fatalf("marshal attestation object: %v", err)
	}

	assessment := new(Service).AssessMakeCredentialAttestation(
		t.Context(),
		MakeCredentialAttestationAssessmentRequest{
			Result: appwebauthn.MakeCredentialResult{
				AAGUID:                   aaguid.String(),
				AttestationObjectCBORHex: hex.EncodeToString(raw),
			},
			Metadata: mdsmodel.LookupResult{
				AAGUID: aaguid,
				Found:  true,
				Entry:  &mdsmodel.PayloadEntry{AAGUID: aaguid},
			},
		},
	)

	if assessment.Status != mdsmodel.AttestationTrustStatusNotApplicable {
		t.Fatalf("status = %q, want not_applicable", assessment.Status)
	}
}

func TestAssessMakeCredentialAttestationRejectsMalformedEvidence(t *testing.T) {
	assessment := new(Service).AssessMakeCredentialAttestation(
		t.Context(),
		MakeCredentialAttestationAssessmentRequest{
			Result: appwebauthn.MakeCredentialResult{
				AAGUID:                   "invalid",
				AttestationObjectCBORHex: "invalid",
			},
		},
	)

	if assessment.Status != mdsmodel.AttestationTrustStatusUnavailable {
		t.Fatalf("status = %q, want unavailable", assessment.Status)
	}

	if len(assessment.Issues) != 1 ||
		assessment.Issues[0] != mdsmodel.AttestationTrustIssueEvidenceMalformed {
		t.Fatalf("issues = %v, want evidence_malformed", assessment.Issues)
	}
}

func TestAssessMakeCredentialAttestationRequiresVerifiedBasicStatement(t *testing.T) {
	aaguid := uuid.MustParse("eabb46cc-e241-80bf-ae9e-96fa6d2975cf")
	raw, err := cbor.Marshal(ctapattestation.Object{
		Format:   ctapattestation.AttestationStatementFormatIdentifierPacked,
		AuthData: []byte{1},
		Statement: map[string]any{
			"alg": int64(-7),
			"sig": []byte{1},
			"x5c": [][]byte{{1}},
		},
	})

	if err != nil {
		t.Fatalf("marshal attestation object: %v", err)
	}

	assessment := new(Service).AssessMakeCredentialAttestation(
		t.Context(),
		MakeCredentialAttestationAssessmentRequest{
			Result: appwebauthn.MakeCredentialResult{
				AAGUID:                   aaguid.String(),
				Format:                   ctapattestation.AttestationStatementFormatIdentifierPacked,
				AttestationObjectCBORHex: hex.EncodeToString(raw),
			},
		},
	)

	if assessment.Status != mdsmodel.AttestationTrustStatusUnavailable {
		t.Fatalf("status = %q, want unavailable", assessment.Status)
	}

	if len(assessment.Issues) != 1 ||
		assessment.Issues[0] != mdsmodel.AttestationTrustIssueEvidenceUnverified {
		t.Fatalf("issues = %v, want evidence_unverified", assessment.Issues)
	}
}
