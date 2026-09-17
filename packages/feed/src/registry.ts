import {
  deepFreeze,
  FEED_OPERATIONS,
  FeedError,
  validateFeedSource,
  type FeedEvidence,
  type FeedOperation,
  type FeedDecision,
  type FeedSource,
} from './model.ts';

const CHECKED = '2026-09-10T00:00:00+09:00';
const HOUR = 3_600_000;
const evidence = (url: string, note: string): FeedEvidence => ({ url, checkedAt: CHECKED, note });
interface Definition {
  id: string;
  publisherId?: string;
  name: string;
  publisher?: string;
  homepage: string;
  topics: string[];
  feedUrl?: string;
  redirects?: string[];
  guide: string;
  policy: string;
  basis: string;
  enabled: boolean;
  interval?: number;
  stale?: number;
  cadence?: string;
  notes?: string[];
}
function define(row: Definition): FeedSource {
  const basis = evidence(row.policy, row.basis);
  const rights = Object.fromEntries(
    FEED_OPERATIONS.map((operation) => [
      operation,
      {
        status: 'unknown',
        scope: 'personal-device',
        reason: 'This feed interface establishes no permission for this separate operation.',
        evidence: [basis],
      },
    ]),
  ) as Record<FeedOperation, FeedDecision>;
  if (row.enabled)
    for (const operation of ['personal-fetch', 'display-metadata'] as const) {
      rights[operation] = {
        status: 'allowed',
        scope: 'personal-device',
        reason: row.basis,
        evidence: [basis],
      };
    }
  // The network adapter keeps response metadata only in process memory. No
  // publisher metadata/body/audio is included in the reference-sync contract.
  rights['server-ingest'] = {
    status: 'denied',
    scope: 'personal-device',
    reason:
      'This adapter is solely a personal-device reader; no shared ingestion or republication basis is established.',
    evidence: [basis],
  };
  return validateFeedSource({
    id: row.id,
    publisherId: row.publisherId || row.id,
    name: row.name,
    publisher: row.publisher || row.name,
    homepage: row.homepage,
    language: 'ja',
    topics: row.topics,
    mode: row.enabled ? 'personal-feed' : 'publisher-window',
    feed: row.feedUrl
      ? {
          url: row.feedUrl,
          redirectUrls: row.redirects || [],
          interfaceEvidence: evidence(
            row.guide,
            'The publisher advertises this RSS/Atom endpoint. Availability and freshness are measured separately by the live probe.',
          ),
        }
      : null,
    cadence: {
      minIntervalMs: row.interval || HOUR,
      staleAfterMs: row.stale || 96 * HOUR,
      label: row.cadence || 'Daily publication; check at most hourly while requested.',
    },
    rights,
    notes: row.notes || [],
  });
}

const asahi: Definition = {
  id: 'asahi',
  name: '朝日新聞',
  homepage: 'https://www.asahi.com/',
  topics: ['news', 'society', 'politics', 'world', 'economy'],
  feedUrl: 'https://www.asahi.com/rss/asahi/newsheadlines.rdf',
  guide: 'https://www.asahi.com/information/service/rss.html',
  policy: 'https://www.asahi.com/information/service/rss.html',
  enabled: true,
  basis:
    'Official RSS-reader route, confined here to direct personal headline/link reading with publisher attribution. The guide excludes alteration and programmatic redistribution; no body, adaptation or shared-service grant follows.',
  notes: [
    'Headline metadata only in the verified general feed. Articles open at Asahi; subscription access remains with the publisher.',
  ],
};

export const SOURCE_REGISTRY: readonly FeedSource[] = deepFreeze([
  define({
    id: 'alma-ja',
    name: 'アルマ望遠鏡（国立天文台）',
    publisher: '国立天文台 アルマプロジェクト',
    homepage: 'https://alma-telescope.jp/',
    topics: ['science', 'astronomy', 'technology'],
    feedUrl: 'https://alma-telescope.jp/feed/index.xml',
    guide: 'https://alma-telescope.jp/policy/',
    policy: 'https://alma-telescope.jp/policy/',
    enabled: true,
    interval: 6 * HOUR,
    stale: 90 * 24 * HOUR,
    cadence: 'Research and project news; check at most every six hours.',
    basis:
      'This separate ALMA site advertises its official RSS and defaults its text to CC BY 4.0 unless specially directed. The registry admits metadata only; each selected news body additionally requires the current reviewed policy section and per-article exclusion checks.',
    notes: [
      'Observed 2026-09-10. No policy inheritance to www.nao.ac.jp, other subdomains, images, captions, logos or third-party works. Body grants remain per article; AI/audio operations remain unknown.',
    ],
  }),
  define(asahi),
  ...[
    ['science', '科学', 'science'],
    ['culture', '文化', 'culture'],
    ['food', '食', 'food'],
    ['travel', '旅', 'travel'],
  ].map(([channel, label, topic]) =>
    define({
      ...asahi,
      id: `asahi-${channel}`,
      publisherId: 'asahi',
      publisher: '朝日新聞',
      name: `朝日新聞・${label}`,
      topics: [topic!],
      feedUrl: `https://www.asahi.com/rss/asahi/${channel}.rdf`,
    }),
  ),
  define({
    id: 'mainichi',
    name: '毎日新聞',
    homepage: 'https://mainichi.jp/',
    topics: ['news', 'society', 'politics'],
    feedUrl: 'https://mainichi.jp/rss/etc/mainichi-flash.rss',
    guide: 'https://mainichi.jp/rss/',
    policy: 'https://mainichi.jp/rss/',
    enabled: true,
    basis:
      'Official RSS-reader route for personal noncommercial use. Commercial use is excluded by the guide; title/link discovery here does not grant article reuse.',
    notes: [
      'The valid RDF feed may be labelled text/html. XML structure is validated independently of MIME.',
    ],
  }),
  define({
    id: 'nhk',
    name: 'NHK ONE ニュース',
    homepage: 'https://news.web.nhk/',
    topics: ['news', 'society', 'world'],
    feedUrl: 'https://news.web.nhk/n-data/conf/na/rss/cat0.xml',
    redirects: ['https://www.nhk.or.jp/rss/news/cat0.xml'],
    guide: 'https://www.nhk.or.jp/toppage/rss/index.html',
    policy: 'https://www.nhk.or.jp/toppage/rss/index.html',
    enabled: true,
    basis:
      'The official RSS guide expressly allows use by individuals and excludes redistribution/re-provision through blogs or programs. This route fetches directly on the personal device and opens the publisher article.',
    notes: [
      'Current official endpoint replaces the older www.nhk.or.jp URL. No NHK Easy, full-body or audio entitlement is implied.',
    ],
  }),
  define({
    id: 'jst-science-portal',
    name: 'JST Science Portal',
    homepage: 'https://scienceportal.jst.go.jp/',
    topics: ['science', 'nature', 'society'],
    feedUrl: 'https://scienceportal.jst.go.jp/feed/rss.xml',
    guide: 'https://scienceportal.jst.go.jp/',
    policy: 'https://scienceportal.jst.go.jp/site_policy/',
    enabled: true,
    interval: 6 * HOUR,
    stale: 21 * 24 * HOUR,
    cadence: 'Research reporting; check at most every six hours.',
    basis:
      'Official direct RSS and source attribution for personal noncommercial discovery. The policy distinguishes third-party rights and approval for commercial use; no body or transformation permission is inferred.',
    notes: [
      'The current footer feed is used; the separate rsslatest.xml has shown older material and is not substituted silently.',
    ],
  }),
  define({
    id: 'hiragana-times',
    name: 'Hiragana Times',
    homepage: 'https://hiraganatimes.com/',
    topics: ['language', 'culture', 'life'],
    feedUrl: 'https://hiraganatimes.com/feed',
    guide: 'https://hiraganatimes.com/',
    policy: 'https://hiraganatimes.com/terms-of-use',
    enabled: false,
    interval: 24 * HOUR,
    stale: 62 * 24 * HOUR,
    cadence: 'Monthly magazine; an older issue is not a daily-feed outage.',
    basis:
      'The official site advertises RSS, but general terms restrict reproduction and redistribution. The precise in-app metadata route remains unreviewed; use publisher-hosted reading meanwhile.',
    notes: [
      'RSS can contain substantial encoded HTML. Payload presence does not establish aligned text, audio, AI, retention or sync permission.',
    ],
  }),
  define({
    id: 'yomiuri',
    name: '読売新聞',
    homepage: 'https://www.yomiuri.co.jp/',
    topics: ['news', 'society', 'culture'],
    guide: 'https://www.yomiuri.co.jp/',
    policy: 'https://www.yomiuri.co.jp/policy/copyright-conditions/',
    enabled: false,
    basis:
      'No current official general RSS/API was verified. Headline/body reuse is covered by publisher conditions and application routes.',
    notes: [
      'Publisher link only. The historical /tools/rss/ route returned 404 in the prior research.',
    ],
  }),
  define({
    id: 'newton',
    name: 'Newton',
    homepage: 'https://www.newtonpress.co.jp/',
    topics: ['science', 'space', 'nature'],
    guide: 'https://www.newtonpress.co.jp/',
    policy: 'https://www.newtonpress.co.jp/policy.html',
    enabled: false,
    interval: 24 * HOUR,
    stale: 62 * 24 * HOUR,
    cadence: 'Monthly magazine catalog.',
    basis:
      'No official feed or integration API was verified. Publisher site and legitimate digital editions remain available; a purchase is not an extraction or transformation grant.',
    notes: ['The former Newton International Edition iPad app is not a current delivery route.'],
  }),
  define({
    id: 'itmedia',
    name: 'ITmedia NEWS',
    homepage: 'https://www.itmedia.co.jp/news/',
    topics: ['technology', 'economy', 'science'],
    feedUrl: 'https://rss.itmedia.co.jp/rss/2.0/news_bursts.xml',
    guide: 'https://corp.itmedia.co.jp/media/rss_list/',
    policy: 'https://corp.itmedia.co.jp/media/rss_condition/',
    enabled: false,
    basis:
      'Official RSS conditions request contact for app embedding and prohibit alterations/removing feed material. A stripped in-app metadata presentation is not treated as established permission.',
    notes: [
      'Feed existence is verified separately; this catalog row is not counted as an active personal feed.',
    ],
  }),
  define({
    id: 'impress-watch',
    name: 'Impress Watch',
    homepage: 'https://www.watch.impress.co.jp/',
    topics: ['technology', 'economy', 'life'],
    feedUrl: 'https://www.watch.impress.co.jp/data/rss/1.0/ipw/feed.rdf',
    guide: 'https://www.watch.impress.co.jp/',
    policy: 'https://www.watch.impress.co.jp/',
    enabled: false,
    basis:
      'The official homepage advertises an RSS endpoint. Specific applicable usage conditions for this in-app route have not yet been established, so the source remains a publisher link.',
  }),
  define({
    id: 'jaxa',
    name: 'JAXA',
    homepage: 'https://www.jaxa.jp/',
    topics: ['space', 'science', 'technology'],
    feedUrl: 'https://www.jaxa.jp/rss/press_j.rdf',
    guide: 'https://www.jaxa.jp/press/about/index_j.html',
    policy: 'https://www.jaxa.jp/policy_j.html',
    enabled: true,
    interval: 6 * HOUR,
    stale: 45 * 24 * HOUR,
    cadence: 'Research/mission releases; check at most every six hours.',
    basis:
      'JAXA offers its press RSS to readers; its policy recognizes private use and requires attribution. This personal headline route supplies JAXA attribution and does not copy article bodies or third-party media.',
  }),
  define({
    id: 'riken',
    name: '理化学研究所',
    homepage: 'https://www.riken.jp/',
    topics: ['science', 'nature', 'technology'],
    feedUrl: 'https://www.riken.jp/feed/press_feed/',
    guide: 'https://www.riken.jp/pr/services/',
    policy: 'https://www.riken.jp/pr/services/',
    enabled: true,
    interval: 6 * HOUR,
    stale: 21 * 24 * HOUR,
    cadence: 'Research releases; check at most every six hours.',
    basis:
      'The official service page explicitly offers press-release RSS through reader software. Only attributed personal feed metadata is displayed; separate site terms reserve republication and modification.',
    notes: ['Additional copyright conditions: https://www.riken.jp/terms/'],
  }),
  define({
    id: 'nippon',
    name: 'nippon.com',
    homepage: 'https://www.nippon.com/ja/',
    topics: ['culture', 'travel', 'society', 'history'],
    feedUrl: 'https://www.nippon.com/ja/feed/',
    guide: 'https://www.nippon.com/ja/rss_list/',
    policy: 'https://www.nippon.com/ja/rss_list/',
    enabled: true,
    basis:
      'The official Japanese RSS page invites users to add the feed to their chosen newsreader application. This direct personal metadata route preserves publisher links; it establishes no separate body/AI/sync grant.',
  }),
  define({
    id: 'afpbb',
    name: 'AFPBB News・スポーツ',
    publisher: 'AFPBB News',
    homepage: 'https://www.afpbb.com/',
    topics: ['sports', 'world'],
    feedUrl: 'https://www.afpbb.com/list/sdata/rss/latest_news_category_sports.xml',
    guide: 'https://www.afpbb.com/list/info/rss',
    policy: 'https://www.afpbb.com/list/info/rss',
    enabled: true,
    basis:
      'The official RSS guide limits use to individuals/noncommercial purposes. This is personal-device discovery; corporate, service and republication permission is not inferred.',
    notes: [
      'The explicitly advertised HTTPS sports feed is used. The advertised general feed uses a different host and is not silently upgraded or proxied.',
    ],
  }),
  define({
    id: 'kitanippon',
    name: '北日本新聞・富山',
    publisher: '北日本新聞社',
    homepage: 'https://webun.jp/',
    topics: ['regional', 'news', 'society', 'culture'],
    feedUrl: 'https://webun.jp/list/feed/rss4kennai_news',
    guide: 'https://webun.jp/list/rss',
    policy: 'https://webun.jp/list/rss',
    enabled: true,
    basis:
      'The official RSS guide offers the Toyama news feed for individual private use and forbids reproduction, republication and public transmission. This direct personal headline/link view is not a shared feed service.',
    notes: ['富山の暮らし、地域社会、文化を伝える県内ニュース。記事本文は北日本新聞で読む。'],
  }),
  define({
    id: 'toonippo',
    name: '東奥日報',
    publisher: '東奥日報社',
    homepage: 'https://www.toonippo.co.jp/',
    topics: ['regional', 'news', 'culture', 'food'],
    feedUrl: 'https://www.toonippo.co.jp/list/feed/rss',
    guide: 'https://www.toonippo.co.jp/',
    policy: 'https://www.toonippo.co.jp/list/company/copyright',
    enabled: true,
    basis:
      'The homepage advertises RSS and the copyright page permits private use within its stated conditions. Only attributed personal headlines and original links are shown; republication and use beyond private reading need separate permission.',
    notes: ['青森の地域ニュース、祭り、食、スポーツ。会員限定記事も掲載元で案内される。'],
  }),
  define({
    id: 'kyoto-shimbun',
    name: '京都新聞',
    publisher: '京都新聞社',
    homepage: 'https://www.kyoto-np.co.jp/',
    topics: ['regional', 'news', 'culture', 'history', 'travel'],
    feedUrl: 'https://www.kyoto-np.co.jp/list/feed/rss',
    guide: 'https://www.kyoto-np.co.jp/',
    policy: 'https://www.kyoto-np.co.jp/list/corporate/copyright',
    enabled: true,
    basis:
      'The homepage advertises RSS and the policy expressly permits private use. This reader confines it to personal attributed title/link discovery; articles open separately at the publisher, without framing or republication.',
    notes: ['京都・滋賀の地域報道、伝統文化、歴史、暮らし。紙面や有料記事の利用権は別。'],
  }),
  define({
    id: 'ryukyu-shimpo',
    name: '琉球新報',
    publisher: '琉球新報社',
    homepage: 'https://ryukyushimpo.jp/',
    topics: ['regional', 'news', 'culture', 'history', 'nature'],
    guide: 'https://ryukyushimpo.jp/pages/entry-164983.html',
    policy: 'https://ryukyushimpo.jp/pages/entry-164983.html',
    enabled: false,
    basis:
      'The legacy RSS guide describes a reader route, but its advertised HTTP feed currently redirects through HTTPS to homepage HTML. No working current XML interface is established; the source stays a publisher link.',
    notes: [
      '沖縄の地域社会、文化、歴史、自然を伝える新聞。',
      'Observed 2026-09-10: http://ryukyushimpo.jp/feed.xml → https://ryukyushimpo.jp/feed.xml → https://ryukyushimpo.jp/feed → homepage. An HTML 200 is not a working feed.',
    ],
  }),
  define({
    id: 'chugoku-shimbun',
    name: '中国新聞',
    publisher: '中国新聞社',
    homepage: 'https://www.chugoku-np.co.jp/',
    topics: ['regional', 'news', 'society', 'history'],
    guide: 'https://www.chugoku-np.co.jp/',
    policy: 'https://www.chugoku-np.co.jp/articles/-/382684',
    enabled: false,
    basis:
      'An official current feed interface was not established in this review. Terms reserve copying, editing, translation and redistribution outside legitimate functions; this row opens the publisher site only.',
    notes: [
      '広島・中国地方の地域報道、平和と歴史、暮らし。',
      'The publisher announces revised terms effective 2026-10-01; re-review before any later interface promotion.',
    ],
  }),
  define({
    id: 'sanyo-shimbun',
    name: '山陽新聞',
    publisher: '山陽新聞社',
    homepage: 'https://www.sanyonews.jp/',
    topics: ['regional', 'news', 'culture', 'life'],
    feedUrl: 'https://www.sanyonews.jp/output/free.xml',
    guide: 'https://www.sanyonews.jp/sanyoid/rss/',
    policy: 'https://www.sanyonews.jp/sanyoid/rss/',
    enabled: true,
    basis:
      'The current official guide explicitly distributes titles and article links through RSS readers under the individual reader responsibility. This direct personal metadata route does not extend to copying bodies or text/data mining.',
    notes: [
      '岡山を中心とする地域ニュース、暮らし、文化。見出しには会員限定記事も含まれる。',
      'Separate site policy restricts copying, processing and AI learning: https://www.sanyonews.jp/pr/op/policy-site.html',
    ],
  }),
  define({
    id: 'shizuoka-shimbun',
    name: '静岡新聞 DIGITAL Web',
    publisher: '静岡新聞社',
    homepage: 'https://news.at-s.com/',
    topics: ['regional', 'news', 'nature', 'food', 'travel'],
    guide: 'https://news.at-s.com/',
    policy: 'https://news.at-s.com/information/rule.html',
    enabled: false,
    basis:
      'The current publisher site is verified, but no supported feed was established. Terms confine use to personal purposes and restrict extraction, alteration and AI analysis; only the publisher reading window is available.',
    notes: ['静岡の地域報道、自然、食、観光。旧アットエスのニュース入口は現行サイトへ移動。'],
  }),
  define({
    id: 'kahoku',
    name: '河北新報',
    publisher: '河北新報社',
    homepage: 'https://kahoku.news/',
    topics: ['regional', 'news', 'society', 'nature'],
    guide: 'https://kahoku.news/',
    policy: 'https://www.kahoku.co.jp/policy.html',
    enabled: false,
    basis:
      'The official publisher and copyright route are verified; a current personal feed interface is unresolved. Secondary use of articles and photographs has a separate application route, so this catalog provides publisher-hosted reading.',
    notes: ['宮城・東北の地域社会、復興、暮らしを伝える新聞。'],
  }),
  define({
    id: 'artscape',
    publisherId: 'dnp',
    name: 'artscape',
    publisher: 'DNPアートコミュニケーションズ',
    homepage: 'https://artscape.jp/',
    topics: ['art', 'culture', 'history', 'travel'],
    guide: 'https://artscape.jp/',
    policy: 'https://artscape.jp/term/',
    enabled: false,
    interval: 24 * HOUR,
    stale: 45 * 24 * HOUR,
    cadence: 'Art reviews and museum information; publisher-hosted catalog.',
    basis:
      'The official terms identify the DNP cultural publication and restrict unapproved reuse of images and other material. No current RSS/app metadata basis was established, so reviews and museum information open on the publisher site.',
    notes: ['美術館・博物館、展覧会、美術批評を読む。全国のアートと地域文化を探せる。'],
  }),
  define({
    id: 'cinra',
    name: 'CINRA',
    publisher: 'cinra',
    homepage: 'https://www.cinra.net/',
    topics: ['culture', 'art', 'music', 'society'],
    guide: 'https://www.cinra.net/',
    policy: 'https://www.cinra.net/terms-of-use/media',
    enabled: false,
    basis:
      'Terms permit attributed links opening a separate window and prohibit framing. No current official feed/in-app reuse basis was established; content remains at CINRA.',
    notes: ['音楽、映画、アート、社会をめぐるインタビューやコラム。'],
  }),
  define({
    id: 'hanako',
    publisherId: 'magazine-house',
    name: 'Hanako',
    publisher: 'マガジンハウス',
    homepage: 'https://hanako.tokyo/',
    topics: ['food', 'travel', 'culture', 'life'],
    feedUrl: 'https://hanako.tokyo/feed/',
    guide: 'https://hanako.tokyo/',
    policy: 'https://hanako.tokyo/',
    enabled: false,
    basis:
      'The official homepage advertises RSS, but a suitable in-app metadata usage basis was not established. The advertised interface is recorded for review, without enabling native retrieval or inferring article reuse.',
    notes: ['喫茶、街歩き、旅、食を扱う雑誌メディア。掲載元で読む。'],
  }),
  define({
    id: 'pen-online',
    publisherId: 'ce-media-house',
    name: 'Pen Online',
    publisher: 'CEメディアハウス',
    homepage: 'https://www.pen-online.jp/',
    topics: ['art', 'culture', 'history', 'travel'],
    guide: 'https://www.pen-online.jp/',
    policy: 'https://www.pen-online.jp/tos/',
    enabled: false,
    basis:
      'Current terms identify CE Media House and reserve uses beyond the stated private-use scope. No official current feed endpoint was established; this is an attributed publisher link.',
    notes: ['デザイン、アート、建築、文化、旅の特集。出版社名は現行の公式規約を使用。'],
  }),
  define({
    id: 'tabizine',
    name: 'TABIZINE',
    homepage: 'https://tabizine.jp/',
    topics: ['travel', 'food', 'culture', 'nature'],
    feedUrl: 'https://tabizine.jp/feed/',
    guide: 'https://tabizine.jp/',
    policy: 'https://tabizine.jp/about/',
    enabled: false,
    basis:
      'The homepage advertises a publication feed, but the applicable personal in-app metadata conditions remain unresolved. Use the publisher site; no comments feed, body ingestion or reuse permission is inferred.',
    notes: ['国内外の旅、地域の食、文化、自然を紹介する旅行メディア。'],
  }),
  define({
    id: 'dancyu',
    publisherId: 'president',
    name: 'dancyu',
    publisher: 'プレジデント社',
    homepage: 'https://dancyu.jp/',
    topics: ['food', 'culture', 'life'],
    guide: 'https://dancyu.jp/',
    policy: 'https://dancyu.jp/',
    enabled: false,
    basis:
      'The official food publication and linked publisher identity are verified. A current feed endpoint and app metadata permissions were not established; recipes and reporting remain on the publisher site.',
    notes: ['料理、食材、店、作り手をめぐる読みもの。レシピの複製や再配信は行わない。'],
  }),
  define({
    id: 'naoj',
    name: '国立天文台',
    publisher: '自然科学研究機構 国立天文台',
    homepage: 'https://www.nao.ac.jp/',
    topics: ['science', 'space', 'nature'],
    feedUrl: 'https://www.nao.ac.jp/atom.xml',
    guide: 'https://www.nao.ac.jp/',
    policy: 'https://www.nao.ac.jp/terms/copyright.html',
    enabled: true,
    interval: 6 * HOUR,
    stale: 45 * 24 * HOUR,
    cadence: 'Astronomy discoveries and observing information; check at most every six hours.',
    basis:
      'The homepage advertises Atom; the policy expressly permits credited personal use and defines broader uses for solely NAOJ-owned works. This adapter enables only attributed personal title/link reading, with separate third-party rights review for any future body adapter.',
    notes: ['天文ニュース、宇宙の研究、星空と観測の話題。画像や共同著作物の権利は個別に確認する。'],
  }),
  define({
    id: 'aist',
    name: '産業技術総合研究所',
    homepage: 'https://www.aist.go.jp/',
    topics: ['science', 'technology', 'environment', 'economy'],
    feedUrl: 'https://www.aist.go.jp/ctl/module/mid/27/tid/75/rss.php',
    guide: 'https://www.aist.go.jp/aist_j/progressive/aist_rss.html',
    policy: 'https://www.aist.go.jp/aist_j/progressive/aist_rss.html',
    enabled: true,
    interval: 6 * HOUR,
    stale: 30 * 24 * HOUR,
    cadence: 'Research and industrial science releases; check at most every six hours.',
    basis:
      'The official RSS guide explicitly instructs users to register the feed in reader software. This is that direct personal reader route; the guide conditions for building a new information service are not treated as a shared-service grant.',
    notes: [
      '産業、エネルギー、環境、材料、ものづくりの研究と社会への応用。',
      'Separate content terms: https://www.aist.go.jp/aist_j/progressive/progressive.html',
    ],
  }),
  define({
    id: 'ndl-reference',
    publisherId: 'ndl',
    name: '国立国会図書館・レファレンス協同データベース',
    publisher: '国立国会図書館',
    homepage: 'https://crd.ndl.go.jp/',
    topics: ['history', 'literature', 'culture', 'education'],
    feedUrl: 'https://crd.ndl.go.jp/jp/public/rss2/rss.xml',
    guide: 'https://www.ndl.go.jp/service/rssemag',
    policy: 'https://crd.ndl.go.jp/jp/help/library/help_08.html',
    enabled: true,
    interval: 6 * HOUR,
    stale: 30 * 24 * HOUR,
    cadence: 'Library research questions and reference cases; check at most every six hours.',
    basis:
      'NDL advertises this feed and the service guide permits noncommercial RSS use by readers. Only reference-case titles and links are displayed; contributing libraries and third parties can hold rights in underlying answers and materials.',
    notes: [
      '全国の図書館に寄せられた歴史、文学、暮らしの疑問と調査事例。一般ニュースの速報ではない。',
    ],
  }),
  define({
    id: 'boj',
    name: '日本銀行',
    homepage: 'https://www.boj.or.jp/',
    topics: ['economy', 'society', 'history'],
    feedUrl: 'https://www.boj.or.jp/rss/whatsnew.xml',
    guide: 'https://www.boj.or.jp/about/abouthp.htm',
    policy: 'https://www.boj.or.jp/about/abouthp.htm',
    enabled: true,
    interval: 6 * HOUR,
    stale: 14 * 24 * HOUR,
    cadence:
      'Economic reports and official updates on publication days; check at most every six hours.',
    basis:
      'The official RSS guide explicitly distributes update titles for reader software. Direct personal title/link reading uses that route; commercial reproduction, alteration and images have separate restrictions.',
    notes: [
      '景気、地域経済、金融、通貨に関する報告・解説・統計の更新。行政的なお知らせも含まれる。',
      'Content conditions: https://www.boj.or.jp/about/copyright.htm',
    ],
  }),
  define({
    id: 'jetro',
    name: 'JETRO',
    publisher: '日本貿易振興機構',
    homepage: 'https://www.jetro.go.jp/',
    topics: ['economy', 'world', 'technology'],
    feedUrl: 'https://www.jetro.go.jp/rss2/biznews.xml',
    guide: 'https://www.jetro.go.jp/',
    policy: 'https://www.jetro.go.jp/legal.html',
    enabled: false,
    interval: 6 * HOUR,
    stale: 14 * 24 * HOUR,
    cadence: 'International business reporting; publisher-hosted discovery pending usage review.',
    basis:
      'The homepage advertises business-news RSS, but the applicable terms reserve reproduction, display and modification without permission. A suitable personal in-app metadata basis remains unresolved; the publisher page is available.',
    notes: ['世界の経済、貿易、産業、ビジネス環境の日本語記事。'],
  }),
  define({
    id: 'ninjal',
    name: '国立国語研究所',
    publisher: '人間文化研究機構 国立国語研究所',
    homepage: 'https://www.ninjal.ac.jp/',
    topics: ['language', 'education', 'culture', 'history'],
    feedUrl: 'https://www.ninjal.ac.jp/feed/?lang=jp',
    guide: 'https://www.ninjal.ac.jp/',
    policy: 'https://www.ninjal.ac.jp/utility/policy/',
    enabled: false,
    interval: 24 * HOUR,
    stale: 45 * 24 * HOUR,
    cadence: 'Language research, resources and events; publisher-hosted catalog.',
    basis:
      'An official feed is advertised, but specific in-app metadata conditions were not established by the site policy. Individual research resources may have their own licenses; those are not inherited by the whole feed.',
    notes: ['日本語の語彙、方言、言語研究と公開資料。資料ごとのライセンスは個別に確認する。'],
  }),
  define({
    id: 'tadoku',
    name: 'にほんごたどく',
    publisher: 'NPO多言語多読',
    homepage: 'https://tadoku.org/japanese/free-books/',
    topics: ['language', 'literature', 'culture', 'life'],
    feedUrl: 'https://tadoku.org/japanese/feed/',
    guide: 'https://tadoku.org/japanese/',
    policy: 'https://tadoku.org/japanese/free-books/note/',
    enabled: false,
    interval: 24 * HOUR,
    stale: 90 * 24 * HOUR,
    cadence: 'Graded-reading library and occasional new titles; not a daily news feed.',
    basis:
      'The graded books have a specific CC BY-NC-ND 4.0 guide permitting credited links and defined unchanged reading uses. That does not establish a general site-feed grant or permission for translated, annotated, tested or AI-adapted republication; books open at the publisher.',
    notes: [
      'やさしい日本語から読めるレベル別の無料読みもの。ふりがなや朗読の有無を掲載元で選べる。',
    ],
  }),
  define({
    id: 'aozora',
    name: '青空文庫',
    homepage: 'https://www.aozora.gr.jp/',
    topics: ['literature', 'history', 'culture', 'language'],
    guide: 'https://www.aozora.gr.jp/',
    policy: 'https://www.aozora.gr.jp/guide/kijyunn.html',
    enabled: false,
    interval: 24 * HOUR,
    stale: 90 * 24 * HOUR,
    cadence: 'Literary collection and newly released works; no official feed established here.',
    basis:
      'The collection mixes public-domain and individually licensed works. A future full reader must check each author/translator and work notice; no whole-collection license or current official RSS is inferred. This row provides the library link only.',
    notes: ['小説、随筆、詩、古典などの日本語文学。作品ごとの権利表示と底本情報を確認できる。'],
  }),
  define({
    id: 'japan-foundation',
    name: '国際交流基金',
    homepage: 'https://www.jpf.go.jp/',
    topics: ['language', 'education', 'culture', 'world'],
    guide: 'https://www.jpf.go.jp/',
    policy: 'https://www.jpf.go.jp/j/policy/',
    enabled: false,
    interval: 24 * HOUR,
    stale: 45 * 24 * HOUR,
    cadence: 'Japanese-learning and cultural-exchange resources; publisher-hosted catalog.',
    basis:
      'Official language-learning and cultural resources are available, but a current article-feed interface was not established. Site policy reserves copying beyond private use; each learning resource can have separate conditions.',
    notes: ['日本語学習、文化交流、世界の日本研究を紹介する公式資料への入口。'],
  }),
  define({
    id: 'global-voices',
    name: 'Global Voices 日本語',
    publisher: 'Global Voices',
    homepage: 'https://jp.globalvoices.org/',
    topics: ['world', 'society', 'culture', 'food', 'environment'],
    feedUrl: 'https://jp.globalvoices.org/feed/',
    guide: 'https://jp.globalvoices.org/read-share/',
    policy: 'https://jp.globalvoices.org/read-share/',
    enabled: true,
    interval: 24 * HOUR,
    stale: 30 * 24 * HOUR,
    cadence: 'Volunteer Japanese translations on an irregular schedule; check at most daily.',
    basis:
      'The Japanese reading guide explicitly invites RSS readers to use this endpoint. This personal metadata adapter keeps publisher attribution and links; the separate Creative Commons publication route requires its own author, translator and third-party review before any full-reader integration.',
    notes: [
      '世界各地の市民メディアを日本語で読む。原文や翻訳者へのリンクは掲載元にあり、更新は不定期。',
    ],
  }),
]);

export function getFeedSource(id: string): FeedSource {
  const source = SOURCE_REGISTRY.find((row) => row.id === id);
  if (!source) throw new FeedError('unknown-source');
  return source;
}
export function sourceCoverage() {
  const active = SOURCE_REGISTRY.filter((row) => row.mode === 'personal-feed');
  const publisherWindows = SOURCE_REGISTRY.filter((row) => row.mode === 'publisher-window');
  return deepFreeze({
    // Keep the original API names for stored/UI consumers. A configured route
    // is not a successful or fresh live fetch; those belong to probe receipts.
    cataloguedSources: SOURCE_REGISTRY.length,
    cataloguedChannels: SOURCE_REGISTRY.length,
    independentPublishers: new Set(SOURCE_REGISTRY.map((row) => row.publisherId)).size,
    activePersonalFeeds: active.length,
    activePersonalPublishers: new Set(active.map((row) => row.publisherId)).size,
    publisherWindowChannels: publisherWindows.length,
    publisherWindowPublishers: new Set(publisherWindows.map((row) => row.publisherId)).size,
    topics: [...new Set(SOURCE_REGISTRY.flatMap((row) => row.topics))].sort(),
    fullReaderSources: 0,
  });
}
