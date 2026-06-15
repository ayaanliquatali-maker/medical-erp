import { useGetReceiptSettings, getGetReceiptSettingsQueryKey } from "@workspace/api-client-react";
import { useCallback } from "react";

export function useCurrency() {
  const { data: settings } = useGetReceiptSettings({ query: { queryKey: getGetReceiptSettingsQueryKey() } });
  const symbol = settings?.currency ?? "₨";

  const fmt = useCallback(
    (value?: number | null, decimals = 2) => {
      const n = typeof value === "number" && !Number.isNaN(value) ? value : 0;
      return `${symbol}${n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
    },
    [symbol]
  );

  return { symbol, fmt };
}
