export const TranslationService = {
    /**
     * Translates text using a hybrid strategy optimized for length.
     * Words (< 100 chars): Lingva -> Google (Proxy)
     * Sentences (> 100 chars): Google (Proxy) -> Lingva
     */
    async translate(text: string, targetLang: string, sourceLang: string = 'auto'): Promise<string> {
        if (!text.trim()) return '';

        // Normalize codes
        const sLang = sourceLang === 'original' || sourceLang === 'auto' ? 'auto' : sourceLang;
        const tLang = targetLang === 'original' ? 'en' : targetLang;

        // Prevent identical lang translation
        if (sLang === tLang && sLang !== 'auto') return text;

        const isShort = text.length < 100;

        // --- STRATEGY SET A: SINGLE WORD / SHORT PHRASE (Prioritize Lingva) ---
        if (isShort) {
            // 1. Lingva (Best for words, clean JSON, no CORS)
            try {
                const res = await fetch(`https://lingva.ml/api/v1/${sLang}/${tLang}/${encodeURIComponent(text)}`);
                if (res.ok) {
                    const data = await res.json();
                    if (data.translation) return data.translation;
                }
            } catch (e) { /* continue */ }
        }

        // --- STRATEGY SET B: GOOGLE PROXIES (Best for Sentences / Fallback for words) ---

        // 2. Google via corsproxy.io
        try {
            const googleUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sLang}&tl=${tLang}&dt=t&q=${encodeURIComponent(text)}`;
            const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(googleUrl)}`;

            const res = await fetch(proxyUrl);
            if (res.ok) {
                const data = await res.json();
                if (data && data[0]) {
                    return data[0].map((seg: any) => seg[0]).join('');
                }
            }
        } catch (e) { /* continue */ }

        // 3. Google via AllOrigins
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
        } catch (e) { /* continue */ }

        // 4. Lingva (Fallback for sentences if it wasn't tried yet)
        if (!isShort) {
            try {
                const res = await fetch(`https://lingva.ml/api/v1/${sLang}/${tLang}/${encodeURIComponent(text)}`);
                if (res.ok) {
                    const data = await res.json();
                    if (data.translation) return data.translation;
                }
            } catch (e) { /* continue */ }
        }

        // 5. MyMemory (Last Resort)
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
        } catch (e) { /* continue */ }

        // Fail
        return `[Hata] ${text}`;
    },

    /**
     * Translates full text by chunking.
     */
    async translateFullText(text: string, targetLang: string, sourceLang: string = 'auto'): Promise<string> {
        const CHUNK_SIZE = 1500;
        const sentences = text.match(/[^\.!\?]+[\.!\?]+|[^\.!\?]+$/g) || [text];
        const chunks: string[] = [];
        let currentChunk = '';

        for (const sent of sentences) {
            if ((currentChunk + sent).length > CHUNK_SIZE) {
                chunks.push(currentChunk);
                currentChunk = sent;
            } else {
                currentChunk += sent;
            }
        }
        if (currentChunk) chunks.push(currentChunk);

        const promises = chunks.map(chunk => this.translate(chunk, targetLang, sourceLang));
        const results = await Promise.all(promises);
        return results.join(' ');
    }
};
