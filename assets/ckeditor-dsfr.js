/**
 * Injection DSFR dans l'éditeur CKEditor de LimeSurvey — mode PLUGGABLE.
 *
 * Contrairement à un override de config.js (qui écrase un fichier core), on
 * utilise les événements natifs CKEditor : `instanceCreated` (avant init) puis
 * `configLoaded` (après la config LimeSurvey, mais AVANT le chargement des
 * plugins) — la fenêtre exacte pour ajouter des plugins/styles proprement.
 *
 * Les URLs des assets DSFR sont fournies par le plugin PHP via
 * `window.CKEditorDSFRConfig.assetUrl` (dossier assets publié du plugin).
 */
(function () {
    'use strict';

    function decorate(config) {
        var cfg = (window.CKEditorDSFRConfig || {});
        var base = cfg.assetUrl;
        if (!base) return;

        // Plugin natif "templates" (embarqué dans LimeSurvey) → palette DSFR.
        config.extraPlugins = (config.extraPlugins ? config.extraPlugins + ',' : '') + 'templates';
        config.templates = 'dsfr';
        config.templates_files = [base + '/dsfr-templates.js'];
        config.templates_replaceContent = false;

        // Menu "Styles" appliquant des CLASSES DSFR (survivent au sanitizer).
        config.stylesSet = 'dsfr:' + base + '/dsfr-styles.js';

        // CSS DSFR dans l'iframe de l'éditeur (aperçu WYSIWYG).
        config.contentsCss = (config.contentsCss ? [].concat(config.contentsCss) : [])
            .concat([base + '/dsfr-contents.css']);

        // Boutons : LimeSurvey pilote l'inline via config.toolbar='inline2' et
        // bascule avec lsswitchtoolbars. On ajoute le groupe DSFR à toutes les
        // barres réellement définies (arrays).
        ['toolbar_inline2', 'toolbar_inline', 'toolbar', 'toolbar_popup'].forEach(function (tb) {
            if (Object.prototype.toString.call(config[tb]) === '[object Array]') {
                config[tb].push({ name: 'dsfr', items: ['Styles', 'Templates'] });
            }
        });
    }

    var attempts = 0;
    var MAX_ATTEMPTS = 100; // ~4 s ; au-delà, la page n'a pas d'éditeur → abandon

    function attach() {
        if (typeof CKEDITOR === 'undefined') {
            // ckeditor.js pas encore chargé — on réessaie (le plugin injecte ce
            // script tôt ; on attend que CKEDITOR existe avant que LimeSurvey ne
            // crée ses instances). Borné : nombre de pages d'admin n'ont pas
            // d'éditeur.
            if (++attempts > MAX_ATTEMPTS) return;
            setTimeout(attach, 40);
            return;
        }
        CKEDITOR.on('instanceCreated', function (ev) {
            ev.editor.on('configLoaded', function () {
                try { decorate(ev.editor.config); } catch (e) {
                    if (window.console) console.warn('[CKEditorDSFR] décoration échouée :', e);
                }
            });
        });
    }

    attach();
})();
