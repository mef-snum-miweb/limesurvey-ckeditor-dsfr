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
 * Alignement (issue #9) : toute la palette Modèles est couverte — accordéon,
 * mise en avant (callout), alerte, mise en exergue, citation, téléchargement.
 * Exception assumée : le TABLEAU (fr-table) n'est PAS un widget — l'édition
 * native des tableaux CKEditor 4 (lignes/colonnes au clic droit) doit rester
 * fonctionnelle (justification : docs/architecture.md).
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
        // Les autres éléments visés par les zones éditables ci-dessous
        // (h3, p, div, blockquote, figcaption) sont déjà dans $editable
        // (vérifié dans le build CKEditor de LimeSurvey 6.16.16).
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
         * - mask            : (option) recouvre le widget d'un masque
         *                     transparent — aucun élément interne n'est
         *                     cliquable (utile quand la popin est le geste
         *                     d'édition principal, ex. téléchargement) ;
         * - dialog          : (option, issue #6) popin d'édition guidée, EN
         *                     COMPLÉMENT de l'édition inline (les nested
         *                     editables restent en place) :
         *                     {title, menuLabel, fields:[{id, label, selector}]}.
         *                     Par défaut, chaque champ texte lit/réécrit le
         *                     TEXTE de l'élément `selector` (racine du widget
         *                     si absent) sans toucher aux attributs. Capacités
         *                     génériques d'un champ (issue #9) :
         *                     · attr: 'href'    — lit/écrit cet ATTRIBUT au
         *                       lieu du texte (ex. URL d'un lien) ;
         *                     · ownText: true   — ne touche que les NŒUDS
         *                       TEXTE directs de l'élément, ses enfants
         *                       (ex. <span> de détail) sont préservés ;
         *                     · optional: {tag, className, editable} — champ
         *                       vide = l'élément est RETIRÉ ; champ rempli =
         *                       créé si absent (premier enfant de la racine)
         *                       et re-branché comme zone éditable `editable` ;
         *                     · select: [[libellé, classe], …] — liste
         *                       déroulante qui BASCULE une classe exclusive
         *                       sur l'élément (ex. type d'alerte fr-alert--*).
         *                     Ouverture : double-clic sur le cadre du widget et
         *                     Entrée sur le widget sélectionné (fournis par le
         *                     plugin natif `widget` dès que la définition a un
         *                     `dialog`), plus clic droit → `menuLabel` (ajouté
         *                     ci-dessous, le plugin widget ne le fournit pas).
         */

        // Règles ACF partagées des zones éditables : inline simple pour les
        // titres/auteurs, inline + liens pour les textes courants.
        var INLINE_TITLE = 'br strong em u s sub sup; abbr[title]';
        var INLINE_TEXT = INLINE_TITLE + '; a[!href,target,rel,title]';

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
                        allowedContent: INLINE_TITLE
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
            },
            {
                // Mise en avant — UN SEUL widget pour les deux variantes de la
                // palette (avec / sans titre) : la zone titre n'est branchée
                // que si le h3 existe, et la popin le crée / retire proprement.
                name: 'dsfrCallout',
                pathName: 'mise en avant',
                upcastSelector: { element: 'div', 'class': 'fr-callout' },
                allowedContent:
                    'div(fr-callout,fr-callout--*,fr-icon-*); ' +
                    'h3(fr-callout__title); p(fr-callout__text)',
                requiredContent: 'div(fr-callout)',
                editables: {
                    title: {
                        selector: '.fr-callout__title',
                        allowedContent: INLINE_TITLE
                    },
                    text: {
                        selector: '.fr-callout__text',
                        allowedContent: INLINE_TEXT
                    }
                },
                dialog: {
                    title: 'Mise en avant',
                    menuLabel: 'Modifier le titre de la mise en avant',
                    fields: [
                        {
                            id: 'title',
                            label: 'Titre (laisser vide pour un encadré sans titre)',
                            selector: '.fr-callout__title',
                            optional: {
                                tag: 'h3',
                                className: 'fr-callout__title',
                                editable: 'title'
                            }
                        }
                    ]
                }
            },
            {
                // Alerte — UN SEUL widget pour les 4 variantes de la palette :
                // le type (info/succès/erreur/avertissement) se change via la
                // popin (select basculant la classe fr-alert--*).
                name: 'dsfrAlert',
                pathName: 'alerte',
                upcastSelector: { element: 'div', 'class': 'fr-alert' },
                allowedContent: 'div(fr-alert,fr-alert--*); h3(fr-alert__title); p',
                requiredContent: 'div(fr-alert)',
                editables: {
                    title: {
                        selector: '.fr-alert__title',
                        allowedContent: INLINE_TITLE
                    },
                    // Texte : le premier <p> du bandeau (structure DSFR type
                    // titre + un paragraphe) — contenu inline, liens compris.
                    text: {
                        selector: 'p',
                        allowedContent: INLINE_TEXT
                    }
                },
                dialog: {
                    title: 'Alerte',
                    menuLabel: "Modifier l'alerte (titre, type)",
                    fields: [
                        {
                            id: 'title',
                            label: 'Titre',
                            selector: '.fr-alert__title'
                        },
                        {
                            id: 'type',
                            label: 'Type',
                            select: [
                                ['Information', 'fr-alert--info'],
                                ['Succès', 'fr-alert--success'],
                                ['Erreur', 'fr-alert--error'],
                                ['Avertissement', 'fr-alert--warning']
                            ]
                        }
                    ]
                }
            },
            {
                // Mise en exergue — widget simple : cadre + zone texte, pas de
                // popin (aucun réglage à guider).
                name: 'dsfrHighlight',
                pathName: 'mise en exergue',
                upcastSelector: { element: 'div', 'class': 'fr-highlight' },
                allowedContent: 'div(fr-highlight); p(fr-text--*)',
                requiredContent: 'div(fr-highlight)',
                editables: {
                    text: {
                        selector: 'p',
                        allowedContent: INLINE_TEXT
                    }
                }
            },
            {
                // Citation — deux zones : texte (blockquote, paragraphes +
                // inline) et auteur. Pas de popin : les deux zones sont
                // directement visibles et cliquables.
                name: 'dsfrQuote',
                pathName: 'citation',
                upcastSelector: { element: 'figure', 'class': 'fr-quote' },
                allowedContent:
                    'figure(fr-quote,fr-quote--column); blockquote[cite]; ' +
                    'figcaption; p(fr-quote__author); ul(fr-quote__source); li',
                requiredContent: 'figure(fr-quote)',
                editables: {
                    text: {
                        selector: 'blockquote',
                        allowedContent: 'p; ' + INLINE_TEXT
                    },
                    author: {
                        selector: '.fr-quote__author',
                        allowedContent: INLINE_TITLE
                    }
                }
            },
            {
                // Téléchargement — la POPIN est le geste d'édition PRINCIPAL :
                // le lien (<a> + <span> de détail imbriqué) est trop fragile
                // pour l'édition inline (une frappe dans la mauvaise zone
                // casse l'imbrication). `mask` neutralise tout clic interne :
                // un clic sélectionne le widget, double-clic / Entrée / clic
                // droit ouvrent la popin (URL, intitulé, détail).
                name: 'dsfrDownload',
                pathName: 'téléchargement',
                upcastSelector: { element: 'div', 'class': 'fr-download' },
                allowedContent:
                    'div(fr-download); p; ' +
                    'a(fr-download__link)[!href,download,hreflang,type]; ' +
                    'span(fr-download__detail)',
                requiredContent: 'div(fr-download)',
                mask: true,
                dialog: {
                    title: 'Téléchargement de fichier',
                    menuLabel: 'Modifier le lien de téléchargement',
                    fields: [
                        {
                            id: 'url',
                            label: 'URL du fichier',
                            selector: '.fr-download__link',
                            attr: 'href'
                        },
                        {
                            id: 'label',
                            label: 'Intitulé',
                            selector: '.fr-download__link',
                            ownText: true
                        },
                        {
                            id: 'detail',
                            label: 'Détail (format – poids)',
                            selector: '.fr-download__detail'
                        }
                    ]
                }
            }
            // Futur composant à structure sensible (ex. onglets DSFR, #8) :
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

        /** Élément visé par un champ de popin (racine du widget par défaut). */
        function fieldTarget(widget, field) {
            return field.selector
                ? widget.element.findOne(field.selector)
                : widget.element;
        }

        /**
         * Lecture/écriture d'un attribut en tenant compte de la protection
         * CKEditor 4 : dans le DOM d'édition, la valeur de VÉRITÉ d'attributs
         * comme `href` ou `src` vit dans `data-cke-saved-<attr>` (le data
         * processor la restaure au downcast). Écrire seulement l'attribut brut
         * serait donc écrasé à l'enregistrement.
         */
        function getProtectedAttr(el, attr) {
            return el.getAttribute('data-cke-saved-' + attr)
                || el.getAttribute(attr) || '';
        }
        function setProtectedAttr(el, attr, value) {
            el.setAttribute(attr, value);
            if (el.hasAttribute('data-cke-saved-' + attr)) {
                el.setAttribute('data-cke-saved-' + attr, value);
            }
        }

        /** Texte des seuls nœuds texte DIRECTS de `el` (enfants ignorés). */
        function getOwnText(el) {
            var text = '';
            for (var i = 0; i < el.getChildCount(); i++) {
                var child = el.getChild(i);
                if (child.type === CKEDITOR.NODE_TEXT) { text += child.getText(); }
            }
            return text;
        }

        /**
         * Remplace les nœuds texte DIRECTS de `el` par `value`, placé avant le
         * premier enfant élément — les enfants (ex. <span> de détail d'un lien
         * de téléchargement) sont préservés à leur place.
         */
        function setOwnText(el, value) {
            for (var i = el.getChildCount() - 1; i >= 0; i--) {
                var child = el.getChild(i);
                if (child.type === CKEDITOR.NODE_TEXT) { child.remove(); }
            }
            var node = new CKEDITOR.dom.text(value, el.getDocument());
            var first = el.getFirst();
            if (first) { node.insertBefore(first); } else { el.append(node); }
        }

        /**
         * Commit d'un champ `optional` : vide → l'élément est retiré (et sa
         * zone éditable débranchée) ; rempli → créé si absent en PREMIER
         * enfant de la racine du widget, re-branché comme zone éditable
         * (`optional.editable`) pour que l'édition inline marche sans
         * rechargement.
         */
        function commitOptional(widget, spec, field, el, value) {
            if (!value) {
                if (el) {
                    if (field.optional.editable) {
                        widget.destroyEditable(field.optional.editable);
                    }
                    el.remove();
                }
                return;
            }
            if (!el) {
                el = new CKEDITOR.dom.element(
                    field.optional.tag, widget.element.getDocument());
                if (field.optional.className) {
                    el.addClass(field.optional.className);
                }
                var first = widget.element.getFirst();
                if (first) { el.insertBefore(first); }
                else { widget.element.append(el); }
                el.setText(value);
                var key = field.optional.editable;
                if (key && spec.editables && spec.editables[key]) {
                    widget.initEditable(key, spec.editables[key]);
                }
                return;
            }
            if (el.getText() !== value) { el.setText(value); }
        }

        /**
         * Champ « select » : liste déroulante qui bascule une classe EXCLUSIVE
         * (une seule de la liste à la fois) sur l'élément visé — capacité
         * générique « variante d'un composant » (ex. type d'alerte).
         */
        function makeSelectField(field) {
            return {
                type: 'select',
                id: field.id,
                label: field.label,
                items: field.select,
                setup: function (widget) {
                    var el = fieldTarget(widget, field);
                    var current = field.select[0][1];
                    if (el) {
                        field.select.forEach(function (item) {
                            if (el.hasClass(item[1])) { current = item[1]; }
                        });
                    }
                    this.setValue(current);
                },
                commit: function (widget) {
                    var el = fieldTarget(widget, field);
                    var value = this.getValue();
                    if (!el || el.hasClass(value)) { return; }
                    field.select.forEach(function (item) {
                        el.removeClass(item[1]);
                    });
                    el.addClass(value);
                }
            };
        }

        /**
         * Champ texte : selon la capacité déclarée, lit/écrit le texte de
         * l'élément (défaut), un attribut (`attr`), ses seuls nœuds texte
         * directs (`ownText`), ou pilote un élément optionnel (`optional`).
         * Les attributs non visés (`aria-*`, `class`, `type`…) restent intacts.
         */
        function makeTextField(spec, field) {
            return {
                type: 'text',
                id: field.id,
                label: field.label,
                setup: function (widget) {
                    var el = fieldTarget(widget, field);
                    if (!el) { this.setValue(''); return; }
                    if (field.attr) {
                        this.setValue(getProtectedAttr(el, field.attr));
                    } else if (field.ownText) {
                        this.setValue(getOwnText(el));
                    } else {
                        this.setValue(el.getText());
                    }
                },
                commit: function (widget) {
                    var el = fieldTarget(widget, field);
                    var value = this.getValue();
                    if (field.optional) {
                        commitOptional(widget, spec, field, el, CKEDITOR.tools.trim(value));
                        return;
                    }
                    if (!el) { return; }
                    if (field.attr) {
                        if (getProtectedAttr(el, field.attr) !== value) {
                            setProtectedAttr(el, field.attr, value);
                        }
                    } else if (field.ownText) {
                        if (getOwnText(el) !== value) { setOwnText(el, value); }
                    } else if (el.getText() !== value) {
                        el.setText(value);
                    }
                }
            };
        }

        /**
         * Enregistre la popin d'édition déclarée par `spec.dialog` : un champ
         * par entrée de `fields` (texte par défaut, `select` si déclaré). Le
         * plugin natif `widget` appelle `setupContent(widget)` à CHAQUE
         * ouverture et `commitContent(widget)` au OK : `setup` lit donc le DOM
         * COURANT du widget (une édition inline faite juste avant est
         * reflétée), `commit` ne réécrit que ce que le champ vise.
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
                            return field.select
                                ? makeSelectField(field)
                                : makeTextField(spec, field);
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
                mask: spec.mask,
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
