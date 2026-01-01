
export const TranslationService = {
    /**
     * "Waterfall" Strategy: Try connection methods from fastest/direct to slowest/proxy.
     * Goals: 
     * 1. Speed (Direct Google/Lingva)
     * 2. Reliability (Multiple Proxies)
     * 3. Fallback (MyMemory)
     */
    async translate(text: string, targetLang: string, sourceLang: string = 'auto'): Promise<string> {
        if (!text.trim()) return '';

        const sLang = sourceLang === 'original' || sourceLang === 'auto' ? 'auto' : sourceLang;
        const tLang = targetLang === 'original' ? 'en' : targetLang;

        if (sLang === tLang && sLang !== 'auto') return text;

        // Helper for timeout-bounded fetch
        const fetchWithTimeout = async (url: string, timeout = 3000) => {
            const controller = new AbortController();
            const id = setTimeout(() => controller.abort(), timeout);
            try {
                const res = await fetch(url, { signal: controller.signal });
                clearTimeout(id);
                return res;
            } catch (e) {
                clearTimeout(id);
                throw e;
            }
        };

        // --- 1. LINGVA (Best for Privacy & Speed if up) ---
        // Great for single words or short sentences.
        try {
            const res = await fetchWithTimeout(`https://lingva.ml/api/v1/${sLang}/${tLang}/${encodeURIComponent(text)}`, 3000);
            if (res.ok) {
                const data = await res.json();
                if (data.translation) return data.translation;
            }
        } catch (e) { /* ignore */ }

        // --- 2. GOOGLE DIRECT (GTX) ---
        // Often blocked by CORS, but IF it works, it's the best. 
        try {
            const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sLang}&tl=${tLang}&dt=t&q=${encodeURIComponent(text)}`;
            const res = await fetchWithTimeout(url, 3000);
            if (res.ok) {
                const data = await res.json();
                if (Array.isArray(data?.[0])) {
                    return data[0].map((s: any) => Array.isArray(s) ? s[0] : '').join('');
                }
            }
        } catch (e) { /* ignore */ }

        // --- 3. GOOGLE via CORSPROXY.IO ---
        try {
            const gUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sLang}&tl=${tLang}&dt=t&q=${encodeURIComponent(text)}`;
            const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(gUrl)}`;
            const res = await fetchWithTimeout(proxyUrl, 4000);
            if (res.ok) {
                const data = await res.json();
                if (Array.isArray(data?.[0])) {
                    return data[0].map((s: any) => Array.isArray(s) ? s[0] : '').join('');
                }
            }
        } catch (e) { /* ignore */ }

        // --- 4. GOOGLE via ALLORIGINS ---
        try {
            const gUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sLang}&tl=${tLang}&dt=t&q=${encodeURIComponent(text)}`;
            // Use 'get' instead of 'raw' for better reliability with JSON wrapping
            const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(gUrl)}`;
            const res = await fetchWithTimeout(proxyUrl, 5000);
            if (res.ok) {
                const wrapper = await res.json();
                if (wrapper.contents) {
                    try {
                        const data = JSON.parse(wrapper.contents);
                        if (Array.isArray(data?.[0])) {
                            return data[0].map((s: any) => Array.isArray(s) ? s[0] : '').join('');
                        }
                    } catch (parseErr) {
                        console.warn('AllOrigins parse error', parseErr);
                    }
                }
            }
        } catch (e) { /* ignore */ }

        // --- 5. MYMEMORY (Last Resort - Quota limited) ---
        try {
            const pair = `${sLang}|${tLang}`;
            const res = await fetchWithTimeout(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${pair}`, 5000);
            const data = await res.json();
            if (data.responseStatus === 200 && data.responseData.translatedText) {
                const result = data.responseData.translatedText;
                // More robust exclusion of MyMemory warnings
                if (!result.includes("MYMEMORY WARNING")
                    && !result.includes("quota")
                    && !result.includes("Translated by")) {
                    return result;
                }
            }
        } catch (e) { /* ignore */ }

        // Return original text labeled as error if EVERYTHING fails
        console.error("Translation completely failed for:", text);
        return `[Hata: Çevrilemedi]`;
    },

    /**
     * Helper for Dictionary Lookups (Synonyms, etc)
     * Uses similar robust strategy chain.
     */
    async lookupDictionary(text: string, targetLang: string, sourceLang: string = 'auto'): Promise<{ text: string, type?: string }[]> {
        if (!text.trim()) return [];

        // We only support Dictionary lookup via Google API (proxy) currently.
        // If proxies fail, we fall back to simple translation.

        const results: { text: string, type?: string }[] = [];
        const sLang = sourceLang === 'original' || sourceLang === 'auto' ? 'auto' : sourceLang;
        const tLang = targetLang === 'original' ? 'en' : targetLang;

        // Strategy 1: Google Dictionary via CorsProxy
        try {
            const gUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sLang}&tl=${tLang}&dt=t&dt=bd&q=${encodeURIComponent(text)}`;
            const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(gUrl)}`;
            const res = await fetch(proxyUrl); // No strict timeout needed here, allow latency for rich data
            if (res.ok) {
                const data = await res.json();
                // Dictionary Data is in data[1]
                if (data && data[1] && Array.isArray(data[1])) {
                    data[1].forEach((group: any) => {
                        const type = group[0];
                        const terms = group[1];
                        if (Array.isArray(terms)) {
                            // Safe string check
                            terms.slice(0, 5).forEach((term: any) => {
                                if (typeof term === 'string') results.push({ text: term, type });
                            });
                        }
                    });
                }

                // If dict found, return immediately
                if (results.length > 0) return results; // Success

                // 2. Main Translation (data[0]) if no dict found
                if (Array.isArray(data?.[0])) {
                    const val = data[0].map((s: any) => Array.isArray(s) ? s[0] : '').join('');
                    if (val) results.push({ text: val, type: 'Çeviri' });
                }
            }
        } catch (e) { /* ignore */ }

        // Strategy 2: Simple Translate (Fallback)
        // If dictionary data failed, just get the simple translation
        const simple = await this.translate(text, targetLang, sourceLang);
        if (simple && !simple.startsWith('[Hata')) {
            results.push({ text: simple, type: 'Çeviri' });
        }

        return results;
    },

    /**
     * Chunking logic for long stories
     */
    async translateFullText(text: string, targetLang: string, sourceLang: string = 'auto'): Promise<string> {
        const CHUNK_SIZE = 1500;
        const sentences = text.match(/[^\.!\?]+[\.!\?]+|[^\.!\?]+$/g) || [text];
        const chunks: string[] = [];
        let currentChunk = '';

        for (const sent of sentences) {
            if ((currentChunk + sent).length > CHUNK_SIZE) {
                if (currentChunk) chunks.push(currentChunk); // Safer push logic
                currentChunk = sent;
            } else {
                currentChunk += sent;
            }
        }
        if (currentChunk) chunks.push(currentChunk);

        // Process sequentially to avoid triggering rate limits on proxies
        const results = [];
        for (const chunk of chunks) {
            if (chunk.trim()) {
                if (results.length > 0) await new Promise(r => setTimeout(r, 100));
                const t = await this.translate(chunk, targetLang, sourceLang);
                results.push(t);
            }
        }
        return results.join(' ');
    }
};
