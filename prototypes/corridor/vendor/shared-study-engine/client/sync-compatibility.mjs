/** Published replica capability, including its checked dependency marker.
 * Regenerate with node tools/reducer_pin.mjs --write when replay or its imports change.
 */
export const SYNC_COMPATIBILITY = Object.freeze({
  reducerSha256:'a2739393b11ae01d3f4e39f0519d3a8c8cd05d965e8afdaa3d4433315b089ce4',
});
export function compatibilityHeaders(value=SYNC_COMPATIBILITY){
  if(!value||Object.keys(value).length!==1||typeof value.reducerSha256!=='string'||
      !/^[a-f0-9]{64}$/.test(value.reducerSha256))throw Error('invalid-compatibility');
  return {'X-NSRS-Reducer-SHA256':value.reducerSha256};
}
