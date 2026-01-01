import React, { useState, useEffect } from 'react';
import { VocabWord } from '../types';
import { DBService } from '../services/db';

interface FlashcardModeProps {
    notebookId: string;
}

const FlashcardMode: React.FC<FlashcardModeProps> = ({ notebookId }) => {
    const [allWords, setAllWords] = useState<VocabWord[]>([]);
    const [filteredWords, setFilteredWords] = useState<VocabWord[]>([]);
    const [targetLang, setTargetLang] = useState<'en' | 'de' | 'fr'>('en');

    const [currentIndex, setCurrentIndex] = useState(0);
    const [isFlipped, setIsFlipped] = useState(false);
    const [loading, setLoading] = useState(true);

    // Flag Map
    const flags: Record<string, string> = {
        en: '🇬🇧',
        de: '🇩🇪',
        fr: '🇫🇷',
        tr: '🇹🇷'
    };

    const langLabels: Record<string, string> = {
        en: 'İNGİLİZCE',
        de: 'ALMANCA',
        fr: 'FRANSIZCA',
        tr: 'TÜRKÇE'
    };

    useEffect(() => {
        loadWords();
    }, [notebookId]);

    useEffect(() => {
        filterWords();
    }, [allWords, targetLang]);

    const loadWords = async () => {
        setLoading(true);
        const data = await DBService.getNotebookWords(notebookId);
        setAllWords(data);
        setLoading(false);
    };

    const filterWords = () => {
        // Filter by targetLang
        // Assume default En if undefined
        const list = allWords.filter(w => (w.language || 'en') === targetLang);
        setFilteredWords(list);
        setCurrentIndex(0); // Reset index on filter change
        setIsFlipped(false);
    };

    if (loading) return <div className="text-center p-10 text-slate-400">Yükleniyor...</div>;

    const currentWord = filteredWords[currentIndex];

    const handleNext = () => {
        setIsFlipped(false);
        if (currentIndex < filteredWords.length - 1) {
            setCurrentIndex(currentIndex + 1);
        } else {
            setCurrentIndex(0); // Loop back
        }
    };

    const handlePrev = () => {
        setIsFlipped(false);
        if (currentIndex > 0) {
            setCurrentIndex(currentIndex - 1);
        }
    };

    const speak = (text: string) => {
        if ('speechSynthesis' in window) {
            const u = new SpeechSynthesisUtterance(text);
            let lang = 'en-US';
            if (targetLang === 'de') lang = 'de-DE';
            else if (targetLang === 'fr') lang = 'fr-FR';

            u.lang = lang;
            window.speechSynthesis.speak(u);
        }
    };

    return (
        <div className="h-full flex flex-col items-center justify-start p-4 gap-6">

            {/* Language Tabs */}
            <div className="flex gap-2 justify-center bg-white p-1 rounded-full border border-slate-200">
                {[
                    { code: 'en', label: 'İngilizce', flag: '🇬🇧' },
                    { code: 'de', label: 'Almanca', flag: '🇩🇪' },
                    { code: 'fr', label: 'Fransızca', flag: '🇫🇷' }
                ].map((lang) => (
                    <button
                        key={lang.code}
                        onClick={() => setTargetLang(lang.code as any)}
                        className={`flex items-center gap-2 px-4 py-2 rounded-full transition-all text-xs font-bold ${targetLang === lang.code
                                ? 'bg-indigo-600 text-white shadow-md'
                                : 'text-slate-500 hover:bg-slate-50'
                            }`}
                    >
                        <span className="">{lang.flag}</span>
                        {lang.label}
                    </button>
                ))}
            </div>

            {filteredWords.length === 0 ? (
                <div className="text-center p-10 text-slate-400 flex flex-col items-center gap-4">
                    <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center text-2xl">
                        {flags[targetLang]}
                    </div>
                    <p>Bu dilde ({langLabels[targetLang]}) henüz kelime kartı yok.</p>
                </div>
            ) : (
                <div className="w-full max-w-md flex flex-col gap-6">
                    <div className="text-center text-slate-400 font-bold text-sm tracking-wider">
                        KART {currentIndex + 1} / {filteredWords.length}
                    </div>

                    {/* CARD */}
                    <div
                        onClick={() => setIsFlipped(!isFlipped)}
                        className="bg-white w-full h-80 rounded-3xl shadow-xl border border-indigo-100 flex items-center justify-center cursor-pointer transition-all hover:-translate-y-2 relative preserve-3d group perspective-1000"
                    >
                        <div className="text-center p-8 flex flex-col items-center gap-4">
                            <span className={`text-xs font-black px-3 py-1 rounded-full tracking-widest ${isFlipped ? 'bg-green-100 text-green-600' : 'bg-indigo-100 text-indigo-600'}`}>
                                {isFlipped ? 'TÜRKÇE' : langLabels[targetLang]}
                            </span>

                            <div className="flex items-center gap-3 justify-center w-full">
                                <p className={`text-4xl md:text-5xl font-black break-words max-w-full leading-tight text-center ${isFlipped ? 'text-green-600' : 'text-slate-800'}`}>
                                    {isFlipped ? currentWord.definition : currentWord.term}
                                </p>
                                {!isFlipped && (
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            speak(currentWord.term);
                                        }}
                                        className="w-10 h-10 rounded-full bg-indigo-50 text-indigo-600 hover:bg-indigo-600 hover:text-white flex items-center justify-center transition shadow-sm flex-shrink-0"
                                        title="Dinle"
                                    >
                                        <i className="fas fa-volume-up"></i>
                                    </button>
                                )}
                            </div>

                            <p className="absolute bottom-8 text-xs text-slate-300 font-medium group-hover:text-indigo-400 transition animate-pulse">
                                <i className="fas fa-sync-alt mr-1"></i> Çevirmek için tıkla
                            </p>
                        </div>
                    </div>

                    {/* CONTROLS */}
                    <div className="flex justify-between gap-4">
                        <button
                            onClick={handlePrev}
                            disabled={currentIndex === 0}
                            className="flex-1 bg-white border-2 border-slate-100 text-slate-600 py-3 rounded-2xl font-bold hover:bg-slate-50 hover:border-slate-300 disabled:opacity-50 disabled:cursor-not-allowed transition"
                        >
                            <i className="fas fa-arrow-left mr-2"></i> Önceki
                        </button>

                        <button
                            onClick={handleNext}
                            className="flex-1 bg-indigo-600 text-white py-3 rounded-2xl font-bold hover:bg-indigo-700 shadow-lg shadow-indigo-200 transition transform active:scale-95"
                        >
                            {currentIndex === filteredWords.length - 1 ? 'Başa Dön' : 'Sonraki'} <i className="fas fa-arrow-right ml-2"></i>
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default FlashcardMode;
