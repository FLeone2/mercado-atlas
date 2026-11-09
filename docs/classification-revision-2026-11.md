# Revisão do BD de outubro de 2026 e propulsão auditada

Revisão em 09/11/2026, comparando os arquivos originais de BD de setembro e outubro obtidos na pasta Emplacamentos do Drive. Os arquivos XLSB privados permanecem fora do repositório. A reprodução é `python scripts/revise-bd.py --old /privado/setembro.xlsb --new /privado/outubro.xlsb --apply`; a revisão é idempotente para os mesmos arquivos, regras e conjunto de fontes mensais.

## Comparação das abas anuais

As abas de 2016 a 2025 são idênticas nos doze campos de identificação/classificação examinados. Em 2026, outubro contém 13.771 códigos, contra 13.656 em setembro: 115 novos, nenhum removido, 44 registros alterados. Somente três códigos mudam dimensões analíticas que o Atlas utiliza:

- 203225, GWM TANK 300 PHEV FLEX: FUEL passa de FFV a PHEV.
- 203381, COMPASS LONGIT HYB: SEGMENT passa de MID a COMPACT.
- 216412, CX-9: SEGMENT/BODY passam de OUT PORTFOLIO/ausente a UPPER-MID/SUV.

Os demais registros alteram PREMIUM, TRANSM ou TRACTION, campos que não entram nos cubos atuais. As 115 inclusões não foram associadas por aproximação: os cubos anteriores não preservam `Modelo_Codigo`, e o arquivo original de emplacamentos de outubro, com 53,8 MB, não foi materializado pela conexão Drive nesta sessão. Os 580 registros originalmente sem correspondência de outubro não foram convertidos em correspondências presumidas.

Para os dois primeiros códigos, a versão original é inequívoca e corresponde ao VERSION do BD após o prefixo de fabricante/importação: `I/GWM TANK 300 PHEV FLEX` e `JEEP/COMPASS LONGIT HYB`. A atualização compara o ano, a versão exata e **todos** os campos anteriores do BD antes de alterar qualquer célula agregada. O código CX-9 não possui uma ponte revisada e ficou pendente; `I/MAZDA CX-9 TOURING` sem BD não foi presumido como esse código.

Foram corrigidos 1.877 registros do Tank Flex e 194 do Compass, em seis meses de 2026. Contagens e dimensões originais de emplacamento foram conservadas; a projeção completa de origem para o cubo-base foi conferida. Novos caminhos dos arquivos invalidam os recortes derivados; hashes anteriores, fontes e alterações mensais ficam em `data/revisions/2026-11-bd-october.json`.

## Erros que continuam no próprio BD novo

Atualizar o XLSB não basta para corrigir os casos encontrados na auditoria. O BD de outubro continua com GASOLINE para Tank 300 PHEV/Macan E4, GASOLINE para Captiva EV em 2025 e FFV para Yaris Cross XRE Hybrid. O Atlas conserva essas categorias no campo **Tecnologia BD** e aplica exceções revisadas somente ao campo analítico **Propulsão**:

| Versão original exata | Anos revisados | Propulsão |
|---|---|---|
| I/GWM TANK 300 PHEV | 2025–2026 | PHEV |
| I/PORSCHE MACAN E4 | 2024–2026 | BEV |
| I/CHEV CAPTIVA EV PR | 2025 | BEV |
| TOYOTA/YCROSS XRE-HYBRID | 2026 | HEV |

Cada regra inclui código, BRAND e VERSION exatos do BD anual, combustível esperado e fonte técnica do fabricante em `data/classification/propulsion-overrides.json`. As versões-alvo devem ser únicas na aba anual. A aplicação mensal exige o rótulo original exato e o FUEL anterior esperado. Nenhuma regra classifica veículos apenas por conterem “híbrido” no combustível ou “EV” no nome. Não se extrapola uma regra para outro ano ou versão.

As exceções estão nos metadados de cada mês do manifesto e são utilizadas pelo worker em filtros, agrupamentos, comparações, pirâmide e histórico materializado. O manifesto faz parte da identidade dos caches, inclusive quando só os metadados mudam. A composição de Cenários usa a mesma definição de propulsão; a tecnologia bruta continua disponível nos cubos. Não foi feito ajuste numérico para forçar igualdade com a ABVE.

O total anual de veículos leves permanece igual. Os modelos econômicos usam volumes nacionais, Mitsubishi, varejo e pick-ups médias, cujos vetores de entrada não foram alterados por esta revisão; não se declara uma nova calibração econômica.

## Regeneração e vínculos geográficos

Depois de revisar o BD, o histórico precisa ser reconstruído. A sequência existente `scripts/update-derived.sh` inclui `build_scenarios.py`, **`relink_regional.py`** e só então os derivados regionais. O passo de relink mantém as regras compartilhadas de nomes e aliases por UF: nesta revisão, preserva 5.552 vínculos e apenas dois nomes sem código. Executar `build_scenarios.py` isoladamente recria vínculos mais restritos; não publicar esse estágio intermediário. As previsões cujos vetores de entrada não mudaram foram mantidas, com as fontes revalidadas e recibos atualizados.

## Verificação

- `tests/test_import_month.py`: XLSX/XLSB, ano exato, chaves e conflitos.
- `tests/test_bd_revision.py`: identidade da fonte, versões ambíguas, ponte com tupla anterior completa, conservação e idempotência.
- `tests/propulsion-revision.test.cjs`: versões reais, tecnologia bruta preservada, filtros, resultado ao vivo versus histórico e invalidação de cache.
- `tests/october-2026.test.cjs`: total original de 254.011 emplacamentos e metadados de outubro.

A comparação com a ABVE exige recorte próprio: BEV/PHEV/HEV, incluindo MHEV somente no histórico até 2024. A série histórica e a tabela por tecnologia da ABVE têm pequenas divergências próprias, preservadas na auditoria anterior.

## Resultado da conciliação após a revisão

Referência: tabela por tecnologia do [ABVE Data](https://abve.org.br/bi-geral/), capturada em 09/11/2026, com as mesmas categorias visíveis compatibilizadas da auditoria inicial. Inclui MHEV em 2024 e exclui em 2025–2026; HEV do Atlas compara com HEV+HEV Flex da ABVE. FCEL residual permanece separado porque a tabela não traz coluna equivalente. A série histórica da própria ABVE registra totais ligeiramente diferentes; não foi usada silenciosamente como substituta.

| Período | ABVE | Atlas anterior | Atlas revisado | Diferença revisada |
|---|---:|---:|---:|---:|
| 2024 | 177.357 | 172.175 | 172.241 | −2,8846% |
| 2025 | 223.896 | 218.276 | 222.256 | −0,7325% |
| Jan–out/2026 | 436.089 | 427.241 | 435.265 | −0,1890% |

O resíduo de 824 emplacamentos em 2026 continua aberto. Corrigir os casos comprovados não valida automaticamente as demais classificações. O CSV `data/revisions/abve-comparison-before-after.csv` preserva os três períodos e a série anterior disponível, com diferença percentual usando ABVE como denominador. Os valores revisados foram somados diretamente do histórico regenerado e conciliados com o worker em versões reais.
