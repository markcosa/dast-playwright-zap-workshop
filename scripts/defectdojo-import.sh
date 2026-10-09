#!/usr/bin/env bash
# defectdojo-import.sh — Sube cada reporte JSON a DefectDojo (consola central).
# Requiere las variables de entorno:
#   DEFECTDOJO_URL    ej. https://defectdojo.adbc.gob.mx
#   DEFECTDOJO_TOKEN  token de API (Usuario -> API v2 Key en DefectDojo)
#   PRODUCT_NAME      ej. nombre del repo
#   ENGAGEMENT_NAME   ej. CI-main
#
# auto_create_context=true crea el Product y el Engagement si no existen.
set -uo pipefail

: "${DEFECTDOJO_URL:?falta DEFECTDOJO_URL}"
: "${DEFECTDOJO_TOKEN:?falta DEFECTDOJO_TOKEN}"
PRODUCT_NAME="${PRODUCT_NAME:-proyecto}"
ENGAGEMENT_NAME="${ENGAGEMENT_NAME:-CI}"
REPORTS_DIR="${REPORTS_DIR:-reports}"

API="${DEFECTDOJO_URL%/}/api/v2/import-scan/"

# archivo  ->  scan_type exacto del parser de DefectDojo
import_one() {
  local archivo="$1" scan_type="$2"
  if [[ ! -s "$REPORTS_DIR/$archivo" ]]; then
    echo "  (omitido: $archivo no existe o está vacío)"; return 0
  fi
  echo "  -> importando $archivo como '$scan_type'"
  curl -sS -o /dev/null -w "     HTTP %{http_code}\n" \
    -X POST "$API" \
    -H "Authorization: Token ${DEFECTDOJO_TOKEN}" \
    -F "scan_type=${scan_type}" \
    -F "file=@${REPORTS_DIR}/${archivo}" \
    -F "product_name=${PRODUCT_NAME}" \
    -F "engagement_name=${ENGAGEMENT_NAME}" \
    -F "auto_create_context=true" \
    -F "active=true" -F "verified=false" \
    -F "minimum_severity=Info" \
    -F "close_old_findings=true"
}

echo "Importando reportes a DefectDojo (${DEFECTDOJO_URL}) para producto '${PRODUCT_NAME}'..."
import_one "semgrep.json"    "Semgrep JSON Report"
import_one "trivy.json"      "Trivy Scan"
import_one "osv.json"        "OSV Scan"
import_one "gitleaks.json"   "Gitleaks Scan"
import_one "trufflehog.json" "Trufflehog Scan"
import_one "checkov.json"    "Checkov Scan"
echo "Listo."
