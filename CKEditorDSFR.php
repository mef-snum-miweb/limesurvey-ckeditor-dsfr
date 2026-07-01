<?php

/**
 * CKEditorDSFR — plugin LimeSurvey.
 *
 * Ajoute une palette de composants DSFR (alerte, mise en avant, accordéon,
 * citation, tableau, téléchargement…) et un menu de styles DSFR à l'éditeur
 * de texte riche (CKEditor) de l'administration.
 *
 * Architecture : le plugin injecte, sur les pages d'administration, un petit
 * script qui s'accroche aux événements NATIFS de CKEditor
 * (`instanceCreated` → `configLoaded`) pour ajouter le plugin « templates »,
 * un `stylesSet` et un `contentsCss`. AUCUN fichier du core n'est modifié
 * (pas d'override de config.js) — cf. ADR-071.
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

        $assetUrl = $this->publish('assets');

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
}
