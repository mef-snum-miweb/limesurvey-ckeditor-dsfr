/**
 * Palette de composants DSFR pour l'éditeur CKEditor de LimeSurvey.
 *
 * Chargée via `config.templates_files` (cf. overlays/ckeditor/config.js).
 * Bouton « Templates » → boîte de dialogue proposant des blocs DSFR prêts à
 * insérer. À utiliser dans le champ AIDE d'une question ou les textes
 * d'introduction / de fin (HTML riche conservé).
 *
 * NB : ne pas utiliser dans l'INTITULÉ d'une question (aplati en <h3>).
 * Les variantes (types d'alerte, callout avec/sans titre…) sont listées
 * comme entrées distinctes — le plugin Templates n'a pas de sous-options.
 */
CKEDITOR.addTemplates('dsfr', {
    imagesPath: '',
    templates: [
        /* --- Accordéon --- */
        {
            title: 'Accordéon',
            description: 'Section repliable DSFR. Si plusieurs accordéons, modifier l’identifiant (id / aria-controls).',
            html:
                '<section class="fr-accordion">' +
                '<h3 class="fr-accordion__title">' +
                '<button type="button" class="fr-accordion__btn" aria-expanded="false" aria-controls="fr-accordion-contenu">Intitulé de l’accordéon</button>' +
                '</h3>' +
                '<div class="fr-collapse" id="fr-accordion-contenu"><p>Contenu de l’accordéon.</p></div>' +
                '</section><p>&nbsp;</p>'
        },

        /* --- Mise en avant (callout) --- */
        {
            title: 'Mise en avant — avec titre',
            description: 'Encadré de mise en avant DSFR (fr-callout) avec titre.',
            html:
                '<div class="fr-callout">' +
                '<h3 class="fr-callout__title">Titre de la mise en avant</h3>' +
                '<p class="fr-callout__text">Texte de la mise en avant.</p>' +
                '</div><p>&nbsp;</p>'
        },
        {
            title: 'Mise en avant — sans titre',
            description: 'Encadré de mise en avant DSFR (fr-callout), texte seul.',
            html:
                '<div class="fr-callout">' +
                '<p class="fr-callout__text">Texte de la mise en avant.</p>' +
                '</div><p>&nbsp;</p>'
        },

        /* --- Mise en exergue (highlight) --- */
        {
            title: 'Mise en exergue',
            description: 'Texte avec liseré latéral DSFR (fr-highlight).',
            html:
                '<div class="fr-highlight"><p>Texte mis en exergue.</p></div><p>&nbsp;</p>'
        },

        /* --- Alertes (4 types) --- */
        {
            title: 'Alerte — information',
            description: 'Bandeau d’information DSFR.',
            html:
                '<div class="fr-alert fr-alert--info">' +
                '<h3 class="fr-alert__title">Titre de l’information</h3>' +
                '<p>Texte de l’information.</p></div><p>&nbsp;</p>'
        },
        {
            title: 'Alerte — succès',
            description: 'Bandeau de succès DSFR.',
            html:
                '<div class="fr-alert fr-alert--success">' +
                '<h3 class="fr-alert__title">Titre du succès</h3>' +
                '<p>Texte du message de succès.</p></div><p>&nbsp;</p>'
        },
        {
            title: 'Alerte — erreur',
            description: 'Bandeau d’erreur DSFR.',
            html:
                '<div class="fr-alert fr-alert--error">' +
                '<h3 class="fr-alert__title">Titre de l’erreur</h3>' +
                '<p>Texte du message d’erreur.</p></div><p>&nbsp;</p>'
        },
        {
            title: 'Alerte — avertissement',
            description: 'Bandeau d’avertissement DSFR.',
            html:
                '<div class="fr-alert fr-alert--warning">' +
                '<h3 class="fr-alert__title">Titre de l’avertissement</h3>' +
                '<p>Texte de l’avertissement.</p></div><p>&nbsp;</p>'
        },

        /* --- Citation --- */
        {
            title: 'Citation',
            description: 'Citation DSFR (fr-quote) avec auteur.',
            html:
                '<figure class="fr-quote">' +
                '<blockquote><p>« Texte de la citation. »</p></blockquote>' +
                '<figcaption><p class="fr-quote__author">Nom de l’auteur</p></figcaption>' +
                '</figure><p>&nbsp;</p>'
        },

        /* --- Tableau --- */
        {
            title: 'Tableau',
            description: 'Tableau DSFR (fr-table) 2 colonnes avec en-tête.',
            html:
                '<div class="fr-table">' +
                '<table>' +
                '<caption>Titre du tableau</caption>' +
                '<thead><tr><th scope="col">Colonne 1</th><th scope="col">Colonne 2</th></tr></thead>' +
                '<tbody>' +
                '<tr><td>Cellule</td><td>Cellule</td></tr>' +
                '<tr><td>Cellule</td><td>Cellule</td></tr>' +
                '</tbody>' +
                '</table></div><p>&nbsp;</p>'
        },

        /* --- Téléchargement de fichier --- */
        {
            title: 'Téléchargement de fichier',
            description: 'Lien de téléchargement DSFR (fr-download). Modifier l’URL, le titre et le détail (format – poids).',
            html:
                '<div class="fr-download">' +
                '<p><a href="[URL-du-fichier]" download class="fr-download__link">' +
                'Intitulé du fichier<span class="fr-download__detail">Format – Poids</span>' +
                '</a></p></div><p>&nbsp;</p>'
        }
    ]
});
