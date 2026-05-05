import type { Request, Response, NextFunction } from 'express';

const STATS_WORKER_ORIGIN = 'https://h2m-gallery-stats.nubiz.workers.dev';

/**
 * Global Security Headers Middleware
 * Sets standard security headers for all responses.
 */
export const globalSecurityHeaders = (_req: Request, res: Response, next: NextFunction) => {
  // 보안 헤더 설정
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  // Referrer 정보 노출 최소화
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  // Cross-Origin Isolation (Defense in Depth)
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  // CSP: 스크립트 및 스타일 인라인 허용 (Svelte 호환), WebSocket 허용
  // STATS_WORKER_ORIGIN: discussion 댓글 API + giscus 커스텀 테마 CSS 로드용
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' https://giscus.app",
      `style-src 'self' 'unsafe-inline' https://giscus.app ${STATS_WORKER_ORIGIN}`,
      "img-src 'self' data: https://*.githubusercontent.com",
      `connect-src 'self' ws: wss: https://raw.githubusercontent.com https://giscus.app ${STATS_WORKER_ORIGIN}`,
      "frame-src 'self' https://giscus.app",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; ') + ';',
  );
  // 민감한 브라우저 기능 비활성화
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  next();
};

/**
 * API Security Middleware
 * Disables caching for API endpoints to prevent leakage of sensitive data.
 */
export const apiSecurityHeaders = (_req: Request, res: Response, next: NextFunction) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
};
