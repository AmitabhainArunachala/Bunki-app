/** Published replica capability, including its checked dependency marker.
 * Regenerate with node tools/reducer_pin.mjs --write when replay or its imports change.
 */
export const SYNC_COMPATIBILITY = Object.freeze({
  reducerSha256:'f564bd01906409b145419c33b5a4db688e94b163e2ca94e5ce36213909ce7430',
});
export function compatibilityHeaders(value=SYNC_COMPATIBILITY){
  if(!value||Object.keys(value).length!==1||typeof value.reducerSha256!=='string'||
      !/^[a-f0-9]{64}$/.test(value.reducerSha256))throw Error('invalid-compatibility');
  return {'X-NSRS-Reducer-SHA256':value.reducerSha256};
}
