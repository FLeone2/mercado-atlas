"""Municipality-name comparison shared with the site (src/market/modules/geo-names.js).
Accents, case, punctuation and the particles DE/DO/DA/DOS/DAS/D are ignored, then a short UF-scoped alias
list covers renamed municipalities and old spellings. tests/test_geo_names.py keeps this file and the
JavaScript module identical."""
import re, unicodedata

PARTICLES = {'DE', 'DO', 'DA', 'DOS', 'DAS', 'D'}


def geo_base(value):
    text = unicodedata.normalize('NFD', '' if value is None else str(value))
    text = ''.join(c for c in text if unicodedata.category(c) != 'Mn').upper()
    return ' '.join(w for w in re.sub(r'[^A-Z0-9]+', ' ', text).split() if w and w not in PARTICLES)


# [UF, name in the registrations, name in the IBGE catalog]; same list as GEO_ALIAS_PAIRS in geo-names.js.
ALIAS_PAIRS = [
    ['RJ', 'Campos dos Goitacazes', 'Campos dos Goytacazes'], ['BA', 'Luiz Eduardo Magalhaes', 'Luís Eduardo Magalhães'], ['SP', 'Embu', 'Embu das Artes'],
    ['RS', 'Santana do Livramento', "Sant'Ana do Livramento"], ['SC', 'Picarras', 'Balneário Piçarras'], ['RJ', 'Parati', 'Paraty'],
    ['PA', 'Santa Isabel do Para', 'Santa Izabel do Pará'], ['MT', 'Poxoreo', 'Poxoréu'], ['SC', 'Barra do Sul', 'Balneário Barra do Sul'],
    ['PE', 'Itamaraca', 'Ilha de Itamaracá'], ['CE', 'Itapage', 'Itapajé'], ['SP', 'Ipaucu', 'Ipaussu'], ['MG', 'Brasopolis', 'Brazópolis'],
    ['SP', 'Sao Luis do Paraitinga', 'São Luiz do Paraitinga'], ['AL', 'Marimbondo', 'Maribondo'], ['MG', 'Itabirinha de Mantena', 'Itabirinha'],
    ['RJ', 'Trajano de Morais', 'Trajano de Moraes'], ['BA', 'Livramento do Brumado', 'Livramento de Nossa Senhora'], ['MG', 'Gouvea', 'Gouveia'],
    ['RN', 'Ares', 'Arez'], ['PA', 'Pau Darco', "Pau D'Arco"], ['TO', 'Pau Darco', "Pau D'Arco"], ['PI', 'Pau Darco do Piaui', "Pau D'Arco do Piauí"],
    ['SC', 'Presidente Castelo Branco', 'Presidente Castello Branco'], ['BA', 'Santa Teresinha', 'Santa Terezinha'], ['AP', 'Amapari', 'Pedra Branca do Amapari'],
    ['RN', 'Boa Saude', 'Januário Cicco'], ['SC', 'Lageado Grande', 'Lajeado Grande'], ['RN', 'Lagoa Danta', "Lagoa d'Anta"],
    ['TO', 'Sao Valerio da Natividade', 'São Valério'], ['MG', 'Queluzita', 'Queluzito'], ['PE', 'Iguaraci', 'Iguaracy'],
    ['PB', 'Sao Domingos de Pombal', 'São Domingos'], ['BA', 'Lagedo do Tabocal', 'Lajedo do Tabocal'], ['PB', 'Santarem', 'Joca Claudino'],
    ['PB', 'Serido', 'São Vicente do Seridó'], ['TO', 'Fortaleza do Tabocao', 'Tabocão'], ['RR', 'Sao Luiz', 'São Luiz do Anauá'],
    ['AC', 'Santa Rosa', 'Santa Rosa do Purus'], ['RN', 'Sao Miguel de Touros', 'São Miguel do Gostoso'], ['RN', 'Espirito Santo do Oeste', 'Paraú'], ['PB', 'Sao Bento de Pombal', 'São Bentinho'],
]
ALIASES = {uf + '|' + geo_base(source): geo_base(target) for uf, source, target in ALIAS_PAIRS}


def geo_key(name, uf=None):
    key = geo_base(name)
    return ALIASES.get(str(uf).upper() + '|' + key, key) if uf else key
