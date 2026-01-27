import type { ContentRepository } from "../repo/fileSystemApi";

export interface SearchResult {
    path: string;
    title: string;
    snippet: string;
    score: number;
}

export class RepoSearchIndex {
    private docs = new Map<string, string>();

    /**
     * Rebuilds the entire index from the repository.
     */
    async build(repo: ContentRepository, onProgress?: (done: number, total: number) => void) {
        this.docs.clear();

        // Fetch all files from the repo
        const files = await repo.listFiles();

        // Filter for indexable text content (Markdown, HTML, JSON, TXT)
        const indexable = files.filter(f =>
            f.kind === 'file' &&
            /\.(md|txt|html|json)$/i.test(f.path)
        );

        let processed = 0;
        const total = indexable.length;

        if (onProgress) onProgress(0, total);

        for (const file of indexable) {
            try {
                const content = await repo.loadFile(file.path);
                this.upsert(file.path, content);
            } catch (err) {
                console.warn(`[SearchIndex] Failed to load ${file.path}`, err);
            }

            processed++;
            if (onProgress) onProgress(processed, total);
        }
    }

    /**
     * Updates or inserts a single file into the index.
     */
    upsert(path: string, content: string) {
        this.docs.set(path, content);
    }

    /**
     * Removes a file from the index.
     */
    remove(path: string) {
        this.docs.delete(path);
    }

    /**
     * Performs a full-text search.
     */
    search(query: string, limit = 30): SearchResult[] {
        const q = query.toLowerCase().trim();
        if (!q) return [];

        const terms = q.split(/\s+/);
        const results: SearchResult[] = [];

        for (const [path, content] of this.docs) {
            const lowerContent = content.toLowerCase();
            const lowerPath = path.toLowerCase();

            let score = 0;
            let matchesAll = true;

            for (const term of terms) {
                let termScore = 0;

                // Weight: Title/Path matches are worth more than content matches
                if (lowerPath.includes(term)) termScore += 10;

                // Count occurrences in content
                const contentMatches = (lowerContent.match(new RegExp(this.escapeRegExp(term), 'g')) || []).length;
                if (contentMatches > 0) termScore += contentMatches;

                if (termScore === 0) {
                    matchesAll = false;
                    break;
                }
                score += termScore;
            }

            if (matchesAll) {
                results.push({
                    path,
                    title: this.extractTitle(path, content),
                    snippet: this.generateSnippet(content, terms),
                    score
                });
            }
        }

        // Sort by score descending
        return results.sort((a, b) => b.score - a.score).slice(0, limit);
    }

    private escapeRegExp(string: string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    private extractTitle(path: string, content: string): string {
        // Try to find Markdown H1
        const h1 = content.match(/^#\s+(.+)$/m);
        if (h1) return h1[1].trim();

        // Try to find Frontmatter title
        const fm = content.match(/^title:\s*(.+)$/m);
        if (fm) return fm[1].trim();

        // Fallback to filename
        return path.split('/').pop() || path;
    }

    private generateSnippet(content: string, terms: string[]): string {
        const lower = content.toLowerCase();
        // Find first occurrence of the first term for the snippet context
        const firstTerm = terms[0];
        const idx = lower.indexOf(firstTerm);

        if (idx === -1) return content.slice(0, 100);

        const start = Math.max(0, idx - 30);
        const end = Math.min(content.length, idx + 100);

        let text = content.slice(start, end).replace(/\s+/g, ' ');
        if (start > 0) text = '...' + text;
        if (end < content.length) text = text + '...';

        return text;
    }
}
