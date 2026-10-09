#!/usr/bin/env bash
# install-tools.sh — Instala la suite localmente (Linux x86_64 / WSL / macOS).
# En Windows: usa WSL, o Docker (ver Dockerfile.intake).
set -euo pipefail

OS="$(uname -s)"
BIN="${BIN:-/usr/local/bin}"
SUDO=""; [[ -w "$BIN" ]] || SUDO="sudo"

echo "== Semgrep + Checkov (requieren Python 3.8+) =="
python3 -m pip install --upgrade --user semgrep checkov

if [[ "$OS" == "Darwin" ]]; then
  echo "== macOS: usando Homebrew =="
  brew install trivy trufflehog gitleaks osv-scanner || true
  echo "Listo. Verifica con: semgrep --version; trivy --version; gitleaks version; trufflehog --version; osv-scanner --version; checkov --version"
  exit 0
fi

echo "== Trivy =="
curl -sfL https://raw.githubusercontent.com/aquasecurity/trivy/main/contrib/install.sh | $SUDO sh -s -- -b "$BIN"

echo "== TruffleHog =="
curl -sSfL https://raw.githubusercontent.com/trufflesecurity/trufflehog/main/scripts/install.sh | $SUDO sh -s -- -b "$BIN"

echo "== Gitleaks (última release) =="
GL_VER=$(curl -s https://api.github.com/repos/gitleaks/gitleaks/releases/latest | grep -Po '"tag_name": "v\K[^"]*')
curl -sSfL "https://github.com/gitleaks/gitleaks/releases/download/v${GL_VER}/gitleaks_${GL_VER}_linux_x64.tar.gz" -o /tmp/gl.tgz
tar -xzf /tmp/gl.tgz -C /tmp gitleaks && $SUDO mv /tmp/gitleaks "$BIN/gitleaks"

echo "== OSV-Scanner (última release) =="
OSV_VER=$(curl -s https://api.github.com/repos/google/osv-scanner/releases/latest | grep -Po '"tag_name": "v\K[^"]*')
$SUDO curl -sSfL "https://github.com/google/osv-scanner/releases/download/v${OSV_VER}/osv-scanner_linux_amd64" -o "$BIN/osv-scanner"
$SUDO chmod +x "$BIN/osv-scanner"

echo
echo "Verifica: semgrep --version; trivy --version; gitleaks version; trufflehog --version; osv-scanner --version; checkov --version"
