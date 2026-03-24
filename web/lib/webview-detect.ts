/**
 * WebView Detection Utility
 * 
 * Detects if the current browser is running inside a WebView (in-app browser)
 * which may have cookie/OAuth compatibility issues.
 * 
 * Known problematic WebViews:
 * - Baidu App (baiduboxapp)
 * - WeChat (MicroMessenger)
 * - QQ Browser (QQ)
 * - Weibo (Weibo)
 * - Alipay (AlipayClient)
 * - Taobao (TaobaoApp)
 * - Facebook (FBAN/FBAV)
 * - Instagram (Instagram)
 * - LINE (Line)
 * - Twitter (Twitter)
 */

export interface WebViewInfo {
  isWebView: boolean;
  appName: string | null;
  hasKnownOAuthIssues: boolean;
  recommendation: 'proceed' | 'warn' | 'block-oauth';
}

// WebViews known to have OAuth/cookie issues
const PROBLEMATIC_WEBVIEWS = [
  { pattern: /baiduboxapp/i, name: 'Baidu App', severity: 'high' },
  { pattern: /MicroMessenger/i, name: 'WeChat', severity: 'high' },
  { pattern: /\bQQ\b/i, name: 'QQ', severity: 'medium' },
  { pattern: /Weibo/i, name: 'Weibo', severity: 'medium' },
  { pattern: /AlipayClient/i, name: 'Alipay', severity: 'medium' },
  { pattern: /TaobaoApp/i, name: 'Taobao', severity: 'medium' },
] as const;

// Other WebViews (may work, but monitor)
const OTHER_WEBVIEWS = [
  { pattern: /FBAN|FBAV/i, name: 'Facebook' },
  { pattern: /Instagram/i, name: 'Instagram' },
  { pattern: /\bLine\b/i, name: 'LINE' },
  { pattern: /Twitter/i, name: 'Twitter' },
  { pattern: /Snapchat/i, name: 'Snapchat' },
  { pattern: /LinkedIn/i, name: 'LinkedIn' },
] as const;

/**
 * Detect if running in a WebView environment
 * @param userAgent - Optional user agent string (defaults to navigator.userAgent)
 */
export function detectWebView(userAgent?: string): WebViewInfo {
  // Server-side safety
  if (typeof window === 'undefined' && !userAgent) {
    return {
      isWebView: false,
      appName: null,
      hasKnownOAuthIssues: false,
      recommendation: 'proceed',
    };
  }

  const ua = userAgent || (typeof navigator !== 'undefined' ? navigator.userAgent : '');

  // Check for problematic WebViews first
  for (const webview of PROBLEMATIC_WEBVIEWS) {
    if (webview.pattern.test(ua)) {
      return {
        isWebView: true,
        appName: webview.name,
        hasKnownOAuthIssues: true,
        recommendation: webview.severity === 'high' ? 'warn' : 'proceed',
      };
    }
  }

  // Check for other WebViews
  for (const webview of OTHER_WEBVIEWS) {
    if (webview.pattern.test(ua)) {
      return {
        isWebView: true,
        appName: webview.name,
        hasKnownOAuthIssues: false,
        recommendation: 'proceed',
      };
    }
  }

  // Generic WebView detection
  // iOS UIWebView or WKWebView
  const isIOSWebView = /\(iPhone|iPod|iPad\).*AppleWebKit(?!.*Safari)/i.test(ua);
  // Android WebView
  const isAndroidWebView = /\bwv\b|; wv\)/i.test(ua) || 
    (/Android.*AppleWebKit/.test(ua) && !/Chrome/.test(ua));

  if (isIOSWebView || isAndroidWebView) {
    return {
      isWebView: true,
      appName: null,
      hasKnownOAuthIssues: false,
      recommendation: 'proceed',
    };
  }

  return {
    isWebView: false,
    appName: null,
    hasKnownOAuthIssues: false,
    recommendation: 'proceed',
  };
}

/**
 * Check if the current environment supports reliable OAuth
 * Some WebViews have cookie isolation issues that break OAuth flows
 */
export function canUseOAuth(userAgent?: string): boolean {
  const info = detectWebView(userAgent);
  return !info.hasKnownOAuthIssues;
}

/**
 * Get a user-friendly message for OAuth issues in WebViews
 */
export function getWebViewOAuthMessage(lang: 'en' | 'zh-CN' = 'en', appName?: string | null): string {
  const app = appName || 'this app';
  
  if (lang === 'zh-CN') {
    return `检测到您正在使用${appName || '内置浏览器'}。Google登录可能无法正常工作。建议使用系统浏览器（如Safari或Chrome）打开此网页，或使用邮箱密码登录。`;
  }
  
  return `You appear to be using ${app}'s built-in browser. Google login may not work properly. Please open this page in your system browser (Safari or Chrome) or use email/password login instead.`;
}

/**
 * Generate a URL to open in external browser
 * Attempts to trigger "Open in Browser" on various platforms
 */
export function getExternalBrowserUrl(url: string): string {
  // For most cases, the URL works as-is
  // Some apps have special schemes, but those are unreliable
  return url;
}
