import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function parseDate(dateStr: string | Date): Date {
  if (typeof dateStr === "string") {
    const [y, m, d] = dateStr.slice(0, 10).split("-").map(Number);
    return new Date(y, m - 1, d);
  }
  return dateStr;
}
