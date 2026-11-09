# Recarga no Laboratório

O Laboratório consulta `/data/charging/abve.json`, um conjunto independente dos emplacamentos. A data de referência da recarga é fixa na fotografia selecionada; os filtros de data, marca e canal dos emplacamentos não devem alterar ou reinterpretar esse estoque de pontos.

## Origem e datas

- Página publicada pela fonte: https://abve.org.br/abve-data/bi-eletropostos/ . Legenda: ABVE/Tupi Mobilidade.
- Captura pública: 09/11/2026; modelo `BI_Eletro_Out26_v5`, atualizado em 09/10/2026.
- A base e a legenda do painel indicam setembro/2026. A [matéria ABVE de 28/09/2026](https://abve.org.br/recarga-rapida-dc-quase-triplica-em-12-meses-e-ja-responde-por-38-da-rede-brasileira/) usa agosto/2026 para os mesmos totais. O conflito foi mantido em `metadata.periodCaveat`.
- Total publicado: 18.469 AC + 11.397 DC = 29.866 pontos públicos e semipúblicos, conforme a unidade publicada pela fonte.

O acesso foi feito ao relatório público do Power BI sem login ou uso da plataforma Tupi. Não foi identificada licença aberta de redistribuição comercial da base; disponibilidade técnica e licença de reutilização são informações distintas.

## Grão e qualidade

Há 1.914 observações originais, agrupadas em 1.911 rótulos exatos UF/nome. Esse número não é uma contagem validada de municípios: há distritos e regiões administrativas, como Guará, Sobradinho e Taguatinga no DF. A UI deve chamar essa dimensão de localidades ou rótulos geográficos e evitar afirmar que todos são municípios IBGE.

- A camada bruta conserva todas as linhas. Três rótulos têm duas observações com contagens diferentes; o agrupamento soma as duas e registra `sourceRowCount`. Isso reproduz o painel, sem afirmar que a fonte está livre de duplicidade material.
- `sourceCodes` conserva códigos opacos da fonte. Eles não são códigos IBGE e não são chaves confiáveis para o Atlas.
- A ponte para IBGE usa apenas o normalizador e os aliases preexistentes em `scripts/lib/geo_names.py`, por UF e nome, aceitando correspondência única. Não foram criados aliases novos nem redistribuídas regiões administrativas para Brasília.
- A fotografia atual tem 1.904 localidades correspondidas a 1.904 municípios do catálogo, cobrindo 29.814 pontos. Os sete rótulos não conciliados conservam todos os 52 pontos, inclusive nos totais por UF e Brasil.
- Não há endereço, coordenadas de estação, operador, conector, potência individual nem situação em tempo real. Mapas por UF mostram o agregado estadual; eventual mapa municipal deve usar centroide identificado como tal e não sugerir pontos físicos de recarga.
- O histórico nacional contém 17 fotografias irregulares nesta captura (março/2021–setembro/2026). Não interpolar meses ausentes nem representar evolução municipal. A consulta bruta direta pode revelar uma fotografia adicional de dezembro/2020, ausente do visual que originou esta versão.

## Reprodução e atualização

```sh
# Recriar o ativo público a partir da fotografia versionada, sem rede.
python3 scripts/build-charging.py

# Refazer a extração original a partir das respostas públicas guardadas.
python3 scripts/charging/extract.py --offline

# Obter uma nova fotografia separada, validar e comparar antes de adotá-la.
python3 scripts/build-charging.py --refresh \
  --source data/charging/source/nova-captura \
  --output /tmp/abve-charging-review.json

python3 -m unittest tests/test_charging.py
```

O extrator descobre o iframe e o modelo atualmente publicados, confere o esquema, detecta truncamento e reconcilia os dados de localidade com consulta independente por UF e o histórico nacional. Falhas de esquema/completude impedem a geração. Não há agenda de atualização.

`data/charging/source/2026-09/` reúne as requisições/respostas públicas originais em `snapshots/` e CSVs, metadados e recibo de qualidade em `values/`. O ativo da UI preserva hashes desses arquivos e do catálogo geográfico. O build copia somente `data/charging/abve.json` para a distribuição pública. As correspondências por nome são recalculadas em cada geração; nenhuma ponte baseada no ordinal da captura anterior é reaproveitada.

Para adotar outra fotografia, versionar a pasta de origem, revisar data/conflitos/totais e alterar `DEFAULT_SOURCE` no gerador para apontar à origem revisada. Os dados públicos são determinísticos; a geração não acrescenta o horário local do build nem altera os cubos de emplacamentos.

## Contrato do ativo

```text
schemaVersion: 1
metadata: source/sourceUrl/reportUrl/referenceDate/referenceMonth/retrievedAt/refreshedAt
          grain/unit/periodCaveat/geoCaveat/historyCaveat/mapCaveat/reuseLicense
          joinMethod/sourceSha256/catalogSha256

totals: ac/dc/total/rawRows/geographicLabels/states/matchedPoints/unmatchedPoints
        matchedLabels/unmatchedLabels/matchedMunicipalities
states[]: uf/name/region/ac/dc/total/geographicLabels
places[]: id/name/uf/region/ac/dc/total/sourceRowCount/sourceCodes[]
          ibgeCode?/ibgeName?/matchStatus
history[]: month/total
```

`places` preserva os rótulos publicados, não uma lista de estabelecimentos. `ibgeCode` e `ibgeName` são nulos para rótulos sem correspondência segura. Históricos e totais referem-se à fonte, não à frota estimada pelo Atlas.
