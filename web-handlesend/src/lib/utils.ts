import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
/** Merge utility classes consistently across the shared UI primitives. */
export function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)); }
