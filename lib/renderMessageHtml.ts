function escapeAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function extractYouTubeId(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl);
    const host = url.hostname.replace(/^www\./, '').toLowerCase();

    if (host === 'youtu.be') {
      const id = url.pathname.split('/').filter(Boolean)[0];
      return id || null;
    }

    if (host === 'youtube.com' || host === 'm.youtube.com') {
      if (url.pathname === '/watch') return url.searchParams.get('v');
      const parts = url.pathname.split('/').filter(Boolean);
      if (parts[0] === 'shorts' || parts[0] === 'embed') return parts[1] || null;
    }
  } catch {
    return null;
  }

  return null;
}

/** True when the URL is a recognizable YouTube watch/short/embed link. */
export function isYouTubeUrl(url: string): boolean {
  const videoId = extractYouTubeId(url);
  return !!videoId && /^[a-zA-Z0-9_-]{6,}$/.test(videoId);
}

type RenderMessageHtmlOptions = {
  includeYouTubeLink?: boolean;
};

function renderYouTubeEmbed(url: string, options: Required<RenderMessageHtmlOptions>): string | null {
  const videoId = extractYouTubeId(url);
  if (!videoId || !/^[a-zA-Z0-9_-]{6,}$/.test(videoId)) return null;

  const youtubeLink = options.includeYouTubeLink
    ? `\n    <a href="${escapeAttribute(url)}" target="_blank" rel="noopener noreferrer">Open on YouTube</a>`
    : '';

  return `<div class="cs-youtube-embed">
    <iframe
      src="https://www.youtube.com/embed/${escapeAttribute(videoId)}"
      title="YouTube video player"
      loading="lazy"
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
      allowfullscreen
    ></iframe>${youtubeLink}
  </div>`;
}

function cleanTrailingUrlPunctuation(url: string): { cleanUrl: string; trailing: string } {
  const match = url.match(/[.,;:!?)>\]]+$/);
  if (!match) return { cleanUrl: url, trailing: '' };
  return {
    cleanUrl: url.slice(0, -match[0].length),
    trailing: match[0],
  };
}

export function renderMessageHtml(html: string, options: RenderMessageHtmlOptions = {}): string {
  if (!html) return '';

  const resolvedOptions: Required<RenderMessageHtmlOptions> = {
    includeYouTubeLink: options.includeYouTubeLink ?? false,
  };

  const withEmbeddedAnchors = html.replace(
    /<a\b([^>]*?)href=(["'])(.*?)\2([^>]*)>[\s\S]*?<\/a>/gi,
    (anchor, _before, _quote, href) => renderYouTubeEmbed(href, resolvedOptions) || anchor
  );

  const parts = withEmbeddedAnchors.split(/(<[^>]+>)/g);
  let inYouTubeEmbed = false;

  return parts
    .map((part) => {
      if (part.startsWith('<')) {
        if (/^<div\b[^>]*class=["'][^"']*\bcs-youtube-embed\b/i.test(part)) inYouTubeEmbed = true;
        if (/^<\/div>/i.test(part) && inYouTubeEmbed) inYouTubeEmbed = false;
        return part;
      }
      if (inYouTubeEmbed) return part;

      return part.replace(/https?:\/\/[^\s<>"']+/g, (url) => {
        const { cleanUrl, trailing } = cleanTrailingUrlPunctuation(url);
        const embed = renderYouTubeEmbed(cleanUrl, resolvedOptions);
        if (embed) return embed + trailing;
        const escapedUrl = escapeAttribute(cleanUrl);
        return `<a href="${escapedUrl}" target="_blank" rel="noopener noreferrer">${cleanUrl}</a>${trailing}`;
      });
    })
    .join('');
}
