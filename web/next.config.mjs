/** @type {import('next').NextConfig} */
const nextConfig = {
  typedRoutes: false,
  // Next.js will buffer proxied request bodies in memory.
  // Default is 10MB; raise it to support knowledge uploads (Nginx/API are already set to 50MB).
  experimental: {
    proxyClientMaxBodySize: '50mb',
  },
  // swcMinify is now enabled by default in Next.js 14+, no need to set it
  async rewrites() {
    const apiTarget = process.env.API_PROXY_TARGET || 'http://127.0.0.1:8000';
    // Using fallback array ensures Next.js API routes are checked first
    return {
      beforeFiles: [
        // Auth email endpoints - must be before NextAuth catches them
        {
          source: '/api/auth/verify-email',
          destination: `${apiTarget}/api/auth/verify-email`,
        },
        {
          source: '/api/auth/resend-verification',
          destination: `${apiTarget}/api/auth/resend-verification`,
        },
        {
          source: '/api/auth/forgot-password',
          destination: `${apiTarget}/api/auth/forgot-password`,
        },
        {
          source: '/api/auth/reset-password',
          destination: `${apiTarget}/api/auth/reset-password`,
        },
      ],
      afterFiles: [],
      fallback: [
        // These rewrites are only checked AFTER Next.js pages/api routes
        // So /api/tree/:id/qa will be handled by Next.js API route first
        {
          source: '/api/tree/:id/export/:format',
          destination: `${apiTarget}/api/tree/:id/export/:format`,
        },
        {
          source: '/api/tree/:id/share',
          destination: `${apiTarget}/api/tree/:id/share`,
        },
        {
          source: '/api/tree/:id/metrics',
          destination: `${apiTarget}/api/tree/:id/metrics`,
        },
        {
          source: '/api/tree/:id/nodes',
          destination: `${apiTarget}/api/tree/:id/nodes`,
        },
        {
          source: '/api/tree/:id/keyframes',
          destination: `${apiTarget}/api/tree/:id/keyframes`,
        },
        {
          source: '/api/tree/:id/keyframes/:nodeId',
          destination: `${apiTarget}/api/tree/:id/keyframes/:nodeId`,
        },
        // T93: Outcomes v2 endpoints
        {
          source: '/api/tree/:id/outcomes',
          destination: `${apiTarget}/api/tree/:id/outcomes`,
        },
        {
          source: '/api/tree/:id/outcomes/preview',
          destination: `${apiTarget}/api/tree/:id/outcomes/preview`,
        },
        {
          source: '/api/tree/:id/outcomes/:outcomeId',
          destination: `${apiTarget}/api/tree/:id/outcomes/:outcomeId`,
        },
        {
          source: '/api/tree/:id/outcomes/:outcomeId/regenerate',
          destination: `${apiTarget}/api/tree/:id/outcomes/:outcomeId/regenerate`,
        },
        // P0-2/P1-4: Trail endpoints
        {
          source: '/api/tree/:id/trail/latest',
          destination: `${apiTarget}/api/tree/:id/trail/latest`,
        },
        {
          source: '/api/tree/:id/trail/generate',
          destination: `${apiTarget}/api/tree/:id/trail/generate`,
        },
        {
          source: '/api/tree/:id/trail/versions',
          destination: `${apiTarget}/api/tree/:id/trail/versions`,
        },
        {
          source: '/api/tree/:id/trail/:versionId',
          destination: `${apiTarget}/api/tree/:id/trail/:versionId`,
        },
        // P1-1/P1-4: Path Snapshot endpoints
        {
          source: '/api/tree/:id/path-snapshots/latest',
          destination: `${apiTarget}/api/tree/:id/path-snapshots/latest`,
        },
        {
          source: '/api/tree/:id/path-snapshots',
          destination: `${apiTarget}/api/tree/:id/path-snapshots`,
        },
        {
          source: '/api/tree/:id/path-snapshots/:snapshotId',
          destination: `${apiTarget}/api/tree/:id/path-snapshots/:snapshotId`,
        },
        {
          source: '/api/tree/:id/path-snapshots/:snapshotId/replay',
          destination: `${apiTarget}/api/tree/:id/path-snapshots/:snapshotId/replay`,
        },
        // P1-2/P1-4: Branch Diff endpoints
        {
          source: '/api/tree/:id/branch-diff',
          destination: `${apiTarget}/api/tree/:id/branch-diff`,
        },
        {
          source: '/api/tree/:id/golden-path',
          destination: `${apiTarget}/api/tree/:id/golden-path`,
        },
        {
          source: '/api/tree/:id/narrative',
          destination: `${apiTarget}/api/tree/:id/narrative`,
        },
        {
          source: '/api/tree/:id',
          destination: `${apiTarget}/api/tree/:id`,
        },
        {
          source: '/api/branch/:path*',
          destination: `${apiTarget}/api/branch/:path*`,
        },
        {
          source: '/api/share/:path*',
          destination: `${apiTarget}/api/share/:path*`,
        },
        {
          source: '/api/trees/:path*',
          destination: `${apiTarget}/api/trees/:path*`,
        },
        {
          source: '/api/account/:path*',
          destination: `${apiTarget}/api/account/:path*`,
        },
        {
          source: '/api/billing/:path*',
          destination: `${apiTarget}/api/billing/:path*`,
        },
        // User endpoints (shares, overview, etc.).
        // Note: Next.js App Router API routes (e.g. /api/user/delete) take precedence.
        {
          source: '/api/user/:path*',
          destination: `${apiTarget}/api/user/:path*`,
        },
        {
          source: '/api/me/:path*',
          destination: `${apiTarget}/api/me/:path*`,
        },
        {
          source: '/api/node/:path*',
          destination: `${apiTarget}/api/node/:path*`,
        },
        // T57-2: Outcome draft endpoints (PATCH, GET single draft)
        {
          source: '/api/outcomes/:path*',
          destination: `${apiTarget}/api/outcomes/:path*`,
        },
        // T59-2: Ledger capture endpoints
        {
          source: '/api/ledger/:path*',
          destination: `${apiTarget}/api/ledger/:path*`,
        },
        {
          source: '/api/process/:path*',
          destination: `${apiTarget}/api/process/:path*`,
        },
        {
          source: '/api/readyz',
          destination: `${apiTarget}/readyz`,
        },
        {
          source: '/api/metrics',
          destination: `${apiTarget}/metrics`,
        },
        // T32-1: Admin platform providers API
        {
          source: '/api/admin/:path*',
          destination: `${apiTarget}/api/admin/:path*`,
        },
        // Mobile App auth endpoints (iOS / Android)
        {
          source: '/api/mobile/:path*',
          destination: `${apiTarget}/api/mobile/:path*`,
        },
        // KB: Knowledge endpoints (WeKnora via oMyTree adapter)
        {
          source: '/api/knowledge/:path*',
          destination: `${apiTarget}/api/knowledge/:path*`,
        },
        // P2: Workspaces (Team)
        {
          source: '/api/workspaces',
          destination: `${apiTarget}/api/workspaces`,
        },
        {
          source: '/api/workspaces/:path*',
          destination: `${apiTarget}/api/workspaces/:path*`,
        },
        // Landing media (public)
        {
          source: '/api/landing-media',
          destination: `${apiTarget}/api/landing-media`,
        },
        {
          source: '/api/landing-media/:path*',
          destination: `${apiTarget}/api/landing-media/:path*`,
        },
      ],
    };
  },
  // Serve apple-app-site-association with correct content type for Universal Links
  async headers() {
    return [
      {
        source: '/.well-known/apple-app-site-association',
        headers: [
          { key: 'Content-Type', value: 'application/json' },
        ],
      },
    ];
  },
};

export default nextConfig;
