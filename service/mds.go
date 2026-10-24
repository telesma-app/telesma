package service

import (
	"context"
	"uuid"

	ctapkit "github.com/telesma-app/kit"
	"github.com/telesma-app/kit/model/failure"
	"github.com/telesma-app/mds"
)

func (s *Service) LookupMDS(ctx context.Context, req MDSLookupRequest) (MDSLookupEnvelope, error) {
	aaguid, err := uuid.Parse(req.AAGUID)
	if err != nil {
		return MDSLookupEnvelope{}, failure.Wrap(
			failure.CodeMDSAAGUIDInvalid,
			err,
			failure.WithPhase(failure.PhaseMetadata),
		)
	}

	client := &mds.Client{
		Source:   req.Source,
		CacheDir: req.CacheDir,
	}

	result, err := client.Lookup(ctx, aaguid, mds.LookupOptions{
		Refresh: req.Refresh,
	})
	if err != nil {
		return MDSLookupEnvelope{}, ctapkit.NormalizeError(err, failure.PhaseMetadata)
	}

	return MDSLookupEnvelope{
		Result: result,
		Error:  failure.Snapshot(ctapkit.NormalizeError(result.RefreshErr, failure.PhaseMetadata)),
	}, nil
}
