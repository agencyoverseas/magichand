#!/data/data/com.termux/files/usr/bin/bash
# ============================================================
#  push-magichand.sh
#  Pousse le projet Magic Hands sur
#  https://github.com/agencyoverseas/magichand
#
#  Rien à saisir : le script retrouve seul le jeton GitHub déjà
#  enregistré sur le téléphone. Le jeton n'est jamais écrit dans
#  .git/config — il ne sert que le temps de la commande.
#
#  Usage :
#     bash push-magichand.sh                       # pousse ~/magichand
#     bash push-magichand.sh ~/Downloads/x.zip     # décompresse puis pousse
#     bash push-magichand.sh --diagnostic          # dit où il a trouvé le jeton
# ============================================================

set -u

REPO="agencyoverseas/magichand"
BRANCHE="${BRANCHE:-}"          # vide = on demande au dépôt sa branche par défaut
DOSSIER="$HOME/magichand"
IDENT_DIR="$HOME/.nexusai"
ROUGE=$'\033[31m'; VERT=$'\033[32m'; JAUNE=$'\033[33m'; GRIS=$'\033[90m'; RAZ=$'\033[0m'

dire()  { printf '%s\n' "$*"; }
ok()    { printf '%s✓%s %s\n' "$VERT" "$RAZ" "$*"; }
warn()  { printf '%s!%s %s\n' "$JAUNE" "$RAZ" "$*"; }
err()   { printf '%s✗%s %s\n' "$ROUGE" "$RAZ" "$*" >&2; }
info()  { printf '%s  %s%s\n' "$GRIS" "$*" "$RAZ"; }

# ------------------------------------------------------------
# 1. Trouver le jeton, dans l'ordre du plus rapide au plus lent
# ------------------------------------------------------------
TOKEN=""; SOURCE=""

trouver_token() {
  if [ -n "${GITHUB_TOKEN:-}" ]; then TOKEN="$GITHUB_TOKEN"; SOURCE="variable GITHUB_TOKEN"; return; fi
  if [ -n "${GH_TOKEN:-}" ];     then TOKEN="$GH_TOKEN";     SOURCE="variable GH_TOKEN";     return; fi

  if [ -r "$IDENT_DIR/token" ]; then
    TOKEN="$(tr -d ' \t\r\n' < "$IDENT_DIR/token")"
    [ -n "$TOKEN" ] && { SOURCE="$IDENT_DIR/token"; return; }
  fi

  if command -v gh >/dev/null 2>&1; then
    TOKEN="$(gh auth token 2>/dev/null | tr -d ' \r\n')"
    [ -n "$TOKEN" ] && { SOURCE="gh auth token"; return; }
  fi

  if [ -r "$HOME/.git-credentials" ]; then
    TOKEN="$(sed -n 's#^https://\([^:]*\):\([^@]*\)@github\.com.*#\2#p' "$HOME/.git-credentials" | head -1)"
    [ -n "$TOKEN" ] && { SOURCE="~/.git-credentials"; return; }
  fi

  TOKEN="$(printf 'protocol=https\nhost=github.com\n\n' | git credential fill 2>/dev/null \
           | sed -n 's/^password=//p' | head -1)"
  [ -n "$TOKEN" ] && { SOURCE="git credential fill"; return; }

  # un dépôt local dont l'URL contient déjà un jeton
  for d in "$DOSSIER" "$HOME"/*/.git; do
    [ -d "${d%/.git}/.git" ] || continue
    u="$(git -C "${d%/.git}" remote get-url origin 2>/dev/null)"
    case "$u" in
      *@github.com*)
        TOKEN="$(printf '%s' "$u" | sed -n 's#https://[^:]*:\([^@]*\)@.*#\1#p')"
        [ -n "$TOKEN" ] && { SOURCE="dépôt local ${d%/.git}"; return; } ;;
    esac
  done
}

trouver_token

if [ "${1:-}" = "--diagnostic" ]; then
  if [ -n "$TOKEN" ]; then
    ok "Jeton trouvé — source : $SOURCE"
    info "empreinte : ${TOKEN:0:7}…${TOKEN: -4}  (${#TOKEN} caractères)"
  else
    err "Aucun jeton trouvé."
    dire "  Enregistre-le une fois pour toutes :"
    dire "     mkdir -p ~/.nexusai && printf '%s' 'ghp_xxx' > ~/.nexusai/token && chmod 600 ~/.nexusai/token"
  fi
  # clé SSH en secours
  ls "$HOME/.ssh"/id_* >/dev/null 2>&1 && info "une clé SSH est également présente dans ~/.ssh"
  exit 0
fi

# ------------------------------------------------------------
# 2. Choisir le mode : SSH si pas de jeton mais une clé présente
# ------------------------------------------------------------
MODE="https"
if [ -z "$TOKEN" ]; then
  if ls "$HOME/.ssh"/id_* >/dev/null 2>&1; then
    MODE="ssh"; SOURCE="clé SSH ~/.ssh"
    warn "Pas de jeton : passage en SSH."
  else
    err "Aucun identifiant GitHub trouvé sur cet appareil."
    dire ""
    dire "  Enregistre ton jeton une seule fois :"
    dire "     mkdir -p ~/.nexusai"
    dire "     printf '%s' 'TON_JETON' > ~/.nexusai/token"
    dire "     chmod 600 ~/.nexusai/token"
    dire ""
    dire "  Puis relance ce script. Tu n'auras plus jamais à le saisir."
    exit 1
  fi
fi
ok "Identifiants : $SOURCE"

# ------------------------------------------------------------
# 3 bis. Branche : on interroge le dépôt plutôt que de supposer
# ------------------------------------------------------------
if [ -z "$BRANCHE" ]; then
  if [ "$MODE" = "https" ]; then SONDE="https://x-access-token:${TOKEN}@github.com/${REPO}.git"
  else SONDE="git@github.com:${REPO}.git"; fi
  BRANCHE="$(git ls-remote --symref "$SONDE" HEAD 2>/dev/null \
             | sed -n 's#^ref: refs/heads/\([^\t ]*\).*#\1#p' | head -1)"
  if [ -n "$BRANCHE" ]; then info "branche du dépôt : $BRANCHE"
  else BRANCHE="main"; warn "dépôt injoignable en lecture — on tente « main »"; fi
fi

# ------------------------------------------------------------
# 3. Identité de commit, récupérée une fois puis mémorisée
# ------------------------------------------------------------
mkdir -p "$IDENT_DIR"
if [ -r "$IDENT_DIR/identite" ]; then
  . "$IDENT_DIR/identite"
else
  GIT_NAME=""; GIT_MAIL=""
  if [ "$MODE" = "https" ] && command -v curl >/dev/null 2>&1; then
    rep="$(curl -s -H "Authorization: Bearer $TOKEN" https://api.github.com/user 2>/dev/null)"
    GIT_NAME="$(printf '%s' "$rep" | sed -n 's/.*"login"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -1)"
    id="$(printf '%s' "$rep" | sed -n 's/.*"id"[[:space:]]*:[[:space:]]*\([0-9]*\).*/\1/p' | head -1)"
    [ -n "$GIT_NAME" ] && GIT_MAIL="${id:-0}+${GIT_NAME}@users.noreply.github.com"
  fi
  [ -z "$GIT_NAME" ] && GIT_NAME="agencyoverseas"
  [ -z "$GIT_MAIL" ] && GIT_MAIL="drayk973@gmail.com"
  printf 'GIT_NAME=%s\nGIT_MAIL=%s\n' "$GIT_NAME" "$GIT_MAIL" > "$IDENT_DIR/identite"
fi
info "commit signé : $GIT_NAME <$GIT_MAIL>"

# ------------------------------------------------------------
# 4. Source : un zip passé en argument, ou le dossier existant
# ------------------------------------------------------------
SRC="${1:-}"
if [ -n "$SRC" ] && [ -f "$SRC" ]; then
  case "$SRC" in
    *.zip)
      command -v unzip >/dev/null 2>&1 || { err "unzip absent : pkg install unzip"; exit 1; }
      TMP="$(mktemp -d)"
      unzip -q -o "$SRC" -d "$TMP" || { err "zip illisible"; exit 1; }
      # si le zip contient un seul dossier racine, on descend dedans
      n=$(find "$TMP" -maxdepth 1 -mindepth 1 | wc -l)
      RACINE="$TMP"
      [ "$n" = "1" ] && [ -d "$(find "$TMP" -maxdepth 1 -mindepth 1)" ] && RACINE="$(find "$TMP" -maxdepth 1 -mindepth 1)"
      [ -f "$RACINE/index.html" ] || warn "pas d'index.html à la racine du zip — vérifie le contenu"
      mkdir -p "$DOSSIER"
      # on préserve .git, on remplace le reste
      find "$DOSSIER" -mindepth 1 -maxdepth 1 ! -name '.git' -exec rm -rf {} + 2>/dev/null
      cp -a "$RACINE"/. "$DOSSIER"/
      rm -rf "$TMP"
      ok "zip décompressé dans $DOSSIER"
      ;;
    *) err "argument non reconnu : $SRC"; exit 1 ;;
  esac
fi

[ -d "$DOSSIER" ] || { err "dossier introuvable : $DOSSIER"; exit 1; }
cd "$DOSSIER" || exit 1

# ------------------------------------------------------------
# 5. Dépôt git
# ------------------------------------------------------------
if [ ! -d .git ]; then
  git init -q
  git symbolic-ref HEAD "refs/heads/$BRANCHE"
  ok "dépôt git créé"
fi

git config user.name  "$GIT_NAME"
git config user.email "$GIT_MAIL"
git config core.fileMode false

# URL propre : jamais de jeton stocké ici
if [ "$MODE" = "ssh" ]; then
  URL_PROPRE="git@github.com:${REPO}.git"
  URL_PUSH="$URL_PROPRE"
else
  URL_PROPRE="https://github.com/${REPO}.git"
  URL_PUSH="https://x-access-token:${TOKEN}@github.com/${REPO}.git"
fi
git remote get-url origin >/dev/null 2>&1 \
  && git remote set-url origin "$URL_PROPRE" \
  || git remote add origin "$URL_PROPRE"

# ------------------------------------------------------------
# 5 bis. Se caler sur l'historique distant
#   Le dépôt local vient d'être créé : il ne connaît pas les commits
#   déjà en ligne. Sans ça GitHub refuse le push (« fetch first »).
#   On récupère la branche distante et on pose notre contenu par
#   dessus : rien n'est perdu côté GitHub, l'historique continue.
# ------------------------------------------------------------
if [ "$MODE" = "https" ]; then FETCH_URL="$URL_PUSH"; else FETCH_URL="$URL_PROPRE"; fi
if git fetch -q "$FETCH_URL" "$BRANCHE" 2>/dev/null; then
  if git rev-parse --verify -q FETCH_HEAD >/dev/null; then
    if git rev-parse --verify -q HEAD >/dev/null; then
      # historiques sans ancêtre commun : on repart de la base distante
      if ! git merge-base --is-ancestor FETCH_HEAD HEAD 2>/dev/null; then
        git reset -q --soft FETCH_HEAD
        info "aligné sur l'historique distant"
      fi
    else
      git reset -q --soft FETCH_HEAD
      info "historique distant récupéré"
    fi
  fi
else
  info "dépôt distant vide ou inaccessible en lecture — premier envoi"
fi

# fichiers à ne jamais publier
if [ ! -f .gitignore ]; then
  cat > .gitignore <<'IGN'
node_modules/
.DS_Store
*.log
.env
.env.*
IGN
fi

# ------------------------------------------------------------
# 5 ter. Empreinte de version
#   version.json est réécrit à chaque envoi avec l'empreinte de
#   tous les fichiers servis. Les appareils déjà ouverts la
#   comparent toutes les 90 s et se mettent à jour tout seuls.
# ------------------------------------------------------------
# service-worker.js est exclu : il porte lui-même l'empreinte, l'inclure
# ferait changer la version à chaque envoi même sans modification réelle.
EMPREINTE="$(find . -type f \
     ! -path './.git/*' ! -name 'version.json' ! -name 'push.sh' \
     ! -name 'service-worker.js' \
     -exec md5sum {} + 2>/dev/null | sort -k2 | md5sum | cut -c1-12)"
[ -z "$EMPREINTE" ] && EMPREINTE="$(date +%s)"
HORO="$(date '+%Y%m%d-%H%M%S')"
cat > version.json <<JSON
{
  "hash": "$EMPREINTE",
  "build": "$HORO-$EMPREINTE",
  "date": "$(date '+%d/%m/%Y %H:%M')",
  "note": "Genere automatiquement par push-magichand.sh. Toute modification de fichier change l'empreinte et declenche la mise a jour cote client."
}
JSON
ok "version $HORO-$EMPREINTE"

# le cache du service worker suit la même empreinte
if [ -f service-worker.js ]; then
  sed -i.bak "s/^var CACHE_VERSION = .*/var CACHE_VERSION = 'mh-shell-$EMPREINTE';/" service-worker.js \
    && rm -f service-worker.js.bak
  info "cache du service worker : mh-shell-$EMPREINTE"
fi

# ------------------------------------------------------------
# 6. Commit
# ------------------------------------------------------------
git add -A
if git diff --cached --quiet 2>/dev/null && git rev-parse HEAD >/dev/null 2>&1; then
  warn "aucun changement à envoyer"
  exit 0
fi

MSG="${MSG:-maj $(date '+%d/%m/%Y %H:%M')}"
git commit -q -m "$MSG" || { err "commit impossible"; exit 1; }
ok "commit : $MSG"

# ------------------------------------------------------------
# 7. Push — le jeton ne vit que le temps de la commande
# ------------------------------------------------------------
dire "Envoi vers $REPO ($BRANCHE)…"
# le résultat lu doit être celui de git, pas celui du filtre qui masque le jeton
SORTIE="$(mktemp)"
if [ "${FORCE:-0}" = "1" ]; then
  warn "envoi forcé : l'historique distant sera remplacé"
  git push --force "$URL_PUSH" "HEAD:$BRANCHE" > "$SORTIE" 2>&1
else
  git push "$URL_PUSH" "HEAD:$BRANCHE" > "$SORTIE" 2>&1
fi
CODE=$?
sed "s#${TOKEN:-@@@@}#***#g" "$SORTIE"
if [ "$CODE" -eq 0 ]; then
  ok "poussé sur https://github.com/${REPO}"
  dire ""
  info "Vercel redéploie automatiquement. Compte une à deux minutes."
  info "https://magichand-chi.vercel.app/"
else
  err "échec du push"
  dire ""
  if grep -qi "rejected\|fetch first\|non-fast-forward" "$SORTIE" 2>/dev/null; then
    dire "  GitHub a des commits que ce dossier n'a pas."
    dire "  Relance le script : il se cale maintenant sur l'historique distant."
    dire "  Si le problème persiste, écrase le distant volontairement :"
    dire "     MSG='remise a plat' FORCE=1 bash ~/push-magichand.sh"
  elif grep -qi "authentication\|invalid username\|403\|denied" "$SORTIE" 2>/dev/null; then
    dire "  GitHub refuse les identifiants."
    dire "  Le jeton n'a probablement pas le droit 'repo'."
    dire "  Vérifie avec : bash ~/push-magichand.sh --diagnostic"
  else
    dire "  Vérifie la connexion, puis : bash ~/push-magichand.sh --diagnostic"
  fi
  exit 1
fi

rm -f "$SORTIE"
# le jeton ne doit rester nulle part
unset TOKEN URL_PUSH
