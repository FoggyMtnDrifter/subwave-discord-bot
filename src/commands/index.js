// Command registry. Import each command module and expose them as a Map (name →
// module, for dispatch), a JSON array (for registration), and a modal-handler
// map keyed by modal customId (for form submissions).
import * as request from './request.js';
import * as tunein from './tunein.js';
import * as play from './play.js';
import * as stop from './stop.js';

const modules = [request, tunein, play, stop];

export const commands = new Map(modules.map((m) => [m.data.name, m]));

export const commandData = modules.map((m) => m.data.toJSON());

// customId → handler for modal (form) submissions.
export const modalHandlers = new Map([[request.MODAL_ID, request.handleModal]]);
