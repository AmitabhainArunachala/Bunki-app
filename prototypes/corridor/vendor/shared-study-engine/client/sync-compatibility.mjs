/** Published replica capability, including its checked dependency marker.
 * Regenerate with node tools/reducer_pin.mjs --write when replay or its imports change.
 */
export const SYNC_COMPATIBILITY = Object.freeze({
  reducerSha256:'642ca6b6759de4cb137b3041670dab5457ad7d600603c58136bd923d14008686',
});
export function compatibilityHeaders(value=SYNC_COMPATIBILITY){
  if(!value||Object.keys(value).length!==1||typeof value.reducerSha256!=='string'||
      !/^[a-f0-9]{64}$/.test(value.reducerSha256))throw Error('invalid-compatibility');
  return {'X-NSRS-Reducer-SHA256':value.reducerSha256};
}
