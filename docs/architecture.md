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
- s'**upcaste automatiquement** : les composants existants en base sont
  reconnus au chargement, et l'insertion via la palette Modèles passe par
  `insertHtml` → data processor → upcast.

Particularité : `<button>` n'est pas éditable par défaut dans CKEditor 4 — le
plugin l'autorise via `CKEDITOR.dtd.$editable.button = 1` (pattern documenté
CKE4 pour les nested editables sur éléments non standard). Les autres éléments
utilisés comme zones éditables (`h3`, `p`, `div`, `blockquote`, `figcaption`)
sont déjà dans `CKEDITOR.dtd.$editable` (vérifié dans le build CKEditor de
LimeSurvey 6.16.16).

Bonus : à l'initialisation d'un widget, si l'`id` de sa zone repliable est déjà
présent dans le document (insertion de plusieurs accordéons), un id unique est
généré et `aria-controls` resynchronisé — plus de correction manuelle.

### Composants couverts (issue #9)

Toute la palette Modèles est alignée sur le pattern widget, à l'exception
assumée du tableau (voir plus bas) :

| Composant | Widget | Zones éditables inline | Popin |
| --- | --- | --- | --- |
| Accordéon (`section.fr-accordion`) | `dsfrAccordion` | intitulé (inline simple) + contenu (riche) | Intitulé |
| Onglets (`div.fr-tabs`) — issue #8 | `dsfrTabs` | libellés (inline simple) + panneaux (riches), **dynamiques** | **gestion de la collection** : renommer, ajouter, supprimer (min 2) |
| Mise en avant (`div.fr-callout`) — avec **et** sans titre | `dsfrCallout` | titre (si présent) + texte | Titre **optionnel** (vide = le `h3` est retiré ; rempli = créé et re-branché éditable) |
| Alerte (`div.fr-alert`) — les 4 variantes | `dsfrAlert` | titre + texte (1ᵉʳ paragraphe) | Titre + **select Type** (bascule `fr-alert--info/success/error/warning`) |
| Mise en exergue (`div.fr-highlight`) | `dsfrHighlight` | texte | — |
| Citation (`figure.fr-quote`) | `dsfrQuote` | texte (`blockquote`, paragraphes) + auteur | — |
| Téléchargement (`div.fr-download`) | `dsfrDownload` | **aucune** (`mask: true`) | **geste principal** : URL, Intitulé, Détail |

Compromis assumés :

- **alerte / mise en exergue** : la zone texte est le premier `<p>` du bloc —
  l'édition inline y est limitée à un paragraphe (inline + liens). Structure
  DSFR type (titre + un paragraphe) ; un contenu multi-paragraphes existant est
  préservé (upcast/downcast intacts), seul le premier est éditable en place ;
- **téléchargement** : le lien (`<a>` + `<span class="fr-download__detail">`
  imbriqué) est trop fragile pour l'inline — une frappe au mauvais endroit
  casse l'imbrication. `mask: true` recouvre le widget d'un masque transparent :
  un clic sélectionne le bloc, tout passe par la popin (double-clic, Entrée,
  clic droit).

### Tableau (fr-table) : volontairement PAS un widget

Le composant Tableau de la palette reste un simple template. L'encapsuler dans
un widget casserait l'édition native des tableaux de CKEditor 4 : les plugins
`table`/`tabletools` (clic droit → ajouter/supprimer ligne ou colonne, fusionner
des cellules, propriétés du tableau) opèrent sur une sélection **libre** dans le
document ; à l'intérieur d'un widget, la sélection est confinée aux nested
editables et le menu contextuel est intercepté par le widget — il faudrait
déclarer chaque `<td>` comme zone éditable (structure **dynamique**, impossible
à décrire par des sélecteurs statiques) et réimplémenter la manipulation de
lignes/colonnes. Perte massive de fonctionnalité pour un gain de protection
marginal : la structure d'un tableau est moins fragile (supprimer du texte dans
une cellule ne casse pas le `<table>`) et l'enveloppe `div.fr-table` survit aux
manipulations natives.

### Popin d'édition guidée (en complément de l'inline)

Retour terrain (issue #6) : le widget protège, mais l'édition inline du titre
n'est pas un geste évident pour un contributeur occasionnel. Chaque widget peut
donc déclarer une **popin d'édition** via la clé optionnelle `dialog` de son
entrée du tableau `WIDGETS` :

```js
dialog: {
    title: 'Accordéon',                                   // titre de la popin
    menuLabel: "Modifier l'intitulé de l'accordéon",      // entrée du clic droit
    fields: [                                             // un champ texte par entrée
        { id: 'title', label: "Intitulé de l'accordéon", selector: '.fr-accordion__btn' }
    ]
}
```

Chaque champ lit à l'ouverture (`setup`) l'**état courant** de l'élément
`selector` (racine du widget si absent) dans le DOM du widget — une édition
inline faite juste avant est donc reflétée — et à la validation (`commit`) ne
réécrit **que ce qu'il vise** : les attributs non concernés (`aria-*`, `class`,
`type`…) restent intacts.

**Capacités génériques d'un champ** (issue #9) — combinables par composant,
implémentées une seule fois dans la fabrique :

| Clé du champ | Capacité | Utilisée par |
| --- | --- | --- |
| *(défaut)* | lit/réécrit le **texte** de l'élément | accordéon, alerte (titre), téléchargement (détail) |
| `attr: 'href'` | lit/réécrit un **attribut** au lieu du texte | téléchargement (URL) |
| `ownText: true` | ne touche que les **nœuds texte directs** — les enfants (ex. `<span>` de détail) sont préservés | téléchargement (intitulé) |
| `optional: {tag, className, editable}` | champ vide → l'élément est **retiré** (zone éditable débranchée) ; rempli → **créé** si absent (premier enfant de la racine) et re-branché comme zone éditable | mise en avant (titre) |
| `select: [[libellé, classe], …]` | liste déroulante qui **bascule une classe exclusive** sur l'élément | alerte (type) |

La clé `mask: true` d'une entrée `WIDGETS` (hors `dialog`) recouvre le widget
d'un masque transparent : aucun élément interne n'est cliquable, la popin
devient le geste d'édition principal (téléchargement).

**Gestes d'ouverture** :

- **double-clic sur le cadre** du widget et **Entrée** sur le widget
  sélectionné — fournis automatiquement par le plugin natif `widget` dès que la
  définition porte une propriété `dialog` (la fabrique `buildDefinition` la
  renseigne). Dans les zones éditables imbriquées, le double-clic reste un
  geste de sélection de texte (consommé par CKEditor) : voulu, l'inline y
  prime ;
- **clic droit** → entrée `menuLabel` — PAS fournie par le plugin `widget` (son
  listener contextmenu ne matche que le wrapper et relaie vers l'événement
  `contextMenu` du widget, vide par défaut) : la fabrique ajoute commande,
  item de menu (groupe `dsfrwidgets`) et un listener qui remonte au widget
  depuis n'importe quel descendant cliqué, zones éditables comprises. Le
  plugin `contextmenu` est dans le build LimeSurvey ; en son absence, la popin
  resterait accessible par double-clic et Entrée.

**Philosophie : inline pour les habitués, popin pour le geste guidé.** La popin
ne remplace pas les nested editables — la zone titre reste éditable au clic ;
elle offre un chemin explicite (libellé, champ, OK/Annuler) à qui ne devine pas
que le texte du bouton est modifiable en place. Limite assumée : le champ est
en texte brut — valider la popin remplace un éventuel balisage inline du titre
(`<strong>`…) par du texte simple.

### Onglets (fr-tabs) : vue empilée + capacité « collection » (issue #8)

Les onglets posent un problème nouveau : un nombre **variable** d'éléments
appariés (bouton d'onglet ↔ panneau de contenu) — impossible à décrire par des
zones éditables statiques, et une édition en « vrais onglets » (un seul panneau
visible) masquerait du contenu au contributeur.

**Vue d'édition** : les panneaux sont affichés **empilés** (comme l'accordéon
apparaît déplié), chacun est une zone éditable **riche** (le panneau est un
`div` : contenu multi-paragraphes, listes, images…). La barre d'onglets est du
chrome — seuls ses libellés (`button.fr-tabs__tab`) sont éditables en place
(inline simple, comme l'intitulé d'accordéon). Les repères visuels (barre
d'aperçu, étiquette « Panneau de l'onglet N » par compteur CSS, séparateurs
pointillés) viennent exclusivement de `dsfr-contents.css`, chargé dans l'iframe
de l'éditeur : **rien n'en sort au downcast**.

**Capacité générique `collection`** d'une entrée `WIDGETS` — réutilisable pour
tout composant « liste de déclencheurs + panneaux » (onglets aujourd'hui,
groupe d'accordéons demain) :

- **zones éditables dynamiques** : branchées par `initEditable` au `init` du
  widget (une par libellé, une par panneau), re-branchées après chaque
  validation de popin — le registre `widget.editables` reste cohérent avec le
  DOM, condition du nettoyage des artefacts `cke_*` au downcast ;
- **recâblage** (`wire`) : à chaque init et chaque commit, ids **uniques dans
  le document** (deux blocs d'onglets insérés depuis la palette ne collisionnent
  jamais), appariement `aria-controls` / `aria-labelledby`, et état actif —
  convention : le **premier** onglet est l'actif au downcast (`aria-selected`,
  `tabindex`, classe `fr-tabs__panel--selected`) ;
- **popin de gestion** (geste principal pour la structure, ouverte par
  double-clic sur le cadre, Entrée, clic droit) : une ligne par onglet (champ
  libellé + Supprimer), bouton « Ajouter un onglet », minimum `min` (2)
  éléments. Supprimer un onglet dont le panneau **n'est pas vide** bascule la
  ligne en **confirmation intégrée à la popin** (jamais de `confirm()` natif).
  À la validation, les panneaux conservés **gardent leur nœud DOM** (contenu
  riche intact), la barre est reconstruite, ids/aria resynchronisés.

Au rendu répondant : markup fr-tabs standard — le JS DSFR embarqué par le thème
rend les onglets fonctionnels.

> **Sens éditorial** : quand préférer des onglets à un accordéon (et les limites
> RGAA — ne pas cacher une information indispensable dans un onglet secondaire)
> relève du **guide contributeur de la suite**, hors périmètre de cette
> extension (à traiter côté `limesurvey-dsfr-suite`).

### Ajouter un composant (pattern réutilisable)

Le fichier est **déclaratif** : chaque composant protégé est une entrée du
tableau `WIDGETS` de `dsfr-widgets.js` — aucun code à dupliquer. Pour un futur
composant à structure sensible, ajouter :

```js
{
    name: 'dsfrMonComposant',         // nom unique du widget
    pathName: 'mon composant',        // libellé du fil d'Ariane de l'éditeur
    upcastSelector: { element: 'div', 'class': 'fr-mon-composant' },
    allowedContent: '…',              // règles ACF (classes, aria-*, id…)
    requiredContent: 'div(fr-mon-composant)',
    editables: { … },                 // zones éditables {clé: {selector, allowedContent}}
    idSync: [ … ],                    // option : unicité id + resync aria-*
    mask: true,                       // option : masque — la popin devient le geste principal
    collection: { … },                // option : éléments répétables + popin de gestion (cf. onglets)
    dialog: { … }                     // option : popin d'édition guidée (cf. supra)
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
