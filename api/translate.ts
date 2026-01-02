
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(request: VercelRequest, response: VercelResponse) {
    // CORS Headers
    response.setHeader('Access-Control-Allow-Credentials', 'true');
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    response.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
    );

    if (request.method === 'OPTIONS') {
        response.status(200).end();
        return;
    }

    const { text, source = 'auto', target = 'tr' } = request.query;

    if (!text) {
        return response.status(400).json({ error: 'Text validation failed' });
    }

    try {
        const term = encodeURIComponent(text as string);
        // Use Google Translate Single (GTX) - very reliable, no token needed usually for low volume
        const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${source}&tl=${target}&dt=t&q=${term}`;

        const res = await fetch(url);
        if (!res.ok) throw new Error('GTX response not ok');

        const data = await res.json();

        // Parse result: [[["translated_text", "original_text", ...], ...], ...]
        if (Array.isArray(data) && Array.isArray(data[0])) {
            const translatedText = data[0]
                .map((chunk: any) => (Array.isArray(chunk) ? chunk[0] : ''))
                .join('');

            if (translatedText) {
                return response.status(200).json({ translation: translatedText });
            }
        }

        throw new Error('Invalid format');

    } catch (error: any) {
        return response.status(500).json({ error: error.message });
    }
}
