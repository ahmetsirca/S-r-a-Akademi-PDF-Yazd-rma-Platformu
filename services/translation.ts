
export const TranslationService = {
    /**
     * Translates text using Google Translate (Unofficial gtx) as primary,
     * falling back to MyMemory if needed.
     */
    async translate(text: string, targetLang: string, sourceLang: string = 'auto'): Promise<string> {
        if (!text.trim()) return '';

        // 1. Try Google Translate (gtx)
        try {
            // Logic for Google: Chunks can be reasonably large (up to ~2000 chars usually works)
            // But URL length limits apply. 
            // Let's use a safe chunk size of 1000 chars.
            // Note: Google 'gtx' endpoint usually returns data[0] as array of segments.

            const gLang = targetLang === 'en' ? 'en' : targetLang; // Map codes if needed

            const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sourceLang}&tl=${gLang}&dt=t&q=${encodeURIComponent(text)}`;

            const res = await fetch(url);
            if (!res.ok) throw new Error('Google Translate Failed');

            const data = await res.json();
            // data[0] contains the translated segments
            // e.g. [[["Merhaba", "Hello", ...], ["Dunya", "World", ...]]]
            if (data && data[0]) {
                return data[0].map((seg: any) => seg[0]).join('');
            }
        } catch (e) {
            console.warn("Google Translate failed, trying MyMemory fallback...", e);
        }

        // 2. Fallback to MyMemory
        try {
            // MyMemory requires source|target pair
            const sLang = sourceLang === 'auto' ? 'Autodetect' : sourceLang;
            const pair = `${sLang}|${targetLang}`;

            const res = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${pair}`);
            const data = await res.json();

            if (data.responseStatus !== 200) {
                throw new Error(data.responseData.translatedText || "MyMemory Error");
            }

            // Check for quota warning in text (MyMemory sometimes returns 200 but sends warning text)
            if (data.responseData.translatedText.includes("MYMEMORY WARNING")) {
                throw new Error("MyMemory Quota Exceeded");
            }

            return data.responseData.translatedText;
        } catch (e) {
            console.error("All translation providers failed", e);
            return `[Çeviri Hatası] (${text.substring(0, 20)}...)`;
        }
    },

    /**
     * Translates a large text by splitting it into chunks to avoid URL length limits.
     */
    async translateFullText(text: string, targetLang: string, sourceLang: string = 'auto'): Promise<string> {
        // Split by sentences to respect grammar, but chunk them to reduce requests.
        // Google limit is effectively URL length (~2000 chars safely).
        const CHUNK_SIZE = 1500;

        // Split by punctuation
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

        // Process chunks sequentially to be polite, or parallel?
        // Parallel is faster for Google.
        const promises = chunks.map(chunk => this.translate(chunk, targetLang, sourceLang));
        const results = await Promise.all(promises);

        return results.join(' ');
    }
};
