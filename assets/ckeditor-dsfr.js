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

    /* ====================================================================
     * Normalisation DSFR des tableaux natifs CKEditor (issue #10)
     *
     * Pas de widget : l'édition native (cellules, clic droit ligne/colonne,
     * propriétés) reste strictement intacte. Trois accroches :
     *   1. htmlFilter (downcast, getData/Source) : enveloppe `div.fr-table`,
     *      purge des attributs de présentation, `scope` sur les th — couvre
     *      aussi les tableaux collés depuis Word (même pipeline de sortie) ;
     *   2. dialogDefinition : défauts assainis de la dialog native (bordure 0,
     *      pas de largeur fixe, cellspacing/cellpadding vides) — sans retirer
     *      de champ ;
     *   3. l'aperçu DSFR en édition est porté par dsfr-contents.css.
     * ==================================================================== */

    // Attributs de présentation HTML à purger sur <table> (le rendu est
    // porté par les classes DSFR côté thème).
    var TABLE_PRESENTATION_ATTRS = ['border', 'cellpadding', 'cellspacing', 'align', 'width', 'height'];

    function hasClass(el, cls) {
        return el && el.attributes
            && (' ' + (el.attributes['class'] || '') + ' ').indexOf(' ' + cls + ' ') !== -1;
    }

    // Retire les dimensions fixes du style inline (width/height), en
    // préservant les autres déclarations éventuelles.
    function purgeInlineSizes(el) {
        var style = el.attributes.style;
        if (!style) return;
        style = style
            .replace(/(?:^|;)\s*(?:width|height)\s*:[^;]*/gi, '')
            .replace(/^\s*;\s*/, '')
            .replace(/\s+$/, '');
        if (style) el.attributes.style = style;
        else delete el.attributes.style;
    }

    // Cellules (th/td) d'une ligne, hors nœuds texte d'espacement.
    function rowCells(tr) {
        var cells = [];
        for (var i = 0; i < tr.children.length; i++) {
            var c = tr.children[i];
            if (c.name === 'th' || c.name === 'td') cells.push(c);
        }
        return cells;
    }

    // Pose scope="col" sur les th de la ligne d'en-tête (thead, ou première
    // ligne composée uniquement de th) et scope="row" sur un th en tête de
    // ligne de corps. Ne touche jamais un scope déjà présent.
    function normalizeScopes(table) {
        var headRows = [], bodyRows = [], i, j;
        for (i = 0; i < table.children.length; i++) {
            var sec = table.children[i];
            if (sec.name === 'thead') {
                for (j = 0; j < sec.children.length; j++)
                    if (sec.children[j].name === 'tr') headRows.push(sec.children[j]);
            } else if (sec.name === 'tbody' || sec.name === 'tfoot') {
                for (j = 0; j < sec.children.length; j++)
                    if (sec.children[j].name === 'tr') bodyRows.push(sec.children[j]);
            } else if (sec.name === 'tr') {
                bodyRows.push(sec);
            }
        }
        // Pas de thead mais une première ligne 100 % th → ligne d'en-tête.
        if (!headRows.length && bodyRows.length) {
            var first = rowCells(bodyRows[0]);
            var allTh = first.length > 0;
            for (i = 0; i < first.length; i++)
                if (first[i].name !== 'th') { allTh = false; break; }
            if (allTh) headRows.push(bodyRows.shift());
        }
        for (i = 0; i < headRows.length; i++) {
            var cells = rowCells(headRows[i]);
            for (j = 0; j < cells.length; j++)
                if (cells[j].name === 'th' && !cells[j].attributes.scope)
                    cells[j].attributes.scope = 'col';
        }
        for (i = 0; i < bodyRows.length; i++) {
            var lead = rowCells(bodyRows[i])[0];
            if (lead && lead.name === 'th' && !lead.attributes.scope)
                lead.attributes.scope = 'row';
        }
    }

    // Règle htmlFilter : purge + scope + enveloppe div.fr-table. Idempotent :
    // un tableau déjà dans .fr-table (template palette compris) n'est pas
    // ré-enveloppé. L'enveloppe est posée par chirurgie manuelle
    // (replaceWith + add, retour undefined) : retourner le wrapper laisserait
    // le framework appeler el.replaceWith(wrapper) alors que le parent d'`el`
    // aurait déjà été réécrit — arbre corrompu (vérifié dans le build 4.22.1).
    function normalizeTableElement(el) {
        for (var i = 0; i < TABLE_PRESENTATION_ATTRS.length; i++)
            delete el.attributes[TABLE_PRESENTATION_ATTRS[i]];
        purgeInlineSizes(el);
        normalizeScopes(el);

        var p = el.parent;
        if (p && p.name === 'div' && hasClass(p, 'fr-table')) return;

        var wrap = new CKEDITOR.htmlParser.element('div', { 'class': 'fr-table' });
        el.replaceWith(wrap); // le wrapper prend la place du tableau…
        wrap.add(el);         // …et le tableau devient son enfant
    }

    // Accroche le filtre de sortie (downcast) sur une instance d'éditeur.
    function attachTableNormalization(editor) {
        editor.dataProcessor.htmlFilter.addRules(
            { elements: { table: normalizeTableElement } },
            { applyToAll: true }
        );
    }

    // Défauts assainis des dialogs natives table/tableProperties : on ne
    // retire aucun champ (UX connue préservée), on change seulement les
    // valeurs proposées à l'insertion. Accroche globale, posée une fois.
    function attachTableDialogDefaults() {
        CKEDITOR.on('dialogDefinition', function (ev) {
            var name = ev.data.name;
            if (name !== 'table' && name !== 'tableProperties') return;
            var info = ev.data.definition.getContents('info');
            if (!info) return;
            var defaults = { txtBorder: '0', txtWidth: '', txtCellSpace: '', txtCellPad: '' };
            for (var id in defaults) {
                var field = info.get(id);
                if (field) field['default'] = defaults[id];
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
            // Normalisation des tableaux au downcast : le dataProcessor de
            // l'instance n'existe qu'une fois l'éditeur prêt.
            ev.editor.on('instanceReady', function () {
                try { attachTableNormalization(ev.editor); } catch (e) {
                    if (window.console) console.warn('[CKEditorDSFR] normalisation tableaux échouée :', e);
                }
            });
        });
        attachTableDialogDefaults();
    }

    attach();
})();
