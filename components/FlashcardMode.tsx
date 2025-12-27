import React, { useState, useEffect } from 'react';
import { VocabWord } from '../types';
import { DBService } from '../services/db';

interface FlashcardModeProps {
    notebookId: string;
}

const FlashcardMode: React.FC<FlashcardModeProps> = ({ notebookId }) => {
    const [words, setWords] = useState<VocabWord[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isFlipped, setIsFlipped] = useState(false);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadWords();
    }, [notebookId]);

    const loadWords = async () => {
        setLoading(true);
        const data = await DBService.getNotebookWords(notebookId);
        setWords(data);
        setLoading(false);
    };

    if (loading) return <div className="text-center p-10 text-slate-400">Yükleniyor...</div>;
    if (words.length === 0) return <div className="text-center p-10 text-slate-400">Bu defterde henüz kelime yok.</div>;

    const currentWord = words[currentIndex];

    const handleNext = () => {
        setIsFlipped(false);
        if (currentIndex < words.length - 1) {
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

    return (
        <div className="h-full flex flex-col items-center justify-center p-4">
            <div className="w-full max-w-md">
                <div className="text-center mb-6 text-slate-500 font-bold text-sm tracking-wider">
                    KART {currentIndex + 1} / {words.length}
                </div>

                {/* CARD */}
                <div
                    onClick={() => setIsFlipped(!isFlipped)}
                    className="bg-white w-full h-80 rounded-3xl shadow-xl border border-indigo-100 flex items-center justify-center cursor-pointer transition-all hover:-translate-y-2 relative preserve-3d group perspective-1000"
                >
                    <div className="text-center p-8 flex flex-col items-center gap-4">
                        <span className={`text-xs font-black px-3 py-1 rounded-full tracking-widest ${isFlipped ? 'bg-green-100 text-green-600' : 'bg-indigo-100 text-indigo-600'}`}>
                            {isFlipped ? 'TÜRKÇE' : 'İNGİLİZCE'}
                        </span>

                        <div className="flex items-center gap-3">
                            <p className={`text-5xl font-black break-words max-w-full ${isFlipped ? 'text-green-600' : 'text-slate-800'}`}>
                                {isFlipped ? currentWord.definition : currentWord.term}
                            </p>
                            {!isFlipped && (
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        if ('speechSynthesis' in window) {
                                            const u = new SpeechSynthesisUtterance(currentWord.term);
                                            u.lang = 'en-US';
                                            window.speechSynthesis.speak(u);
                                        }
                                    }}
                                    className="w-12 h-12 rounded-full bg-indigo-50 text-indigo-600 hover:bg-indigo-600 hover:text-white flex items-center justify-center transition shadow-sm flex-shrink-0"
                                    title="Dinle"
                                >
                                    <i className="fas fa-volume-up text-xl"></i>
                                </button>
                            )}
                        </div>

                        <p className="absolute bottom-8 text-xs text-slate-300 font-medium group-hover:text-indigo-400 transition animate-pulse">
                            <i className="fas fa-sync-alt mr-1"></i> Çevirmek için tıkla
                        </p>
                    </div>
                </div>

                {/* CONTROLS */}
                <div className="flex justify-between mt-8 gap-4">
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
                        {currentIndex === words.length - 1 ? 'Başa Dön' : 'Sonraki'} <i className="fas fa-arrow-right ml-2"></i>
                    </button>
                </div>
            </div>
        </div>
    );
};

export default FlashcardMode;
