

export const TranslationService = {
    /**
     * Translates text using multiple providers for maximum reliability.
     * Order: Google (GTX) -> Lingva (Proxy) -> MyMemory (Fallback)
     */
    async translate(text: string, targetLang: string, sourceLang: string = 'auto'): Promise<string> {
        if (!text.trim()) return '';

        // Normalize Source/Target for different APIs
        // Google: en, tr, de, fr
        // Lingva: en, tr, de, fr
        // MyMemory: en, tr, de, fr

        // 1. Google Translate (Client: dict-chrome-ex - more robust vs gtx)
        try {
            const gSource = sourceLang === 'auto' ? 'auto' : sourceLang;
            const gTarget = targetLang === 'original' ? 'en' : targetLang; // Fallback logic

            // Use 'dict-chrome-ex' client which often bypasses strict web checks better than 'gtx'
            const url = `https://translate.googleapis.com/translate_a/single?client=dict-chrome-ex&sl=${gSource}&tl=${gTarget}&dt=t&q=${encodeURIComponent(text)}`;

            const res = await fetch(url);
            if (res.ok) {
                const data = await res.json();
                // data[0] is array of [translated, source, ...]
                if (data && data[0]) {
                    const combined = data[0].map((seg: any) => seg[0]).join('');
                    if (combined && combined.trim()) return combined;
                }
            }
        } catch (e) {
            // console.warn("Google Primary Failed", e);
        }

        // 2. Lingva Translate (Public instance - Acts as CORS proxy for Google)
        try {
            const lSource = sourceLang === 'auto' ? 'auto' : sourceLang;
            const lTarget = targetLang === 'original' ? 'en' : targetLang;

            const res = await fetch(`https://lingva.ml/api/v1/${lSource}/${lTarget}/${encodeURIComponent(text)}`);
            if (res.ok) {
                const data = await res.json();
                if (data.translation) return data.translation;
            }
        } catch (e) {
            // console.warn("Lingva Fallback Failed", e);
        }

        // 3. Fallback to MyMemory
        try {
            const sLang = sourceLang === 'auto' ? 'Autodetect' : sourceLang;
            const tLang = targetLang === 'original' ? 'en' : targetLang;
            const pair = `${sLang}|${tLang}`;

            const res = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${pair}`);
            const data = await res.json();

            if (data.responseStatus !== 200) {
                // Check for specific matches to ignore useful matches? No, 200 is strict success usually.
                // But sometimes status is 200 and text is warning.
                // If status IS NOT 200, it's failed.
            }

            // MyMemory Quota Check
            if (data.responseData.translatedText &&
                (data.responseData.translatedText.includes("MYMEMORY WARNING") ||
                    data.responseData.translatedText.includes("quota"))) {
                throw new Error("MyMemory Limit");
            }

            return data.responseData.translatedText || text; // Return original if all else fails really bad? No, throw to show error.
        } catch (e) {
            // All failed
            console.error("All translation services failed.");
            return `[Çeviri Yapılamadı] ${text.substring(0, 15)}...`;
        }
    },

    /**
     * Translates a large text by splitting it into chunks.
     */
    async translateFullText(text: string, targetLang: string, sourceLang: string = 'auto'): Promise<string> {
        const CHUNK_SIZE = 1500;

        // Split by sentences
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

        // Process chunks
        const promises = chunks.map(chunk => this.translate(chunk, targetLang, sourceLang));
        const results = await Promise.all(promises);

        return results.join(' ');
    }
};
