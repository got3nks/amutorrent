/**
 * Resolve which connected instance a search for `searchType` targets: an instance
 * is a candidate when its clientMeta searchSources (shipped via
 * instances[id].capabilities) include the selected source value. Keeps the
 * current pick if it still serves the source, otherwise the first that does, and
 * null when none is connected — so a new searchable network resolves with no
 * per-network branch here.
 *
 * Shared by the search dispatcher (ActionsContext, which routes the search) and
 * the search-lock greying (SearchContext, which decides whether the box is
 * locked for that instance) so the two can't drift apart.
 *
 * @param {Object} instances - instances map (id → { connected, capabilities })
 * @param {string} searchType - selected source value (e.g. 'global', 'kad', 'rucio')
 * @param {string|null} [selectedInstanceId] - the currently selected instance, if any
 * @returns {string|null} the instance id to use, or null
 */
export function resolveServingInstanceId(instances, searchType, selectedInstanceId = null) {
  const serving = Object.entries(instances || {})
    .filter(([, i]) => i.connected && (i.capabilities?.searchSources || []).some(s => s.value === searchType))
    .map(([id]) => id);
  if (selectedInstanceId && serving.includes(selectedInstanceId)) return selectedInstanceId;
  return serving[0] || null;
}

export default resolveServingInstanceId;
