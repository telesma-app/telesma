package service

import (
	"context"
	"errors"
	"strconv"

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
		return MDSLookupEnvelope{}, normalizeMDSError(err)
	}

	return MDSLookupEnvelope{Result: result}, nil
}

func normalizeMDSError(err error) error {
	switch {
	case errors.Is(err, mds.ErrInvalidAAGUID):
		return failure.Wrap(failure.CodeMDSAAGUIDInvalid, err, failure.WithPhase(failure.PhaseMetadata))
	case errors.Is(err, mds.ErrFetch):
		opts := []failure.Option{failure.WithPhase(failure.PhaseMetadata)}

		if statusErr, ok := errors.AsType[*mds.HTTPStatusError](err); ok {
			opts = append(opts, failure.WithParams(map[string]string{
				"httpStatus": strconv.Itoa(statusErr.StatusCode),
			}))
		}

		return failure.Wrap(failure.CodeMDSFetchFailed, err, opts...)
	case errors.Is(err, mds.ErrVerify):
		return failure.Wrap(failure.CodeMDSVerificationFailed, err, failure.WithPhase(failure.PhaseMetadata))
	default:
		return ctapkit.NormalizeError(err, failure.PhaseMetadata)
	}
}
