import Hero from '../Hero.jsx';
import Story from '../Story.jsx';
import { useNext } from '../ctx.js';

export default function Panorama() {
  const c = useNext();
  return (
    <>
      <Hero model={c.model} points={c.points} ufFilter={c.ufFilter} insights={c.insights} scrollRef={c.setTone} onTip={c.onTip} />
      <Story model={c.model} market={c.hasBrand ? c.market : null} geoMarket={c.hasGeo ? c.geoless : null} hist={c.hist} filters={c.filters} setFilter={c.setFilter} insights={c.insights} focus={c.focus} cityName={c.cityName} />
    </>
  );
}
