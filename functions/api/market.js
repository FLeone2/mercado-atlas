// Cloudflare Pages Function: GET /api/market — o cálculo do Atlas no servidor (server/market.js).
// Desligado até existir o KV ligado ao projeto com o nome RESPOSTAS (Settings › Bindings).
import { handle } from '../../server/market.js';

export const onRequest = ({ request, env, waitUntil }) => handle(request, env, waitUntil);
