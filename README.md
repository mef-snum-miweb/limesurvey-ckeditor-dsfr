# CKEditorDSFR — extension tierce LimeSurvey

**Extension tierce** (plugin) pour LimeSurvey qui enrichit **l'éditeur de texte riche
(CKEditor)** de l'administration :

- une **palette de composants DSFR** (bouton *Templates*) : alerte (information /
  succès / erreur / avertissement), mise en avant, mise en exergue, accordéon,
  citation, tableau, téléchargement de fichier ;
- un **menu Styles DSFR** qui applique des **classes** `fr-*` (et non des styles
  inline — elles survivent ainsi à la normalisation du thème de sondage) ;
- le **CSS DSFR dans l'iframe** de l'éditeur (aperçu WYSIWYG).

Objectif : permettre aux gestionnaires d'enquêtes de produire du contenu conforme
**sans passer par le mode code**.

> Extension **tierce** — pas une modification du core LimeSurvey. Voir
> [`docs/architecture.md`](docs/architecture.md).

## Architecture — injection *pluggable*, sans modifier le core

Le plugin **n'écrase aucun fichier du core**. Il injecte, sur les pages
d'administration, un petit script (`assets/ckeditor-dsfr.js`) qui s'accroche aux
**événements natifs CKEditor** :

```
CKEDITOR.on('instanceCreated') → editor.on('configLoaded') → on ajoute
  extraPlugins += 'templates', stylesSet, templates_files, contentsCss, toolbar
```

`configLoaded` tombe **après** la config LimeSurvey mais **avant** le chargement
des plugins CKEditor — la fenêtre exacte pour ajouter proprement un plugin. C'est
purement additif : la config LimeSurvey (`limereplacementfields`, `lsswitchtoolbars`,
toolbars…) est préservée, aucun conflit.

## Structure

```
CKEditorDSFR.php            # Plugin : subscribe('beforeControllerAction') → publie
                            #   et enregistre les assets sur les pages d'admin
config.xml                  # Métadonnées LimeSurvey (type=plugin)
assets/
  ckeditor-dsfr.js          # Accroche aux événements CKEditor (injection)
  dsfr-templates.js         # CKEDITOR.addTemplates('dsfr', …) — la palette
  dsfr-styles.js            # CKEDITOR.stylesSet.add('dsfr', …) — le menu Styles
  dsfr-contents.css         # CSS DSFR d'aperçu dans l'iframe
docs/
  architecture.md           # Note d'architecture (extension tierce, publish, packaging)
```

## Installation

### Méthode 1 — Upload & install via l'UI (recommandée, sans accès serveur)

1. Récupérer le ZIP `CKEditorDSFR.zip` depuis les
   [Releases GitHub](https://github.com/mef-snum-miweb/limesurvey-ckeditor-dsfr/releases).
2. Administration LimeSurvey → **Configuration → Plugins → Upload & install**
   → uploader le ZIP.
3. **Installer** puis **Activer** `CKEditorDSFR`.

Le plugin est déposé dans `upload/plugins/CKEditorDSFR/` — dossier **préservé aux
mises à jour** de LimeSurvey (contrairement à `plugins/`).

Cette méthode ne demande que les **droits admin LimeSurvey**, pas d'accès système au
serveur.

### Méthode 2 — Dépôt fichier (accès serveur, git ou docker)

Déposer le dossier dans l'un des emplacements suivants :

- `upload/plugins/CKEditorDSFR/` — préservé aux mises à jour (équivalent Méthode 1
  mais posé à la main) ;
- `plugins/CKEditorDSFR/` — pratique pour un checkout git ou un mount docker (le
  chemin est écrasé lors d'une mise à jour du core LimeSurvey).

Puis : Administration → **Configuration → Plugins** → *Analyser les fichiers* →
**Installer** puis **Activer** `CKEditorDSFR`.

## Usage (côté gestionnaire)

- Composants riches (alerte, accordéon, tableau…) : à insérer dans le champ
  **Aide** d'une question ou les **textes d'introduction / de fin** (HTML conservé).
  **Pas dans l'intitulé** d'une question (rendu en `<h3>`, aplati par le thème).
- Préférer le menu **Styles** (classes DSFR) aux couleurs/tailles manuelles.

## Compatibilité

- **LimeSurvey 5 / 6 / 7** (auto-hébergé — cf. Distribution ci-dessous).
- **CKEditor 4** (embarqué dans LimeSurvey ; version figée par le core).
  > ⚠️ CKEditor 4 est en **fin de vie éditeur depuis juin 2023** (4.22 — dernière
  > release LTS de la lignée 4). Le core LimeSurvey n'a pas encore migré vers
  > CKEditor 5 ; ce plugin suit donc le core.

## Distribution

Deux voies de diffusion possibles :

- **Diffusion interne / gouv** — publication de ZIP taggés sur ce dépôt (GitHub
  Releases). Cible : les instances MEF SNUM / miweb et autres administrations qui
  installent le plugin via *Upload & install*.
- **Répertoire officiel** `extensions.limesurvey.org` — soumission possible (licence
  GPL v2+ conforme, plugin fonctionnel). Nécessite l'approbation de LimeSurvey GmbH ;
  un mécanisme `<updater>` dans `config.xml` peut être ajouté pour les mises à jour
  in-app.

> **Caveat** : LimeSurvey **Cloud / Professional** interdit les plugins tiers. Cette
> extension ne cible que les instances **auto-hébergées** (Community Edition ou
> installations gérées en interne).

## Licence

**GNU GPL v2+** (conforme au core LimeSurvey).
