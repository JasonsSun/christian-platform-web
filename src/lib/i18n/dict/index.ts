import type { Locale } from '../config';
import zh from './zh';
import en from './en';

const dicts = { zh, en } as const;

export function getDictionary(locale: Locale) {
  return dicts[locale] ?? dicts.zh;
}

export type { Dict } from './zh';
