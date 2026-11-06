#!/usr/bin/env python3
"""Erzeugt Update-Log und Versionsnummern für alle Spiele aus ihren GitHub-Commits.

Aufruf:
  python3 tools/changelog.py                 normaler Lauf (Action, stündlich)
  python3 tools/changelog.py --freeze        Einstufung aller noch nicht eingefrorenen Commits festschreiben
  python3 tools/changelog.py --cache DIR     vorhandene Klone in DIR wiederverwenden (DIR/<repo>.git)
  python3 tools/changelog.py --force         alles neu berechnen, auch wenn es keine neuen Commits gibt

Version: Major.Minor.Patch.Build (alle Spiele starten bei 0.1.0.0 = Beta).
  Major  riesige Hauptversion / Wechsel zur Veröffentlichung (nur von Hand: "Major:" oder offiziell_ab)
  Minor  neue Inhalte, Mechaniken, größere Features
  Patch  Fehler beheben, Balance, kleinere Optimierungen
  Build  Kleinkram, Feinschliff, Tests, Hotfix

Einstufung eines Commits (erste passende Regel gewinnt):
  1. eingefroren: Stufe steht in data/levels/<id>.json (alte Historie, ändert sich nie wieder)
  2. Marker am Anfang der Commit-Nachricht: "Minor: Text" / "Patch: ..." / "Build: ..." / "Major: ..."
     oder eine ausgeschriebene Nummer "1.2.0.0: Text" (überschreibt die Berechnung)
  3. Regeln nach Schlüsselwörtern und Länge der Nachricht (Upload-Commits nach Zeilenumfang)
"""
import argparse
import json
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
GAMES = ROOT / "public" / "games.json"
OUT_DIR = ROOT / "public" / "changelog"
VERSIONS = ROOT / "public" / "versions.json"
LEVEL_DIR = ROOT / "data" / "levels"
HEADS = ROOT / "data" / "heads.json"

LEVELS = ("major", "minor", "patch", "build")

# ---------- Regeln ----------
IGNORE = re.compile(r"^(initial commit|merge\b|wiki|delete\b|rename\b|revert \"merge)", re.I)
GENERIC = re.compile(r"^(add files via upload|upload\b|update [\w.\-]+$|create\b)", re.I)
MARKER_ART = re.compile(r"^(major|minor|patch|build)\s*[:\-–—]\s*(.*)$", re.I | re.S)
MARKER_NUM = re.compile(r"^v?(\d+)\.(\d+)\.(\d+)\.(\d+)\s*[:\-–—]\s*(.*)$", re.S)

REVERT = re.compile(r"^revert\b", re.I)
FIX = re.compile(r"\b(fix|fehler|bug|bugfix|bugfixing|behoben|korrigiert|repariert|verhindert|hotfix|crash|absturz)\b", re.I)
# starke Signale für neue Inhalte
STRONG = re.compile(
    r"\b(neu|neue|neuer|neues|neuen|neuem|hinzugefügt|hinzugefuegt|eingebaut|eingeführt|eingefuehrt|etappe|schritt|"
    r"spielmodus|modus|event|editor|boss|bosse|saison|mehrspieler|multiplayer|marktplatz|kapitel)\b",
    re.I,
)
# schwächere Signale, zählen nur bei langen Nachrichten
WEAK = re.compile(
    r"\b(ergänzt|ergaenzt|erweitert|umgebaut|überarbeitet|ueberarbeitet|komplett|tutorial|shop|quest|quests|level|gebiet|"
    r"system|rangliste|handel|aufträge|forschung|abteilung|ansicht|menü|menue|kampf|musik|sound)\b",
    re.I,
)
PATCH = re.compile(
    r"\b(angepasst|balance|tempo|schneller|langsamer|stärker|staerker|schwächer|schwaecher|reduziert|erhöht|erhoeht|"
    r"verbessert|optimiert|entfernt|rückgängig|rueckgaengig|zurückgenommen|zurueckgenommen|wieder|statt|"
    r"nicht mehr|nur noch|kein|keine|sofort|gleich|geändert|geaendert|umgestellt|vereinfacht|jetzt)\b",
    re.I,
)
BUILD = re.compile(
    r"\b(test|typo|tippfehler|readme|doku|kommentar|favicon|icon|manifest|abstand|kleiner|größer|groesser|farbe|"
    r"schrift|umbenannt|aufgeräumt|aufgeraeumt|wortlaut|beschriftung|text|texte)\b|\bpx\b|\d\s?%",
    re.I,
)


def level_by_text(msg: str) -> str:
    n = len(msg)
    items = len([p for p in re.split(r"[;,]| und |\+", msg) if p.strip()])
    if REVERT.match(msg):
        return "build"
    if FIX.search(msg):
        return "patch" if n >= 30 else "build"
    if STRONG.search(msg) and (n >= 65 or items >= 4):
        return "minor"
    if items >= 5 or n >= 140:
        return "minor"
    if WEAK.search(msg) and n >= 100 and items >= 3:
        return "minor"
    if PATCH.search(msg):
        return "patch" if n >= 40 else "build"
    if BUILD.search(msg):
        return "build"
    if n >= 60:
        return "patch"
    return "build"


def level_by_lines(changed: int) -> str:
    if changed >= 400:
        return "minor"
    if changed >= 40:
        return "patch"
    return "build"


# ---------- Git ----------
def run(args, cwd=None, check=True):
    r = subprocess.run(args, cwd=cwd, capture_output=True, text=True, encoding="utf-8", errors="replace")
    if check and r.returncode != 0:
        tok = os.environ.get("GAME_REPOS_TOKEN", "").strip()
        err = r.stderr.strip()[:300]
        if tok:
            err = err.replace(tok, "***")
        raise RuntimeError(f"{' '.join(args[:3])} ... fehlgeschlagen: {err}")
    return r.stdout


def clone_url(repo: str) -> str:
    token = os.environ.get("GAME_REPOS_TOKEN", "").strip()
    if token:
        return f"https://x-access-token:{token}@github.com/{repo}.git"
    return f"https://github.com/{repo}.git"


def ensure_clone(repo: str, base: Path) -> Path:
    path = base / f"{repo.split('/')[-1]}.git"
    if path.exists():
        run(["git", "-C", str(path), "fetch", "--quiet", "--prune", "origin", "+refs/heads/*:refs/heads/*"])
    else:
        run(["git", "clone", "--bare", "--filter=blob:none", "--quiet", clone_url(repo), str(path)])
    return path


def head_sha(repo: str):
    """Winzige Vorabfrage: aktueller Stand des Standard-Zweigs (ein einziger Aufruf, kein Download)."""
    out = run(["git", "ls-remote", clone_url(repo), "HEAD"], check=False).strip()
    return out.split()[0] if out else None


def read_commits(path: Path):
    """Alle Commits des Standard-Zweigs ohne Merges, älteste zuerst."""
    out = run(["git", "-C", str(path), "log", "HEAD", "--no-merges", "--topo-order", "--reverse",
               "--format=%H%x1f%aI%x1f%s"])
    commits = []
    for line in out.splitlines():
        parts = line.split("\x1f")
        if len(parts) == 3:
            commits.append({"sha": parts[0], "datum": parts[1], "subject": parts[2].strip()})
    return commits


def changed_lines(path: Path, sha: str) -> int:
    out = run(["git", "-C", str(path), "show", "--shortstat", "--format=", sha], check=False)
    total = 0
    for num, kind in re.findall(r"(\d+) (insertion|deletion)", out):
        total += int(num)
    return total


# ---------- Versionen ----------
def bump(v, level):
    major, minor, patch, build = v
    if level == "major":
        return (major + 1, 0, 0, 0)
    if level == "minor":
        return (major, minor + 1, 0, 0)
    if level == "patch":
        return (major, minor, patch + 1, 0)
    return (major, minor, patch, build + 1)


def vstr(v):
    return ".".join(str(x) for x in v)


def process_game(game, base: Path, freeze: bool):
    gid, repo = game["id"], game["repo"]
    path = ensure_clone(repo, base)
    commits = read_commits(path)

    lvl_file = LEVEL_DIR / f"{gid}.json"
    frozen = json.loads(lvl_file.read_text(encoding="utf-8")) if lvl_file.exists() else {}
    new_frozen = dict(frozen)

    offiziell_ab = game.get("offiziell_ab")  # ISO-Datum, ab dem 1.0.0.0 gilt
    version = None
    entries = []
    official_done = False

    for c in commits:
        sha12, subject = c["sha"][:12], c["subject"]
        text, level, explicit = subject, None, None

        if sha12 in frozen:
            level = frozen[sha12]
            if level == "skip":
                continue
        else:
            if IGNORE.match(subject):
                if freeze:
                    new_frozen[sha12] = "skip"
                continue
            m_num, m_art = MARKER_NUM.match(subject), MARKER_ART.match(subject)
            if m_num:
                explicit = tuple(int(m_num.group(i)) for i in range(1, 5))
                text = m_num.group(5).strip()
            elif m_art:
                level, text = m_art.group(1).lower(), m_art.group(2).strip()
            elif GENERIC.match(subject):
                lines = changed_lines(path, c["sha"])
                level = level_by_lines(lines)
                text = f"Update hochgeladen ({lines} geänderte Zeilen)"
            else:
                level = level_by_text(subject)
            if freeze and not explicit:
                new_frozen[sha12] = level

        # Text für eingefrorene Upload-Commits bleibt neutral
        if sha12 in frozen and GENERIC.match(subject):
            text = "Update hochgeladen"

        if version is None:
            version = (0, 1, 0, 0)
            art = "start"
        elif explicit:
            version, art = explicit, "nummer"
        else:
            version, art = bump(version, level), level

        # Offizielle Veröffentlichung: erster Commit ab dem Stichtag
        if offiziell_ab and not official_done and c["datum"][:10] >= offiziell_ab and version[0] == 0:
            version, art, official_done = (1, 0, 0, 0), "major", True
            text = f"Offizielle Veröffentlichung: {text}"
        elif version[0] >= 1:
            official_done = True

        entries.append({"v": vstr(version), "art": art, "datum": c["datum"], "text": text[:220], "sha": sha12})

    if freeze:
        lvl_file.parent.mkdir(parents=True, exist_ok=True)
        write_if_changed(lvl_file, json.dumps(new_frozen, ensure_ascii=False, indent=0, sort_keys=False) + "\n")

    entries.reverse()  # neueste zuerst
    latest = entries[0] if entries else None
    data = {
        "id": gid,
        "version": latest["v"] if latest else "0.1.0.0",
        "offiziell": bool(latest and int(latest["v"].split(".")[0]) >= 1),
        "eintraege": entries,
    }
    return data


def write_if_changed(path: Path, text: str) -> bool:
    if path.exists() and path.read_text(encoding="utf-8") == text:
        return False
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")
    return True


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--freeze", action="store_true", help="Einstufung noch nicht eingefrorener Commits festschreiben")
    ap.add_argument("--cache", help="Ordner mit vorhandenen Klonen (<repo>.git)")
    ap.add_argument("--only", help="nur dieses Spiel (id)")
    ap.add_argument("--force", action="store_true", help="alles neu berechnen, auch ohne neue Commits")
    args = ap.parse_args()

    games = json.loads(GAMES.read_text(encoding="utf-8"))["games"]
    base = Path(args.cache) if args.cache else Path(tempfile.mkdtemp(prefix="spielerepos-"))
    base.mkdir(parents=True, exist_ok=True)

    versions, failed, changed = {}, [], 0
    old_versions = json.loads(VERSIONS.read_text(encoding="utf-8")) if VERSIONS.exists() else {}
    heads = json.loads(HEADS.read_text(encoding="utf-8")) if HEADS.exists() else {}
    for g in games:
        if not g.get("repo") or (args.only and g["id"] != args.only):
            if g["id"] in old_versions:
                versions[g["id"]] = old_versions[g["id"]]
            continue
        # Sparsam: nur eine winzige Vorabfrage; ohne neue Commits wird nichts geladen oder berechnet.
        sha = head_sha(g["repo"])
        if (not args.force and sha and heads.get(g["repo"]) == sha
                and g["id"] in old_versions and (OUT_DIR / f"{g['id']}.json").exists()):
            versions[g["id"]] = old_versions[g["id"]]
            print(f"{g['id']:16} unverändert")
            continue
        try:
            data = process_game(g, base, args.freeze)
        except Exception as e:  # ein kaputtes Repo darf die anderen nicht blockieren
            print(f"WARNUNG {g['id']}: {e}", file=sys.stderr)
            failed.append(g["id"])
            if g["id"] in old_versions:
                versions[g["id"]] = old_versions[g["id"]]
            continue
        if sha:
            heads[g["repo"]] = sha
        text = json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n"
        changed += write_if_changed(OUT_DIR / f"{g['id']}.json", text)
        latest = data["eintraege"][0] if data["eintraege"] else None
        versions[g["id"]] = {"version": data["version"], "offiziell": data["offiziell"],
                             "datum": latest["datum"] if latest else None, "anzahl": len(data["eintraege"])}
        print(f"{g['id']:16} {data['version']:>12}  {len(data['eintraege']):4} Einträge")

    vtext = json.dumps(versions, ensure_ascii=False, indent=1, sort_keys=True) + "\n"
    changed += write_if_changed(VERSIONS, vtext)
    changed += write_if_changed(HEADS, json.dumps(heads, indent=1, sort_keys=True) + "\n")
    print(f"{changed} Datei(en) geändert" + (f", Fehler bei: {', '.join(failed)}" if failed else ""))
    if failed and len(failed) == len([g for g in games if g.get('repo')]):
        sys.exit(1)


if __name__ == "__main__":
    main()
