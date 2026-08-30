import { Algorithm } from "../../bindings/github.com/telesma-app/ctap/cose";

const PREVIEW_SIGN_ALGORITHM_NAMES = new Map<number, string>([
  [Algorithm.AlgorithmES256, "ES256"],
  [Algorithm.AlgorithmESP256, "ESP256"],
  [Algorithm.AlgorithmES384, "ES384"],
  [Algorithm.AlgorithmESP384, "ESP384"],
  [Algorithm.AlgorithmES512, "ES512"],
  [Algorithm.AlgorithmESP512, "ESP512"],
  [Algorithm.AlgorithmES256K, "ES256K"],
  [Algorithm.AlgorithmEdDSA, "EdDSA"],
  [Algorithm.AlgorithmEd25519, "Ed25519"],
  [Algorithm.AlgorithmRS256, "RS256"],
  [Algorithm.AlgorithmPS256, "PS256"],
  [Algorithm.AlgorithmECDHESHKDF256, "ECDH-ES+HKDF-256"],
  [Algorithm.AlgorithmESP256SplitARKGPlaceholder, "ESP256-split-ARKG"],
  [Algorithm.AlgorithmARKGP256Placeholder, "ARKG-P256"],
]);

export function previewSignAlgorithmLabel(algorithm: number) {
  const name = PREVIEW_SIGN_ALGORITHM_NAMES.get(algorithm);

  return name ? `${name} (${algorithm})` : `COSE ${algorithm}`;
}
