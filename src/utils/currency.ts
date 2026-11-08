const INR_SIGN = '\u20B9';

export function formatINR(amount: number | undefined | null, options?: { decimals?: number }): string {
  if (amount === undefined || amount === null || !Number.isFinite(amount)) {
    return 'N/A';
  }
  const maxDecimals = options && options.decimals !== undefined ? options.decimals : 2;
  const rounded = maxDecimals > 0 ? Number(amount.toFixed(maxDecimals)) : Math.round(amount);
  const hasFraction = rounded % 1 !== 0;

  if (hasFraction) {
    return INR_SIGN + rounded.toLocaleString('en-IN', {
      minimumFractionDigits: maxDecimals,
      maximumFractionDigits: maxDecimals,
    });
  }
  return INR_SIGN + rounded.toLocaleString('en-IN');
}

export function formatINRPerHour(amount: number | undefined | null): string {
  if (amount === undefined || amount === null || !Number.isFinite(amount)) {
    return 'N/A';
  }
  return formatINR(amount) + '/hr';
}

export function formatINRPerDay(amount: number | undefined | null): string {
  if (amount === undefined || amount === null || !Number.isFinite(amount)) {
    return 'N/A';
  }
  return 'Max ' + formatINR(amount) + '/day';
}
