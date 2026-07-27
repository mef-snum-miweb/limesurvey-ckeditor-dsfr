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
 * Complément (issue #6) : un widget peut déclarer une POPIN d'édition guidée
 * (clé `dialog` de l'entrée) ouverte par double-clic sur le cadre, Entrée sur
 * le widget sélectionné, ou clic droit. Philosophie : « inline pour les
 * habitués, popin pour le geste guidé » — la popin s'ajoute à l'édition
 * inline, elle ne la remplace pas.
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
    requires: 'widget,dialog',

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
         *                     `refs` (ex. aria-controls du bouton) ;
         * - dialog          : (option, issue #6) popin d'édition guidée, EN
         *                     COMPLÉMENT de l'édition inline (les nested
         *                     editables restent en place) :
         *                     {title, menuLabel, fields:[{id, label, selector}]}.
         *                     Chaque champ texte lit/réécrit le TEXTE de
         *                     l'élément `selector` sans toucher aux attributs.
         *                     Ouverture : double-clic sur le cadre du widget et
         *                     Entrée sur le widget sélectionné (fournis par le
         *                     plugin natif `widget` dès que la définition a un
         *                     `dialog`), plus clic droit → `menuLabel` (ajouté
         *                     ci-dessous, le plugin widget ne le fournit pas).
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
                ],
                dialog: {
                    title: 'Accordéon',
                    menuLabel: "Modifier l'intitulé de l'accordéon",
                    fields: [
                        {
                            id: 'title',
                            label: "Intitulé de l'accordéon",
                            selector: '.fr-accordion__btn'
                        }
                    ]
                }
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

        /** Nom (global CKEDITOR) de la popin d'un widget. */
        function dialogName(spec) {
            return spec.name + 'Dialog';
        }

        /**
         * Enregistre la popin d'édition déclarée par `spec.dialog` : un champ
         * texte par entrée de `fields`. Le plugin natif `widget` appelle
         * `setupContent(widget)` à CHAQUE ouverture et `commitContent(widget)`
         * au OK : `setup` lit donc le DOM COURANT du widget (une édition
         * inline faite juste avant est reflétée), `commit` réécrit le texte de
         * l'élément visé — attributs (`aria-*`, `class`, `type`…) intacts.
         * Registre global CKEDITOR : idempotent entre instances d'éditeur.
         */
        function registerDialog(spec) {
            var name = dialogName(spec);
            if (CKEDITOR.dialog.exists(name)) { return; }
            CKEDITOR.dialog.add(name, function () {
                return {
                    title: spec.dialog.title,
                    minWidth: 350,
                    minHeight: 80,
                    contents: [{
                        id: 'main',
                        elements: spec.dialog.fields.map(function (field) {
                            return {
                                type: 'text',
                                id: field.id,
                                label: field.label,
                                setup: function (widget) {
                                    var el = widget.element.findOne(field.selector);
                                    this.setValue(el ? el.getText() : '');
                                },
                                commit: function (widget) {
                                    var el = widget.element.findOne(field.selector);
                                    if (el && el.getText() !== this.getValue()) {
                                        el.setText(this.getValue());
                                    }
                                }
                            };
                        })
                    }]
                };
            });
        }

        /** Widget nommé `name` visé par l'action en cours (sélection/caret). */
        function findWidget(name) {
            var widget = editor.widgets.focused
                || editor.widgets.widgetHoldingFocusedEditable;
            if (!widget) {
                var sel = editor.getSelection();
                var start = sel && sel.getStartElement();
                widget = start && editor.widgets.getByElement(start);
            }
            return (widget && widget.name === name) ? widget : null;
        }

        /**
         * Entrée de menu contextuel « spec.dialog.menuLabel » → ouvre la popin.
         * Le plugin natif `widget` ne fournit PAS cette entrée : son listener
         * contextmenu ne matche que le wrapper et relaie vers l'événement
         * `contextMenu` du widget, vide par défaut. On ajoute donc commande +
         * item, et un listener qui remonte au widget depuis n'importe quel
         * descendant cliqué (zones éditables comprises).
         */
        function registerContextMenu(spec) {
            var command = spec.name + 'Edit';
            editor.addCommand(command, {
                exec: function () {
                    var widget = findWidget(spec.name);
                    if (widget) { widget.edit(); }
                }
            });
            editor.addMenuItem(command, {
                label: spec.dialog.menuLabel,
                command: command,
                group: 'dsfrwidgets'
            });
            editor.contextMenu.addListener(function (element) {
                var widget = element && editor.widgets.getByElement(element);
                if (widget && widget.name === spec.name) {
                    var state = {};
                    state[command] = CKEDITOR.TRISTATE_OFF;
                    return state;
                }
            });
        }

        /** Transforme une entrée déclarative en définition de widget CKE4. */
        function buildDefinition(spec) {
            return {
                pathName: spec.pathName,
                allowedContent: spec.allowedContent,
                requiredContent: spec.requiredContent,
                editables: spec.editables,
                // Lier la popin ici suffit pour que le plugin natif `widget`
                // l'ouvre au double-clic sur le cadre (hors zones éditables —
                // il y consomme le double-clic, voulu : l'inline y prime) et
                // sur Entrée quand le widget est sélectionné.
                dialog: spec.dialog ? dialogName(spec) : undefined,
                upcast: function (el) {
                    return el.name === spec.upcastSelector.element
                        && el.hasClass(spec.upcastSelector['class']);
                },
                init: function () {
                    if (spec.idSync) { syncUniqueIds(this, spec.idSync); }
                }
            };
        }

        // `contextmenu` est dans le build LimeSurvey ; garde par prudence
        // (sans lui, la popin reste accessible par double-clic et Entrée).
        if (editor.contextMenu) { editor.addMenuGroup('dsfrwidgets'); }

        WIDGETS.forEach(function (spec) {
            if (spec.dialog) {
                registerDialog(spec);
                if (editor.contextMenu) { registerContextMenu(spec); }
            }
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
