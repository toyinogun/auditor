import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Joins class names and lets a later Tailwind class win over an earlier one (shadcn's helper). */
export const cn = (...inputs: ClassValue[]): string => twMerge(clsx(inputs));
