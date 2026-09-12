import { getBillCategories, getTransactions, markDirty } from '../store/engine.js';

/**
 * Repository for BillCategories table.
 * Rules: can add new, can rename, CANNOT delete.
 * Same Category+Subcategory combination cannot be duplicated.
 */

/**
 * Get all bill categories, optionally filtered by Type.
 * @param {string} [type] - Optional filter: 'Expense' or 'Income'
 * @returns {Array} Array of category objects
 */
export function getAll(type) {
  const categories = getBillCategories();
  if (type) {
    return categories.filter((c) => c.Type === type || c.type === type);
  }
  return [...categories];
}

/**
 * Get all categories grouped by Type and Category (for frontend dropdowns).
 */
export function getGrouped() {
  const categories = getBillCategories();
  const grouped = {};
  for (const cat of categories) {
    const type = cat.Type || cat.type;
    const category = cat.Category || cat.category;
    if (!grouped[type]) grouped[type] = {};
    if (!grouped[type][category]) grouped[type][category] = [];
    grouped[type][category].push({
      subcategory: cat.Subcategory || cat.subcategory,
      description: cat.Description || cat.description,
    });
  }
  return grouped;
}

/**
 * Add a new category.
 * @param {object} data - { Type, Category, Subcategory, Description }
 * @returns {object} The created category
 * @throws {Error} If validation fails or duplicate
 */
export function create(data) {
  const type = data.Type || data.type;
  const category = data.Category || data.category;
  const subcategory = data.Subcategory || data.subcategory;
  const description = data.Description || data.description || '';

  // Validate
  if (!type || !['Expense', 'Income'].includes(type)) {
    throw new Error('Type must be "Expense" or "Income"');
  }
  if (!category || !category.trim()) {
    throw new Error('Category is required');
  }
  if (!subcategory || !subcategory.trim()) {
    throw new Error('Subcategory is required');
  }

  // Check for duplicates
  const categories = getBillCategories();
  const duplicate = categories.find(
    (c) =>
      (c.Type === type || c.type === type) &&
      (c.Category === category || c.category === category) &&
      (c.Subcategory === subcategory || c.subcategory === subcategory),
  );
  if (duplicate) {
    throw new Error(`Category '${category}/${subcategory}' already exists for type '${type}'`);
  }

  const newCategory = {
    Type: type,
    Category: category,
    Subcategory: subcategory,
    Description: description,
  };

  categories.push(newCategory);
  markDirty();
  return newCategory;
}

/**
 * Rename or modify a category.
 * If renaming Category or Subcategory, all referencing Transactions are updated.
 *
 * @param {string} category - Current Category name
 * @param {string} subcategory - Current Subcategory name
 * @param {object} updates - { newCategory?, newSubcategory?, newDescription? }
 * @returns {object} Updated category
 * @throws {Error} If not found or validation fails
 */
export function update(category, subcategory, updates) {
  const categories = getBillCategories();
  const index = categories.findIndex(
    (c) =>
      (c.Category === category || c.category === category) &&
      (c.Subcategory === subcategory || c.subcategory === subcategory),
  );

  if (index === -1) {
    throw new Error(`Category '${category}/${subcategory}' not found`);
  }

  const newCategory = updates.newCategory || updates.NewCategory || updates.Category;
  const newSubcategory = updates.newSubcategory || updates.NewSubcategory || updates.Subcategory;
  const newDescription = updates.newDescription || updates.NewDescription || updates.Description;

  const oldCategory = categories[index].Category || categories[index].category;
  const oldSubcategory = categories[index].Subcategory || categories[index].subcategory;

  // Check for duplicate if renaming
  if (newCategory || newSubcategory) {
    const checkCategory = newCategory || oldCategory;
    const checkSub = newSubcategory || oldSubcategory;
    const isSame = checkCategory === oldCategory && checkSub === oldSubcategory;
    if (!isSame) {
      const duplicate = categories.find(
        (c, i) =>
          i !== index &&
          (c.Category === checkCategory || c.category === checkCategory) &&
          (c.Subcategory === checkSub || c.subcategory === checkSub),
      );
      if (duplicate) {
        throw new Error(`Category '${checkCategory}/${checkSub}' already exists`);
      }
    }
  }

  // Update the category record
  if (newCategory) {
    categories[index].Category = newCategory;
  }
  if (newSubcategory) {
    categories[index].Subcategory = newSubcategory;
  }
  if (newDescription !== undefined) {
    categories[index].Description = newDescription;
  }

  // Cascade rename to transactions
  if (newCategory || newSubcategory) {
    const effectiveNewCategory = newCategory || oldCategory;
    const effectiveNewSubcategory = newSubcategory || oldSubcategory;

    const transactions = getTransactions();
    for (const txn of transactions) {
      const txnCat = txn.Category || txn.category;
      const txnSub = txn.Subcategory || txn.subcategory;
      if (txnCat === oldCategory && txnSub === oldSubcategory) {
        txn.Category = effectiveNewCategory;
        txn.Subcategory = effectiveNewSubcategory;
      }
    }
  }

  markDirty();
  return categories[index];
}

/**
 * Find a category by Category and Subcategory.
 */
export function findByCategoryAndSubcategory(category, subcategory) {
  const categories = getBillCategories();
  return categories.find(
    (c) =>
      (c.Category === category || c.category === category) &&
      (c.Subcategory === subcategory || c.subcategory === subcategory),
  ) || null;
}

export default { getAll, getGrouped, create, update, findByCategoryAndSubcategory };
