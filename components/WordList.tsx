import React, { useState, useEffect } from 'react';
import { VocabWord } from '../types';
import { DBService } from '../services/db';

interface WordListProps {
    notebookId: string;
}

const WordList: React.FC<WordListProps> = ({ notebookId }) => {
    const [words, setWords] = useState<VocabWord[]>([]);
    const [loading, setLoading] = useState(true);
    const [newTerm, setNewTerm] = useState('');
    const [newDef, setNewDef] = useState('');
    const [suggestions, setSuggestions] = useState<string[]>([]); // Store multiple meanings
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

    // Auto-translate debounce for NEW words
    useEffect(() => {
        const translate = async () => {
            if (!newTerm || newTerm.length < 2) {
                setSuggestions([]);
                return;
            }

            setIsTranslating(true);
            try {
                const response = await fetch(`https://api.mymemory.translated.net/get?q=${newTerm}&langpair=en|tr`);
                const data = await response.json();

                // Parse Matches for Richer Suggestions
                const matches = data.matches || [];
                const distinctDefs = new Set<string>();

                // Add main translation first
                if (data.responseData.translatedText) {
                    distinctDefs.add(data.responseData.translatedText);
                }

                // Add other high quality matches
                matches.forEach((m: any) => {
                    if (m.translation && !m.translation.toLowerCase().includes(newTerm.toLowerCase())) {
                        distinctDefs.add(m.translation);
                    }
                });

                const finalList = Array.from(distinctDefs).slice(0, 5); // Limit to 5
                setSuggestions(finalList);

                // Auto-fill first only if empty (Quality of Life)
                if (finalList.length > 0 && !newDef) {
                    // Optionally don't auto-fill, just show suggestions to force choice?
                    // User asked for "see multiple meanings".
                    // Let's auto-fill the best one but show others.
                    setNewDef(finalList[0]);
                }

            } catch (e) {
                console.error("Translation fail", e);
            } finally {
                setIsTranslating(false);
            }
        };

        const timer = setTimeout(translate, 800); // 800ms debounce
        return () => clearTimeout(timer);
    }, [newTerm]);

    const handleAdd = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newTerm || !newDef) return;
        const res = await DBService.addNotebookWord(notebookId, newTerm, newDef);
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
            utterance.lang = 'en-US';
            window.speechSynthesis.speak(utterance);
        } else {
            alert("Tarayıcınız seslendirmeyi desteklemiyor.");
        }
    };

    return (
        <div className="space-y-6">
            {/* Add Form - UX Enhanced */}
            <form onSubmit={handleAdd} className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 flex flex-col gap-4 relative">
                <h3 className="text-sm font-bold text-slate-400 uppercase mb-2">Yeni Kelime Ekle</h3>

                <div className="flex flex-col md:flex-row gap-4">
                    <div className="flex-1 relative">
                        <input
                            type="text"
                            placeholder="İngilizce kelime (örn: run)"
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
                            placeholder="Türkçe karşılığı"
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
                            <i className="fas fa-magic"></i> Önerilen Anlamlar:
                        </p>
                        <div className="flex flex-wrap gap-2">
                            {suggestions.map((s, idx) => (
                                <button
                                    key={idx}
                                    type="button"
                                    onClick={() => setNewDef(s)}
                                    className={`px-3 py-1 rounded-full text-sm transition border ${newDef === s ? 'bg-blue-600 text-white border-blue-600 shadow-md' : 'bg-white text-slate-600 border-slate-200 hover:border-blue-400 hover:text-blue-600'}`}
                                >
                                    {s}
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
                ) : words.length === 0 ? (
                    <p className="text-center text-slate-400 py-8">Henüz kelime eklenmemiş.</p>
                ) : (
                    words.map(w => (
                        <div key={w.id} className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 flex items-center justify-between group hover:border-blue-200 transition">
                            {editingId === w.id ? (
                                // Edit Mode Row
                                <div className="flex-1 flex flex-col md:flex-row gap-4 items-center">
                                    <input
                                        className="flex-1 p-2 border rounded border-blue-300 outline-none font-bold"
                                        value={editTerm}
                                        onChange={e => setEditTerm(e.target.value)}
                                        placeholder="İngilizce"
                                    />
                                    <input
                                        className="flex-1 p-2 border rounded border-blue-300 outline-none"
                                        value={editDef}
                                        onChange={e => setEditDef(e.target.value)}
                                        placeholder="Türkçe"
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
