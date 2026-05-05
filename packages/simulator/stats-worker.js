/**
 * Gallery Snippet Stats Worker
 * Cloudflare Worker + D1 기반 갤러리 스니펫 다운로드 통계 수집
 *
 * API:
 * - GET /  : 모든 스니펫의 다운로드 수 조회 (인증 불필요)
 * - POST / : 다운로드 카운트 증가 (PUT_KEY 인증 필요)
 * - GET /discussion?term=  : discussion 조회 또는 생성 후 URL 반환 (인증 불필요)
 * - GET /discussion/token  : 익명 댓글용 단기 토큰 발급 (IP 기반 HMAC)
 * - POST /discussion/comment : 익명 댓글 작성 (토큰 인증 + IP rate limit)
 *
 * D1 테이블 생성:
 * CREATE TABLE IF NOT EXISTS snippet_stats (
 *     id TEXT PRIMARY KEY,
 *     downloads INTEGER DEFAULT 0,
 *     last_downloaded_at INTEGER
 * );
 *
 * CREATE TABLE IF NOT EXISTS comment_rate_limits (
 *     ip TEXT PRIMARY KEY,
 *     window_start INTEGER NOT NULL,
 *     count INTEGER DEFAULT 0
 * );
 *
 * 환경변수 (Cloudflare 대시보드에서 설정):
 * - PUT_KEY: 쓰기 API 인증 키 (LOG_COLLECTOR_API_KEY와 동일)
 * - GH_TOKEN: GitHub API 인증 토큰 (discussion read/write 권한 필요)
 * - GH_REPO: GitHub 리포지토리
 * - GH_REPO_ID: GitHub Repository Node ID
 * - GH_CATEGORY_ID: GitHub Discussion Category ID
 * - COMMENT_SECRET: 익명 댓글 토큰 서명용 비밀키
 * - STATS_DB: D1 데이터베이스 바인딩
 */

// CORS 헤더 설정
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-api-key',
};

// 댓글 rate limit 설정
const COMMENT_RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1시간
const COMMENT_RATE_LIMIT_MAX = 5; // 시간당 최대 5개

// 토큰 유효시간 (10분)
const TOKEN_VALIDITY_MS = 10 * 60 * 1000;

// 필드 길이 제한
const MAX_NAME_LENGTH = 50;
const MAX_MESSAGE_LENGTH = 2000;
const MAX_TERM_LENGTH = 500;

/**
 * GitHub GraphQL API 호출 헬퍼
 */
async function githubGraphQL(token, query, variables = {}) {
  const response = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      'User-Agent': 'homenet2mqtt-stats-worker/1.0',
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    throw new Error(`GitHub API error: ${response.status}`);
  }

  const data = await response.json();

  if (data.errors && data.errors.length > 0) {
    throw new Error(`GitHub GraphQL error: ${data.errors.map((e) => e.message).join(', ')}`);
  }

  return data.data;
}

/**
 * Discussion 제목 생성
 * Giscus mapping="specific" 모드는 term 값과 제목이 정확히 일치해야 함.
 * 따라서 term을 그대로 제목으로 사용한다.
 */
function buildDiscussionTitle(term) {
  return term;
}

/**
 * term으로 Discussion 검색
 * @returns { id, url } | null
 */
async function findDiscussion(token, repo, term) {
  const title = buildDiscussionTitle(term);
  const query = `
    query($searchQuery: String!) {
      search(query: $searchQuery, type: DISCUSSION, first: 5) {
        nodes {
          ... on Discussion {
            id
            title
            url
          }
        }
      }
    }
  `;

  const data = await githubGraphQL(token, query, {
    searchQuery: `repo:${repo} "${title}" in:title`,
  });

  const nodes = data?.search?.nodes ?? [];
  // 정확한 제목 매칭 우선
  const exact = nodes.find((n) => n?.title === title);
  if (exact) return { id: exact.id, url: exact.url };

  // 없으면 첫 번째 결과
  const first = nodes.find((n) => n?.id);
  if (first) return { id: first.id, url: first.url };

  return null;
}

/**
 * Discussion 생성
 * @returns { id, url }
 */
async function createDiscussion(token, repoId, categoryId, term) {
  const title = buildDiscussionTitle(term);
  const body = `이 페이지는 갤러리 스니펫 \`${term}\`에 대한 토론 공간입니다.\n\n질문, 사용 후기, 버그 제보 등 자유롭게 남겨주세요.`;

  const mutation = `
    mutation($input: CreateDiscussionInput!) {
      createDiscussion(input: $input) {
        discussion {
          id
          url
        }
      }
    }
  `;

  const data = await githubGraphQL(token, mutation, {
    input: { repositoryId: repoId, categoryId, title, body },
  });

  const discussion = data?.createDiscussion?.discussion;
  if (!discussion) throw new Error('Failed to create discussion');

  return { id: discussion.id, url: discussion.url };
}

/**
 * Discussion 조회 or 생성 후 { id, url, created } 반환
 */
async function findOrCreateDiscussion(env, term) {
  const existing = await findDiscussion(env.GH_TOKEN, env.GH_REPO, term);
  if (existing) return { ...existing, created: false };

  const created = await createDiscussion(env.GH_TOKEN, env.GH_REPO_ID, env.GH_CATEGORY_ID, term);
  return { ...created, created: true };
}

/**
 * 댓글 추가
 */
async function addDiscussionComment(token, discussionId, name, message) {
  const displayName = name?.trim() || '익명';
  const body = `> **${displayName}**\n\n${message.trim()}`;

  const mutation = `
    mutation($input: AddDiscussionCommentInput!) {
      addDiscussionComment(input: $input) {
        comment {
          id
          url
        }
      }
    }
  `;

  const data = await githubGraphQL(token, mutation, {
    input: { discussionId, body },
  });

  const comment = data?.addDiscussionComment?.comment;
  if (!comment) throw new Error('Failed to add comment');

  return { id: comment.id, url: comment.url };
}

/**
 * HMAC-SHA256 토큰 검증
 * 토큰은 로컬 서비스(homenet2mqtt)가 발급하며, 워커는 검증만 수행.
 * 토큰 형식: {ts}:{base64(hmac)}
 * 메시지: ts 만으로 서명 (IP 바인딩 없음 — 서비스가 origin 보증)
 */
async function verifyToken(secret, token) {
  if (!token || typeof token !== 'string') return false;

  const parts = token.split(':');
  if (parts.length < 2) return false;

  const [tsStr, sigB64] = [parts[0], parts.slice(1).join(':')];
  const ts = parseInt(tsStr, 10);
  if (isNaN(ts)) return false;

  // 현재 윈도우와 직전 윈도우 허용 (서비스-워커 간 시계 오차 대응)
  const currentTs = Math.floor(Date.now() / TOKEN_VALIDITY_MS);
  if (ts < currentTs - 1 || ts > currentTs) return false;

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify'],
  );

  try {
    const sigBytes = Uint8Array.from(atob(sigB64), (c) => c.charCodeAt(0));
    return await crypto.subtle.verify('HMAC', key, sigBytes, new TextEncoder().encode(String(ts)));
  } catch {
    return false;
  }
}

/**
 * IP rate limit 체크 및 카운트 증가 (D1)
 * @returns true if allowed, false if rate limited
 */
async function checkAndIncrementRateLimit(db, ip) {
  const now = Date.now();

  const row = await db
    .prepare('SELECT window_start, count FROM comment_rate_limits WHERE ip = ?')
    .bind(ip)
    .first();

  if (!row) {
    // 신규: 레코드 생성
    await db
      .prepare('INSERT INTO comment_rate_limits (ip, window_start, count) VALUES (?, ?, 1)')
      .bind(ip, now)
      .run();
    return true;
  }

  const windowExpired = now - row.window_start >= COMMENT_RATE_LIMIT_WINDOW_MS;

  if (windowExpired) {
    // 윈도우 리셋
    await db
      .prepare('UPDATE comment_rate_limits SET window_start = ?, count = 1 WHERE ip = ?')
      .bind(now, ip)
      .run();
    return true;
  }

  if (row.count >= COMMENT_RATE_LIMIT_MAX) {
    return false;
  }

  await db.prepare('UPDATE comment_rate_limits SET count = count + 1 WHERE ip = ?').bind(ip).run();
  return true;
}

export default {
  async fetch(request, env) {
    // Preflight (OPTIONS) 요청 처리
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);
    const pathname = url.pathname.replace(/\/+$/, '') || '/'; // 후행 슬래시 제거
    const requestKey = request.headers.get('x-api-key');
    const PUT_KEY = env.PUT_KEY;

    // 클라이언트 IP (Cloudflare Workers 환경)
    const clientIp =
      request.headers.get('CF-Connecting-IP') ||
      request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() ||
      'unknown';

    // Giscus 커스텀 테마 서빙 (Ingress용 입력폼 숨김 처리)
    if (pathname === '/giscus-theme.css') {
      const giscusDarkThemeUrl =
        'https://raw.githubusercontent.com/giscus/giscus/main/styles/themes/dark.css';
      const customCss = `
        @import url("${giscusDarkThemeUrl}");
        .gsc-comments > form { display: none !important; }
      `;
      return new Response(customCss, {
        headers: {
          'Content-Type': 'text/css; charset=UTF-8',
          'Cache-Control': 'public, max-age=3600',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }

    try {
      // ==========================================
      // [GET /discussion] Discussion 조회 or 생성
      // ==========================================
      if (request.method === 'GET' && pathname === '/discussion') {
        const term = url.searchParams.get('term');

        if (!term || typeof term !== 'string' || term.trim().length === 0) {
          return new Response('Bad Request: term is required', {
            status: 400,
            headers: corsHeaders,
          });
        }

        if (term.length > MAX_TERM_LENGTH) {
          return new Response('Bad Request: term too long', {
            status: 400,
            headers: corsHeaders,
          });
        }

        if (!env.GH_TOKEN || !env.GH_REPO || !env.GH_REPO_ID || !env.GH_CATEGORY_ID) {
          return new Response('Service Unavailable: GitHub env not configured', {
            status: 503,
            headers: corsHeaders,
          });
        }

        const result = await findOrCreateDiscussion(env, term.trim());

        return new Response(JSON.stringify({ url: result.url, created: result.created }), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      }

      // ==========================================
      // [POST /discussion/comment] 익명 댓글 작성
      // ==========================================
      if (request.method === 'POST' && pathname === '/discussion/comment') {
        if (!env.GH_TOKEN || !env.GH_REPO || !env.GH_REPO_ID || !env.GH_CATEGORY_ID) {
          return new Response('Service Unavailable: GitHub env not configured', {
            status: 503,
            headers: corsHeaders,
          });
        }

        if (!env.COMMENT_SECRET) {
          return new Response('Service Unavailable: COMMENT_SECRET not configured', {
            status: 503,
            headers: corsHeaders,
          });
        }

        const body = await request.json();
        const { term, name, message, token } = body;

        // 입력 검증
        if (!term || typeof term !== 'string' || term.trim().length === 0) {
          return new Response('Bad Request: term is required', {
            status: 400,
            headers: corsHeaders,
          });
        }
        if (term.length > MAX_TERM_LENGTH) {
          return new Response('Bad Request: term too long', {
            status: 400,
            headers: corsHeaders,
          });
        }
        if (!message || typeof message !== 'string' || message.trim().length === 0) {
          return new Response('Bad Request: message is required', {
            status: 400,
            headers: corsHeaders,
          });
        }
        if (message.length > MAX_MESSAGE_LENGTH) {
          return new Response(`Bad Request: message too long (max ${MAX_MESSAGE_LENGTH} chars)`, {
            status: 400,
            headers: corsHeaders,
          });
        }
        if (name && typeof name === 'string' && name.length > MAX_NAME_LENGTH) {
          return new Response(`Bad Request: name too long (max ${MAX_NAME_LENGTH} chars)`, {
            status: 400,
            headers: corsHeaders,
          });
        }

        // 토큰 검증 (로컬 서비스가 COMMENT_SECRET으로 서명한 토큰인지 확인)
        const tokenValid = await verifyToken(env.COMMENT_SECRET, token);
        if (!tokenValid) {
          return new Response('Unauthorized: Invalid or expired token', {
            status: 401,
            headers: corsHeaders,
          });
        }

        // IP rate limit 체크
        const allowed = await checkAndIncrementRateLimit(env.STATS_DB, clientIp);
        if (!allowed) {
          return new Response(
            `Too Many Requests: max ${COMMENT_RATE_LIMIT_MAX} comments per hour`,
            { status: 429, headers: corsHeaders },
          );
        }

        // Discussion 조회 or 생성
        const discussion = await findOrCreateDiscussion(env, term.trim());

        // 댓글 작성
        const comment = await addDiscussionComment(env.GH_TOKEN, discussion.id, name, message);

        return new Response(
          JSON.stringify({
            success: true,
            commentUrl: comment.url,
            discussionUrl: discussion.url,
          }),
          { headers: { 'Content-Type': 'application/json', ...corsHeaders } },
        );
      }

      // ==========================================
      // [GET /] 모든 스니펫 다운로드 수 조회 (인증 불필요)
      // ==========================================
      if (request.method === 'GET' && pathname === '/') {
        const { results } = await env.STATS_DB.prepare(
          'SELECT id, downloads FROM snippet_stats ORDER BY downloads DESC',
        ).all();

        // { "스니펫ID": 다운로드수 } 형태로 변환
        const stats = {};
        for (const row of results) {
          stats[row.id] = row.downloads;
        }

        return new Response(JSON.stringify({ stats }), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      }

      // ==========================================
      // [POST /] 다운로드 카운트 증가 (PUT_KEY 필요)
      // ==========================================
      if (request.method === 'POST' && pathname === '/') {
        if (requestKey !== PUT_KEY) {
          return new Response('Forbidden: Invalid API Key', {
            status: 403,
            headers: corsHeaders,
          });
        }

        const body = await request.json();
        const { snippetId } = body;

        if (!snippetId || typeof snippetId !== 'string') {
          return new Response('Bad Request: snippetId is required', {
            status: 400,
            headers: corsHeaders,
          });
        }

        const now = Date.now();

        // UPSERT: 존재하면 downloads +1, 없으면 새로 생성
        const { success } = await env.STATS_DB.prepare(
          `INSERT INTO snippet_stats (id, downloads, last_downloaded_at)
           VALUES (?, 1, ?)
           ON CONFLICT(id) DO UPDATE SET
             downloads = downloads + 1,
             last_downloaded_at = ?`,
        )
          .bind(snippetId, now, now)
          .run();

        if (!success) {
          return new Response('Database Error', { status: 500, headers: corsHeaders });
        }

        return new Response(JSON.stringify({ success: true, snippetId }), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      }

      return new Response('Method Not Allowed', { status: 405, headers: corsHeaders });
    } catch (e) {
      console.error(e);
      return new Response('Internal Server Error: ' + e.message, {
        status: 500,
        headers: corsHeaders,
      });
    }
  },
};
