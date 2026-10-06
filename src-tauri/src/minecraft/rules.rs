use super::manifest::Rule;

/// Évalue une liste de règles Mojang pour la plateforme Windows x64.
/// Sans règle -> autorisé. Avec des règles -> refusé par défaut, la dernière règle
/// correspondante gagne (comportement du launcher officiel: absence de correspondance = disallow).
pub fn rules_allow(rules: &Option<Vec<Rule>>) -> bool {
    let Some(rules) = rules else {
        return true;
    };
    let mut allowed = false;
    for rule in rules {
        let os_matches = match &rule.os {
            None => true,
            Some(os) => {
                let name_ok = os.name.as_deref().map(|n| n == "windows").unwrap_or(true);
                let arch_ok = os
                    .arch
                    .as_deref()
                    .map(|a| a == "x86_64" || a == "x64" || a == "amd64")
                    .unwrap_or(true);
                name_ok && arch_ok
            }
        };
        // Aucune fonctionnalité optionnelle (quick play, démo, ...) n'est prise en charge:
        // une règle qui en réclame une ne correspond donc jamais.
        let features_match = match &rule.features {
            None => true,
            Some(features) => features.is_empty(),
        };
        if os_matches && features_match {
            allowed = rule.action == "allow";
        }
    }
    allowed
}
