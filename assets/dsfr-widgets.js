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
         *                     ci-dessous, le plugin widget ne le fournit pas) ;
         * - collection      : (option, issue #8) COLLECTION D'ÉLÉMENTS
         *                     RÉPÉTABLES — paires (porteur de libellé, panneau
         *                     de contenu) en nombre variable (ex. onglets).
         *                     Les zones éditables sont branchées DYNAMIQUEMENT
         *                     (une par libellé + une par panneau, initEditable
         *                     au `init` du widget), les ids/aria recâblés à
         *                     chaque init (unicité dans le document), et la
         *                     popin déclarée par `dialog` devient une popin de
         *                     GESTION : renommer, ajouter, supprimer (avec
         *                     confirmation intégrée si le panneau a du
         *                     contenu), minimum `min` éléments. Clés : voir
         *                     l'entrée dsfrTabs et docs/architecture.md.
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
            },
            {
                // Onglets (issue #8) — collection d'onglets en nombre variable.
                // EN ÉDITION : les panneaux sont affichés EMPILÉS (comme
                // l'accordéon apparaît déplié), chacun est une zone éditable
                // riche ; la barre d'onglets est du chrome dont seuls les
                // libellés (boutons) sont éditables en place. La POPIN est le
                // geste principal pour la STRUCTURE : renommer, ajouter,
                // supprimer un onglet (min 2), ids/aria resynchronisés à la
                // validation. AU RENDU : markup fr-tabs pur, le JS DSFR du
                // thème rend les onglets fonctionnels côté répondant.
                // Convention : au downcast, le PREMIER onglet est l'actif
                // (aria-selected/tabindex/--selected posés par le recâblage).
                name: 'dsfrTabs',
                pathName: 'onglets',
                upcastSelector: { element: 'div', 'class': 'fr-tabs' },
                allowedContent:
                    'div(fr-tabs); ul(fr-tabs__list)[role,aria-label]; li[role]; ' +
                    'button(fr-tabs__tab)[id,type,role,tabindex,aria-selected,aria-controls]; ' +
                    'div(fr-tabs__panel,fr-tabs__panel--selected)[id,role,tabindex,aria-labelledby]',
                requiredContent: 'div(fr-tabs)',
                collection: {
                    itemName: 'onglet',                 // libellés UI de la popin
                    min: 2,
                    labelSelector: '.fr-tabs__tab',     // porteurs de libellé (ordre = panneaux)
                    panelSelector: '.fr-tabs__panel',   // panneaux de contenu appariés
                    listSelector: '.fr-tabs__list',     // conteneur (chrome) reconstruit au commit
                    idPrefix: 'fr-tabs-tab',            // base de génération d'ids uniques
                    panelIdSuffix: '-panel',            // id panneau = id libellé + suffixe
                    // Gabarits d'un nouvel élément (libellé posé par la popin ;
                    // ids/aria posés par le recâblage) :
                    itemHtml: '<li role="presentation"><button type="button" class="fr-tabs__tab" role="tab"></button></li>',
                    panelHtml: '<div class="fr-tabs__panel" role="tabpanel" tabindex="0"><p>Contenu de l’onglet.</p></div>',
                    // Zones éditables dynamiques : libellés inline simple,
                    // panneaux riches (héritent du filtre de l'éditeur).
                    labelEditable: { allowedContent: INLINE_TITLE },
                    panelEditable: {},
                    // Invariants réappliqués à chaque recâblage — le premier
                    // élément est l'actif, les autres sont désactivés :
                    wire: {
                        labelAttrs: { type: 'button', role: 'tab' },
                        activeLabelAttrs: { 'aria-selected': 'true', tabindex: '0' },
                        inactiveLabelAttrs: { 'aria-selected': 'false', tabindex: '-1' },
                        labelRefAttr: 'aria-controls',      // libellé → id du panneau
                        panelAttrs: { role: 'tabpanel', tabindex: '0' },
                        panelRefAttr: 'aria-labelledby',    // panneau → id du libellé
                        activePanelClass: 'fr-tabs__panel--selected'
                    }
                },
                dialog: {
                    title: 'Onglets',
                    menuLabel: 'Gérer les onglets (renommer, ajouter, supprimer)'
                    // Pas de `fields` : la popin est générée par la capacité
                    // `collection` (liste des libellés + ajout / suppression).
                }
            }
            // Futur composant à structure sensible : ajouter une entrée ici
            // sur le même modèle.
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

        /* ------------------------------------------------------------------
         * Capacité « collection » (issue #8) — éléments répétables appariés
         * (libellé, panneau), en nombre variable. Générique : tout composant
         * structuré en « liste de déclencheurs + panneaux de contenu » peut la
         * déclarer (onglets aujourd'hui, groupe d'accordéons demain).
         * ------------------------------------------------------------------ */

        /** Nom réservé des zones éditables dynamiques d'une collection. */
        var COLLECTION_EDITABLE = /^(label|panel)\d+$/;

        /**
         * Recâble une collection : ids uniques DANS LE DOCUMENT (couvre
         * l'insertion de plusieurs blocs depuis la palette — tous arrivent
         * avec les mêmes ids), appariement libellé ↔ panneau
         * (`labelRefAttr` / `panelRefAttr`), et état actif/inactif — par
         * convention le PREMIER élément est l'actif au downcast.
         */
        function wireCollection(widget, col) {
            var doc = widget.element.getDocument();
            var labels = widget.element.find(col.labelSelector).toArray();
            var panels = widget.element.find(col.panelSelector).toArray();
            var suffix = col.panelIdSuffix;

            /** `id` déjà porté par un AUTRE élément que `owner` ? */
            function taken(id, owner) {
                var found = doc.find('[id="' + id + '"]');
                for (var i = 0; i < found.count(); i++) {
                    if (!found.getItem(i).equals(owner)) { return true; }
                }
                return false;
            }
            function freeId(label, panel) {
                var n = 1;
                var id;
                do { id = col.idPrefix + '-' + n++; }
                while (taken(id, label) || taken(id + suffix, panel));
                return id;
            }

            labels.forEach(function (label, i) {
                var panel = panels[i];
                if (!panel) { return; }
                var id = label.getAttribute('id');
                var panelId = panel.getAttribute('id');
                // Libellé sans id (barre reconstruite par la popin) : retrouver
                // la base depuis l'id du panneau conservé.
                if (!id && panelId && panelId.slice(-suffix.length) === suffix) {
                    id = panelId.slice(0, -suffix.length);
                }
                if (!id || taken(id, label) || taken(id + suffix, panel)) {
                    id = freeId(label, panel);
                }
                label.setAttribute('id', id);
                panel.setAttribute('id', id + suffix);
                label.setAttributes(col.wire.labelAttrs);
                label.setAttributes(i === 0
                    ? col.wire.activeLabelAttrs : col.wire.inactiveLabelAttrs);
                label.setAttribute(col.wire.labelRefAttr, id + suffix);
                panel.setAttributes(col.wire.panelAttrs);
                panel.setAttribute(col.wire.panelRefAttr, id);
                panel[i === 0 ? 'addClass' : 'removeClass'](col.wire.activePanelClass);
            });
        }

        /**
         * (Re)branche les zones éditables dynamiques d'une collection — une
         * par panneau (riche) et, si `labelEditable` est déclaré, une par
         * libellé (inline). Les zones sont détruites puis réinitialisées pour
         * que le registre `widget.editables` reste cohérent avec le DOM (le
         * downcast s'appuie dessus pour nettoyer les artefacts cke_*).
         * À appeler APRÈS wireCollection : les sélecteurs s'ancrent sur les ids.
         */
        function syncCollectionEditables(widget, spec) {
            var col = spec.collection;
            var name;
            for (name in widget.editables) {
                if (COLLECTION_EDITABLE.test(name)) { widget.destroyEditable(name); }
            }
            widget.element.find(col.panelSelector).toArray().forEach(function (panel, i) {
                widget.initEditable('panel' + i, CKEDITOR.tools.extend({
                    selector: '[id="' + panel.getAttribute('id') + '"]'
                }, col.panelEditable));
            });
            if (col.labelEditable) {
                widget.element.find(col.labelSelector).toArray().forEach(function (label, i) {
                    widget.initEditable('label' + i, CKEDITOR.tools.extend({
                        selector: '[id="' + label.getAttribute('id') + '"]'
                    }, col.labelEditable));
                });
            }
        }

        /** Un panneau « a du contenu » : texte non vide ou média embarqué. */
        function panelHasContent(panel) {
            var text = panel.getText().replace(/\u00a0/g, ' ');
            return !!CKEDITOR.tools.trim(text)
                || !!panel.findOne('img,table,iframe,video,audio,object,embed');
        }

        /**
         * Applique l'état de la popin de collection au widget : les panneaux
         * des éléments CONSERVÉS gardent leur nœud DOM (contenu riche intact),
         * les nouveaux sont créés depuis `panelHtml`, les supprimés retirés ;
         * la barre de libellés (chrome) est reconstruite depuis `itemHtml` ;
         * puis recâblage ids/aria et re-branchement des zones éditables.
         * L'appelant (plugin widget) encadre déjà l'opération de deux
         * saveSnapshot — l'annulation restaure l'état complet.
         */
        function commitCollection(widget, spec, rows) {
            var col = spec.collection;
            var doc = widget.element.getDocument();
            var oldPanels = widget.element.find(col.panelSelector).toArray();
            var name;

            for (name in widget.editables) {
                if (COLLECTION_EDITABLE.test(name)) { widget.destroyEditable(name); }
            }

            var kept = {};
            var finalPanels = rows.map(function (row) {
                if (row.panelIndex !== null && oldPanels[row.panelIndex]) {
                    kept[row.panelIndex] = true;
                    return oldPanels[row.panelIndex];
                }
                return CKEDITOR.dom.element.createFromHtml(col.panelHtml, doc);
            });
            oldPanels.forEach(function (panel, i) {
                if (!kept[i]) { panel.remove(); }
            });
            // append() déplace les nœuds existants : la liste reste en tête,
            // les panneaux suivent dans l'ordre de la popin.
            finalPanels.forEach(function (panel) { widget.element.append(panel); });

            var list = widget.element.findOne(col.listSelector);
            list.setHtml('');
            rows.forEach(function (row) {
                var item = CKEDITOR.dom.element.createFromHtml(col.itemHtml, doc);
                var label = item.findOne(col.labelSelector) || item;
                label.setText(CKEDITOR.tools.trim(row.label)
                    || (col.itemName.charAt(0).toUpperCase() + col.itemName.slice(1)));
                list.append(item);
            });

            wireCollection(widget, col);
            syncCollectionEditables(widget, spec);
        }

        /**
         * Popin de GESTION d'une collection (générée quand l'entrée déclare
         * `collection`) : une ligne par élément (champ libellé + Supprimer),
         * bouton d'ajout, minimum `col.min` éléments. La suppression d'un
         * élément dont le panneau a du contenu bascule la ligne en
         * CONFIRMATION INTÉGRÉE à la popin (jamais de confirm() natif).
         * L'état vit dans `_rows` de l'élément html du dialogue :
         * [{label, panelIndex|null, hasContent, confirming}] — panelIndex null
         * = nouvel élément (panneau créé au commit).
         */
        function registerCollectionDialog(spec) {
            var name = dialogName(spec);
            if (CKEDITOR.dialog.exists(name)) { return; }
            var col = spec.collection;
            var itemName = col.itemName;

            function render(uiEl) {
                var rows = uiEl._rows;
                var container = uiEl.getElement().$;
                var doc = container.ownerDocument;
                container.innerHTML = '';

                function button(text, onclick) {
                    var b = doc.createElement('button');
                    b.type = 'button';
                    b.appendChild(doc.createTextNode(text));
                    b.style.cssText = 'padding:4px 10px;cursor:pointer;';
                    b.onclick = onclick;
                    return b;
                }

                rows.forEach(function (row, i) {
                    var line = doc.createElement('div');
                    line.style.cssText =
                        'display:flex;align-items:center;gap:8px;margin:0 0 8px;';
                    if (row.confirming) {
                        var msg = doc.createElement('span');
                        msg.style.cssText = 'flex:1;color:#b34000;';
                        msg.appendChild(doc.createTextNode(
                            'Le panneau de « ' + (CKEDITOR.tools.trim(row.label) || itemName + ' ' + (i + 1))
                            + ' » n’est pas vide. Supprimer quand même ?'));
                        line.appendChild(msg);
                        line.appendChild(button('Supprimer', function () {
                            rows.splice(i, 1);
                            render(uiEl);
                        }));
                        line.appendChild(button('Annuler', function () {
                            row.confirming = false;
                            render(uiEl);
                        }));
                    } else {
                        var input = doc.createElement('input');
                        input.type = 'text';
                        input.value = row.label;
                        input.setAttribute('aria-label',
                            'Libellé de l’' + itemName + ' ' + (i + 1));
                        input.style.cssText = 'flex:1;min-width:0;padding:4px 6px;';
                        input.oninput = function () { row.label = input.value; };
                        line.appendChild(input);
                        var del = button('Supprimer', function () {
                            if (row.hasContent) {
                                row.confirming = true;
                            } else {
                                rows.splice(i, 1);
                            }
                            render(uiEl);
                        });
                        if (rows.length <= col.min) {
                            del.disabled = true;
                            del.title = 'Minimum : ' + col.min + ' ' + itemName + 's';
                        }
                        line.appendChild(del);
                    }
                    container.appendChild(line);
                });

                var add = button('Ajouter un ' + itemName, function () {
                    rows.push({
                        label: '', panelIndex: null,
                        hasContent: false, confirming: false
                    });
                    render(uiEl);
                    var inputs = container.getElementsByTagName('input');
                    if (inputs.length) { inputs[inputs.length - 1].focus(); }
                });
                add.style.marginTop = '4px';
                container.appendChild(add);
            }

            CKEDITOR.dialog.add(name, function () {
                return {
                    title: spec.dialog.title,
                    minWidth: 420,
                    minHeight: 120,
                    contents: [{
                        id: 'main',
                        elements: [{
                            type: 'html',
                            id: 'items',
                            html: '<div></div>',
                            setup: function (widget) {
                                var panels = widget.element
                                    .find(col.panelSelector).toArray();
                                this._rows = widget.element
                                    .find(col.labelSelector).toArray()
                                    .map(function (label, i) {
                                        return {
                                            label: label.getText(),
                                            panelIndex: panels[i] ? i : null,
                                            hasContent: panels[i]
                                                ? panelHasContent(panels[i]) : false,
                                            confirming: false
                                        };
                                    });
                                render(this);
                            },
                            commit: function (widget) {
                                commitCollection(widget, spec, this._rows);
                            }
                        }]
                    }]
                };
            });
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
                    // Collection : recâblage (ids uniques document + aria)
                    // puis branchement des zones éditables dynamiques — le
                    // plugin widget a déjà traité les editables STATIQUES
                    // (setupEditables) avant d'appeler init().
                    if (spec.collection) {
                        wireCollection(this, spec.collection);
                        syncCollectionEditables(this, spec);
                    }
                }
            };
        }

        // `contextmenu` est dans le build LimeSurvey ; garde par prudence
        // (sans lui, la popin reste accessible par double-clic et Entrée).
        if (editor.contextMenu) { editor.addMenuGroup('dsfrwidgets'); }

        WIDGETS.forEach(function (spec) {
            if (spec.dialog) {
                if (spec.collection) { registerCollectionDialog(spec); }
                else { registerDialog(spec); }
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
