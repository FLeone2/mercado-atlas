import { createContext, useContext } from 'react';

/* Everything an area needs, built once in NextApp:
   filters, setFilter      current global filters (arrays or 'all') and the setter that writes them to the URL
   model                   market result for the filters (groups.uf/marca/modelo/... with count, previous, shareChange)
   market                  same, without brand/model filters (use for rankings); null when no brand filter is active → use model
   geoless                 same, without UF/region/city filters; null when none active → use model
   hist, histMonthly       long monthly history (data/history) and engine.historyMonthly(hist.data, filters, groupBy)
   manifest                dimensionChoices, months
   points                  municipal points {rows:[code,name,uf,x,y]}
   focus                   brand in focus (single selected brand or MITSUBISHI)
   insights                "observações rápidas" sentences
   cityName(raw)           'SAO PAULO · SP' → 'São Paulo'
   base                    data base URL
   go(area)                navigate to another area */
export const NextCtx = createContext(null);
export const useNext = () => useContext(NextCtx);
