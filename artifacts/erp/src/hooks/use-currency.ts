import { useGetReceiptSettings, getGetReceiptSettingsQueryKey } from "@workspace/api-client-react";
import { useCallback } from "react";

export function useCurrency() {
  const { data: settings } = useGetReceiptSettings({ query: { queryKey: getGetReceiptSettingsQueryKey() } });
  const symbol = settings?.currency ?? "₨";

  const fmt = useCallback(
    (value: number, decimals = 2) =>
      `${symbol}${value.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`,
    [symbol]
  );

  return { symbol, fmt };
}
