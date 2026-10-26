import { createContext, useContext } from 'react';

/* Tudo o que as páginas do Atlas usam, montado uma vez em App:
   filters/mFilters   filtros globais / os mesmos sem a marca (o mercado do recorte)
   focus, focusName   marca em foco (Mitsubishi por padrão)
   market             resultado 'atlas': mercado do recorte, marca em foco e o mesmo período do ano anterior
   hist               histórico mensal (2016 em diante) para as trajetórias
   points, cityName   posições dos municípios e nome de exibição
   go(page, anchor)   navegação; tip.show/hide balão; scope = recorte em uma linha */
export const Ctx = createContext(null);
export const useAtlas = () => useContext(Ctx);
