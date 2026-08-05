// Command registry. Import each command module and expose them both as a Map
// (name → module, for dispatch) and as a JSON array (for registration).
import * as nowplaying from './nowplaying.js';
import * as request from './request.js';
import * as tunein from './tunein.js';
import * as play from './play.js';
import * as stop from './stop.js';

const modules = [nowplaying, request, tunein, play, stop];

export const commands = new Map(modules.map((m) => [m.data.name, m]));

export const commandData = modules.map((m) => m.data.toJSON());
