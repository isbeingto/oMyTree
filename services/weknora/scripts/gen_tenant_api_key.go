package main

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"encoding/binary"
	"encoding/hex"
	"fmt"
	"io"
	"os"
	"strconv"
	"strings"
)

func readTenantAESKey() ([]byte, error) {
	raw := strings.TrimSpace(os.Getenv("TENANT_AES_KEY"))
	if raw == "" {
		return nil, fmt.Errorf("TENANT_AES_KEY is empty")
	}

	// Support common ops format: 32-byte key stored as 64-char hex.
	if len(raw)%2 == 0 && (len(raw) == 32 || len(raw) == 48 || len(raw) == 64) {
		if decoded, err := hex.DecodeString(raw); err == nil {
			rawKey := decoded
			if len(rawKey) == 16 || len(rawKey) == 24 || len(rawKey) == 32 {
				return rawKey, nil
			}
		}
	}

	key := []byte(raw)
	if len(key) != 16 && len(key) != 24 && len(key) != 32 {
		return nil, fmt.Errorf("TENANT_AES_KEY must be 16/24/32 bytes (or hex-encoded 32/48/64 chars); got %d bytes", len(key))
	}
	return key, nil
}

func generateAPIKey(key []byte, tenantID uint64) (string, error) {
	idBytes := make([]byte, 8)
	binary.LittleEndian.PutUint64(idBytes, tenantID)

	block, err := aes.NewCipher(key)
	if err != nil {
		return "", err
	}
	aesgcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}

	nonce := make([]byte, 12)
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", err
	}

	ciphertext := aesgcm.Seal(nil, nonce, idBytes, nil)
	combined := append(nonce, ciphertext...)
	encoded := base64.RawURLEncoding.EncodeToString(combined)
	return "sk-" + encoded, nil
}

func main() {
	if len(os.Args) != 2 {
		fmt.Fprintln(os.Stderr, "Usage: go run scripts/gen_tenant_api_key.go <tenant_id>")
		os.Exit(2)
	}

	tenantID, err := strconv.ParseUint(os.Args[1], 10, 64)
	if err != nil {
		fmt.Fprintln(os.Stderr, "Invalid tenant_id:", err)
		os.Exit(2)
	}

	key, err := readTenantAESKey()
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}

	apiKey, err := generateAPIKey(key, tenantID)
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}

	fmt.Println(apiKey)
}
