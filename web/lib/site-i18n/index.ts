export { mt } from './marketing';
export type { MarketingKey } from './marketing';
export {
  type SiteLocale,
  SITE_LOCALES,
  DEFAULT_LOCALE,
  LOCALE_COOKIE,
  isValidLocale,
  siteLocaleToLang,
  langToSiteLocale,
  localePath,
  isMarketingPath,
  stripLocalePrefix,
  extractLocaleFromPath,
  detectLocaleFromAcceptLanguage,
  localeToDocLang,
} from './locale-utils';
