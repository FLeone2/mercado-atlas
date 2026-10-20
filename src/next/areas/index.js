import Panorama from './Panorama.jsx';
import Evolucao from './Evolucao.jsx';
import Concorrencia from './Concorrencia.jsx';
import Segmentos from './Segmentos.jsx';
import Territorios from './Territorios.jsx';
import Explorar from './Explorar.jsx';
import Economia from './Economia.jsx';
import Animacoes from './Animacoes.jsx';

// slug is what goes in the URL (?a=slug); tone is the navigation bar colour at the top of the page.
export const AREAS = [
  { slug: 'panorama', label: 'Panorama', Component: Panorama, tone: 'dark' },
  { slug: 'evolucao', label: 'Evolução', Component: Evolucao, tone: 'light' },
  { slug: 'concorrencia', label: 'Concorrência', Component: Concorrencia, tone: 'light' },
  { slug: 'segmentos', label: 'Segmentos', Component: Segmentos, tone: 'light' },
  { slug: 'territorios', label: 'Territórios', Component: Territorios, tone: 'light' },
  { slug: 'explorar', label: 'Explorar', Component: Explorar, tone: 'light' },
  { slug: 'economia', label: 'Economia', Component: Economia, tone: 'light' },
  { slug: 'animacoes', label: 'Animações', Component: Animacoes, tone: 'light' },
];
