package passkeydirectory

import (
	"bytes"
	"context"
	"crypto"
	"encoding/hex"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/ProtonMail/go-crypto/openpgp"
	"github.com/ProtonMail/go-crypto/openpgp/packet"
)

const testDataset = `{
  "example.com": {
    "additional-domains": ["login.example.com"],
    "passwordless": "allowed",
    "mfa": "required",
    "documentation": "https://example.com/passkeys",
    "recovery": "https://example.com/recovery",
    "notes": "Passkeys are available after enrollment."
  }
}`

func TestTrustedKeyFingerprint(t *testing.T) {
	keyring := mustTrustedKeyring()
	fingerprint := entityFingerprint(keyring[0])

	if fingerprint != trustedKeyFingerprint {
		t.Fatalf("trusted key fingerprint = %q, want %q", fingerprint, trustedKeyFingerprint)
	}
}

func TestSignedDatasetVerificationAndExactLookup(t *testing.T) {
	entity := testEntity(t)
	signed := signPayload(t, entity, testDataset)

	index, err := verifyAndIndex(signed, openpgp.EntityList{entity})
	if err != nil {
		t.Fatalf("verify signed dataset: %v", err)
	}

	result := lookupResult(
		index,
		[]string{"Example.COM.", "login.example.com", "example.com"},
	)

	if len(result.Matches) != 2 {
		t.Fatalf("matches = %#v, want primary and additional domain", result.Matches)
	}

	primary := result.Matches[0]

	if primary.RPID != "Example.COM." || primary.CanonicalDomain != "example.com" {
		t.Fatalf("primary match = %#v", primary)
	}

	if primary.Passwordless == nil || *primary.Passwordless != PasskeySupportModeAllowed {
		t.Fatalf("passwordless = %#v, want allowed", primary.Passwordless)
	}

	if primary.MFA == nil || *primary.MFA != PasskeySupportModeRequired {
		t.Fatalf("mfa = %#v, want required", primary.MFA)
	}

	if result.Matches[1].CanonicalDomain != "example.com" {
		t.Fatalf("additional-domain match = %#v", result.Matches[1])
	}
}

func TestLookupFallsBackToDeclaredParentsWithinRegistrableDomain(t *testing.T) {
	index, err := parseCatalog([]byte(`{
  "bitwarden.com": {"notes": "registrable parent"},
  "vault.bitwarden.com": {"notes": "exact"},
  "example.co.uk": {"notes": "registrable parent"},
  "login.example.co.uk": {"notes": "nearest parent"},
  "signin.example.net": {"notes": "sibling"},
  "github.io": {"notes": "private suffix"},
  "0.1": {"notes": "IP suffix"}
}`))
	if err != nil {
		t.Fatalf("parse catalog: %v", err)
	}

	result := lookupResult(index, []string{
		"vault.bitwarden.com",
		"storage.bitwarden.com",
		"a.login.example.co.uk",
		"shop.example.co.uk",
		"vault.example.net",
		"alice.github.io",
		"127.0.0.1",
	})

	if len(result.Matches) != 4 {
		t.Fatalf("matches = %#v, want exact and bounded parent matches", result.Matches)
	}

	want := []struct {
		rpID      string
		canonical string
		notes     string
	}{
		{"vault.bitwarden.com", "vault.bitwarden.com", "exact"},
		{"storage.bitwarden.com", "bitwarden.com", "registrable parent"},
		{"a.login.example.co.uk", "login.example.co.uk", "nearest parent"},
		{"shop.example.co.uk", "example.co.uk", "registrable parent"},
	}

	for i, expected := range want {
		match := result.Matches[i]

		if match.RPID != expected.rpID ||
			match.CanonicalDomain != expected.canonical ||
			match.Notes != expected.notes {
			t.Fatalf("match %d = %#v, want %#v", i, match, expected)
		}
	}
}

func TestSignedDatasetRejectsWrongKeyTamperingAndMalformedPayload(t *testing.T) {
	entity := testEntity(t)
	signed := signPayload(t, entity, testDataset)
	other := testEntity(t)

	tests := map[string]struct {
		message []byte
		keyring openpgp.EntityList
	}{
		"wrong key": {
			message: signed,
			keyring: openpgp.EntityList{other},
		},
		"truncated message": {
			message: signed[:len(signed)-8],
			keyring: openpgp.EntityList{entity},
		},
		"tampered message": {
			message: bytes.Replace(
				signed,
				[]byte("example.com"),
				[]byte("example.net"),
				1,
			),
			keyring: openpgp.EntityList{entity},
		},
		"malformed payload": {
			message: signPayload(t, entity, `{`),
			keyring: openpgp.EntityList{entity},
		},
	}

	for name, test := range tests {
		t.Run(name, func(t *testing.T) {
			if _, err := verifyAndIndex(test.message, test.keyring); err == nil {
				t.Fatal("verification succeeded")
			}
		})
	}
}

func TestCatalogOmitsNonHTTPSLinks(t *testing.T) {
	index, err := parseCatalog([]byte(`{
  "example.com": {
    "documentation": "http://example.com/passkeys",
    "recovery": "javascript:alert(1)"
  }
}`))
	if err != nil {
		t.Fatalf("parse catalog: %v", err)
	}

	entry := index["example.com"]

	if entry.Documentation != "" || entry.Recovery != "" {
		t.Fatalf("unsafe links were retained: %#v", entry)
	}
}

func TestCacheFreshRejectsFutureValidationTime(t *testing.T) {
	now := time.Date(2026, time.August, 17, 0, 0, 0, 0, time.UTC)

	if cacheFresh(now.Add(time.Minute), now) {
		t.Fatal("cache validated in the future is fresh")
	}
}

func TestLookupCachesAndConditionallyRefreshes(t *testing.T) {
	entity := testEntity(t)
	signed := signPayload(t, entity, testDataset)

	var calls atomic.Int32

	var conditional atomic.Bool

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		call := calls.Add(1)

		if call > 1 &&
			r.Header.Get("If-None-Match") == `"dataset-1"` &&
			r.Header.Get("If-Modified-Since") == "Sun, 16 Aug 2026 00:00:00 GMT" {
			conditional.Store(true)
		}

		switch call {
		case 1:
			w.Header().Set("ETag", `"dataset-1"`)
			w.Header().Set("Last-Modified", "Sun, 16 Aug 2026 00:00:00 GMT")
			_, _ = w.Write(signed)
		case 2:
			w.WriteHeader(http.StatusNotModified)
		default:
			http.Error(w, "unavailable", http.StatusServiceUnavailable)
		}
	}))
	defer server.Close()

	now := time.Date(2026, time.August, 17, 0, 0, 0, 0, time.UTC)
	path := filepath.Join(t.TempDir(), cacheFile)
	service := testService(server, path, &now, entity)

	first, err := service.LookupPasskeyDirectory(
		context.Background(),
		PasskeyDirectoryLookupRequest{RPIDs: []string{"example.com"}},
	)
	if err != nil {
		t.Fatalf("initial lookup: %v", err)
	}

	if len(first.Matches) != 1 || calls.Load() != 1 {
		t.Fatalf("initial result = %#v, calls = %d", first, calls.Load())
	}

	if _, err := service.LookupPasskeyDirectory(
		context.Background(),
		PasskeyDirectoryLookupRequest{RPIDs: []string{"example.com"}},
	); err != nil {
		t.Fatalf("fresh cached lookup: %v", err)
	}

	if calls.Load() != 1 {
		t.Fatalf("fresh cache caused %d HTTP calls, want 1", calls.Load())
	}

	now = now.Add(refreshInterval + time.Minute)

	revalidated, err := service.LookupPasskeyDirectory(
		context.Background(),
		PasskeyDirectoryLookupRequest{RPIDs: []string{"example.com"}},
	)
	if err != nil {
		t.Fatalf("conditional lookup: %v", err)
	}

	if len(revalidated.Matches) != 1 ||
		service.current.record.ValidatedAt != now ||
		!conditional.Load() ||
		calls.Load() != 2 {
		t.Fatalf("conditional result = %#v, conditional = %v", revalidated, conditional.Load())
	}

	now = now.Add(refreshInterval + time.Minute)

	_, err = service.LookupPasskeyDirectory(
		context.Background(),
		PasskeyDirectoryLookupRequest{RPIDs: []string{"example.com"}},
	)
	if err == nil {
		t.Fatal("expired cache lookup succeeded after refresh failure")
	}

	if calls.Load() != 3 {
		t.Fatalf("HTTP calls = %d, want 3", calls.Load())
	}

	restarted := testService(server, path, &now, entity)

	_, err = restarted.LookupPasskeyDirectory(
		context.Background(),
		PasskeyDirectoryLookupRequest{RPIDs: []string{"example.com"}},
	)
	if err == nil {
		t.Fatal("restarted service used an expired cache after refresh failure")
	}

	if calls.Load() != 4 {
		t.Fatalf("HTTP calls = %d, want 4", calls.Load())
	}
}

func TestInvalidRefreshRejectsExpiredCache(t *testing.T) {
	entity := testEntity(t)
	valid := signPayload(t, entity, testDataset)
	other := testEntity(t)
	invalid := signPayload(t, other, testDataset)

	var calls atomic.Int32

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		if calls.Add(1) == 1 {
			_, _ = w.Write(valid)

			return
		}

		_, _ = w.Write(invalid)
	}))
	defer server.Close()

	now := time.Date(2026, time.August, 17, 0, 0, 0, 0, time.UTC)
	service := testService(server, filepath.Join(t.TempDir(), cacheFile), &now, entity)

	if _, err := service.LookupPasskeyDirectory(
		context.Background(),
		PasskeyDirectoryLookupRequest{RPIDs: []string{"example.com"}},
	); err != nil {
		t.Fatalf("seed verified cache: %v", err)
	}

	now = now.Add(refreshInterval + time.Minute)

	_, err := service.LookupPasskeyDirectory(
		context.Background(),
		PasskeyDirectoryLookupRequest{RPIDs: []string{"example.com"}},
	)
	if err == nil {
		t.Fatal("expired cache lookup succeeded after invalid refresh")
	}

	if calls.Load() != 2 {
		t.Fatalf("HTTP calls = %d, want 2", calls.Load())
	}
}

func TestValidRefreshReplacesVerifiedCache(t *testing.T) {
	entity := testEntity(t)
	initial := signPayload(t, entity, testDataset)
	replacement := signPayload(t, entity, `{
  "replacement.example": {
    "passwordless": "required"
  }
}`)

	var calls atomic.Int32

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		if calls.Add(1) == 1 {
			w.Header().Set("ETag", `"initial"`)
			_, _ = w.Write(initial)

			return
		}

		w.Header().Set("ETag", `"replacement"`)
		_, _ = w.Write(replacement)
	}))
	defer server.Close()

	now := time.Date(2026, time.August, 17, 0, 0, 0, 0, time.UTC)
	path := filepath.Join(t.TempDir(), cacheFile)
	service := testService(server, path, &now, entity)

	if _, err := service.LookupPasskeyDirectory(
		context.Background(),
		PasskeyDirectoryLookupRequest{RPIDs: []string{"example.com"}},
	); err != nil {
		t.Fatalf("seed cache: %v", err)
	}

	now = now.Add(refreshInterval + time.Minute)

	result, err := service.LookupPasskeyDirectory(
		context.Background(),
		PasskeyDirectoryLookupRequest{RPIDs: []string{"example.com", "replacement.example"}},
	)
	if err != nil {
		t.Fatalf("refresh cache: %v", err)
	}

	if len(result.Matches) != 1 || result.Matches[0].RPID != "replacement.example" {
		t.Fatalf("replacement result = %#v", result)
	}

	restarted := testService(server, path, &now, entity)
	restartedResult, err := restarted.LookupPasskeyDirectory(
		context.Background(),
		PasskeyDirectoryLookupRequest{RPIDs: []string{"replacement.example"}},
	)

	if err != nil || len(restartedResult.Matches) != 1 || calls.Load() != 2 {
		t.Fatalf("restarted replacement = %#v, err = %v, calls = %d", restartedResult, err, calls.Load())
	}
}

func TestLookupWithoutVerifiedCacheReturnsRefreshFailures(t *testing.T) {
	entity := testEntity(t)

	tests := map[string]func(http.ResponseWriter, *http.Request){
		"HTTP status": func(w http.ResponseWriter, _ *http.Request) {
			http.Error(w, "unavailable", http.StatusServiceUnavailable)
		},
		"oversized response": func(w http.ResponseWriter, _ *http.Request) {
			_, _ = w.Write(bytes.Repeat([]byte("x"), maxSignedBytes+1))
		},
		"invalid signature": func(w http.ResponseWriter, _ *http.Request) {
			_, _ = w.Write([]byte("not a signed message"))
		},
	}

	for name, handler := range tests {
		t.Run(name, func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(handler))
			defer server.Close()

			now := time.Date(2026, time.August, 17, 0, 0, 0, 0, time.UTC)
			service := testService(server, filepath.Join(t.TempDir(), cacheFile), &now, entity)

			_, err := service.LookupPasskeyDirectory(
				context.Background(),
				PasskeyDirectoryLookupRequest{RPIDs: []string{"example.com"}},
			)
			if err == nil {
				t.Fatal("lookup succeeded")
			}
		})
	}
}

func TestLookupHonorsHTTPTimeout(t *testing.T) {
	entity := testEntity(t)

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		time.Sleep(100 * time.Millisecond)

		_, _ = w.Write(signPayload(t, entity, testDataset))
	}))
	defer server.Close()

	now := time.Date(2026, time.August, 17, 0, 0, 0, 0, time.UTC)
	service := testService(server, filepath.Join(t.TempDir(), cacheFile), &now, entity)
	service.httpClient.Timeout = 10 * time.Millisecond

	if _, err := service.LookupPasskeyDirectory(
		context.Background(),
		PasskeyDirectoryLookupRequest{RPIDs: []string{"example.com"}},
	); err == nil {
		t.Fatal("timed-out lookup succeeded")
	}
}

func TestConcurrentLookupsShareRefresh(t *testing.T) {
	entity := testEntity(t)
	signed := signPayload(t, entity, testDataset)

	var calls atomic.Int32

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		calls.Add(1)

		_, _ = w.Write(signed)
	}))
	defer server.Close()

	now := time.Date(2026, time.August, 17, 0, 0, 0, 0, time.UTC)
	service := testService(server, filepath.Join(t.TempDir(), cacheFile), &now, entity)
	start := make(chan struct{})
	errorsByCall := make(chan error, 8)

	var wait sync.WaitGroup

	for range 8 {
		wait.Add(1)

		go func() {
			defer wait.Done()

			<-start

			_, err := service.LookupPasskeyDirectory(
				context.Background(),
				PasskeyDirectoryLookupRequest{RPIDs: []string{"example.com"}},
			)
			errorsByCall <- err
		}()
	}

	close(start)
	wait.Wait()
	close(errorsByCall)

	for err := range errorsByCall {
		if err != nil {
			t.Fatalf("concurrent lookup: %v", err)
		}
	}

	if calls.Load() != 1 {
		t.Fatalf("HTTP calls = %d, want 1", calls.Load())
	}
}

func TestMalformedCacheIsReplacedByVerifiedRefresh(t *testing.T) {
	entity := testEntity(t)
	signed := signPayload(t, entity, testDataset)

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write(signed)
	}))
	defer server.Close()

	now := time.Date(2026, time.August, 17, 0, 0, 0, 0, time.UTC)
	path := filepath.Join(t.TempDir(), cacheFile)

	if err := os.WriteFile(path, []byte(`{"broken":true}`), 0o600); err != nil {
		t.Fatalf("write malformed cache: %v", err)
	}

	service := testService(server, path, &now, entity)

	result, err := service.LookupPasskeyDirectory(
		context.Background(),
		PasskeyDirectoryLookupRequest{RPIDs: []string{"example.com"}},
	)
	if err != nil {
		t.Fatalf("refresh malformed cache: %v", err)
	}

	if len(result.Matches) != 1 {
		t.Fatalf("refreshed result = %#v", result)
	}
}

func testService(
	server *httptest.Server,
	path string,
	now *time.Time,
	entity *openpgp.Entity,
) *Service {
	client := server.Client()
	client.Timeout = requestTimeout

	return &Service{
		source:     server.URL,
		httpClient: client,
		cachePath:  path,
		now:        func() time.Time { return *now },
		keyring:    openpgp.EntityList{entity},
	}
}

func testEntity(t *testing.T) *openpgp.Entity {
	t.Helper()

	entity, err := openpgp.NewEntity("Test signer", "", "test@example.com", &packet.Config{
		DefaultHash: crypto.SHA256,
		RSABits:     1024,
	})
	if err != nil {
		t.Fatalf("create test signing key: %v", err)
	}

	return entity
}

func signPayload(t *testing.T, entity *openpgp.Entity, payload string) []byte {
	t.Helper()

	var output bytes.Buffer

	writer, err := openpgp.Sign(&output, entity, nil, nil)
	if err != nil {
		t.Fatalf("create signed message: %v", err)
	}

	if _, err := writer.Write([]byte(payload)); err != nil {
		t.Fatalf("write signed message: %v", err)
	}

	if err := writer.Close(); err != nil {
		t.Fatalf("close signed message: %v", err)
	}

	return output.Bytes()
}

func entityFingerprint(entity *openpgp.Entity) string {
	return strings.ToUpper(hex.EncodeToString(entity.PrimaryKey.Fingerprint[:]))
}
