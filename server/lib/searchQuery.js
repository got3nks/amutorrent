/**
 * Query text normalisation shared by the search paths.
 *
 * Each transform here is sorted by one question: is it visible to the user?
 * Automated queries (Torznab, *arr) take all of them, because a near miss is a
 * missed download. A query the user typed takes only the invisible ones, so
 * the results always match the words on screen.
 */

/**
 * Put the query in NFC.
 *
 * ED2K servers fold precomposed diacritics symmetrically - an NFC "café"
 * finds files named "cafe" and the reverse - but they fold nothing at all when
 * the accent is a combining mark. The same word in NFD returned 0 results where
 * NFC returned the full set, measured on a stock Lugdunum 17.15. NFD reaches us
 * from macOS pastes and from *arr clients alike.
 *
 * Safe on a user-typed query: the glyphs on screen do not change.
 *
 * @param {string} query
 * @returns {string}
 */
function normaliseQueryForm(query) {
  if (!query) return query;
  return query.normalize('NFC');
}

/**
 * NFC, plus typographic apostrophes rewritten to ASCII.
 *
 * Server tokenizers treat `'` as a word separator but not U+2019, so
 * "l’immigration" stays one long token and matches nothing, while
 * "l'immigration" indexes the useful half.
 *
 * The rewrite changes characters the user can see, and it costs matches against
 * files genuinely named with U+2019, so it is for automated queries only.
 *
 * @param {string} query
 * @returns {string}
 */
function canonicaliseQuery(query) {
  if (!query) return query;
  return normaliseQueryForm(query.replace(/[’‘ʼ´`]/g, "'"));
}

// Never promoted to the Kad keyword: the node indexing one of these holds a
// large share of the network and answers with a bounded set, so the wanted
// file would likely not come back.
const KAD_KEY_STOP_WORDS = new Set([
  'the', 'and', 'for', 'with', 'from', 'this', 'that',
  'les', 'des', 'una', 'der', 'die', 'das'
]);

/** Does this word carry a diacritic? */
function hasDiacritic(word) {
  return word.normalize('NFKD').replace(/[̀-ͯ]/g, '') !== word.normalize('NFC');
}

/**
 * The longest run of a word carrying no diacritic, or null if under 3 chars.
 *
 * Kad matches terms as substrings of the filename (Entry.cpp), so a stem is
 * strictly broader than the word it replaces: any name containing "impôts"
 * also contains "imp", in NFC, NFD or mojibake alike. Three characters is the
 * floor aMule itself applies to keywords.
 *
 * @param {string} word
 * @returns {string|null}
 */
function diacriticFreeStem(word) {
  const bare = (c) => c.normalize('NFKD').replace(/[̀-ͯ]/g, '') === c;
  let best = '';
  let run = '';
  for (const ch of word.normalize('NFC')) {
    if (bare(ch)) {
      run += ch;
      if (run.length > best.length) best = run;
    } else {
      run = '';
    }
  }
  return best.length >= 3 ? best : null;
}

/**
 * Rewrite a query for Kad, which resolves it differently from an ED2K server.
 *
 * Kad hashes ONE keyword to choose the node that answers, then evaluates every
 * word of the query as a substring filter on that node. The two roles want
 * opposite treatment:
 *
 *   - The key must be a word a publisher actually indexed, so it is never
 *     stemmed. If it carries a diacritic it only reaches publishers who used
 *     our exact encoding, so a plain word is promoted ahead of it when a good
 *     one exists. Selectivity matters for the promoted word: Kad returns a
 *     bounded set per keyword, so a common short word would ask a huge node and
 *     could crowd the wanted file out. Longest wins, stop-words never do.
 *   - Every other word is a filter, where a stem widens the match to every
 *     encoding.
 *
 * The key is the first word of at least 3 UTF-8 bytes, not simply the first
 * word: CSearchManager::GetWords skips shorter ones when choosing it
 * (SearchList.cpp:613). Promoting past a short accented word would therefore
 * achieve nothing, because aMule was already going to skip it. A short word
 * still filters, wherever it sits - that path is parsed from the raw query with
 * no length rule at all (SearchList.cpp:1579) - but nothing here can help that.
 *
 * Only the promotion runs on a user-typed query. The words are AND-ed, so
 * reordering cannot change what matches, only which node is asked, whereas a
 * stem returns files the user did not ask for.
 *
 * ED2K needs none of this. Its server intersects tokens, so order is
 * meaningless, and prefixes match nothing there.
 *
 * @param {string} query - already canonicalised
 * @param {Object} [opts]
 * @param {boolean} [opts.stem=true] - Apply the widening step.
 * @param {Function} [opts.log] - Called once when the query changed.
 * @returns {string}
 */
function adaptQueryForKad(query, { stem = true, log } = {}) {
  if (!query) return query;

  // Only the leading plain-text part is ours to reorder; from the first
  // boolean operator onwards is the format OR-group.
  const opAt = query.search(/\s(?:AND|OR|NOT)\s|\s\(/);
  const head = opAt === -1 ? query : query.slice(0, opAt);
  const tail = opAt === -1 ? '' : query.slice(opAt);

  // A long anchor is quoted to stay under aMule's operator limit. The quotes
  // are grammar and never reach the wire, so reorder inside them and leave
  // them where they are. Any other shape carrying a quote is left alone.
  const quoted = head.match(/^"([^"]*)"$/);
  if (!quoted && head.includes('"')) return query;

  const words = (quoted ? quoted[1] : head).split(/\s+/).filter(Boolean);
  if (words.length === 0) return query;

  const isKeyable = (w) => Buffer.byteLength(w, 'utf8') >= 3;
  const keyAt = words.findIndex(isKeyable);

  // Step 1: promote a selective plain word when the key would be accented.
  if (keyAt !== -1 && hasDiacritic(words[keyAt])) {
    const candidates = words
      .map((w, i) => ({ w, i }))
      .filter(({ w, i }) => i !== keyAt
        && !hasDiacritic(w)
        && isKeyable(w)
        && !KAD_KEY_STOP_WORDS.has(w.toLowerCase()));
    if (candidates.length > 0) {
      const pick = candidates.reduce((a, b) => (b.w.length > a.w.length ? b : a));
      // Every word before keyAt is too short to be keyable, so the pick always
      // sits after it and removing it cannot shift keyAt.
      words.splice(pick.i, 1);
      words.splice(keyAt, 0, pick.w);
    }
  }

  // Step 2: stem words carrying diacritics, never the key itself.
  const newKeyAt = words.findIndex(isKeyable);
  const adapted = stem
    ? words.map((w, i) => (i === newKeyAt || !hasDiacritic(w) ? w : diacriticFreeStem(w) || w))
    : words;

  const body = adapted.join(' ');
  const out = (quoted ? `"${body}"` : body) + tail;
  if (out !== query) log?.(`Kad keyword lookup: "${query}" -> "${out}"`);
  return out;
}

module.exports = {
  normaliseQueryForm,
  canonicaliseQuery,
  hasDiacritic,
  diacriticFreeStem,
  adaptQueryForKad,
  KAD_KEY_STOP_WORDS
};
