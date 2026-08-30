package service

import (
	"context"

	ctapkit "github.com/telesma-app/kit"
	appwebauthn "github.com/telesma-app/kit/model/webauthn"
)

type DerivePreviewSignARKGP256Request struct {
	GeneratedKey appwebauthn.PreviewSignGeneratedKey `json:"generatedKey"`
	Context      string                              `json:"context"`
}

func (s *Service) DerivePreviewSignARKGP256(
	_ context.Context,
	req DerivePreviewSignARKGP256Request,
) (appwebauthn.PreviewSignARKGP256Derivation, error) {
	return ctapkit.DerivePreviewSignARKGP256(req.GeneratedKey, []byte(req.Context))
}
