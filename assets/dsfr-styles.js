/**
 * Menu déroulant « Styles » DSFR pour CKEditor (LimeSurvey).
 *
 * Chargé via `config.stylesSet = 'dsfr:.../dsfr-styles.js'`.
 * Chaque style applique une CLASSE DSFR (jamais un style inline) : les
 * classes survivent au sanitizer du thème (contrairement à `style="…"`),
 * ce qui permet une mise en forme conforme sans passer par le mode code.
 */
CKEDITOR.stylesSet.add('dsfr', [
    // --- Blocs ---
    { name: 'Paragraphe — introduction', element: 'p', attributes: { 'class': 'fr-text--lead' } },
    { name: 'Paragraphe — plus grand', element: 'p', attributes: { 'class': 'fr-text--lg' } },
    { name: 'Paragraphe — plus petit', element: 'p', attributes: { 'class': 'fr-text--sm' } },

    // --- En ligne ---
    { name: 'Texte — plus grand', element: 'span', attributes: { 'class': 'fr-text--lg' } },
    { name: 'Texte — plus petit', element: 'span', attributes: { 'class': 'fr-text--sm' } },

    // --- Badges (statut) ---
    { name: 'Badge — information', element: 'span', attributes: { 'class': 'fr-badge fr-badge--info fr-badge--sm' } },
    { name: 'Badge — succès', element: 'span', attributes: { 'class': 'fr-badge fr-badge--success fr-badge--sm' } },
    { name: 'Badge — nouveau', element: 'span', attributes: { 'class': 'fr-badge fr-badge--new fr-badge--sm' } }
]);
