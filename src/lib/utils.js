import { clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs) {
  return twMerge(clsx(inputs))
}

export function createPageUrl(page) {
  if (page === 'Dashboard') return '/';
  return `/${page.toLowerCase()}`;
}