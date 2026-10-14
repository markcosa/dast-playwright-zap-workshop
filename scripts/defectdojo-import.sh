#!/usr/bin/env bash
# defectdojo-import.sh — Sube cada reporte a DefectDojo (consola central).
# Requiere:
#   DEFECTDOJO_URL    ej. http://localhost:8085
#   DEFECTDOJO_TOKEN  token del usuario de servicio ci-bot
#   PRODUCT_NAME      ej. owner/repo
#   ENGAGEMENT_NAME   ej. CI-main
# Opcionales:
#   REPORTS_DIR       carpeta con los JSON (default: reports)
#   VERACODE_XML      ruta a un detailedreport XML de Veracode para subirlo también
#
# Estrategia: intenta REIMPORT (actualiza el test existente, sin duplicar);
# si el test aún no existe (primer envío) y devuelve 400/404, cae a IMPORT (lo crea).
# Imprime el cuerpo de la respuesta cuando hay error, para diagnóstico.
set -uo pipefail

: "${DEFECTDOJO_URL:?falta DEFECTDOJO_URL}"
: "${DEFECTDOJO_TOKEN:?falta DEFECTDOJO_TOKEN}"
PRODUCT_NAME="${PRODUCT_NAME:-proyecto}"
ENGAGEMENT_NAME="${ENGAGEMENT_NAME:-CI}"
REPORTS_DIR="${REPORTS_DIR:-reports}"
BASE="${DEFECTDOJO_URL%/}"

# POST a un endpoint (import o reimport). Devuelve el código HTTP por stdout (última línea)
# y el cuerpo arriba.
_post() {
  local endpoint="$1" archivo="$2" scan_type="$3"
  curl -sS -w $'\n%{http_code}' -X POST "${BASE}/api/v2/${endpoint}/" \
    -H "Authorization: Token ${DEFECTDOJO_TOKEN}" \
    -F "scan_type=${scan_type}" \
    -F "file=@${archivo}" \
    -F "product_name=${PRODUCT_NAME}" \
    -F "engagement_name=${ENGAGEMENT_NAME}" \
    -F "auto_create_context=true" \
    -F "active=true" -F "verified=false" \
    -F "minimum_severity=Info" \
    -F "close_old_findings=true"
}

import_file() {
  local archivo="$1" scan_type="$2"
  if [[ ! -s "$archivo" ]]; then
    echo "  (omitido: $(basename "$archivo") no existe o está vacío)"; return 0
  fi

  # 1) intento reimport
  local resp code body
  resp="$(_post 'reimport-scan' "$archivo" "$scan_type")"
  code="$(printf '%s' "$resp" | tail -n1)"
  body="$(printf '%s' "$resp" | sed '$d')"

  if [[ "$code" =~ ^2 ]]; then
    echo "  -> reimport  $(basename "$archivo") [$scan_type]  HTTP $code"
    return 0
  fi

  # 2) fallback a import (primer envío: crea el test)
  resp="$(_post 'import-scan' "$archivo" "$scan_type")"
  code="$(printf '%s' "$resp" | tail -n1)"
  body="$(printf '%s' "$resp" | sed '$d')"

  if [[ "$code" =~ ^2 ]]; then
    echo "  -> import    $(basename "$archivo") [$scan_type]  HTTP $code"
  else
    echo "  -> FALLÓ     $(basename "$archivo") [$scan_type]  HTTP $code"
    echo "     Respuesta: $(printf '%s' "$body" | head -c 600)"
  fi
}

echo "DefectDojo -> ${BASE}  (producto '${PRODUCT_NAME}', engagement '${ENGAGEMENT_NAME}')"
import_file "${REPORTS_DIR}/semgrep.json"    "Semgrep JSON Report"
import_file "${REPORTS_DIR}/trivy.json"      "Trivy Scan"
import_file "${REPORTS_DIR}/osv.json"        "OSV Scan"
import_file "${REPORTS_DIR}/gitleaks.json"   "Gitleaks Scan"
import_file "${REPORTS_DIR}/trufflehog.json" "Trufflehog Scan"
import_file "${REPORTS_DIR}/checkov.json"    "Checkov Scan"
[[ -n "${VERACODE_XML:-}" ]] && import_file "${VERACODE_XML}" "Veracode Scan"
echo "Listo."
