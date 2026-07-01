# CKEditorDSFR — plugin LimeSurvey

Ajoute à l'**éditeur de texte riche (CKEditor)** de l'administration LimeSurvey :

- une **palette de composants DSFR** (bouton *Templates*) : alerte (information /
  succès / erreur / avertissement), mise en avant, mise en exergue, accordéon,
  citation, tableau, téléchargement de fichier ;
- un **menu Styles DSFR** qui applique des **classes** `fr-*` (et non des styles
  inline — elles survivent ainsi à la normalisation du thème de sondage) ;
- le **CSS DSFR dans l'iframe** de l'éditeur (aperçu WYSIWYG).

Objectif : permettre aux gestionnaires d'enquêtes de produire du contenu conforme
**sans passer par le mode code**. Cf. ADR-071 (stratégie de contribution DSFR).

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
```

## Installation

1. Déposer le dossier dans `plugins/CKEditorDSFR/` de l'instance LimeSurvey
   (ou le monter via docker-compose, cf. `limesurvey-dsfr-suite`).
2. Administration → **Configuration > Plugins** → *Analyser les fichiers* →
   **Installer** puis **Activer** `CKEditorDSFR`.
3. L'éditeur des questions / textes affiche le menu **Styles** et le bouton
   **Templates** avec les entrées DSFR.

## Usage (côté gestionnaire)

- Composants riches (alerte, accordéon, tableau…) : à insérer dans le champ
  **Aide** d'une question ou les **textes d'introduction / de fin** (HTML conservé).
  **Pas dans l'intitulé** d'une question (rendu en `<h3>`, aplati par le thème).
- Préférer le menu **Styles** (classes DSFR) aux couleurs/tailles manuelles.

## Compatibilité

LimeSurvey 5 / 6 / 7. Éditeur CKEditor 4 (embarqué dans LimeSurvey).
