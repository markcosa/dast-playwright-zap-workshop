#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
gate.py — Lee los reportes JSON de los escáneres, cuenta hallazgos por severidad
y decide si el pipeline PASA o FALLA (bloqueo de merge).

Uso:
  python3 scripts/gate.py --reports-dir reports --threshold HIGH [--summary "$GITHUB_STEP_SUMMARY"]

Salida: imprime un resumen y termina con código 1 si hay hallazgos >= al umbral.
Es defensivo: si un archivo no existe o viene vacío, lo omite sin romper.
"""
import argparse, json, os, sys

NIVELES = ["INFO", "LOW", "MEDIUM", "HIGH", "CRITICAL"]
ORDEN = {n: i for i, n in enumerate(NIVELES)}


def norm(sev):
    if not sev:
        return "MEDIUM"
    s = str(sev).strip().upper()
    mapa = {
        "ERROR": "HIGH", "WARNING": "MEDIUM", "INFO": "INFO", "INFORMATIONAL": "INFO",
        "UNKNOWN": "LOW", "NONE": "INFO", "MODERATE": "MEDIUM",
        "CRITICAL": "CRITICAL", "HIGH": "HIGH", "MEDIUM": "MEDIUM", "LOW": "LOW",
    }
    return mapa.get(s, "MEDIUM" if s not in NIVELES else s)


def cargar(path):
    if not os.path.isfile(path) or os.path.getsize(path) == 0:
        return None
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return None


def cargar_ndjson(path):
    """TruffleHog emite un objeto JSON por línea."""
    out = []
    if not os.path.isfile(path):
        return out
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                out.append(json.loads(line))
            except Exception:
                pass
    return out


def contar(d):
    """d: dict herramienta -> Counter de severidades."""
    res = {}

    # --- Semgrep (JSON) ---
    data = cargar(os.path.join(d, "semgrep.json"))
    if data:
        c = {}
        for r in data.get("results", []):
            sev = norm(r.get("extra", {}).get("severity"))
            c[sev] = c.get(sev, 0) + 1
        res["Semgrep (SAST)"] = c

    # --- Trivy (JSON) ---
    data = cargar(os.path.join(d, "trivy.json"))
    if data:
        c = {}
        for r in data.get("Results", []) or []:
            for v in r.get("Vulnerabilities", []) or []:
                sev = norm(v.get("Severity")); c[sev] = c.get(sev, 0) + 1
            for m in r.get("Misconfigurations", []) or []:
                sev = norm(m.get("Severity")); c[sev] = c.get(sev, 0) + 1
            for s in r.get("Secrets", []) or []:
                sev = norm(s.get("Severity") or "HIGH"); c[sev] = c.get(sev, 0) + 1
        res["Trivy (SCA/IaC/secretos)"] = c

    # --- OSV-Scanner (JSON) ---
    data = cargar(os.path.join(d, "osv.json"))
    if data:
        c = {}
        for pkg in [p for r in data.get("results", []) or [] for p in r.get("packages", []) or []]:
            for vuln in pkg.get("vulnerabilities", []) or []:
                sev = "MEDIUM"
                for sv in vuln.get("severity", []) or []:
                    score = sv.get("score", "")
                    # CVSS vector o número -> aproximación
                    try:
                        num = float(str(score).split("/")[0])
                        sev = "CRITICAL" if num >= 9 else "HIGH" if num >= 7 else "MEDIUM" if num >= 4 else "LOW"
                    except Exception:
                        pass
                c[sev] = c.get(sev, 0) + 1
        res["OSV-Scanner (dependencias)"] = c

    # --- Gitleaks (JSON array) ---
    data = cargar(os.path.join(d, "gitleaks.json"))
    if isinstance(data, list):
        if data:
            res["Gitleaks (secretos)"] = {"HIGH": len(data)}
        else:
            res["Gitleaks (secretos)"] = {}

    # --- TruffleHog (NDJSON) ---
    th = cargar_ndjson(os.path.join(d, "trufflehog.json"))
    if th is not None:
        c = {}
        for item in th:
            if "DetectorName" not in item and "SourceMetadata" not in item:
                continue
            sev = "HIGH" if item.get("Verified") else "MEDIUM"
            c[sev] = c.get(sev, 0) + 1
        if c or os.path.isfile(os.path.join(d, "trufflehog.json")):
            res["TruffleHog (secretos)"] = c

    # --- Checkov (JSON) ---
    data = cargar(os.path.join(d, "checkov.json"))
    if data:
        c = {}
        bloques = data if isinstance(data, list) else [data]
        for b in bloques:
            fails = (b.get("results", {}) or {}).get("failed_checks", []) if isinstance(b, dict) else []
            for chk in fails or []:
                sev = norm(chk.get("severity") or "MEDIUM")
                c[sev] = c.get(sev, 0) + 1
        res["Checkov (IaC)"] = c

    return res


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--reports-dir", default="reports")
    ap.add_argument("--threshold", default="HIGH")
    ap.add_argument("--summary", default="")  # ruta de $GITHUB_STEP_SUMMARY (opcional)
    args = ap.parse_args()

    umbral = norm(args.threshold)
    res = contar(args.reports_dir)

    total = {n: 0 for n in NIVELES}
    lineas = []
    lineas.append("| Herramienta | CRITICAL | HIGH | MEDIUM | LOW | INFO |")
    lineas.append("|---|---:|---:|---:|---:|---:|")
    for tool, c in res.items():
        for n in NIVELES:
            total[n] += c.get(n, 0)
        lineas.append("| {} | {} | {} | {} | {} | {} |".format(
            tool, c.get("CRITICAL", 0), c.get("HIGH", 0), c.get("MEDIUM", 0), c.get("LOW", 0), c.get("INFO", 0)))
    lineas.append("| **TOTAL** | **{}** | **{}** | **{}** | **{}** | **{}** |".format(
        total["CRITICAL"], total["HIGH"], total["MEDIUM"], total["LOW"], total["INFO"]))

    # ¿Cuántos hallazgos están en o por encima del umbral?
    bloqueantes = sum(v for n, v in total.items() if ORDEN[n] >= ORDEN[umbral])

    encabezado = "## Resultado de seguridad\n\nUmbral del gate: **{}** — hallazgos bloqueantes: **{}**\n\n".format(umbral, bloqueantes)
    tabla = "\n".join(lineas)
    print(encabezado + tabla)

    if args.summary:
        try:
            with open(args.summary, "a", encoding="utf-8") as f:
                f.write(encabezado + tabla + "\n")
        except Exception:
            pass

    if bloqueantes > 0:
        print("\n❌ GATE: BLOQUEADO — hay {} hallazgo(s) de severidad {} o superior.".format(bloqueantes, umbral))
        sys.exit(1)
    print("\n✅ GATE: APROBADO — sin hallazgos de severidad {} o superior.".format(umbral))
    sys.exit(0)


if __name__ == "__main__":
    main()
