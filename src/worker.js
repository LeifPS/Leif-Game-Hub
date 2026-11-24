// Einstiegspunkt des Workers. Die Logik liegt in konten.js (der Einstiegspunkt darf außer dem Handler nichts exportieren).
import { handle } from './konten.js';
import { altAdresseWeiterleiten } from './umzug.js';
import { handschriftWeiche } from './handschrift.js';
import { hauptdomainWeiche } from './hauptdomain.js';

export default { fetch: (request, env) => altAdresseWeiterleiten(request) || hauptdomainWeiche(request) || handschriftWeiche(request, env) || handle(request, env) };
