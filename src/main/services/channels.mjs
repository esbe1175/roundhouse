export function normalizeChannel(item) {
  if (!item || typeof item !== "object") return null;
  const channel = item.channel || item;
  const live = channel.livestream ?? item.livestream ?? (item.channel ? item : null);
  const slug = channel.slug || channel.channel_slug;
  if (typeof slug !== "string" || !/^[a-zA-Z0-9_-]+$/.test(slug)) return null;
  const isLive = channel.is_live ?? live?.is_live ?? !!live;
  const thumbnail = live?.thumbnail ?? channel.thumbnail ?? channel.banner_picture;
  const startedAt = live?.created_at ?? live?.started_at ?? live?.start_time ?? null;
  return {
    id: channel.id,
    slug,
    name: channel.user?.username || channel.user_username || channel.username || slug,
    avatar: channel.user?.profile_pic || channel.profile_picture || null,
    live: isLive === true,
    title: live?.session_title || live?.title || channel.session_title || (isLive ? "" : "Offline"),
    category: live?.categories?.[0]?.name || live?.category?.name || channel.category_name || "",
    viewers:
      (channel.show_view_count ?? live?.show_view_count) === false
        ? null
        : (live?.viewer_count ?? live?.viewers ?? channel.viewer_count ?? null),
    thumbnail: typeof thumbnail === "string" ? thumbnail : thumbnail?.url || thumbnail?.src || null,
    startedAt: typeof startedAt === "string" && Number.isFinite(Date.parse(startedAt)) ? startedAt : null,
  };
}

const followsURL = "https://kick.com/api/v2/channels/followed-page";

export function followPage(body, currentURL) {
  const rows = Array.isArray(body)
    ? body
    : [body?.data, body?.data?.data, body?.data?.channels, body?.channels].find(Array.isArray);
  if (!rows) throw new Error("Kick returned an unfamiliar followed-channel response. Please retry after signing in.");
  let next = body?.next_page_url || body?.links?.next || body?.data?.next_page_url || null;
  const cursor = body?.nextCursor ?? body?.data?.nextCursor;
  if (!next && cursor !== undefined && cursor !== null) {
    if (!["number", "string"].includes(typeof cursor) || String(cursor).length === 0)
      throw new Error("Kick returned invalid followed-channel pagination.");
    const url = new URL(currentURL);
    url.searchParams.set("cursor", String(cursor));
    next = url.href;
  }
  const meta = body?.meta || body?.data?.meta || body;
  if (!next && meta.current_page < meta.last_page) {
    const url = new URL(currentURL);
    url.searchParams.set("page", String(meta.current_page + 1));
    next = url.href;
  }
  if (next) {
    const url = new URL(next, currentURL);
    if (
      url.origin !== "https://kick.com" ||
      url.pathname !== new URL(followsURL).pathname ||
      url.username ||
      url.password
    )
      throw new Error("Invalid followed-channel pagination URL.");
    next = url.href;
  }
  const channels = rows.map(normalizeChannel);
  if (channels.some((channel) => !channel))
    throw new Error(
      "Kick returned an unfamiliar followed-channel entry. Please retry; your follows have not been cleared.",
    );
  return { channels, next };
}

export async function collectFollows(request) {
  let url = followsURL;
  const seen = new Set(),
    channels = new Map();
  while (url) {
    if (seen.has(url) || seen.size >= 100) throw new Error("Kick returned inconsistent pagination. Please refresh.");
    seen.add(url);
    const page = followPage(await request(url), url);
    for (const channel of page.channels) channels.set(channel.slug, channel);
    url = page.next;
  }
  return [...channels.values()].sort(
    (a, b) => Number(b.live) - Number(a.live) || (b.viewers || 0) - (a.viewers || 0) || a.name.localeCompare(b.name),
  );
}

// The full Following list has avatars and banners but no stream titles or
// live thumbnails. Resolve metadata only for live follows, with bounded traffic.
export async function resolveFollowDetails(channels, request) {
  const result = [...channels];
  let index = 0;
  await Promise.all(
    Array.from({ length: Math.min(4, channels.length) }, async () => {
      while (index < channels.length) {
        const current = index++;
        const channel = channels[current];
        if (!channel.live) continue;
        const body = await request(`https://kick.com/api/v2/channels/${encodeURIComponent(channel.slug)}/info`);
        const detail = normalizeChannel(body?.data || body);
        if (!detail || detail.slug.toLowerCase() !== channel.slug.toLowerCase())
          throw new Error("Kick returned unfamiliar live-channel details. Please refresh.");
        result[current] = {
          ...channel,
          ...detail,
          avatar: detail.avatar || channel.avatar,
          thumbnail: detail.thumbnail || channel.thumbnail,
          viewers: channel.viewers === null ? null : (detail.viewers ?? channel.viewers),
        };
      }
    }),
  );
  return result.sort(
    (a, b) => Number(b.live) - Number(a.live) || (b.viewers || 0) - (a.viewers || 0) || a.name.localeCompare(b.name),
  );
}

export function parseQualities(manifest, baseURL) {
  const lines = manifest.split(/\r?\n/),
    results = [];
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].startsWith("#EXT-X-STREAM-INF:")) continue;
    const target = lines.slice(i + 1).find((l) => l.trim() && !l.startsWith("#"));
    if (!target) continue;
    const url = new URL(target.trim(), baseURL);
    if (url.protocol !== "https:") continue;
    const resolution = /RESOLUTION=(\d+)x(\d+)/.exec(lines[i]);
    const fps = /FRAME-RATE=([\d.]+)/.exec(lines[i]);
    const height = resolution ? Number(resolution[2]) : 0;
    results.push({
      id: String(results.length),
      label: height ? `${height}p${Number(fps?.[1]) > 50 ? "60" : ""}` : "Audio",
      height,
      url: url.href,
    });
  }
  return results.sort((a, b) => b.height - a.height);
}
