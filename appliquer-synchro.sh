#!/data/data/com.termux/files/usr/bin/bash
# ============================================================
#  appliquer-synchro.sh
#  Applique la livraison « synchro » sur le dépôt local
#  puis pousse sur https://github.com/agencyoverseas/magichand
#
#  Ce que le script fait, dans l'ordre :
#     1. il vérifie qu'il est bien lancé depuis le dossier de
#        la livraison (celui qui contient index.html) ;
#     2. il sauvegarde les fichiers qu'il va remplacer, datés,
#        dans le dépôt sous .sauvegarde-<date>/ ;
#     3. il copie les nouveaux fichiers ;
#     4. il supprime assets/sync.js, qui n'est plus appelé ;
#     5. il commite et pousse, en réutilisant le jeton GitHub
#        déjà enregistré sur l'appareil — jamais écrit dans
#        .git/config.
#
#  Usage :
#     bash appliquer-synchro.sh                 # dépôt dans ~/magichand
#     bash appliquer-synchro.sh ~/mon/depot     # autre emplacement
#     bash appliquer-synchro.sh --sans-push     # applique sans pousser
# ============================================================

set -u

REPO="agencyoverseas/magichand"
DEPOT="${1:-$HOME/magichand}"
[ "$DEPOT" = "--sans-push" ] && DEPOT="$HOME/magichand"
SANS_PUSH=0
for a in "$@"; do [ "$a" = "--sans-push" ] && SANS_PUSH=1; done

IDENT_DIR="$HOME/.nexusai"
SOURCE="$(cd "$(dirname "$0")" && pwd)"
DATE="$(date +%Y%m%d-%H%M)"

ROUGE=$'\033[31m'; VERT=$'\033[32m'; JAUNE=$'\033[33m'; GRIS=$'\033[90m'; RAZ=$'\033[0m'
ok()   { printf '%s✓%s %s\n' "$VERT" "$RAZ" "$*"; }
warn() { printf '%s!%s %s\n' "$JAUNE" "$RAZ" "$*"; }
err()  { printf '%s✗%s %s\n' "$ROUGE" "$RAZ" "$*" >&2; }
info() { printf '%s  %s%s\n' "$GRIS" "$*" "$RAZ"; }

FICHIERS_ASSETS="mh-data.js mh-bridge.js mh-etat.js mh-ui.js etat.css pwa.js"
FICHIERS_RACINE="index.html service-worker.js version.json"

# ------------------------------------------------------------
# 1. Vérifications
# ------------------------------------------------------------
[ -f "$SOURCE/index.html" ] || { err "Lance le script depuis le dossier qui contient index.html."; exit 1; }

# Le zip complet peut avoir ete decompresse DIRECTEMENT dans le depot.
# Dans ce cas il n y a rien a copier : les fichiers sont deja en place,
# et se copier sur soi-meme ferait echouer le script.
SUR_PLACE=0
CIBLE="$(cd "$DEPOT" 2>/dev/null && pwd || echo _)"
if [ "$SOURCE" = "$CIBLE" ]; then SUR_PLACE=1; fi
if [ "$SUR_PLACE" = "0" ] && [ -d "$SOURCE/.git" ] && [ ! -d "$DEPOT/.git" ]; then
  DEPOT="$SOURCE"; SUR_PLACE=1
fi
[ -d "$DEPOT/.git" ] || { err "Pas de depot git dans $DEPOT"; exit 1; }

for f in $FICHIERS_ASSETS; do
  [ -f "$SOURCE/assets/$f" ] || { err "Fichier manquant dans la livraison : assets/$f"; exit 1; }
done
ok "Livraison complète, dépôt trouvé dans $DEPOT"

# ------------------------------------------------------------
# 2. Sauvegarde de l'existant
#    On ne remplace jamais sans garder une copie : si un bug
#    apparaît, tu reviens en arrière en une commande.
# ------------------------------------------------------------
if [ "$SUR_PLACE" = "1" ]; then
  info "Fichiers deja dans le depot : aucune copie necessaire"
else
SAUV="$DEPOT/.sauvegarde-$DATE"
mkdir -p "$SAUV/assets"
for f in $FICHIERS_ASSETS sync.js; do
  [ -f "$DEPOT/assets/$f" ] && cp "$DEPOT/assets/$f" "$SAUV/assets/$f"
done
for f in $FICHIERS_RACINE; do
  [ -f "$DEPOT/$f" ] && cp "$DEPOT/$f" "$SAUV/$f"
done
ok "Anciens fichiers sauvegardés dans $(basename "$SAUV")"

# ------------------------------------------------------------
# 3. Copie des nouveaux fichiers
# ------------------------------------------------------------
mkdir -p "$DEPOT/assets"
for f in $FICHIERS_ASSETS; do
  cp "$SOURCE/assets/$f" "$DEPOT/assets/$f" && info "assets/$f"
done
for f in $FICHIERS_RACINE; do
  cp "$SOURCE/$f" "$DEPOT/$f" && info "$f"
done
ok "Fichiers copiés"
fi

# ------------------------------------------------------------
# 4. Retrait de l'ancienne synchronisation
# ------------------------------------------------------------
if [ -f "$DEPOT/assets/sync.js" ]; then
  rm -f "$DEPOT/assets/sync.js"
  ok "assets/sync.js supprimé (remplacé par mh-etat.js)"
else
  info "assets/sync.js déjà absent"
fi

if grep -rq "sync\.js" "$DEPOT/index.html" "$DEPOT/service-worker.js" 2>/dev/null; then
  warn "Une référence à sync.js subsiste — à vérifier avant de pousser"
fi

# ------------------------------------------------------------
# 5. Empreinte de version, pour que la mise à jour se déclenche
#    toute seule sur les appareils déjà installés
# ------------------------------------------------------------
if [ -f "$DEPOT/version.json" ]; then
  EMPREINTE="$(cd "$DEPOT" && cat index.html assets/*.js assets/*.css 2>/dev/null | md5sum | cut -c1-12)"
  printf '{ "version": "%s", "date": "%s" }\n' "$EMPREINTE" "$(date -Iseconds)" > "$DEPOT/version.json"
  ok "version.json mis à jour ($EMPREINTE)"
fi

[ "$SANS_PUSH" = "1" ] && { ok "Terminé (sans push, comme demandé)."; exit 0; }

# ------------------------------------------------------------
# 6. Jeton GitHub
# ------------------------------------------------------------
TOKEN=""; ORIGINE=""
if   [ -n "${GITHUB_TOKEN:-}" ]; then TOKEN="$GITHUB_TOKEN"; ORIGINE="variable GITHUB_TOKEN"
elif [ -n "${GH_TOKEN:-}" ];     then TOKEN="$GH_TOKEN";     ORIGINE="variable GH_TOKEN"
elif [ -r "$IDENT_DIR/token" ];  then TOKEN="$(tr -d ' \t\r\n' < "$IDENT_DIR/token")"; ORIGINE="$IDENT_DIR/token"
elif [ -r "$HOME/.git-credentials" ]; then
  TOKEN="$(sed -n 's#https://[^:]*:\([^@]*\)@github.com.*#\1#p' "$HOME/.git-credentials" | head -n1)"
  ORIGINE="$HOME/.git-credentials"
fi

[ -n "$TOKEN" ] || {
  err "Aucun jeton GitHub trouvé."
  info "Enregistre-le une fois :  mkdir -p ~/.nexusai && printf '%s' 'ghp_xxx' > ~/.nexusai/token && chmod 600 ~/.nexusai/token"
  exit 1
}
ok "Jeton trouvé ($ORIGINE)"

# ------------------------------------------------------------
# 7. Commit et push
# ------------------------------------------------------------
cd "$DEPOT" || exit 1

git config user.name  >/dev/null 2>&1 || git config user.name  "NexusAI"
git config user.email >/dev/null 2>&1 || git config user.email "hello@nexusai-agency.fr"

BRANCHE="$(git symbolic-ref --quiet --short HEAD 2>/dev/null || echo main)"

# la sauvegarde locale ne part pas sur GitHub
grep -q '^\.sauvegarde-' .gitignore 2>/dev/null || echo '.sauvegarde-*' >> .gitignore

git add -A
if git diff --cached --quiet; then
  warn "Rien à commiter : les fichiers sont déjà à jour."
else
  git commit -q -m "Synchro : pont unique, file d'attente fiable, corbeille, état hors ligne

- sync.js et mh_state retirés, le pont par tables devient l'unique chemin
- la file d'attente ne se vide plus en bloc : chaque opération est
  retirée seulement quand le serveur l'a acceptée
- 5 tentatives espacées puis mise de côté, sans bloquer la file
- modifications et suppressions remontent enfin en base
- téléphone et email transmis à la fiche élève
- état réseau vérifié auprès du serveur, pas seulement du navigateur
- bandeau et pastille hors ligne, liste d'attente, diagnostic, auto-test"
  ok "Commit créé"
fi

# alignement sur le distant avant d'envoyer
git remote set-url origin "https://github.com/$REPO.git" 2>/dev/null
git -c credential.helper= \
    -c http.extraheader="AUTHORIZATION: basic $(printf 'x-access-token:%s' "$TOKEN" | base64 | tr -d '\n')" \
    pull --rebase --quiet origin "$BRANCHE" 2>/dev/null || warn "Pas de rebase possible, on tente le push tel quel"

if git -c credential.helper= \
       -c http.extraheader="AUTHORIZATION: basic $(printf 'x-access-token:%s' "$TOKEN" | base64 | tr -d '\n')" \
       push origin "$BRANCHE"; then
  ok "Poussé sur $REPO ($BRANCHE)"
  info "Vercel va redéployer tout seul. Attends la fin du build, puis recharge l'app deux fois."
else
  err "Push refusé. Vérifie que le jeton a le droit 'repo' et que la branche $BRANCHE existe."
  exit 1
fi
