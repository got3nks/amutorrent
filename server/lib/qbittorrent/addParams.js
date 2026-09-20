/**
 * Resolve aMule category for POST /api/v2/torrents/add.
 *
 * aMule picks the download directory from its category configuration.
 * Per-torrent savepath is not supported; we map savepath to a category path
 * when no explicit category/label is provided and log when values conflict.
 */

function normalizePath(path) {
  if (!path) return '';
  return String(path)
    .replace(/\\/g, '/')
    .replace(/\/+/g, '/')
    .replace(/\/+$/, '');
}

/**
 * @param {object} params
 * @param {string} [params.category]
 * @param {string} [params.label]
 * @param {string} [params.savepath]
 * @param {Array<{id:number,title:string,path:string}>} categories
 * @returns {{ categoryId: number, warnings: string[] }}
 */
function resolveCategoryForAdd({ category, label, savepath }, categories) {
  const warnings = [];
  const categoryName = category || label || '';
  const normalizedSavepath = normalizePath(savepath);

  if (categoryName) {
    const cat = categories.find(c => c.title === categoryName);
    if (!cat) {
      warnings.push(`Category "${categoryName}" not found, using default`);
      return { categoryId: 0, warnings };
    }

    if (normalizedSavepath && cat.path && normalizePath(cat.path) !== normalizedSavepath) {
      warnings.push(
        `savepath "${savepath}" ignored; category "${categoryName}" uses "${cat.path}"`
      );
    }

    return { categoryId: cat.id, warnings };
  }

  if (normalizedSavepath) {
    const catByPath = categories.find(c => normalizePath(c.path) === normalizedSavepath);
    if (catByPath) {
      return { categoryId: catByPath.id, warnings };
    }

    warnings.push(
      `savepath "${savepath}" has no matching aMule category; using default. ` +
      'Configure an aMule category with this path.'
    );
  }

  return { categoryId: 0, warnings };
}

module.exports = { normalizePath, resolveCategoryForAdd };
