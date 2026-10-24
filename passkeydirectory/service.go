package passkeydirectory

import (
	"bytes"
	"context"
	_ "embed"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/ProtonMail/go-crypto/openpgp"
	"golang.org/x/net/publicsuffix"

	"telesma/internal/atomicfile"
)

const (
	defaultSource = "https://passkeys-api.2fa.directory/v1/supported.json.sig"
	cacheFile     = "supported-v1.json"

	refreshInterval = 72 * time.Hour
	requestTimeout  = 10 * time.Second
	maxSignedBytes  = 2 << 20
	maxPayloadBytes = 2 << 20
	maxCacheBytes   = maxSignedBytes*4/3 + 4096

	trustedKeyFingerprint = "0D504141CE290061BD4F95A4AD8483C1CBABC36D"
)

//go:embed trusted-key.asc
var trustedKey []byte

type directoryEntry struct {
	AdditionalDomains []string            `json:"additional-domains"`
	Passwordless      *PasskeySupportMode `json:"passwordless"`
	MFA               *PasskeySupportMode `json:"mfa"`
	Documentation     string              `json:"documentation"`
	Recovery          string              `json:"recovery"`
	Notes             string              `json:"notes"`
}

type indexedEntry struct {
	canonicalDomain string
	directoryEntry
}

type catalog map[string]indexedEntry

type cacheRecord struct {
	ETag          string    `json:"etag,omitempty"`
	LastModified  string    `json:"lastModified,omitempty"`
	ValidatedAt   time.Time `json:"validatedAt"`
	SignedMessage []byte    `json:"signedMessage"`
}

type snapshot struct {
	record  cacheRecord
	catalog catalog
}

type Service struct {
	mu sync.Mutex

	source       string
	httpClient   *http.Client
	cachePath    string
	cachePathErr error
	now          func() time.Time
	keyring      openpgp.EntityList

	loaded  bool
	current *snapshot
}

func NewService() *Service {
	path, err := defaultCachePath()

	return &Service{
		source:       defaultSource,
		httpClient:   &http.Client{Timeout: requestTimeout},
		cachePath:    path,
		cachePathErr: err,
		now:          time.Now,
		keyring:      mustTrustedKeyring(),
	}
}

func (s *Service) ServiceName() string {
	return "PasskeyDirectoryService"
}

func (s *Service) LookupPasskeyDirectory(
	ctx context.Context,
	req PasskeyDirectoryLookupRequest,
) (PasskeyDirectoryLookupResult, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	current, err := s.resolveCatalog(ctx)
	if err != nil {
		return PasskeyDirectoryLookupResult{}, err
	}

	return lookupResult(current.catalog, req.RPIDs), nil
}

func (s *Service) resolveCatalog(ctx context.Context) (*snapshot, error) {
	if s.cachePathErr != nil {
		return nil, s.cachePathErr
	}

	var loadErr error

	if !s.loaded {
		s.current, loadErr = s.loadCache()
		s.loaded = true
	}

	now := s.now()

	if s.current != nil && cacheFresh(s.current.record.ValidatedAt, now) {
		return s.current, nil
	}

	refreshed, err := s.refresh(ctx, s.current, now)
	if err == nil {
		s.current = refreshed

		return refreshed, nil
	}

	if loadErr != nil {
		return nil, fmt.Errorf("load Passkey Directory cache: %v; refresh: %w", loadErr, err)
	}

	return nil, err
}

func (s *Service) refresh(
	ctx context.Context,
	current *snapshot,
	now time.Time,
) (*snapshot, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, s.source, nil)
	if err != nil {
		return nil, err
	}

	if current != nil {
		if current.record.ETag != "" {
			req.Header.Set("If-None-Match", current.record.ETag)
		}

		if current.record.LastModified != "" {
			req.Header.Set("If-Modified-Since", current.record.LastModified)
		}
	}

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("fetch Passkey Directory dataset: %w", err)
	}

	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode == http.StatusNotModified {
		if current == nil {
			return nil, errors.New("passkey directory returned 304 without a verified cache")
		}

		updated := *current
		updated.record.ValidatedAt = now
		updated.record.ETag = responseHeader(resp, "ETag", current.record.ETag)
		updated.record.LastModified = responseHeader(
			resp,
			"Last-Modified",
			current.record.LastModified,
		)

		if err := s.storeCache(updated.record); err != nil {
			return nil, fmt.Errorf("store Passkey Directory cache: %w", err)
		}

		return &updated, nil
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("fetch Passkey Directory dataset: HTTP status %d", resp.StatusCode)
	}

	signedMessage, err := readLimited(resp.Body, maxSignedBytes)
	if err != nil {
		return nil, fmt.Errorf("read Passkey Directory dataset: %w", err)
	}

	index, err := verifyAndIndex(signedMessage, s.keyring)
	if err != nil {
		return nil, err
	}

	record := cacheRecord{
		ETag:          resp.Header.Get("ETag"),
		LastModified:  resp.Header.Get("Last-Modified"),
		ValidatedAt:   now,
		SignedMessage: signedMessage,
	}

	if err := s.storeCache(record); err != nil {
		return nil, fmt.Errorf("store Passkey Directory cache: %w", err)
	}

	return &snapshot{record: record, catalog: index}, nil
}

func (s *Service) loadCache() (*snapshot, error) {
	file, err := os.Open(s.cachePath)

	if errors.Is(err, os.ErrNotExist) {
		return nil, nil
	}

	if err != nil {
		return nil, err
	}

	defer func() { _ = file.Close() }()

	data, err := readLimited(file, maxCacheBytes)
	if err != nil {
		return nil, err
	}

	var record cacheRecord

	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()

	if err := decoder.Decode(&record); err != nil {
		return nil, err
	}

	if err := requireJSONEOF(decoder); err != nil {
		return nil, err
	}

	if record.ValidatedAt.IsZero() || len(record.SignedMessage) == 0 {
		return nil, errors.New("incomplete Passkey Directory cache")
	}

	index, err := verifyAndIndex(record.SignedMessage, s.keyring)
	if err != nil {
		return nil, err
	}

	return &snapshot{record: record, catalog: index}, nil
}

func (s *Service) storeCache(record cacheRecord) error {
	data, err := json.Marshal(record)
	if err != nil {
		return err
	}

	return atomicfile.WriteFile(s.cachePath, data, 0o600, 0o700)
}

func defaultCachePath() (string, error) {
	dir, err := os.UserCacheDir()
	if err != nil {
		return "", err
	}

	return filepath.Join(dir, "Telesma", "passkey-directory", cacheFile), nil
}

func mustTrustedKeyring() openpgp.EntityList {
	keyring, err := openpgp.ReadArmoredKeyRing(bytes.NewReader(trustedKey))
	if err != nil {
		panic(fmt.Sprintf("parse embedded Passkey Directory key: %v", err))
	}

	if len(keyring) != 1 {
		panic(fmt.Sprintf("embedded Passkey Directory keyring contains %d keys", len(keyring)))
	}

	fingerprint := strings.ToUpper(hex.EncodeToString(keyring[0].PrimaryKey.Fingerprint[:]))

	if fingerprint != trustedKeyFingerprint {
		panic(fmt.Sprintf("embedded Passkey Directory key fingerprint is %s", fingerprint))
	}

	return keyring
}

func verifyAndIndex(
	signedMessage []byte,
	keyring openpgp.EntityList,
) (catalog, error) {
	if len(signedMessage) > maxSignedBytes {
		return nil, fmt.Errorf("signed Passkey Directory dataset exceeds %d bytes", maxSignedBytes)
	}

	message, err := openpgp.ReadMessage(bytes.NewReader(signedMessage), keyring, nil, nil)
	if err != nil {
		return nil, fmt.Errorf("parse signed Passkey Directory dataset: %w", err)
	}

	if !message.IsSigned || message.SignedBy == nil {
		return nil, errors.New("passkey directory dataset is not signed by a trusted key")
	}

	payload, err := readLimited(message.UnverifiedBody, maxPayloadBytes)
	if err != nil {
		return nil, fmt.Errorf("read signed Passkey Directory payload: %w", err)
	}

	if message.SignatureError != nil {
		return nil, fmt.Errorf("verify Passkey Directory signature: %w", message.SignatureError)
	}

	index, err := parseCatalog(payload)
	if err != nil {
		return nil, fmt.Errorf("parse Passkey Directory payload: %w", err)
	}

	return index, nil
}

func parseCatalog(payload []byte) (catalog, error) {
	var entries map[string]directoryEntry

	decoder := json.NewDecoder(bytes.NewReader(payload))

	if err := decoder.Decode(&entries); err != nil {
		return nil, err
	}

	if err := requireJSONEOF(decoder); err != nil {
		return nil, err
	}

	if len(entries) == 0 {
		return nil, errors.New("passkey directory dataset is empty")
	}

	index := make(catalog, len(entries))

	for domain, entry := range entries {
		canonicalDomain := normalizeDomain(domain)

		if canonicalDomain == "" {
			return nil, errors.New("passkey directory entry has an empty domain")
		}

		if err := validateEntry(canonicalDomain, entry); err != nil {
			return nil, err
		}

		entry.Documentation = httpsURL(entry.Documentation)
		entry.Recovery = httpsURL(entry.Recovery)

		indexed := indexedEntry{canonicalDomain: canonicalDomain, directoryEntry: entry}

		if err := addDomain(index, canonicalDomain, indexed); err != nil {
			return nil, err
		}

		for _, additional := range entry.AdditionalDomains {
			normalized := normalizeDomain(additional)

			if normalized == "" {
				return nil, fmt.Errorf("passkey directory entry %q has an empty additional domain", domain)
			}

			if err := addDomain(index, normalized, indexed); err != nil {
				return nil, err
			}
		}
	}

	return index, nil
}

func validateEntry(domain string, entry directoryEntry) error {
	for name, mode := range map[string]*PasskeySupportMode{
		"passwordless": entry.Passwordless,
		"mfa":          entry.MFA,
	} {
		if mode == nil {
			continue
		}

		if *mode != PasskeySupportModeAllowed && *mode != PasskeySupportModeRequired {
			return fmt.Errorf("passkey directory entry %q has invalid %s mode %q", domain, name, *mode)
		}
	}

	return nil
}

func httpsURL(raw string) string {
	parsed, err := url.Parse(raw)

	if err != nil || parsed.Scheme != "https" || parsed.Host == "" {
		return ""
	}

	return raw
}

func addDomain(index catalog, domain string, entry indexedEntry) error {
	if existing, present := index[domain]; present && existing.canonicalDomain != entry.canonicalDomain {
		return fmt.Errorf(
			"passkey directory domain %q maps to both %q and %q",
			domain,
			existing.canonicalDomain,
			entry.canonicalDomain,
		)
	}

	index[domain] = entry

	return nil
}

func lookupResult(index catalog, rpIDs []string) PasskeyDirectoryLookupResult {
	matches := make([]PasskeyDirectoryMatch, 0, len(rpIDs))
	seen := make(map[string]struct{}, len(rpIDs))

	for _, rpID := range rpIDs {
		normalized := normalizeDomain(rpID)

		if normalized == "" {
			continue
		}

		if _, present := seen[normalized]; present {
			continue
		}

		seen[normalized] = struct{}{}
		entry, found := lookupCatalogEntry(index, normalized)

		if !found {
			continue
		}

		matches = append(matches, PasskeyDirectoryMatch{
			RPID:            rpID,
			CanonicalDomain: entry.canonicalDomain,
			Passwordless:    entry.Passwordless,
			MFA:             entry.MFA,
			Documentation:   entry.Documentation,
			Recovery:        entry.Recovery,
			Notes:           entry.Notes,
		})
	}

	return PasskeyDirectoryLookupResult{
		Matches: matches,
	}
}

func lookupCatalogEntry(index catalog, domain string) (indexedEntry, bool) {
	if entry, found := index[domain]; found {
		return entry, true
	}

	if net.ParseIP(domain) != nil {
		return indexedEntry{}, false
	}

	registrableDomain, err := publicsuffix.EffectiveTLDPlusOne(domain)

	if err != nil || registrableDomain == domain {
		return indexedEntry{}, false
	}

	parent := domain

	for parent != registrableDomain {
		_, nextParent, found := strings.Cut(parent, ".")

		if !found {
			return indexedEntry{}, false
		}

		parent = nextParent

		if entry, present := index[parent]; present {
			return entry, true
		}
	}

	return indexedEntry{}, false
}

func normalizeDomain(value string) string {
	return strings.TrimSuffix(strings.ToLower(strings.TrimSpace(value)), ".")
}

func cacheFresh(validatedAt, now time.Time) bool {
	return !validatedAt.After(now) && now.Before(validatedAt.Add(refreshInterval))
}

func responseHeader(resp *http.Response, name, fallback string) string {
	value := resp.Header.Get(name)

	if value == "" {
		return fallback
	}

	return value
}

func readLimited(reader io.Reader, limit int64) ([]byte, error) {
	data, err := io.ReadAll(io.LimitReader(reader, limit+1))
	if err != nil {
		return nil, err
	}

	if int64(len(data)) > limit {
		return nil, fmt.Errorf("data exceeds %d bytes", limit)
	}

	return data, nil
}

func requireJSONEOF(decoder *json.Decoder) error {
	var extra any

	err := decoder.Decode(&extra)

	if errors.Is(err, io.EOF) {
		return nil
	}

	if err != nil {
		return err
	}

	return errors.New("unexpected data after JSON value")
}
