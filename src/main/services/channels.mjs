export function normalizeChannel(item) {
  const channel = item.channel || item;
  const live = channel.livestream ?? item.livestream ?? (item.channel ? item : null);
  const slug = channel.slug;
  if (!slug || !/^[a-zA-Z0-9_-]+$/.test(slug)) return null;
  return {
    id: channel.id,
    slug,
    name: channel.user?.username || channel.username || slug,
    avatar: channel.user?.profile_pic || channel.profile_picture || null,
    live: !!live && live.is_live !== false,
    title: live?.session_title || live?.title || "Offline",
    category: live?.categories?.[0]?.name || live?.category?.name || "",
    viewers: live?.viewer_count ?? live?.viewers ?? null,
    thumbnail:
      typeof live?.thumbnail === "string" ? live.thumbnail : live?.thumbnail?.url || live?.thumbnail?.src || null,
  };
}

export function followPage(body, currentURL) {
  const rows = Array.isArray(body)
    ? body
    : [body?.data, body?.data?.data, body?.data?.channels, body?.channels].find(Array.isArray);
  if (!rows) throw new Error("Kick returned an unfamiliar followed-channel response. Please retry after signing in.");
  let next = body?.next_page_url || body?.links?.next || body?.data?.next_page_url || null;
  const meta = body?.meta || body?.data?.meta || body;
  if (!next && meta.current_page < meta.last_page) {
    const url = new URL(currentURL);
    url.searchParams.set("page", String(meta.current_page + 1));
    next = url.href;
  }
  if (next) {
    const url = new URL(next, currentURL);
    if (url.origin !== "https://kick.com" || url.pathname !== "/api/v2/channels/followed")
      throw new Error("Invalid followed-channel pagination URL.");
    next = url.href;
  }
  return { channels: rows.map(normalizeChannel).filter(Boolean), next };
}

export async function collectFollows(request) {
  let url = "https://kick.com/api/v2/channels/followed?limit=100&page=1";
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
