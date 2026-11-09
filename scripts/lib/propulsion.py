"""Materialize the reviewed propulsion definition without rewriting raw BD FUEL."""
ICE = {'GASOLINE', 'FFV', 'DIESEL', 'ETANOL', 'ETHANOL', 'TETRAFUEL', 'GNV'}
ELECTRIC = {'HEV', 'PHEV', 'BEV', 'MHEV', 'FCEL'}


def effective_propulsion(fuel, model, overrides):
    matching = {rule['propulsion'] for rule in overrides
                if rule['model'] == model and rule['expectedBdFuel'] == fuel}
    if len(matching) > 1 or any(value not in ELECTRIC for value in matching):
        raise ValueError('Conflicting or invalid audited propulsion exceptions')
    if matching:
        return next(iter(matching))
    value = str(fuel or '').strip().upper()
    return 'ICE' if value in ICE else value if value in ELECTRIC else 'Não classificado'
