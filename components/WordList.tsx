import React, { useState, useEffect } from 'react';
import { VocabWord } from '../types';
import { DBService } from '../services/db';

interface WordListProps {
    notebookId: string;
}

const WordList: React.FC<WordListProps> = ({ notebookId }) => {
    const [words, setWords] = useState<VocabWord[]>([]);
    const [loading, setLoading] = useState(true);

    // Form State
    const [targetLang, setTargetLang] = useState<'en' | 'de' | 'fr'>('en');
    const [newTerm, setNewTerm] = useState('');
    const [newDef, setNewDef] = useState('');

    // Smart Suggestions State
    const [suggestions, setSuggestions] = useState<{ text: string, lang: string, from?: string, direction?: string }[]>([]);
    const [isTranslating, setIsTranslating] = useState(false);

    // Editing State
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editTerm, setEditTerm] = useState('');
    const [editDef, setEditDef] = useState('');

    useEffect(() => {
        loadWords();
    }, [notebookId]);

    const loadWords = async () => {
        setLoading(true);
        const data = await DBService.getNotebookWords(notebookId);
        setWords(data);
        setLoading(false);
    };

    // Flag Map
    const flags: Record<string, string> = {
        en: '🇬🇧',
        de: '🇩🇪',
        fr: '🇫🇷',
        tr: '🇹🇷'
    };

    // Auto-translate Bidirectional
    useEffect(() => {
        const translate = async () => {
            if (!newTerm || newTerm.length < 2) {
                setSuggestions([]);
                return;
            }

            setIsTranslating(true);
            try {
                // Parallel Query: Foreign->TR AND TR->Foreign
                const [resForeignToTr, resTrToForeign] = await Promise.all([
                    fetch(`https://api.mymemory.translated.net/get?q=${newTerm}&langpair=${targetLang}|tr`),
                    fetch(`https://api.mymemory.translated.net/get?q=${newTerm}&langpair=tr|${targetLang}`)
                ]);

                const data1 = await resForeignToTr.json();
                const data2 = await resTrToForeign.json();

                const distinctResults = new Map<string, { text: string, lang: string, direction: string }>();

                // Helper to process matches
                const processMatches = (data: any, sourceLang: string, destLang: string) => {
                    const matches = data.matches || [];

                    // Add main match
                    if (data.responseData.translatedText &&
                        !data.responseData.translatedText.toLowerCase().includes("invalid key") &&
                        data.responseData.translatedText.toLowerCase() !== newTerm.toLowerCase()) {

                        const val = data.responseData.translatedText;
                        distinctResults.set(val, {
                            text: val,
                            lang: destLang,
                            direction: `${flags[sourceLang]}➜${flags[destLang]}`
                        });
                    }

                    // Add other matches
                    matches.forEach((m: any) => {
                        if (m.translation &&
                            m.translation.toLowerCase() !== newTerm.toLowerCase()) {
                            distinctResults.set(m.translation, {
                                text: m.translation,
                                lang: destLang,
                                direction: `${flags[sourceLang]}➜${flags[destLang]}`
                            });
                        }
                    });
                };

                // Process Foreign -> TR
                processMatches(data1, targetLang, 'tr');

                // Process TR -> Foreign
                processMatches(data2, 'tr', targetLang);

                const finalList = Array.from(distinctResults.values()).slice(0, 8);
                setSuggestions(finalList);

                // Auto-fill logic
                if (finalList.length > 0 && !newDef) {
                    setNewDef(finalList[0].text);
                }

            } catch (e) {
                console.error("Translation fail", e);
            } finally {
                setIsTranslating(false);
            }
        };

        const timer = setTimeout(translate, 600); // 600ms debounce
        return () => clearTimeout(timer);
    }, [newTerm, targetLang]);

    const handleAdd = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newTerm || !newDef) return;
        const res = await DBService.addNotebookWord(notebookId, newTerm, newDef, targetLang);
        if (res) {
            setWords([res, ...words]);
            setNewTerm('');
            setNewDef('');
            setSuggestions([]);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Silmek istediğinize emin misiniz?')) return;
        await DBService.deleteNotebookWord(id);
        setWords(words.filter(w => w.id !== id));
    };

    // Filter words by current tab
    const filteredWords = words.filter(w => {
        // If word has no language (legacy), treat as 'en' or show in all?
        // User wants separation. Let's assume legacy is 'en' or user has to migrate. 
        // My SQL migration sets default 'en', so checking 'en' should cover legacy.
        const wLang = w.language || 'en';
        return wLang === targetLang;
    });

    const startEditing = (word: VocabWord) => {
        setEditingId(word.id);
        setEditTerm(word.term);
        setEditDef(word.definition);
    };

    const handleUpdate = async () => {
        if (!editingId || !editTerm || !editDef) return;
        await DBService.updateNotebookWord(editingId, editTerm, editDef);

        setWords(words.map(w => w.id === editingId ? { ...w, term: editTerm, definition: editDef } : w));
        setEditingId(null);
        setEditTerm('');
        setEditDef('');
    };

    const speak = (text: string) => {
        if ('speechSynthesis' in window) {
            const utterance = new SpeechSynthesisUtterance(text);
            // Detect lang roughly
            let lang = 'en-US';
            if (targetLang === 'de') lang = 'de-DE';
            else if (targetLang === 'fr') lang = 'fr-FR';
            else if (targetLang === 'tr') lang = 'tr-TR';

            utterance.lang = lang;
            window.speechSynthesis.speak(utterance);
        } else {
            alert("Tarayıcınız seslendirmeyi desteklemiyor.");
        }
    };

    return (
        <div className="space-y-6">

            {/* Language Tabs */}
            <div className="flex gap-2 justify-center pb-2">
                {[
                    { code: 'en', label: 'İngilizce', flag: '🇬🇧' },
                    { code: 'de', label: 'Almanca', flag: '🇩🇪' },
                    { code: 'fr', label: 'Fransızca', flag: '🇫🇷' }
                ].map((lang) => (
                    <button
                        key={lang.code}
                        type="button"
                        onClick={() => {
                            setTargetLang(lang.code as any);
                            setSuggestions([]);
                        }}
                        className={`flex items-center gap-2 px-6 py-2 rounded-full transition-all text-sm font-bold ${targetLang === lang.code
                            ? 'bg-blue-600 text-white shadow-lg scale-105'
                            : 'bg-white text-slate-500 border border-slate-200 hover:bg-slate-50'
                            }`}
                    >
                        <span className="text-lg">{lang.flag}</span>
                        {lang.label}
                    </button>
                ))}
            </div>

            {/* Add Form - UX Enhanced */}
            <form onSubmit={handleAdd} className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 flex flex-col gap-4 relative transition-all">
                <h3 className="text-sm font-bold text-slate-400 uppercase mb-2 flex items-center justify-between">
                    <span>Yeni Kelime Ekle</span>
                    <span className="text-xs text-blue-500 bg-blue-50 px-2 py-1 rounded">
                        {targetLang.toUpperCase()} ↔ TR Modu Aktif
                    </span>
                </h3>

                <div className="flex flex-col md:flex-row gap-4">
                    <div className="flex-1 relative">
                        <input
                            type="text"
                            placeholder={`Kelime yazın (${flags[targetLang]} veya 🇹🇷)...`}
                            className="w-full p-4 border rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-lg font-bold text-slate-700 bg-slate-50 focus:bg-white transition"
                            value={newTerm}
                            onChange={e => setNewTerm(e.target.value)}
                        />
                        {isTranslating && (
                            <div className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400">
                                <i className="fas fa-circle-notch fa-spin"></i>
                            </div>
                        )}
                    </div>

                    <div className="flex-1 flex flex-col gap-2">
                        <input
                            type="text"
                            placeholder="Çevirisi..."
                            className="w-full p-4 border rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-lg text-slate-700 bg-slate-50 focus:bg-white transition"
                            value={newDef}
                            onChange={e => setNewDef(e.target.value)}
                        />
                    </div>

                    <button className="bg-blue-600 text-white px-8 py-3 rounded-xl font-bold hover:bg-blue-700 transition shadow-lg hover:shadow-blue-500/30 active:scale-95">
                        <i className="fas fa-plus mr-2"></i> Ekle
                    </button>
                </div>

                {/* Smart Suggestions Chips */}
                {suggestions.length > 0 && (
                    <div className="animate-fade-in mt-2 p-3 bg-blue-50 rounded-lg border border-blue-100">
                        <p className="text-xs text-blue-500 font-bold mb-2 flex items-center gap-2">
                            <i className="fas fa-magic"></i> Akıllı Öneriler:
                        </p>
                        <div className="flex flex-wrap gap-2">
                            {suggestions.map((s, idx) => (
                                <button
                                    key={idx}
                                    type="button"
                                    onClick={() => setNewDef(s.text)}
                                    className={`px-3 py-1 rounded-lg text-sm transition border flex items-center gap-2 group ${newDef === s.text
                                        ? 'bg-blue-600 text-white border-blue-600 shadow-md'
                                        : 'bg-white text-slate-600 border-slate-200 hover:border-blue-400 hover:text-blue-600'
                                        }`}
                                >
                                    <span className="opacity-50 text-xs font-mono group-hover:opacity-100">{s.direction}</span>
                                    <span className="font-medium">{s.text}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </form>

            {/* List */}
            <div className="grid grid-cols-1 gap-3">
                {loading ? (
                    <p className="text-center text-slate-400">Yükleniyor...</p>
                ) : filteredWords.length === 0 ? (
                    <p className="text-center text-slate-400 py-8">
                        {targetLang === 'en' ? 'İngilizce' : targetLang === 'de' ? 'Almanca' : 'Fransızca'} bölümünde henüz kelime yok.
                    </p>
                ) : (
                    filteredWords.map(w => (
                        <div key={w.id} className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 flex items-center justify-between group hover:border-blue-200 transition">
                            {editingId === w.id ? (
                                // Edit Mode Row
                                <div className="flex-1 flex flex-col md:flex-row gap-4 items-center">
                                    <input
                                        className="flex-1 p-2 border rounded border-blue-300 outline-none font-bold"
                                        value={editTerm}
                                        onChange={e => setEditTerm(e.target.value)}
                                        placeholder="Terim"
                                    />
                                    <input
                                        className="flex-1 p-2 border rounded border-blue-300 outline-none"
                                        value={editDef}
                                        onChange={e => setEditDef(e.target.value)}
                                        placeholder="Tanım"
                                    />
                                    <div className="flex gap-2">
                                        <button onClick={handleUpdate} className="bg-green-600 text-white px-3 py-2 rounded font-bold text-sm hover:bg-green-700">
                                            <i className="fas fa-check"></i>
                                        </button>
                                        <button onClick={() => setEditingId(null)} className="bg-slate-200 text-slate-600 px-3 py-2 rounded font-bold text-sm hover:bg-slate-300">
                                            <i className="fas fa-times"></i>
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                // View Mode Row
                                <>
                                    <div className="flex items-center gap-4">
                                        <button
                                            onClick={() => speak(w.term)}
                                            className="w-10 h-10 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center hover:bg-blue-600 hover:text-white transition"
                                            title="Dinle"
                                        >
                                            <i className="fas fa-volume-up"></i>
                                        </button>
                                        <div>
                                            <h4 className="font-bold text-lg text-slate-800">{w.term}</h4>
                                            <p className="text-slate-500">{w.definition}</p>
                                        </div>
                                    </div>
                                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition">
                                        <button
                                            onClick={() => startEditing(w)}
                                            className="text-slate-300 hover:text-blue-500 p-2"
                                            title="Düzenle"
                                        >
                                            <i className="fas fa-pen"></i>
                                        </button>
                                        <button
                                            onClick={() => handleDelete(w.id)}
                                            className="text-slate-300 hover:text-red-500 p-2"
                                            title="Sil"
                                        >
                                            <i className="fas fa-trash"></i>
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};

export default WordList;
