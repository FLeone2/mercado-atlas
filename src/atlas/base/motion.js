import { createElement, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';

/* Movimento do Atlas, sem biblioteca: entradas que começam quando o gráfico aparece na tela,
   transições entre dados (o gráfico se transforma em vez de piscar) e números que contam.
   Curvas de easing no padrão da web (saída rápida, chegada suave). Tudo some com
   "reduzir movimento" do sistema. */

const RM = '(prefers-reduced-motion: reduce)';
const subscribeRM = cb => { const m = matchMedia(RM); m.addEventListener('change', cb); return () => m.removeEventListener('change', cb); };
export const useReducedMotion = () => useSyncExternalStore(subscribeRM, () => matchMedia(RM).matches, () => false);

export const ease = {
  outExpo: t => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  inOutSine: t => -(Math.cos(Math.PI * t) - 1) / 2,
  outQuad: t => 1 - (1 - t) * (1 - t),
};

/* uma animação de 0 a 1 em `duration` ms; devolve a função que a cancela */
export function tween(duration, onUpdate, { easing = ease.outExpo, onDone } = {}) {
  let raf = 0, t0 = 0;
  const step = now => {
    if (!t0) t0 = now;
    const p = Math.min(1, (now - t0) / duration);
    onUpdate(easing(p));
    if (p < 1) raf = requestAnimationFrame(step); else onDone?.();
  };
  raf = requestAnimationFrame(step);
  return () => cancelAnimationFrame(raf);
}

/* vira true (uma vez) quando `amount` do elemento aparece na tela */
export function useInView(ref, amount = .2) {
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current; if (!el || seen) return undefined;
    if (typeof IntersectionObserver === 'undefined') { setSeen(true); return undefined; }
    const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { setSeen(true); io.disconnect(); } }, { threshold: amount });
    io.observe(el);
    return () => io.disconnect();
  }, [ref, amount, seen]);
  return seen;
}

/* séries que mudam de valor se transformam (mesmo número de séries e de pontos); senão, troca direta */
export function useMorph(target, duration = 650) {
  const rm = useReducedMotion(), [shown, setShown] = useState(target), cur = useRef(target);
  const sig = target.map(a => a.join(',')).join('|');
  useEffect(() => {
    const from = cur.current, same = from.length === target.length && from.every((a, k) => a.length === target[k].length);
    if (rm || !same) { cur.current = target; setShown(target); return undefined; }
    return tween(duration, p => {
      const v = target.map((a, k) => a.map((y, i) => { const x = from[k][i]; return y == null || x == null || !Number.isFinite(x) ? y : x + (y - x) * p; }));
      cur.current = v; setShown(v);
    }, { onDone: () => { cur.current = target; setShown(target); } });
  }, [sig, rm]); // eslint-disable-line react-hooks/exhaustive-deps
  return shown;
}

/* número que conta: de 0 ao valor na primeira vez, e do valor anterior ao novo quando ele muda */
export function Num({ value, format = v => String(v), duration = 800 }) {
  const ref = useRef(null), last = useRef(null), rm = useReducedMotion();
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return undefined;
    const a = last.current ?? 0, b = value; last.current = value;
    if (rm || b == null || !Number.isFinite(b) || a === b) { el.textContent = format(b); return undefined; }
    el.textContent = format(a);
    return tween(duration, p => { el.textContent = format(a + (b - a) * p); }, { onDone: () => { el.textContent = format(b); } });
  }, [value, rm]); // eslint-disable-line react-hooks/exhaustive-deps
  return createElement('span', { ref, className: 'px-num' });
}
