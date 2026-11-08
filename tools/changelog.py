#!/usr/bin/env python3
"""Erzeugt Update-Log und Versionsnummern für alle Spiele aus ihren GitHub-Commits.

Aufruf:
  python3 tools/changelog.py                 normaler Lauf (Action, stündlich)
  python3 tools/changelog.py --freeze        Einstufung aller noch nicht eingefrorenen Commits festschreiben
  python3 tools/changelog.py --cache DIR     vorhandene Klone in DIR wiederverwenden (DIR/<repo>.git)
  python3 tools/changelog.py --force         alles neu berechnen, auch wenn es keine neuen Commits gibt
  python3 tools/changelog.py --freeze --force --reklassify   alte Historie nach geänderten Regeln neu einstufen (einmalig)

Version: Major.Großes.Kleines.Patch (alle Spiele starten bei 0.1.0.0 = Beta).
  Major          riesige Hauptversion / Wechsel zur Veröffentlichung (nur von Hand: "Major:" oder offiziell_ab)
  Großes Update  neue Inhalte, Mechaniken, größere Features
  Kleines Update Fehler beheben, Balance, kleinere Optimierungen
  Patch          Kleinkram, Feinschliff, Tests, Hotfix
Intern heißen die Stufen weiter major / minor / patch / build (so stehen sie in data/levels und public/changelog);
nur die Namen für Menschen haben sich geändert: Großes Update = minor, Kleines Update = patch, Patch = build.

Einstufung eines Commits (erste passende Regel gewinnt):
  1. eingefroren: Stufe steht in data/levels/<id>.json (alte Historie, ändert sich nie wieder)
  2. Marker am Anfang der Commit-Nachricht: "Großes Update: Text" / "Kleines Update: ..." / "Patch: ..." / "Major: ..."
     ("Patch:" meint seit November 2026 die unterste Stufe; die alten "Minor:"/"Build:" zählen nicht mehr als Vorgabe,
     dann entscheiden die Regeln unter 3.)
     oder eine ausgeschriebene Nummer "1.2.0.0: Text" (überschreibt die Berechnung)
  3. Regeln nach Spielerumfang (nicht nach Code, Aufwand oder Länge der Nachricht):
       Patch          alles, was der Spieler kaum merkt: Technik, Tests, Doku, Admin, "noch nicht freigeschaltet", sofortiges
                      Aktualisieren, reine Optik/Feinschliff, einzelne Fehlerbehebungen, Zahlen/Texte
       Kleines Update sichtbare, aber kleine Verbesserungen: Balance, kleine Ergänzungen, Hilfsmittel (Spielstand, Konto,
                      Einstellungen), wenige neue Dinge, Neues mit Kleinmengen, mehrere Fehler zugleich
       Großes Update  nur wirklich Neues: neuer Modus, neue Box/Pack/Event/Gebiet/Welt/Boss/Waffen, größere neue Mechanik
     Upload-Commits ("Update hochgeladen") sind höchstens Kleines Update (ab 500 Zeilen), sonst Patch.
"""
import argparse
from datetime import datetime
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
MARKER_ART = re.compile(
    r"^(major|gro(?:ß|ss)es\s+update|klein(?:es)?\s+update|patch|minor|build)\s*[:\-–—]\s*(.*)$", re.I | re.S)
# Name im Marker -> interne Stufe (siehe Kopfkommentar)
MARKER_STUFE = {"major": "major", "minor": "minor", "build": "build", "patch": "build"}


def marker_stufe(name):
    n = re.sub(r"\s+", " ", name.lower())
    if n.startswith("gro"):
        return "minor"
    if n.startswith("klein"):
        return "patch"
    return MARKER_STUFE[n]
MARKER_NUM = re.compile(r"^v?(\d+)\.(\d+)\.(\d+)\.(\d+)\s*[:\-–—]\s*(.*)$", re.S)

REVERT = re.compile(r"^revert\b", re.I)
FIX = re.compile(r"\b(fix|fixes|fehler|bug|bugfix|bugfixing|behoben|korrigiert|repariert|verhindert|hotfix|crash|absturz)\b", re.I)

# Maßstab: Wie viel ist für den SPIELER neu? Nicht Code, nicht Aufwand, nicht Länge der Nachricht.
# 1. Unsichtbares (Technik, Tests, Doku, Admin, noch nicht freigeschaltet, sofort aktualisieren ...)  -> Patch
INVISIBLE = re.compile(
    r"\b(test|tests|getestet|verifiziert|readme|doku|dokumentation|kommentar|refactor\w*|intern\w*|cache|caching|sync|"
    r"synchron\w*|echtzeit|performance|leistung|lazy|server|absicherung|protokoll|forensisch\w*|debug\w*|log|logs|"
    r"admin|admin-only|admin-button|prototyp|vorerst|"
    r"aktualisiert sich|aktualisiert|aktualisierung|sofort|automatisch\w*|im hintergrund|"
    r"wartung\w*|migration|migriert|aufgeräumt|aufgeraeumt|vereinfacht|typo|tippfehler|rechtschreib\w*|wortlaut|"
    r"beschriftung|umbenannt|favicon|manifest|stückweise|gestaffelt|lazy loading|cloudflare|workers|konfiguration|"
    r"plan|wiki|datenstruktur|datenmodell|ki-effekte?|effekt-hooks|kalibriert|berechnet|hooks?)\b"
    r"|nicht (?:kaufbar|freigeschaltet|sichtbar)|noch nicht (?:kaufbar|freigeschaltet)|\bpx\b|\d\s?%|\bci\b",
    re.I,
)
# 2. Nur Optik/Feinschliff -> Patch (außer "komplett neu" / "Design-Update", dann höchstens Kleines)
KOSMETIK = re.compile(
    r"\b(polish\w*|politur|feinschliff|optik|farbe|farben|schrift|abstand|symbol|icon|icons|badge|badges|animation\w*|"
    r"glanz|schatten|design|layout|gegliedert|aussehen|handgezeichnet\w*|kleiner|größer|groesser|dezent\w*|ui|oberfläche)\b",
    re.I,
)
# Verwaltung des Kontos/Spielstands: nützlich, aber kein neues Spielerlebnis -> höchstens Kleines
HILFSMITTEL = re.compile(
    r"\b(spielstand|sicherung|backup|konto|account|accounts|login|passwort|profil|einstellung\w*|steuerung|filter|"
    r"suche|sortier\w*|tastatur|touch|mobile|qol|komfort)\b",
    re.I,
)
# 3. Wirklich Neues für den Spieler (Großes Update): neue Inhalte oder ein neuer Spielmodus / neue Mechanik
INHALT = (r"modus|spielmodus|modi|box|boxen|pack|packs|event|events|gebiet|gebiete|welt|welten|boss|bosse|bälle|skins?|"
          r"waffen?|gegner|kapitel|saison|mehrspieler|multiplayer|system|mechanik|fähigkeit\w*|charakter\w*|inseln?|level|"
          r"karten|sorten|rezepte|spiel|liga|ligen|turnier\w*|cup|sbc|aufgaben|quests?|marktplatz|handel|tauschen")
NEU_INHALT = re.compile(r"\b(neu\w*|komplett neu\w*|neubau|hinzugefügt|hinzugefuegt|eingebaut|eingeführt|eingefuehrt)\b.{0,50}\b(" + INHALT + r")\b"
                        r"|\b(" + INHALT + r")\b[^:]{0,30}\bkomplett neu\b|\bneuer?\s+(?:spiel)?modus\b|\b(?:etappe|schritt|phase)\s+\d", re.I)
# Kleine Mengen oder Nebensächliches bleiben unter "Großes Update"
KLEIN_INHALT = re.compile(
    r"\b(?:ein|eine|einen|zwei|drei|[1-3])\s+neue\w*\b|\b(wochenpass|nametag\w*|logos?|fotos?|commands?|erfolg\w*|abzeichen|"
    r"rating|ratings|kader|karte|bild|bilder|photos?|position\w*|untertab|tab|ansicht|tabelle|balanc\w*|odds|abgestimmt|"
    r"stellschrauben|sim)\b", re.I)
# 4. Sichtbare, aber kleinere Verbesserungen -> Kleines Update
SICHTBAR = re.compile(
    r"\b(neu|neue|neuer|neues|neuen|neuem|ergänzt|ergaenzt|erweitert|überarbeitet|ueberarbeitet|umgebaut|balancing|balance|"
    r"abgestimmt|angepasst|angehoben|gesenkt|schneller|langsamer|stärker|staerker|schwächer|schwaecher|reduziert|erhöht|"
    r"erhoeht|verbessert|ersetzt|neu designt|nerf|buff|buffs|kosten|preis|preise|belohnung\w*|odds|chancen)\b",
    re.I,
)


def anzahl_punkte(msg: str) -> int:
    return len([p for p in re.split(r"[;,]| und |\+", msg) if p.strip()])


def level_by_text(msg: str) -> str:
    """major gibt es nie automatisch; minor = Großes Update, patch = Kleines Update, build = Patch."""
    if REVERT.match(msg):
        return "build"
    if INVISIBLE.search(msg):
        return "build"
    if FIX.search(msg):
        return "patch" if anzahl_punkte(msg) >= 4 else "build"
    kosmetisch = bool(KOSMETIK.search(msg))
    if NEU_INHALT.search(msg) and not KLEIN_INHALT.search(msg) and not HILFSMITTEL.search(msg):
        # reine Optik-Nachricht ohne neuen Inhalt wird nicht zum Großen Update
        if not kosmetisch or re.search(r"\b(modus|spielmodus|box|boxen|pack|packs|event|gebiet|gebiete|welt|boss|waffen?|skins?|bälle|kapitel|saison)\b", msg, re.I):
            return "minor"
    if kosmetisch and not re.search(r"komplett neu|neu designt|design-update|großes design", msg, re.I):
        return "build"
    if SICHTBAR.search(msg) or NEU_INHALT.search(msg):
        return "patch"
    return "build"


def level_by_lines(changed: int) -> str:
    # Hochgeladene Dateien verraten nichts über den Spielerumfang: nie "Großes Update", nur sehr viele Zeilen = Kleines
    return "patch" if changed >= 500 else "build"


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
    # Zeitlich sortieren (stabil): manche Repos haben mehrere Wurzeln, dann stimmt die reine Graph-Reihenfolge nicht.
    commits.sort(key=lambda c: datetime.fromisoformat(c["datum"]).timestamp())
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


def process_game(game, base: Path, freeze: bool, reklass: bool = False):
    gid, repo = game["id"], game["repo"]
    path = ensure_clone(repo, base)
    commits = read_commits(path)

    lvl_file = LEVEL_DIR / f"{gid}.json"
    frozen = json.loads(lvl_file.read_text(encoding="utf-8")) if lvl_file.exists() else {}
    new_frozen = dict(frozen)

    offiziell_ab = game.get("offiziell_ab")  # ISO-Datum, ab dem 1.0.0.0 gilt
    # "offiziell_seit": "0.1.0.0" = das Spiel gilt von Anfang an als offiziell: die Zählung beginnt bei 1.1.0.0 statt 0.1.0.0
    seit = game.get("offiziell_seit")
    start_version = (0, 1, 0, 0)
    if seit:
        t = tuple(int(x) for x in seit.split("."))
        start_version = (t[0] + 1,) + t[1:]
    version = None
    entries = []
    official_done = False

    for c in commits:
        sha12, subject = c["sha"][:12], c["subject"]
        text, level, explicit = subject, None, None

        if sha12 in frozen and frozen[sha12] == "skip":
            continue
        if sha12 in frozen and not reklass:
            level = frozen[sha12]
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
                text = m_art.group(2).strip()
                # Die alten Marker "Minor:"/"Build:" sind nur ein Hinweis und wurden oft zu hoch gesetzt:
                # sie zählen nicht mehr, die Regeln nach Spielerumfang entscheiden. Die neuen Namen gelten fest.
                if m_art.group(1).lower() in ("minor", "build"):
                    level = level_by_text(text)
                else:
                    level = marker_stufe(m_art.group(1))
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
            version = start_version
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
    ap.add_argument("--reklassify", action="store_true",
                    help="eingefrorene Stufen mit den aktuellen Regeln neu berechnen (nur mit --freeze, einmalig nach Regeländerung)")
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
            data = process_game(g, base, args.freeze, args.reklassify)
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

    # Erscheinungsdatum = Datum des ältesten Eintrags (für die Detailseite)
    for gid, v in versions.items():
        f = OUT_DIR / f"{gid}.json"
        try:
            ein = json.loads(f.read_text(encoding="utf-8")).get("eintraege") or []
            if ein:
                v["erste"] = ein[-1]["datum"]
        except (OSError, ValueError, KeyError):
            pass
    vtext = json.dumps(versions, ensure_ascii=False, indent=1, sort_keys=True) + "\n"
    changed += write_if_changed(VERSIONS, vtext)
    changed += write_if_changed(HEADS, json.dumps(heads, indent=1, sort_keys=True) + "\n")
    print(f"{changed} Datei(en) geändert" + (f", Fehler bei: {', '.join(failed)}" if failed else ""))
    if failed and len(failed) == len([g for g in games if g.get('repo')]):
        sys.exit(1)


if __name__ == "__main__":
    main()
