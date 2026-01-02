
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
        console.log(`[TranslationService] Translating: "${text.substring(0, 20)}..." (${sourceLang} -> ${targetLang})`);

        const sLang = sourceLang === 'original' || sourceLang === 'auto' ? 'auto' : sourceLang;
        const tLang = targetLang === 'original' ? 'en' : targetLang;

        if (sLang === tLang && sLang !== 'auto') return text;

        // --- 1. LINGVA (Best for Privacy & Speed if up) ---
        try {
            console.log('[TranslationService] Trying Strategy 1: Lingva');
            const res = await this.fetchWithTimeout(`https://lingva.ml/api/v1/${sLang}/${tLang}/${encodeURIComponent(text)}`, 2500);
            if (res.ok) {
                const data = await res.json();
                if (data.translation) return data.translation;
            }
        } catch (e) { console.warn('Lingva failed'); }

        // --- 2. GOOGLE CLIENTS5 via CODITABS (New Robust Strategy) ---
        // often works when others don't
        try {
            console.log('[TranslationService] Trying Strategy 2: Google Clients5 via CodeTabs');
            const gUrl = `https://clients5.google.com/translate_a/t?client=dict-chrome-ex&sl=${sLang}&tl=${tLang}&q=${encodeURIComponent(text)}`;
            const proxyUrl = `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(gUrl)}`;
            const res = await this.fetchWithTimeout(proxyUrl, 4000);
            if (res.ok) {
                const data = await res.json();
                // clients5 returns nested array [[["translated"]]]
                if (Array.isArray(data?.[0]) && data[0][0]) {
                    return data[0][0];
                }
            }
        } catch (e) { console.warn('CodeTabs/Clients5 failed'); }

        // --- 3. GOOGLE via CORSPROXY.IO ---
        try {
            console.log('[TranslationService] Trying Strategy 3: CorsProxy.io');
            const gUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sLang}&tl=${tLang}&dt=t&q=${encodeURIComponent(text)}`;
            const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(gUrl)}`;
            const res = await this.fetchWithTimeout(proxyUrl, 4000);
            if (res.ok) {
                const data = await res.json();
                if (Array.isArray(data?.[0])) {
                    return data[0].map((s: any) => Array.isArray(s) ? s[0] : '').join('');
                }
            }
        } catch (e) {
            console.warn('CorsProxy failed');
        }

        // --- 4. GOOGLE via ALLORIGINS ---
        try {
            console.log('[TranslationService] Trying Strategy 4: AllOrigins');
            const gUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sLang}&tl=${tLang}&dt=t&q=${encodeURIComponent(text)}`;
            const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(gUrl)}`;
            const res = await this.fetchWithTimeout(proxyUrl, 5000);
            if (res.ok) {
                const wrapper = await res.json();
                if (wrapper.contents) {
                    const data = JSON.parse(wrapper.contents);
                    if (Array.isArray(data?.[0])) {
                        return data[0].map((s: any) => Array.isArray(s) ? s[0] : '').join('');
                    }
                }
            }
        } catch (e) { console.warn('AllOrigins failed'); }

        // --- 5. MYMEMORY (Last Resort) ---
        try {
            console.log('[TranslationService] Trying Strategy 5: MyMemory');
            const pair = `${sLang}|${tLang}`;
            const res = await this.fetchWithTimeout(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${pair}`, 5000);
            const data = await res.json();
            if (data.responseStatus === 200 && data.responseData.translatedText) {
                const result = data.responseData.translatedText;
                if (!result.includes("MYMEMORY WARNING") && !result.includes("quota")) {
                    return result;
                }
            }
        } catch (e) { console.warn('MyMemory failed'); }

        return `[Hata: Çevrilemedi]`;
    },

    /**
     * Helper for timeout-bounded fetch
     */
    async fetchWithTimeout(url: string, timeout: number = 3000): Promise<Response> {
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
    },

    /**
     * Helper for Dictionary Lookups (Synonyms, etc)
     */
    async lookupDictionary(text: string, targetLang: string, sourceLang: string = 'auto'): Promise<{ text: string, type?: string }[]> {
        if (!text.trim()) return [];

        const results: { text: string, type?: string }[] = [];
        const sLang = sourceLang === 'original' || sourceLang === 'auto' ? 'auto' : sourceLang;
        const tLang = targetLang === 'original' ? 'en' : targetLang;

        // Strategy 1: Google Clients5 via CodeTabs (Robust JSON)
        try {
            const gUrl = `https://clients5.google.com/translate_a/t?client=dict-chrome-ex&sl=${sLang}&tl=${tLang}&q=${encodeURIComponent(text)}`;
            const proxyUrl = `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(gUrl)}`;
            const res = await this.fetchWithTimeout(proxyUrl, 5000); // 5s timeout
            if (res.ok) {
                const data = await res.json();
                // clients5 dict structure: [ [ "translation", ["synonyms"...]], ["dict_type", ["terms"...]] ]
                // actually it varies. Simple translation is data[0][0].
                // Dict data might be complex. Let's fallback to simple if complex parsing fails, 
                // but clients5 is MAINLY for simple translation in this url format.

                // If we want FULL DICT we need stricter params. 
                // Let's stick to gtx for Dict, but use CodeTabs as proxy!
            }

            // REVISED Strategy 1: GTX via CodeTabs (Better for Dictionary Data)
            const gtxUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sLang}&tl=${tLang}&dt=t&dt=bd&q=${encodeURIComponent(text)}`;
            const codeTabsUrl = `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(gtxUrl)}`;
            const res2 = await this.fetchWithTimeout(codeTabsUrl, 4000);
            if (res2.ok) {
                const data = await res2.json();
                if (data && data[1] && Array.isArray(data[1])) {
                    data[1].forEach((group: any) => {
                        const type = group[0];
                        const terms = group[1];
                        if (Array.isArray(terms)) {
                            terms.slice(0, 5).forEach((term: any) => {
                                if (typeof term === 'string') results.push({ text: term, type });
                            });
                        }
                    });
                }
                // If dict found, return
                if (results.length > 0) return results;

                // Simple translation from GTX
                if (Array.isArray(data?.[0])) {
                    const val = data[0].map((s: any) => Array.isArray(s) ? s[0] : '').join('');
                    if (val) results.push({ text: val, type: 'Çeviri' });
                }
            }

        } catch (e) { console.warn('CodeTabs Dict lookup failed', e); }

        // Strategy 2: GTX via CorsProxy (Fallback)
        if (results.length === 0) {
            try {
                const gUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sLang}&tl=${tLang}&dt=t&dt=bd&q=${encodeURIComponent(text)}`;
                const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(gUrl)}`;
                const res = await this.fetchWithTimeout(proxyUrl, 4000);
                if (res.ok) {
                    const data = await res.json();
                    if (data && data[1] && Array.isArray(data[1])) {
                        data[1].forEach((group: any) => {
                            const type = group[0];
                            const terms = group[1];
                            if (Array.isArray(terms)) {
                                terms.slice(0, 5).forEach((term: any) => {
                                    if (typeof term === 'string') results.push({ text: term, type });
                                });
                            }
                        });
                    }
                    if (results.length > 0) return results;

                    if (Array.isArray(data?.[0])) {
                        const val = data[0].map((s: any) => Array.isArray(s) ? s[0] : '').join('');
                        if (val) results.push({ text: val, type: 'Çeviri' });
                    }
                }
            } catch (e) { /* ignore */ }
        }

        // Strategy 3: Single Translate Fallback
        if (results.length === 0) {
            const simple = await this.translate(text, targetLang, sourceLang);
            if (simple && !simple.startsWith('[Hata')) {
                results.push({ text: simple, type: 'Çeviri' });
            }
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
                if (currentChunk) chunks.push(currentChunk);
                currentChunk = sent;
            } else {
                currentChunk += sent;
            }
        }
        if (currentChunk) chunks.push(currentChunk);

        const results = [];
        for (const chunk of chunks) {
            if (chunk.trim()) {
                if (results.length > 0) await new Promise(r => setTimeout(r, 100)); // Rate limit guard
                const t = await this.translate(chunk, targetLang, sourceLang);
                results.push(t);
            }
        }
        return results.join(' ');
    }
};
