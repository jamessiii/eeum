import type { Category } from "../../shared/types/models";

export function isCategoryGroup(category: Category) {
  return category.categoryType === "group";
}

export function isLeafCategory(category: Category) {
  return category.categoryType === "category";
}

export function getCategoryGroups(categories: Category[]) {
  return categories.filter((category) => isCategoryGroup(category) && !category.isHidden).sort((left, right) => left.sortOrder - right.sortOrder);
}

export function getLeafCategories(categories: Category[]) {
  return categories.filter((category) => isLeafCategory(category) && !category.isHidden).sort((left, right) => left.sortOrder - right.sortOrder);
}

export function getChildCategories(categories: Category[], groupId: string) {
  return categories
    .filter((category) => isLeafCategory(category) && !category.isHidden && category.parentCategoryId === groupId)
    .sort((left, right) => left.sortOrder - right.sortOrder);
}

export function getHiddenCategories(categories: Category[]) {
  return categories.filter((category) => category.isHidden).sort((left, right) => left.sortOrder - right.sortOrder);
}

export function getCategoryNameMap(categories: Category[]) {
  return new Map(categories.map((category) => [category.id, category.name]));
}

export function getCategoryLabel(category: Category, categoryMap: Map<string, Category>) {
  if (!category.parentCategoryId) return category.name;
  const parentName = categoryMap.get(category.parentCategoryId)?.name;
  return parentName ? `${parentName} > ${category.name}` : category.name;
}
