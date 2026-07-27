# Architecture — CKEditorDSFR

Note d'architecture autonome, ADR-style, décrivant le positionnement, les
contraintes techniques et le packaging de l'extension.

## Positionnement — extension tierce, pas core

`CKEditorDSFR` est une **extension tierce** (plugin) au sens de LimeSurvey. Elle
**ne modifie aucun fichier du core** et n'ajoute rien à `application/` : elle
s'accroche aux **événements publics** de CKEditor 4 et du PluginManager LimeSurvey.

Cette contrainte est structurante : elle rend le plugin **installable et
désinstallable** proprement via l'UI d'administration, sans intervention système,
et **survit aux mises à jour** de LimeSurvey si déposée dans `upload/plugins/`.

## Les 3 répertoires de plugins LimeSurvey

Le `PluginManager` reconnaît trois emplacements pour découvrir les plugins
(`PluginManager::$pluginDirs`) :

| Clé      | Alias Yii                    | Chemin réel                 | Écrasé aux MàJ core ? |
| -------- | ---------------------------- | --------------------------- | ---------------------- |
| `core`   | `application.core.plugins`   | `application/core/plugins/` | oui (livré par le core) |
| `user`   | `webroot.plugins`            | `plugins/`                  | oui                    |
| `upload` | `uploaddir.plugins`          | `upload/plugins/`           | **non — préservé**     |

Source : [`PluginManager.php`](https://github.com/LimeSurvey/LimeSurvey/blob/master/application/libraries/PluginManager/PluginManager.php).

Le flux **Upload & install** de l'UI d'administration (*Configuration → Plugins*)
dépose l'extension dans `upload/plugins/<name>/`, où `<name>` vient de
`config.xml <metadata><name>` — pour ce plugin : `CKEditorDSFR`.

Détails du flux : `FileFetcherUploadZip` décompresse le ZIP dans un tempdir et
localise `config.xml` (à la racine de l'archive **ou** dans un sous-dossier,
recherche récursive) ; `PluginInstaller extends ExtensionInstaller` copie ensuite
dans `getPluginFolder($config, 'upload')`. La config par défaut
`allowedpluginuploads` inclut `php, xml, js, css, md` — tous les fichiers du plugin
passent.

Source : [`FileFetcherUploadZip.php`](https://github.com/LimeSurvey/LimeSurvey/blob/master/application/libraries/ExtensionInstaller/FileFetcherUploadZip.php).

### Ordre de résolution & shadowing (vérifié sur LimeSurvey 6.16.16)

`PluginManager::getPluginInfo()` parcourt `$pluginDirs` dans l'ordre **`user`
(`plugins/`) → `core` (`application/core/plugins/`) → `upload`
(`upload/plugins/`)** et s'arrête au **premier** `CKEditorDSFR.php` trouvé. Une
copie présente dans un répertoire prioritaire **masque silencieusement** toute
copie des répertoires suivants.

Scénario reproduit (issue [#2](https://github.com/mef-snum-miweb/limesurvey-ckeditor-dsfr/issues/2)) :

1. Plugin installé via `plugins/` (filesystem — checkout git ou bind-mount docker).
2. Dans l'UI d'admin : désactivation → **désinstallation**. L'UI ne supprime que
   la ligne en base — jamais les fichiers (le bouton « Delete files » de
   `PluginManagerController::deleteFiles()` n'existe que pour les plugins `upload`).
3. **Réinstallation via Upload & install** (ZIP) : la ligne DB est créée
   (`plugin_type=upload`, nouvelle version), les fichiers déposés dans
   `upload/plugins/CKEditorDSFR/` — **sans aucune erreur**.
4. Mais la copie résiduelle de `plugins/CKEditorDSFR/` est trouvée en premier :
   **la classe chargée vient de l'ancienne copie** (vérifié au runtime via
   `ReflectionClass`), alors que l'admin affiche la version du ZIP (lue en DB).
   Les assets suivent, publiés depuis le `__DIR__` de la classe chargée.
   Effet secondaire : `getPluginInfo()` retourne `extensionConfig=null` (classe
   déjà chargée au boot), dégradant l'affichage compatibilité/description.

En clair : l'admin croit exécuter la nouvelle version, il exécute l'ancienne,
sans aucun message nulle part.

**Garde-fou implémenté** — à `beforeControllerAction` (pages admin uniquement),
le plugin résout les 3 emplacements (`Yii::getPathOfAlias()` sur les alias du
tableau ci-dessus, avec fallback `App()->getConfig('uploaddir')` si l'alias
`uploaddir` n'est pas encore posé) et fait un `is_dir` sur chacun. S'il se
trouve dans **plusieurs** emplacements, il affiche un avertissement admin non
bloquant (`setFlashMessage(..., 'warning')`, rendu par le widget `FlashMessage`
du header d'admin) indiquant l'emplacement réellement chargé (`__DIR__`), le ou
les emplacements ignorés, et la consigne : **supprimer la copie obsolète côté
serveur**. Procédure de migration complète : voir le
[README](../README.md#migrer-dune-installation-filesystem-vers-le-zip).

## Contrainte publish() → et son contournement

`PluginBase::publish($assetName)` (méthode utilitaire pour publier un dossier
d'assets via l'AssetManager Yii) résout le chemin source **en dur** :

```php
Yii::getPathOfAlias('webroot.plugins.' . get_class($this))
```

soit `plugins/<Classe>/<assetName>` — **quel que soit l'emplacement réel** du
plugin. Aucun alias par-plugin n'est enregistré au démarrage. **Conséquence** :
installé dans `upload/plugins/`, la publication d'assets via `publish()` échoue
(chemin source inexistant → l'AssetManager lève une exception).

Source : [`PluginBase.php` ~L249-268](https://github.com/LimeSurvey/LimeSurvey/blob/master/application/libraries/PluginManager/PluginBase.php).

**Contournement retenu** — publier directement via l'AssetManager avec un chemin
absolu résolu par `__DIR__` :

```php
// À la place de : $assetUrl = $this->publish('assets');
$assetUrl = App()->getAssetManager()->publish(__DIR__ . '/assets');
```

`__DIR__` pointe vers le vrai dossier du plugin (`plugins/`, `upload/plugins/`,
ou `application/core/plugins/`) — la publication fonctionne depuis les trois. Le
reste du pipeline (cache-buster via `filemtime`, `registerScript` / `registerScriptFile`)
est inchangé.

## Flux d'injection dans CKEditor 4

Le plugin s'abonne à `beforeControllerAction`. Sur les contrôleurs d'admin
(excluant `survey` / `surveys` — pages publiques du sondage, sans éditeur), il
publie ses assets et injecte deux scripts dans `<head>` :

1. `window.CKEditorDSFRConfig = {assetUrl, v}` (l'URL de publication + version) ;
2. `ckeditor-dsfr.js`, qui s'accroche aux **événements natifs CKEditor** :

```
CKEDITOR.on('instanceCreated', ({editor}) => {
  editor.on('configLoaded', () => {
    editor.config.extraPlugins   = (editor.config.extraPlugins || '') + ',templates,dsfrwidgets';
    CKEDITOR.plugins.addExternal('dsfrwidgets', assetUrl + '/dsfr-widgets.js?v=' + v, '');
    editor.config.stylesSet      = 'dsfr:' + assetUrl + '/dsfr-styles.js?v=' + v;
    editor.config.templates_files= [assetUrl + '/dsfr-templates.js?v=' + v];
    editor.config.contentsCss    = [...contentsCss, assetUrl + '/dsfr-contents.css?v=' + v];
    // + réglage de toolbar
  });
});
```

`configLoaded` tombe **après** la config LimeSurvey mais **avant** le chargement
des plugins CKEditor : la fenêtre exacte pour ajouter proprement `templates`,
`stylesSet` et `contentsCss` sans écraser la config LimeSurvey
(`limereplacementfields`, `lsswitchtoolbars`, toolbars par défaut).

## Widgets CKEditor : structure protégée, zones éditables

### Pourquoi

Certains composants DSFR reposent sur une **structure HTML stricte** dont la
casse est silencieuse pour le contributeur. Cas fondateur (issue #3) :
l'accordéon (`section > h3 > button.fr-accordion__btn + div.fr-collapse`). Dans
un éditeur classique, une sélection de texte trop large (triple-clic, Ctrl+A,
glisser) englobe le `<button>` lui-même : taper du texte **supprime le bouton**
et casse l'accordéon sans message.

### Comment

`assets/dsfr-widgets.js` déclare un plugin CKEditor 4 (`dsfrwidgets`) fondé sur
le système de **widgets** (plugin natif `widget` + `lineutils`, embarqués dans
le build CKEditor de LimeSurvey — seul `dsfrwidgets` est externe, enregistré
via `CKEDITOR.plugins.addExternal` depuis `ckeditor-dsfr.js`). Un widget :

- rend la structure **atomique** : insupprimable par une sélection de texte,
  déplaçable/supprimable uniquement en sélectionnant le bloc entier (cadre +
  poignée) ;
- ouvre des **zones éditables imbriquées** (*nested editables*) là où le
  contributeur doit saisir : pour l'accordéon, l'intitulé (`.fr-accordion__btn`,
  contenu limité à de l'inline simple) et le contenu (`.fr-collapse`, riche) ;
- garde un **downcast propre** : le HTML enregistré est le markup DSFR exact,
  sans artefact widget (wrappers et classes `cke_*` retirés des données) ;
- s'**upcaste automatiquement** : les accordéons existants en base sont
  reconnus au chargement, et l'insertion via la palette Modèles passe par
  `insertHtml` → data processor → upcast.

Particularité : `<button>` n'est pas éditable par défaut dans CKEditor 4 — le
plugin l'autorise via `CKEDITOR.dtd.$editable.button = 1` (pattern documenté
CKE4 pour les nested editables sur éléments non standard).

Bonus : à l'initialisation d'un widget, si l'`id` de sa zone repliable est déjà
présent dans le document (insertion de plusieurs accordéons), un id unique est
généré et `aria-controls` resynchronisé — plus de correction manuelle.

### Ajouter un composant (pattern réutilisable)

Le fichier est **déclaratif** : chaque composant protégé est une entrée du
tableau `WIDGETS` de `dsfr-widgets.js` — aucun code à dupliquer. Pour un futur
composant à structure sensible (ex. **onglets DSFR**), ajouter :

```js
{
    name: 'dsfrTabs',                 // nom unique du widget
    pathName: 'onglets',              // libellé du fil d'Ariane de l'éditeur
    upcastSelector: { element: 'div', 'class': 'fr-tabs' },
    allowedContent: '…',              // règles ACF (classes, aria-*, id…)
    requiredContent: 'div(fr-tabs)',
    editables: { … },                 // zones éditables {clé: {selector, allowedContent}}
    idSync: [ … ]                     // option : unicité id + resync aria-*
}
```

Si une zone éditable vise un élément absent de `CKEDITOR.dtd.$editable`
(`button`, etc.), l'y ajouter en tête de `init` comme pour l'accordéon. Ne pas
oublier d'ajouter tout nouveau fichier d'asset à la liste du cache-buster dans
`CKEditorDSFR.php`.

## Packaging & release

Distribution par **ZIP taggé** via GitHub Actions (`.github/workflows/release.yml`) :

- Déclencheur : `push` sur un tag `v*`.
- Le workflow vérifie que le tag correspond à `<version>` dans `config.xml`
  (ex. `v1.2.3` ↔ `<version>1.2.3</version>`).
- `git archive --format=zip --prefix=CKEditorDSFR/ -o CKEditorDSFR.zip HEAD` produit
  une archive dont **la racine est `CKEditorDSFR/`** — nom aligné sur
  `config.xml <metadata><name>`, ce qu'attend le `FileFetcherUploadZip`.
- `gh release create` publie la release avec le ZIP en asset.

Un `.gitattributes` avec `export-ignore` sur `/.github` et `/.gitattributes`
garde l'archive propre (pas de fichiers de CI dans le plugin livré).

> **Note** : `git archive HEAD` empaquette l'arbre **committé**. Tout changement
> doit être committé avant de taguer.

## Non-modification du core

Aucune écriture n'est faite hors du dossier du plugin lui-même. Aucun fichier de
`application/`, `themes/`, `plugins/` (autre que ce plugin) n'est touché. Seuls
sont utilisés :

- l'API publique du **PluginManager** (`PluginBase`, `subscribe`, `getEvent`) ;
- l'API publique de **CKEditor 4** (`CKEDITOR.on`, `editor.on('configLoaded')`,
  `config.extraPlugins`, `stylesSet`, `templates_files`, `contentsCss`) ;
- l'API publique de **Yii/LimeSurvey** (`App()->getAssetManager()->publish()`,
  `App()->clientScript->registerScript*`).

## CKEditor 4 — fin de vie

CKEditor 4 est en **fin de vie éditeur depuis juin 2023** (4.22 — dernière release
LTS). Le core LimeSurvey n'a pas encore migré vers CKEditor 5 ; ce plugin suit donc
le core. Une migration vers CKEditor 5 n'est envisageable qu'après une bascule
équivalente côté core LimeSurvey — hors périmètre à ce jour.

## Diffusion

Deux voies possibles :

- **Diffusion interne / gouv** : publication de ZIP taggés sur ce dépôt GitHub.
  Cible = instances auto-hébergées MEF SNUM / miweb et autres administrations.
- **Répertoire officiel** `extensions.limesurvey.org` : soumission possible (GPL v2+
  conforme). Nécessite l'approbation LimeSurvey GmbH ; un `<updater>` peut être
  ajouté à `config.xml` pour piloter les mises à jour in-app.

**Caveat** : LimeSurvey **Cloud / Professional** interdit les plugins tiers — la
cible est exclusivement **auto-hébergée** (Community Edition ou installations
gérées en interne).

## Sources

- [`PluginBase.php`](https://github.com/LimeSurvey/LimeSurvey/blob/master/application/libraries/PluginManager/PluginBase.php)
- [`PluginManager.php`](https://github.com/LimeSurvey/LimeSurvey/blob/master/application/libraries/PluginManager/PluginManager.php)
- [`FileFetcherUploadZip.php`](https://github.com/LimeSurvey/LimeSurvey/blob/master/application/libraries/ExtensionInstaller/FileFetcherUploadZip.php)
