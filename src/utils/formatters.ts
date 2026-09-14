export const safeToLocaleString = (
  val: any,
  locale: string = 'en-US',
  options?: Intl.NumberFormatOptions
): string => {
  const num = Number(val) || 0;
  if (!Number.isFinite(num)) return '0';
  return (Number(num) || 0).toLocaleString(locale, options);
};

export const formatCurrency = (val: any): string => {
  return safeToLocaleString(val, 'en-US', { style: 'currency', currency: 'USD' });
};

export const formatPercent = (val: any): string => {
  if (val === null || val === undefined) return '0.00%';
  const num = Number(val);
  if (isNaN(num)) return '0.00%';
  return `${num >= 0 ? '+' : ''}${num.toFixed(2)}%`;
};
