#!/usr/bin/env bash
# scan-local.sh — Corre TODA la batería de escáneres sobre una carpeta local.
# Sirve para (a) probar un repo antes de hacer push, y (b) analizar proyectos
# que llegan en archivos (.zip) — base de la Fase 2.
#
# Uso:
#   bash scripts/scan-local.sh [RUTA_DEL_PROYECTO] [UMBRAL]
#   RUTA_DEL_PROYECTO  por defecto "."
#   UMBRAL             INFO|LOW|MEDIUM|HIGH|CRITICAL  (por defecto HIGH)
#
# Requiere tener instaladas las herramientas (ver scripts/install-tools.sh o el README).
set -uo pipefail

TARGET="${1:-.}"
UMBRAL="${2:-HIGH}"
HERE="$(cd "$(dirname "$0")" && pwd)"
OUT="$(pwd)/reports"
mkdir -p "$OUT"

echo "== Analizando: $TARGET =="
echo "== Reportes en: $OUT =="

run() { echo "-- $1"; shift; "$@" || true; }

run "Semgrep (SAST)"      semgrep scan --config p/default --config p/secrets --config p/owasp-top-ten \
                             --metrics=off --error=false --no-git-ignore \
                             --json --output "$OUT/semgrep.json" "$TARGET"

run "Trivy (SCA/IaC/sec)" trivy fs --scanners vuln,secret,misconfig,license \
                             --format json --output "$OUT/trivy.json" \
                             --severity LOW,MEDIUM,HIGH,CRITICAL "$TARGET"

run "OSV-Scanner (deps)"  osv-scanner scan --recursive --format json --output "$OUT/osv.json" "$TARGET"

run "Gitleaks (secretos)" gitleaks detect --source "$TARGET" --no-git \
                             --report-format json --report-path "$OUT/gitleaks.json" --redact

run "TruffleHog (sec)"    bash -c "trufflehog filesystem '$TARGET' --json --no-update > '$OUT/trufflehog.json'"

run "Checkov (IaC)"       bash -c "checkov -d '$TARGET' --output json --compact --quiet > '$OUT/checkov.json'"

echo
echo "== Gate =="
python3 "$HERE/gate.py" --reports-dir "$OUT" --threshold "$UMBRAL"
