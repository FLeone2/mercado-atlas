# Atlas · Mercado Automotivo

Painel dos emplacamentos de automóveis e comerciais leves no Brasil, com a estética
**Marfim Botânico** do Atlas: fundo marfim, títulos em DM Serif Display, interface em
Inter (as mesmas fontes do Mercado Atlas 2), tinta verde-escura, latão para ação e seleção, filetes no lugar de caixas.

É a reconstrução do `mercado-automotivo-2` com a mesma base de dados, reorganizada para
mostrar cada análise uma vez, com pouco texto (método e ressalvas ficam atrás do ⓘ):

| Área | O que tem |
|---|---|
| Panorama | Mapa, pulso, 4 destaques, evolução, marcas, combustível e canal |
| Evolução | Uma página: ritmo e sazonalidade, trajetórias, propulsão, crescimento, modelos/carrocerias, combustível/canal, linha do tempo |
| Concorrência | Mitsubishi no segmento e onde crescer, concentração, ranking (lista, conectado, pirâmide), ganhos e perdas, duelo, ranking mês a mês, Sankey, conexões |
| Segmentos | Porte (pirâmide + segmentos/carrocerias), Propulsão, Origem |
| Territórios | Mapas (mapa principal, líder por município, top 3, força da marca, calor, por mil habitantes / canal) e 3D (espigões, estados em 3D, atlas municipal) |
| Explorar | Monte seu gráfico e todos os formatos |
| Economia | Contexto, Potencial regional, Projeções (testes técnicos em Dados e metodologia) |
| Animações | Corrida, liderança, mapas e composição no tempo |

Links antigos (`?tab=ranking`, `?tab=structure`) abrem Concorrência e Segmentos.
Os repositórios `mercado-automotivo`, `mercado-automotivo-2` e `atlas-automotivo` seguem intocados.

## Publicação (Cloudflare Pages)

| Configuração | Valor |
|---|---|
| Framework preset | Nenhum (ou Vite) |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Variável de ambiente | `NODE_VERSION=22` |

Cada push em `main` publica sozinho. `dist/` leva o app, as fontes e `data/` (sem as fontes brutas de Economia).
Cabeçalhos de segurança e cache ficam em `public/_headers`.

## Rodar localmente

```sh
npm install
npm run dev                 # http://localhost:5173
npm run build && npm run preview   # versão de produção em http://localhost:8765
```

## Como está organizado

| Pasta | O quê |
|---|---|
| `src/kit/` | Os componentes no estilo Atlas: seções, figuras (com CSV e PNG), gráficos SVG, tabelas, campos, seletor de período, diálogos e o estado do painel na URL. |
| `src/market/` | As análises. `core.js` é a montagem; `modules/` tem cada área (mapas, Sankey, histórico, cenários, animações…); `workers/` são os cálculos que rodam fora da tela; `modules/market-request.js` define cada consulta e `modules/precomputed.js` usa o pré-cálculo. |
| `src/styles/atlas.css` | A camada visual Atlas (tokens claro/escuro, cabeçalho, filtros, figuras). É carregada por último. `legacy/` guarda os estilos de layout de cada análise. |
| `data/` | A mesma base do mercado-automotivo-2: cubos mensais, cubos de origem, geografia, histórico de 10 anos, população IBGE, cenários e `snapshot.json` (listas de filtros e séries oficiais). |
| `scripts/` | Histórico, população, cenários e `update-derived.sh`. |
| `tests/` | Testes automáticos (dados reais) e a varredura visual. |

`src/market/core.js` usa `/*@include arquivo*/` para juntar os módulos num só escopo
(eles foram escritos assim) e `/*@string a + b*/` para embutir o código dos workers.
Quem faz isso é o plugin `atlas-market` em `vite.config.js`.

## Período

- **Ano atual** (janeiro até o último mês) e **Último mês** ficam sempre na barra de filtros,
  em todas as áreas. Os dois seguem o manifesto: quando um mês novo entra, eles avançam sozinhos.
  Se o mês mais recente vier parcial e sem data final declarada, os botões usam o último mês completo
  (nunca somem). Teste: `tests/period-shortcuts.test.cjs`.
- **Período personalizado** no seletor: atalhos (último mês, ano atual, últimos 12 meses, ano anterior,
  todo o período), meses de/até e dia inicial/final.
- Ao abrir sem período na URL, o painel mostra o último mês disponível.

## Explore as conexões

Gráfico de cordas trazido do Atlas Automotivo, em Concorrência (depois do Sankey): liga regiões, marcas
(6 maiores + Mitsubishi + Outras) e propulsões do recorte. Passar o mouse destaca; clicar numa marca filtra o painel.
Os dados (região × marca e marca × propulsão) vêm na mesma consulta de Concorrência, sem leitura extra dos cubos,
e entram no pré-cálculo. Fonte: `src/market/modules/connections-chord.js`; teste: `tests/connections.test.cjs`.

## Tempo de carregamento

- **Pré-cálculo dos períodos rápidos.** `npm run build` roda antes `scripts/precompute.cjs`, que usa o mesmo cálculo
  do navegador para gerar o resultado de "Ano atual" e "Último mês" sem filtros, para cada área
  (`data/precomputed.json` + `data/precomputed/*.json.gz`, ~7 MB, ~1 min). O site usa um arquivo só quando ele foi gerado
  do manifesto em uso e responde exatamente ao mesmo pedido; com filtros (ou se algo falhar) volta ao cálculo normal.
  Medido a 25 Mbps: Ano atual de ~18 s para ~2 s; Último mês de ~3 s para ~1,5 s.
- **Uma leitura só para painel e pulso.** A consulta principal já traz a marca em foco (Mitsubishi, ou a marca filtrada),
  e a faixa de pulso reaproveita esse resultado. Recortes com filtro baixam e processam cada cubo uma vez (antes, duas).
- Os arquivos pré-calculados não vão para o Git: são gerados a cada build (no Cloudflare também).
  Para gerar localmente sem o build: `npm run precompute`.
- Testes: `tests/precompute.test.cjs` (índice do manifesto atual, uma entrada por área, arquivo = cálculo ao vivo) e
  `tests/market-focus.test.cjs` (marca em foco = consulta separada da marca).

## Nomes de municípios e população

Um só módulo compara nomes de municípios entre registros, malhas do IBGE, pontos e população: `src/market/modules/geo-names.js`.
Ele ignora acentos, apóstrofos e "de/do/da" (Alta Floresta D'Oeste = ALTA FLORESTA DO OESTE) e tem uma lista curta de apelidos
por UF (Campos dos Goitacazes → Goytacazes, Embu → Embu das Artes…). Quem não casa fica "N/D", nunca zero.
Os cálculos por mil habitantes usam o catálogo completo (`data/geography/catalog-population.json`, 5.571 municípios).
Testes: `tests/geo-names.test.cjs` (os 129 cubos casam inteiros) e `tests/audit-regression.test.cjs` (números do dossiê de auditoria de 19/10/2026).
Pendente: os pacotes regionais pré-calculados (`scripts/build_scenarios.py`) ainda usam a regra antiga; regenerá-los muda arquivos de dados.

## Ferramentas

Copiar link (área + filtros + vistas na URL), favoritos, relatório executivo, exportar recorte (CSV),
CSV e PNG de cada figura (menu ⋯), imprimir/PDF da área ou resumo de uma página, faixa de pulso,
perguntas rápidas, guia "Como confiar nestes números" e tema claro/escuro (☾/☼).

## Testes

```sh
pip install -r scripts/requirements-scenarios.txt   # uma vez, para os testes de Economia
bash scripts/test.sh                                 # Node + Python
node tests/visual/run.cjs                            # com o preview rodando: 13 áreas × claro/escuro × desktop/celular
```

`tests/fixtures/data-baseline.json` guarda o SHA-256 de cada arquivo de dados (o mesmo do
mercado-automotivo-2): mudança visual não pode alterar dados.

## Atualizar com um mês novo

1. Coloque o cubo do mês em `data/cubes/` e `data/origin-cubes/` e atualize `data/manifest.json`
   (mesmo processo de ingestão do mercado-automotivo-2).
2. `bash scripts/update-derived.sh` — regenera o histórico, registra a nova impressão digital dos dados,
   gera `dist/` (com o pré-cálculo dos períodos rápidos do mês novo) e roda os testes.
3. Commit e push em `main`.

## Regras de cor

Vermelho carmim é exclusivo da Mitsubishi. Queda usa cobre; crescimento, verde.
Cada marca tem a mesma cor em todas as áreas (FIAT azul, VW âmbar, GM lavanda, BYD verde…).

## Temas visuais

O seletor **Tema do site** oferece **Original** (padrão) e **Liquid Aurora**.
O Original preserva as aparências clara e escura de Marfim Botânico e sua preferência
existente (`atlas-theme`). Liquid Aurora é um tema visual adicional, com vidro escuro
e luz azul fria, aplicado apenas quando selecionado (`atlas-visual-theme`).
Ao voltar ao Original, a preferência clara/escura anterior é restaurada.
Os estilos adicionais ficam isolados em `src/styles/liquid-aurora.css`; dados e
organização do painel são compartilhados pelos dois temas.
