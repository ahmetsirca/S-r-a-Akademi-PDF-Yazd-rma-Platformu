
export const TranslationService = {
    /**
     * Translates text using a "Bulletproof" multi-proxy strategy.
     * browser -> proxy -> google_api (Bypasses CORS)
     */
    async translate(text: string, targetLang: string, sourceLang: string = 'auto'): Promise<string> {
        if (!text.trim()) return '';

        // Normalize codes (Google uses 'iw' for hebrew, etc. but standard en/tr/fr/de are fine)
        const sLang = sourceLang === 'original' || sourceLang === 'auto' ? 'auto' : sourceLang;
        const tLang = targetLang === 'original' ? 'en' : targetLang;

        if (sLang === tLang && sLang !== 'auto') return text;

        // STRATEGY 1: Google via corsproxy.io (High Reliability)
        // Uses the 'gtx' client which is generous with quotas, wrapped in a CORS proxy.
        try {
            const googleUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sLang}&tl=${tLang}&dt=t&q=${encodeURIComponent(text)}`;
            const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(googleUrl)}`;

            const res = await fetch(proxyUrl);
            if (res.ok) {
                const data = await res.json();
                // data[0] is the array of sentences [[translated, source], [translated, source]...]
                if (data && data[0]) {
                    return data[0].map((seg: any) => seg[0]).join('');
                }
            }
        } catch (e) {
            console.warn("Proxy 1 (corsproxy) failed", e);
        }

        // STRATEGY 2: Google via AllOrigins (Secondary Proxy)
        try {
            const googleUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sLang}&tl=${tLang}&dt=t&q=${encodeURIComponent(text)}`;
            const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(googleUrl)}`;

            const res = await fetch(proxyUrl);
            if (res.ok) {
                const data = await res.json();
                if (data && data[0]) {
                    return data[0].map((seg: any) => seg[0]).join('');
                }
            }
        } catch (e) {
            console.warn("Proxy 2 (allorigins) failed", e);
        }

        // STRATEGY 3: Lingva (Direct API, no CORS issues usually)
        try {
            const res = await fetch(`https://lingva.ml/api/v1/${sLang}/${tLang}/${encodeURIComponent(text)}`);
            if (res.ok) {
                const data = await res.json();
                if (data.translation) return data.translation;
            }
        } catch (e) {
            console.warn("Strategy 3 (Lingva) failed", e);
        }

        // STRATEGY 4: MyMemory (Legacy Fallback)
        try {
            const mmSLang = sLang === 'auto' ? 'Autodetect' : sLang;
            const pair = `${mmSLang}|${tLang}`;
            const res = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${pair}`);
            const data = await res.json();

            if (data.responseStatus === 200 && data.responseData.translatedText) {
                const result = data.responseData.translatedText;
                if (!result.includes("MYMEMORY WARNING") && !result.includes("quota")) {
                    return result;
                }
            }
        } catch (e) {
            console.warn("Strategy 4 (MyMemory) failed", e);
        }

        // If all fail
        console.error("All strategies failed for text:", text.substring(0, 20));
        return `[Çeviri Yapılamadı] ${text.substring(0, 20)}...`;
    },

    /**
     * Translates full text by chunking, preserving structure.
     */
    async translateFullText(text: string, targetLang: string, sourceLang: string = 'auto'): Promise<string> {
        // Google gtx via proxy handles ~2000 chars well.
        const CHUNK_SIZE = 1800; // Safe limit for URL length through proxy

        // Split better: Try to split by newlines first to preserve paragraph structure visually if possible,
        // but the output is usually just text. 
        // Let's stick to sentence splitting for context quality.

        const sentences = text.match(/[^\.!\?]+[\.!\?]+|[^\.!\?]+$/g) || [text];
        const chunks: string[] = [];
        let currentChunk = '';

        for (const sent of sentences) {
            // Prepare encoded length check approx
            if ((currentChunk + sent).length > CHUNK_SIZE) {
                chunks.push(currentChunk);
                currentChunk = sent;
            } else {
                currentChunk += sent;
            }
        }
        if (currentChunk) chunks.push(currentChunk);

        // Run sequentially to be kind to proxies and avoid race condition bans
        const results = [];
        for (const chunk of chunks) {
            const translated = await this.translate(chunk, targetLang, sourceLang);
            results.push(translated);
        }

        return results.join(' ');
    }
};
