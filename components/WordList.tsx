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

    useEffect(() => {
        loadWords();
    }, [notebookId]);

    const loadWords = async () => {
        setLoading(true);
        const data = await DBService.getNotebookWords(notebookId);
        setWords(data);
        setLoading(false);
    };

    // Auto-translate debounce
    useEffect(() => {
        const translate = async () => {
            if (!newTerm || newTerm.length < 2) return;
            try {
                const response = await fetch(`https://api.mymemory.translated.net/get?q=${newTerm}&langpair=en|tr`);
                const data = await response.json();
                if (data.responseData.translatedText) {
                    setNewDef(data.responseData.translatedText);
                }
            } catch (e) {
                console.error("Translation fail", e);
            }
        };

        const timer = setTimeout(translate, 1000);
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
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Silmek istediğinize emin misiniz?')) return;
        await DBService.deleteNotebookWord(id);
        setWords(words.filter(w => w.id !== id));
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
            {/* Add Form */}
            <form onSubmit={handleAdd} className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-col md:flex-row gap-4">
                <input
                    type="text"
                    placeholder="İngilizce Kelime"
                    className="flex-1 p-3 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                    value={newTerm}
                    onChange={e => setNewTerm(e.target.value)}
                />
                <input
                    type="text"
                    placeholder="Türkçe Karşılığı"
                    className="flex-1 p-3 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                    value={newDef}
                    onChange={e => setNewDef(e.target.value)}
                />
                <button className="bg-blue-600 text-white px-6 py-3 rounded-lg font-bold hover:bg-blue-700 transition">
                    Ekle
                </button>
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
                            <button
                                onClick={() => handleDelete(w.id)}
                                className="text-slate-300 hover:text-red-500 p-2 opacity-0 group-hover:opacity-100 transition"
                            >
                                <i className="fas fa-trash"></i>
                            </button>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};

export default WordList;
