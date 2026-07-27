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
        var v = cfg.v ? ('?v=' + cfg.v) : ''; // cache-buster versionné (cf. plugin PHP)

        // Plugin natif "templates" (embarqué dans LimeSurvey) → palette DSFR.
        config.extraPlugins = (config.extraPlugins ? config.extraPlugins + ',' : '') + 'templates';

        // Widgets DSFR : structure protégée + zones éditables (dsfr-widgets.js).
        // Le plugin est externe au build CKEditor de LimeSurvey → on déclare son
        // URL via addExternal (3ᵉ argument '' = le chemin inclut le nom de
        // fichier, cache-buster compris). Ses dépendances `widget` et
        // `lineutils` sont, elles, embarquées dans le build LimeSurvey.
        // Appel idempotent : ré-enregistrer la même URL est sans effet.
        CKEDITOR.plugins.addExternal('dsfrwidgets', base + '/dsfr-widgets.js' + v, '');
        config.extraPlugins += ',dsfrwidgets';
        config.templates = 'dsfr';
        config.templates_files = [base + '/dsfr-templates.js' + v];
        config.templates_replaceContent = false;

        // Menu "Styles" appliquant des CLASSES DSFR (survivent au sanitizer).
        config.stylesSet = 'dsfr:' + base + '/dsfr-styles.js' + v;

        // CSS DSFR dans l'iframe de l'éditeur (aperçu WYSIWYG).
        config.contentsCss = (config.contentsCss ? [].concat(config.contentsCss) : [])
            .concat([base + '/dsfr-contents.css' + v]);

        // Boutons dans la barre d'outils. La barre COMPLÈTE (toolbar_inline)
        // contient déjà nativement les combos Styles + Templates : notre
        // stylesSet / templates_files (config globale) les peuplent — inutile
        // d'y ajouter quoi que ce soit. Seule la barre BASIQUE (toolbar_inline2)
        // n'a ni Styles ni Templates : on l'y ajoute.
        //
        // Garde d'idempotence : les tableaux de toolbar sont partagés entre
        // instances et relus à chaque bascule (lsswitchtoolbars) — sans ce
        // garde, le groupe s'empilerait (doublon, triplon…).
        var basic = config.toolbar_inline2;
        if (Object.prototype.toString.call(basic) === '[object Array]'
            && !basic.some(function (g) { return g && g.name === 'dsfr'; })) {
            basic.push({ name: 'dsfr', items: ['Styles', 'Templates'] });
        }
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
