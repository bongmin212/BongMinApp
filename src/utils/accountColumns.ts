export type AccountColumn = {
  id?: string;
  title?: string;
  isVisible?: boolean;
  is_visible?: boolean;
  visible?: boolean;
  show?: boolean;
  showInOrder?: boolean;
  [key: string]: any;
};

const coerceVisibilityFlag = (value: any): boolean | undefined => {
  if (value === undefined) return undefined;
  if (value === null) return false;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === '') return undefined;
    return !['false', '0', 'off', 'no'].includes(normalized);
  }
  return Boolean(value);
};

export const isAccountColumnVisible = (column?: AccountColumn | null) => {
  if (!column) return false;
  const rawVisibility =
    Object.prototype.hasOwnProperty.call(column, 'isVisible') ? column.isVisible :
    Object.prototype.hasOwnProperty.call(column, 'is_visible') ? column.is_visible :
    Object.prototype.hasOwnProperty.call(column, 'visible') ? column.visible :
    Object.prototype.hasOwnProperty.call(column, 'showInOrder') ? column.showInOrder :
    Object.prototype.hasOwnProperty.call(column, 'show') ? column.show :
    undefined;

  const coerced = coerceVisibilityFlag(rawVisibility);
  if (coerced === undefined) {
    // Default to visible when the field was never explicitly configured
    return true;
  }
  return coerced;
};

export const filterVisibleAccountColumns = (columns?: AccountColumn[] | null) => {
  if (!Array.isArray(columns)) return [];
  return columns.filter(col => isAccountColumnVisible(col));
};

type PackageLike = {
  id?: string;
  accountColumns?: AccountColumn[];
  account_columns?: AccountColumn[];
};

const getPackageAccountColumns = (
  packageId: string | undefined,
  packages?: PackageLike[] | null,
  packageMap?: Map<string, PackageLike>
): AccountColumn[] | undefined => {
  if (!packageId) return undefined;
  if (packageMap && packageMap.has(packageId)) {
    const pkg = packageMap.get(packageId);
    if (pkg?.accountColumns?.length) return pkg.accountColumns;
    if ((pkg as any)?.account_columns?.length) return (pkg as any).account_columns;
  }
  if (Array.isArray(packages)) {
    const pkg = packages.find(p => p.id === packageId);
    if (pkg?.accountColumns?.length) return pkg.accountColumns;
    if ((pkg as any)?.account_columns?.length) return (pkg as any).account_columns;
  }
  return undefined;
};

export const resolveAccountColumns = ({
  orderPackageId,
  inventoryItem,
  packages,
  packageMap
}: {
  orderPackageId?: string;
  inventoryItem?: any;
  packages?: PackageLike[] | null;
  packageMap?: Map<string, PackageLike>;
} = {}): AccountColumn[] => {
  const byOrder = getPackageAccountColumns(orderPackageId, packages, packageMap);
  if (byOrder?.length) return byOrder;

  if (inventoryItem?.accountColumns?.length) {
    return inventoryItem.accountColumns;
  }
  if (inventoryItem?.account_columns?.length) {
    return inventoryItem.account_columns;
  }

  const invPackageId = inventoryItem?.packageId || inventoryItem?.package_id;
  const byInventoryPackage = getPackageAccountColumns(invPackageId, packages, packageMap);
  if (byInventoryPackage?.length) return byInventoryPackage;

  return [];
};

