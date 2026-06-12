export type RecipeIngredient = {
  id: string;
  name: string;
  amount: number;
  unit: 'g';
};

export type RecipeTemplate = {
  flavour: string;
  shortLabel: string;
  ingredients: RecipeIngredient[];
};

export type IngredientCost = {
  purchasePrice: number;
  purchaseGrams: number;
};

export const MINI_TART_SELLING_PRICE = 2.5;

export const initialIngredientCosts: Record<string, IngredientCost> = {
  'matcha-powder': { purchasePrice: 60, purchaseGrams: 1000 },
  'red-bean': { purchasePrice: 18, purchaseGrams: 1000 },
  cream: { purchasePrice: 18, purchaseGrams: 1000 },
  butter: { purchasePrice: 38, purchaseGrams: 1000 },
  'chocolate-powder': { purchasePrice: 30, purchaseGrams: 1000 },
  milk: { purchasePrice: 12, purchaseGrams: 1000 },
  salt: { purchasePrice: 2, purchaseGrams: 1000 },
  honey: { purchasePrice: 20, purchaseGrams: 1000 },
  custard: { purchasePrice: 16, purchaseGrams: 1000 },
  'brown-sugar': { purchasePrice: 6, purchaseGrams: 1000 },
  'cream-cheese': { purchasePrice: 25, purchaseGrams: 1000 },
  'lime-juice': { purchasePrice: 10, purchaseGrams: 1000 },
  sugar: { purchasePrice: 4, purchaseGrams: 1000 },
  'biscoff-spread': { purchasePrice: 32, purchaseGrams: 1000 },
  'biscuit-crumb': { purchasePrice: 20, purchaseGrams: 1000 },
  'sesame-paste': { purchasePrice: 28, purchaseGrams: 1000 },
  'sesame-powder': { purchasePrice: 20, purchaseGrams: 500 }
};

export const recipeTemplates: RecipeTemplate[] = [
  {
    flavour: 'Matcha Red Bean',
    shortLabel: 'Matcha',
    ingredients: [
      { id: 'matcha-powder', name: 'Matcha powder', amount: 4, unit: 'g' },
      { id: 'red-bean', name: 'Red bean paste', amount: 18, unit: 'g' },
      { id: 'cream', name: 'Fresh cream', amount: 12, unit: 'g' },
      { id: 'butter', name: 'Butter', amount: 5, unit: 'g' }
    ]
  },
  {
    flavour: 'Chocolate Noir',
    shortLabel: 'Chocolate',
    ingredients: [
      { id: 'chocolate-powder', name: 'Chocolate powder', amount: 30, unit: 'g' },
      { id: 'milk', name: 'Milk', amount: 10, unit: 'g' },
      { id: 'butter', name: 'Butter', amount: 5, unit: 'g' },
      { id: 'salt', name: 'Salt', amount: 10, unit: 'g' }
    ]
  },
  {
    flavour: 'Honey Brûlée',
    shortLabel: 'Honey',
    ingredients: [
      { id: 'honey', name: 'Honey', amount: 12, unit: 'g' },
      { id: 'custard', name: 'Custard cream', amount: 22, unit: 'g' },
      { id: 'brown-sugar', name: 'Brown sugar', amount: 5, unit: 'g' },
      { id: 'butter', name: 'Butter', amount: 5, unit: 'g' }
    ]
  },
  {
    flavour: 'Lime Cheese',
    shortLabel: 'Lime',
    ingredients: [
      { id: 'cream-cheese', name: 'Cream cheese', amount: 24, unit: 'g' },
      { id: 'lime-juice', name: 'Lime juice', amount: 6, unit: 'g' },
      { id: 'sugar', name: 'Sugar', amount: 8, unit: 'g' },
      { id: 'butter', name: 'Butter', amount: 5, unit: 'g' }
    ]
  },
  {
    flavour: 'Biscoff',
    shortLabel: 'Biscoff',
    ingredients: [
      { id: 'biscoff-spread', name: 'Biscoff spread', amount: 20, unit: 'g' },
      { id: 'biscuit-crumb', name: 'Biscoff crumb', amount: 8, unit: 'g' },
      { id: 'cream', name: 'Fresh cream', amount: 12, unit: 'g' },
      { id: 'butter', name: 'Butter', amount: 5, unit: 'g' }
    ]
  },
  {
    flavour: 'Black Sesame',
    shortLabel: 'Sesame',
    ingredients: [
      { id: 'sesame-paste', name: 'Black sesame paste', amount: 18, unit: 'g' },
      { id: 'sesame-powder', name: 'Black sesame powder', amount: 6, unit: 'g' },
      { id: 'milk', name: 'Milk', amount: 10, unit: 'g' },
      { id: 'butter', name: 'Butter', amount: 5, unit: 'g' }
    ]
  }
];
