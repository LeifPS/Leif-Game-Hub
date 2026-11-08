// Einstiegspunkt des Workers. Die Logik liegt in konten.js (der Einstiegspunkt darf außer dem Handler nichts exportieren).
import { handle } from './konten.js';
import { altAdresseWeiterleiten } from './umzug.js';

export default { fetch: (request, env) => altAdresseWeiterleiten(request) || handle(request, env) };
