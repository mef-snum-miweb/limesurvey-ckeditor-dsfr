/**
 * Widgets CKEditor 4 pour les composants DSFR à structure sensible.
 *
 * Problème traité (issue #3) : certains composants DSFR reposent sur une
 * structure HTML stricte (ex. accordéon : section > h3 > button + div.fr-collapse).
 * Sans protection, une sélection de texte trop large (triple-clic, Ctrl+A,
 * glisser) englobe les éléments structurels : taper du texte les supprime et
 * casse le composant sans message.
 *
 * Solution : le système de WIDGETS de CKEditor 4 (plugin natif `widget`,
 * embarqué dans le build LimeSurvey). Un widget rend sa structure atomique —
 * insupprimable par une sélection de texte — tout en ouvrant des ZONES
 * ÉDITABLES imbriquées (nested editables) là où le contributeur doit saisir
 * du contenu. La suppression du bloc entier reste possible en sélectionnant
 * le widget lui-même (clic sur son cadre, puis Suppr).
 *
 * PATTERN RÉUTILISABLE : chaque composant est décrit par une ENTRÉE du tableau
 * `WIDGETS` ci-dessous (déclaratif). Pour protéger un futur composant (ex.
 * onglets DSFR), ajouter une entrée — aucun code à dupliquer. Voir
 * docs/architecture.md, section « Widgets CKEditor ».
 *
 * Le downcast (HTML enregistré) reste le markup DSFR PROPRE : le système
 * widget retire ses artefacts (wrappers, classes cke_*, poignées) des données.
 */
CKEDITOR.plugins.add('dsfrwidgets', {
    requires: 'widget',

    init: function (editor) {
        'use strict';

        // <button> n'est pas listé dans CKEDITOR.dtd.$editable : on l'y
        // autorise pour pouvoir en faire une zone éditable imbriquée
        // (pattern documenté CKE4 — nested editable sur élément non standard).
        CKEDITOR.dtd.$editable.button = 1;

        /**
         * Déclaration des widgets DSFR — une entrée par composant :
         * - name            : nom du widget (unique par éditeur) ;
         * - pathName        : libellé affiché dans le fil d'Ariane de l'éditeur ;
         * - upcastSelector  : { element, class } — l'élément racine du composant,
         *                     reconnu au chargement des données ET à l'insertion
         *                     via la palette Modèles (insertHtml passe par le
         *                     data processor → upcast automatique) ;
         * - allowedContent / requiredContent : règles ACF préservant classes et
         *                     attributs (aria-*, id, type…) du markup DSFR ;
         * - editables       : zones éditables imbriquées {clé: {selector,
         *                     allowedContent}} — sans allowedContent, la zone
         *                     hérite du filtre de l'éditeur (contenu riche) ;
         * - idSync          : (option) [{target, refs:[{selector, attr}]}] —
         *                     à l'initialisation du widget, si l'`id` de
         *                     `target` est dupliqué dans le document, un id
         *                     unique est généré et recopié dans les attributs
         *                     `refs` (ex. aria-controls du bouton).
         */
        var WIDGETS = [
            {
                name: 'dsfrAccordion',
                pathName: 'accordéon',
                upcastSelector: { element: 'section', 'class': 'fr-accordion' },
                allowedContent:
                    'section(fr-accordion); h3(fr-accordion__title); ' +
                    'button(fr-accordion__btn)[type,aria-expanded,aria-controls]; ' +
                    'div(fr-collapse)[id]',
                requiredContent: 'section(fr-accordion)',
                editables: {
                    // Intitulé : le texte du bouton — inline simple uniquement
                    // (pas de bloc : le contenu d'un <button> doit rester du
                    // phrasing content).
                    title: {
                        selector: '.fr-accordion__btn',
                        allowedContent: 'br strong em u s sub sup; abbr[title]'
                    },
                    // Contenu repliable : riche (hérite du filtre de l'éditeur).
                    content: {
                        selector: '.fr-collapse'
                    }
                },
                idSync: [
                    {
                        target: '.fr-collapse',
                        refs: [{ selector: '.fr-accordion__btn', attr: 'aria-controls' }]
                    }
                ]
            }
            // Futur composant à structure sensible (ex. onglets DSFR) :
            // ajouter une entrée ici sur le même modèle.
        ];

        /**
         * Rend uniques les `id` dupliqués d'un widget fraîchement initialisé
         * et resynchronise les attributs qui les référencent (aria-controls…).
         * Cas visé : insertion de plusieurs accordéons depuis la palette
         * Modèles — tous arrivent avec le même id ; l'issue historique
         * demandait de le corriger à la main.
         */
        function syncUniqueIds(widget, rules) {
            var doc = widget.element.getDocument();
            rules.forEach(function (rule) {
                var target = widget.element.findOne(rule.target);
                if (!target) { return; }
                var id = target.getAttribute('id');
                if (!id || doc.find('[id="' + id + '"]').count() < 2) { return; }
                // Id dupliqué → suffixe numérique libre le plus proche.
                var base = id.replace(/-\d+$/, '');
                var n = 2;
                var candidate;
                do { candidate = base + '-' + n++; } while (doc.findOne('[id="' + candidate + '"]'));
                target.setAttribute('id', candidate);
                rule.refs.forEach(function (ref) {
                    var el = widget.element.findOne(ref.selector);
                    if (el) { el.setAttribute(ref.attr, candidate); }
                });
            });
        }

        /** Transforme une entrée déclarative en définition de widget CKE4. */
        function buildDefinition(spec) {
            return {
                pathName: spec.pathName,
                allowedContent: spec.allowedContent,
                requiredContent: spec.requiredContent,
                editables: spec.editables,
                upcast: function (el) {
                    return el.name === spec.upcastSelector.element
                        && el.hasClass(spec.upcastSelector['class']);
                },
                init: function () {
                    if (spec.idSync) { syncUniqueIds(this, spec.idSync); }
                }
            };
        }

        WIDGETS.forEach(function (spec) {
            editor.widgets.add(spec.name, buildDefinition(spec));
        });

        // Ctrl+A / Cmd+A depuis une zone éditable imbriquée : CKEditor 4
        // sélectionne par défaut TOUT le document (widgets compris) — la
        // saisie suivante détruirait la structure, exactement le scénario de
        // l'issue #3. On borne la sélection au contenu de la zone éditable.
        editor.on('key', function (evt) {
            if (evt.data.keyCode !== (CKEDITOR.CTRL + 65)) { return; } // 65 = A
            var sel = editor.getSelection();
            var start = sel && sel.getStartElement();
            var nested = start
                && CKEDITOR.plugins.widget.getNestedEditable(editor.editable(), start);
            if (!nested) { return; }
            var range = editor.createRange();
            range.selectNodeContents(nested);
            range.select();
            evt.cancel();
        });
    }
});
