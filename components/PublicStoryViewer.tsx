import React, { useState, useEffect } from 'react';
import { DBService } from '../services/db';
import { VocabStory, VocabWord } from '../types';

interface PublicStoryViewerProps {
    storyId: string;
}

const PublicStoryViewer: React.FC<PublicStoryViewerProps> = ({ storyId }) => {
    const [story, setStory] = useState<VocabStory | null>(null);
    const [words, setWords] = useState<VocabWord[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const load = async () => {
            setLoading(true);
            try {
                // 1. Get Story
                const s = await DBService.getStoryById(storyId);
                if (!s) {
                    setError("Hikaye bulunamadı.");
                    setLoading(false);
                    return;
                }
                setStory(s);

                // 2. Get Words (for highlighting) - Requires public access to vocab_words (already enabled in SQL)
                const w = await DBService.getNotebookWords(s.notebookId);
                setWords(w);
            } catch (e: any) {
                console.error(e);
                setError("Hikaye yüklenirken hata oluştu.");
            } finally {
                setLoading(false);
            }
        };
        load();
    }, [storyId]);

    const speak = (text: string) => {
        if ('speechSynthesis' in window) {
            window.speechSynthesis.cancel();
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.lang = 'en-US';
            window.speechSynthesis.speak(utterance);
        }
    };

    if (loading) return <div className="flex h-screen items-center justify-center text-slate-500">Yükleniyor...</div>;
    if (error || !story) return <div className="flex h-screen items-center justify-center text-red-500">{error || "Hikaye bulunamadı"}</div>;

    return (
        <div className="min-h-screen bg-slate-50 py-10 px-4">
            <div className="max-w-[800px] mx-auto bg-white p-8 md:p-12 rounded-2xl shadow-xl border border-slate-100">
                <div className="mb-8 text-center border-b border-slate-100 pb-6">
                    <h1 className="text-3xl md:text-4xl font-bold text-slate-800 font-serif tracking-wide mb-2">{story.title}</h1>
                    <p className="text-xs text-slate-400">Sırça Akademi / Public Story</p>
                </div>

                <div className="text-xl leading-loose text-slate-800 font-serif break-words text-justify">
                    {(() => {
                        const sentences = story.content.match(/[^\.!\?]+[\.!\?]+|[^\.!\?]+$/g) || [story.content];
                        return sentences.map((sentence, index) => (
                            <InteractiveSentence
                                key={index}
                                text={sentence}
                                words={words}
                                speak={speak}
                            />
                        ));
                    })()}
                </div>

                <div className="mt-12 pt-6 border-t border-slate-100 text-center">
                    <a href="/" className="text-blue-600 hover:underline font-bold text-sm">Sırça Akademi'ye Git</a>
                </div>
            </div>
        </div>
    );
};

// Reused Component (Duplicated for independence/portability in Public View)
const InteractiveSentence: React.FC<{ text: string, words: VocabWord[], speak: (t: string) => void }> = ({ text, words, speak }) => {
    const [translation, setTranslation] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    const handleTranslate = async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (translation) {
            setTranslation(null);
            return;
        }
        setLoading(true);
        try {
            const res = await fetch(`https://api.mymemory.translated.net/get?q=${text.replace(/[.!?]/g, '')}&langpair=en|tr`);
            const data = await res.json();
            if (data.responseData.translatedText) {
                setTranslation(data.responseData.translatedText);
            }
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const renderTokens = () => {
        const tokens = text.split(/(\s+|[.,!?;])/);
        return tokens.map((token, i) => {
            const cleanToken = token.replace(/[.,!?;]/g, '').toLowerCase().trim();
            if (!cleanToken) return <span key={i}>{token}</span>;

            const match = words.find(w => w.term.toLowerCase() === cleanToken);
            if (match) {
                return (
                    <span
                        key={i}
                        className="text-blue-600 font-bold cursor-pointer hover:bg-blue-100 rounded px-0.5 transition relative group"
                        onClick={(e) => { e.stopPropagation(); speak(match.term); }}
                    >
                        {token}
                        <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-slate-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-10 transition shadow-lg">
                            {match.definition}
                        </span>
                    </span>
                );
            }
            return <span key={i}>{token}</span>;
        });
    };

    return (
        <span
            className="hover:bg-yellow-50/50 cursor-pointer rounded transition duration-300 relative inline"
            onClick={handleTranslate}
            title="Cümle çevirisi için tıkla"
        >
            {renderTokens()}
            {(translation || loading) && (
                <span className="block my-2 p-3 bg-indigo-50 text-indigo-800 text-lg font-sans rounded-r-xl border-l-4 border-indigo-500 animate-scale-in select-text cursor-auto shadow-sm" onClick={e => e.stopPropagation()}>
                    {loading ? <i className="fas fa-spinner fa-spin text-indigo-400"></i> : <><i className="fas fa-language mr-2 text-indigo-400"></i> {translation}</>}
                </span>
            )}
            {" "}
        </span>
    );
};

export default PublicStoryViewer;
