/** Stub: the quest world as an instance of the one world model (G7). It opens on an entry id, reads the shared graph through
 *  openWorld, and saves through the single state layer. It imports nothing from the rescued m4-quest module: the contract is
 *  the only interface it compiles against. */
import { openWorld, createWorldState, saveProject, continueAt, startJourney } from '../world.mjs';

export const kind = 'quest';
export function open(graph, entry, id = `quest:${entry}`) { return openWorld(graph, { kind, entry, id }); }
export function state() { return createWorldState(); }
export function save(raw, world, { projectId, placed, at }) { return saveProject(raw, { worldId: world.id, projectId, placed, at }); }
export function pause(raw, world, { position, at }) { return continueAt(raw, { worldId: world.id, position, at }); }
export function journey(raw, world, { journeyId, at }) { return startJourney(raw, { worldId: world.id, journeyId, at }); }
