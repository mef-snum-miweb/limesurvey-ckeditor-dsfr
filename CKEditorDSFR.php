<?php

/**
 * CKEditorDSFR — extension tierce LimeSurvey (plugin).
 *
 * Ajoute une palette de composants DSFR (alerte, mise en avant, accordéon,
 * citation, tableau, téléchargement…) et un menu de styles DSFR à l'éditeur
 * de texte riche (CKEditor) de l'administration.
 *
 * Architecture : le plugin injecte, sur les pages d'administration, un petit
 * script qui s'accroche aux événements NATIFS de CKEditor
 * (`instanceCreated` → `configLoaded`) pour ajouter le plugin « templates »,
 * un `stylesSet` et un `contentsCss`. AUCUN fichier du core LimeSurvey
 * n'est modifié — public API et événements uniquement.
 */
class CKEditorDSFR extends PluginBase
{
    protected $storage = 'DbStorage';

    protected static $name = 'CKEditorDSFR';
    protected static $description = 'Palette de composants et styles DSFR pour l\'éditeur CKEditor de LimeSurvey.';

    /**
     * Contrôleurs de rendu du sondage côté répondant : on n'y injecte JAMAIS
     * l'éditeur (il n'y est pas chargé, et ça polluerait les pages publiques).
     */
    private $frontControllers = ['survey', 'surveys'];

    public function init()
    {
        // Un seul point d'accroche : avant chaque action de contrôleur, on
        // décide d'injecter (ou non) les assets sur les pages d'admin.
        $this->subscribe('beforeControllerAction');
    }

    public function beforeControllerAction()
    {
        $event = $this->getEvent();
        $controller = (string) $event->get('controller');

        // Ne rien charger sur le rendu public du sondage.
        if (in_array($controller, $this->frontControllers, true)) {
            return;
        }

        // Garde-fou : avertir l'admin si le plugin est présent dans plusieurs
        // répertoires (une copie résiduelle masquerait silencieusement la
        // version réellement installée — voir issue #2).
        $this->warnIfShadowed();

        // Publication indépendante de l'emplacement : `PluginBase::publish()`
        // résout le chemin source en dur sur `webroot.plugins.<Classe>` = `plugins/`.
        // Or ce plugin peut être installé dans `upload/plugins/` (flux « Upload &
        // install » de l'UI) ou `application/core/plugins/`. On publie donc l'asset
        // directement depuis `__DIR__` — fonctionne depuis les 3 emplacements.
        $assetUrl = App()->getAssetManager()->publish(__DIR__ . '/assets');

        // Cache-buster : LimeSurvey publie les assets sous un hash de chemin
        // stable → sans version dans l'URL, le navigateur sert l'ancien JS
        // après une mise à jour du plugin. On suffixe `?v=<mtime max>` : l'URL
        // change dès qu'un asset change, forçant le rechargement.
        $dir = __DIR__ . '/assets/';
        $ver = 0;
        foreach (['ckeditor-dsfr.js', 'dsfr-templates.js', 'dsfr-styles.js', 'dsfr-contents.css'] as $f) {
            $m = @filemtime($dir . $f);
            if ($m && $m > $ver) {
                $ver = $m;
            }
        }

        // URL de base + version des assets DSFR → consommées par ckeditor-dsfr.js
        // (qui suffixe lui-même ?v= sur templates_files / stylesSet / contentsCss).
        App()->clientScript->registerScript(
            'CKEditorDSFR-config',
            'window.CKEditorDSFRConfig = {assetUrl: ' . json_encode($assetUrl, JSON_HEX_TAG | JSON_HEX_APOS | JSON_HEX_QUOT) . ', v: ' . (int) $ver . '};',
            CClientScript::POS_HEAD
        );

        // Script d'accroche aux événements CKEditor (natif, non destructif).
        App()->clientScript->registerScriptFile(
            $assetUrl . '/ckeditor-dsfr.js?v=' . (int) $ver,
            CClientScript::POS_HEAD
        );
    }

    /**
     * Garde-fou anti-shadowing (issue #2).
     *
     * `PluginManager::getPluginInfo()` parcourt les 3 répertoires de plugins
     * (`PluginManager::$pluginDirs`) dans l'ordre `user` (`plugins/`) →
     * `core` (`application/core/plugins/`) → `upload` (`upload/plugins/`) et
     * s'arrête au PREMIER `CKEditorDSFR.php` trouvé. Or la désinstallation via
     * l'UI ne supprime que la ligne en base — jamais les fichiers. Une copie
     * résiduelle dans `plugins/` masque donc silencieusement une version plus
     * récente installée par ZIP dans `upload/plugins/` : l'admin croit
     * exécuter la nouvelle version, il exécute l'ancienne, sans aucun message.
     *
     * On détecte ici la double présence et on affiche un avertissement admin
     * NON bloquant via le pipeline standard : `setFlashMessage()` alimente
     * `session['aFlashMessage']`, consommé par le widget `FlashMessage`
     * (rendu dans `views/admin/super/header.php`) puis affiché par
     * `notifications.php`. API publiques uniquement, aucun fichier core touché.
     */
    private function warnIfShadowed()
    {
        // Les 3 emplacements reconnus par le core, dans son ordre de
        // résolution effectif (miroir de PluginManager::$pluginDirs).
        $aliases = [
            'user'   => 'webroot.plugins',
            'core'   => 'application.core.plugins',
            'upload' => 'uploaddir.plugins',
        ];

        $pluginName = get_class($this);
        $loadedDir = realpath(__DIR__) ?: __DIR__;
        $ignoredDirs = [];
        $present = 0;

        foreach ($aliases as $type => $alias) {
            $base = Yii::getPathOfAlias($alias);
            if ($base === false && $type === 'upload') {
                // L'alias racine `uploaddir` est posé par le PluginManager à
                // son init ; par prudence, retomber sur la config si absent.
                $uploadDir = (string) App()->getConfig('uploaddir');
                $base = $uploadDir !== '' ? $uploadDir . DIRECTORY_SEPARATOR . 'plugins' : false;
            }
            if ($base === false) {
                continue;
            }
            $dir = $base . DIRECTORY_SEPARATOR . $pluginName;
            if (!is_dir($dir)) {
                continue;
            }
            $present++;
            if ((realpath($dir) ?: $dir) !== $loadedDir) {
                $ignoredDirs[] = $dir;
            }
        }

        if ($present < 2 || $ignoredDirs === []) {
            return;
        }

        // Chemins encodés à la main : la vue notifications.php rend le
        // message en HTML brut (AlertWidget fait `echo $text;`).
        $ignoredList = implode(
            '</code>, <code>',
            array_map(['CHtml', 'encode'], $ignoredDirs)
        );
        $message = '<strong>' . $pluginName . ' est présent dans plusieurs répertoires de plugins.</strong><br>'
            . 'Version réellement chargée : <code>' . CHtml::encode($loadedDir) . '</code><br>'
            . 'Emplacement(s) ignoré(s) (ordre de résolution user → core → upload) : <code>' . $ignoredList . '</code><br>'
            . 'Supprimez la copie obsolète côté serveur — typiquement la copie résiduelle de '
            . '<code>plugins/</code>, qui masque silencieusement une version installée par ZIP dans '
            . '<code>upload/plugins/</code>.';

        // Ne pas empiler le même avertissement : plusieurs requêtes (AJAX
        // compris) peuvent passer ici avant le prochain rendu du widget.
        $aFlash = App()->session['aFlashMessage'];
        if (is_array($aFlash)) {
            foreach ($aFlash as $flash) {
                if (isset($flash['message']) && $flash['message'] === $message) {
                    return;
                }
            }
        }

        App()->setFlashMessage($message, 'warning');
    }
}
