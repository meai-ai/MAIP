/**
 * Real-World Data Interfaces.
 *
 * Adapter interfaces and basic implementations for external data ingestion.
 * These feed the AI's autonomous exploration capability — the agent can
 * browse the web, follow RSS feeds, and aggregate news to bring discoveries
 * back to its guardian.
 */

/** A discovered piece of external content. */
export interface ExternalContent {
  /** Source URL or identifier. */
  source: string;
  /** Title of the content. */
  title: string;
  /** Summary or full text. */
  text: string;
  /** Relevance score (0-1) based on agent's interests. */
  relevance: number;
  /** Topics/tags. */
  topics: string[];
  /** ISO 8601 publication date. */
  publishedAt: string;
  /** ISO 8601 fetch date. */
  fetchedAt: string;
}

/** Base interface for all data adapters. */
export interface DataAdapter {
  /** Unique adapter name. */
  readonly name: string;
  /** Whether this adapter is currently configured and available. */
  isAvailable(): boolean;
  /** Fetch content relevant to the given interests. */
  fetch(interests: string[], limit?: number): Promise<ExternalContent[]>;
}

/**
 * RSS/Atom feed adapter.
 * Fetches and parses RSS/Atom feeds for content relevant to interests.
 */
export class RSSAdapter implements DataAdapter {
  readonly name = "rss";
  private feedUrls: string[];

  constructor(feedUrls: string[]) {
    this.feedUrls = feedUrls;
  }

  isAvailable(): boolean {
    return this.feedUrls.length > 0;
  }

  async fetch(interests: string[], limit = 10): Promise<ExternalContent[]> {
    const results: ExternalContent[] = [];
    const interestLower = interests.map((i) => i.toLowerCase());

    for (const url of this.feedUrls) {
      try {
        const res = await globalThis.fetch(url);
        const text = await res.text();
        // Simple XML extraction (works for basic RSS/Atom)
        const items = extractRSSItems(text);

        for (const item of items) {
          const titleLower = item.title.toLowerCase();
          const descLower = item.description.toLowerCase();
          const matchingInterests = interestLower.filter(
            (i) => titleLower.includes(i) || descLower.includes(i)
          );

          if (matchingInterests.length > 0) {
            results.push({
              source: item.link || url,
              title: item.title,
              text: item.description,
              relevance: Math.min(1, matchingInterests.length / interests.length),
              topics: matchingInterests,
              publishedAt: item.pubDate || new Date().toISOString(),
              fetchedAt: new Date().toISOString(),
            });
          }
        }
      } catch {
        // Skip failed feeds
      }
    }

    return results
      .sort((a, b) => b.relevance - a.relevance)
      .slice(0, limit);
  }
}

/** Extract items from RSS/Atom XML (simple regex parser). */
function extractRSSItems(xml: string): Array<{ title: string; description: string; link: string; pubDate: string }> {
  const items: Array<{ title: string; description: string; link: string; pubDate: string }> = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>|<entry>([\s\S]*?)<\/entry>/g;
  let match;

  while ((match = itemRegex.exec(xml)) !== null) {
    const content = match[1] || match[2];
    const title = content.match(/<title[^>]*>([\s\S]*?)<\/title>/)?.[1]?.replace(/<!\[CDATA\[|\]\]>/g, "").trim() ?? "";
    const description = content.match(/<description[^>]*>([\s\S]*?)<\/description>|<summary[^>]*>([\s\S]*?)<\/summary>/)?.[1]?.replace(/<!\[CDATA\[|\]\]>/g, "").replace(/<[^>]+>/g, "").trim() ?? "";
    const link = content.match(/<link[^>]*>([\s\S]*?)<\/link>|<link[^>]*href="([^"]*)"/)?.slice(1).find(Boolean) ?? "";
    const pubDate = content.match(/<pubDate>([\s\S]*?)<\/pubDate>|<published>([\s\S]*?)<\/published>/)?.slice(1).find(Boolean) ?? "";

    if (title) items.push({ title, description, link, pubDate });
  }
  return items;
}

/**
 * Web search adapter.
 * Uses a configurable search API to find content matching interests.
 */
export class WebSearchAdapter implements DataAdapter {
  readonly name = "web_search";
  private apiUrl: string;
  private apiKey: string;

  constructor(apiUrl: string, apiKey: string) {
    this.apiUrl = apiUrl;
    this.apiKey = apiKey;
  }

  isAvailable(): boolean {
    return !!this.apiUrl && !!this.apiKey;
  }

  async fetch(interests: string[], limit = 5): Promise<ExternalContent[]> {
    const results: ExternalContent[] = [];
    const query = interests.slice(0, 3).join(" ");

    try {
      const res = await globalThis.fetch(
        `${this.apiUrl}?q=${encodeURIComponent(query)}&limit=${limit}`,
        { headers: { Authorization: `Bearer ${this.apiKey}` } }
      );
      const data = await res.json() as { results?: Array<{ title: string; snippet: string; url: string; date?: string }> };

      for (const item of data.results ?? []) {
        results.push({
          source: item.url,
          title: item.title,
          text: item.snippet,
          relevance: 0.7,
          topics: interests,
          publishedAt: item.date ?? new Date().toISOString(),
          fetchedAt: new Date().toISOString(),
        });
      }
    } catch {
      // Search failed
    }

    return results;
  }
}

/**
 * DataAggregator — combines multiple data adapters and manages
 * the autonomous exploration pipeline.
 */
export class DataAggregator {
  private adapters: DataAdapter[] = [];

  /** Register a data adapter. */
  addAdapter(adapter: DataAdapter): void {
    this.adapters.push(adapter);
  }

  /** Fetch content from all available adapters. */
  async explore(interests: string[], limit = 20): Promise<ExternalContent[]> {
    const allResults: ExternalContent[] = [];

    const promises = this.adapters
      .filter((a) => a.isAvailable())
      .map((a) => a.fetch(interests, limit));

    const results = await Promise.allSettled(promises);
    for (const result of results) {
      if (result.status === "fulfilled") {
        allResults.push(...result.value);
      }
    }

    // Deduplicate by source URL
    const seen = new Set<string>();
    const unique = allResults.filter((r) => {
      if (seen.has(r.source)) return false;
      seen.add(r.source);
      return true;
    });

    return unique
      .sort((a, b) => b.relevance - a.relevance)
      .slice(0, limit);
  }
}
