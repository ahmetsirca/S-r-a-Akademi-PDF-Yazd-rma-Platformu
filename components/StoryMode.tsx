import React, { useState, useEffect } from 'react';
import { VocabStory, VocabWord } from '../types';
import { DBService } from '../services/db';

interface StoryModeProps {
    notebookId: string;
}

const StoryMode: React.FC<StoryModeProps> = ({ notebookId }) => {
    const [stories, setStories] = useState<VocabStory[]>([]);
    const [words, setWords] = useState<VocabWord[]>([]);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [title, setTitle] = useState('');
    const [content, setContent] = useState('');
    const [viewMode, setViewMode] = useState(false); // Toggle between Edit and Interactive View

    useEffect(() => {
        loadData();
    }, [notebookId]);

    const loadData = async () => {
        const [sData, wData] = await Promise.all([
            DBService.getNotebookStories(notebookId),
            DBService.getNotebookWords(notebookId)
        ]);
        setStories(sData);
        setWords(wData);
    };

    const handleSave = async () => {
        if (!title || !content) return;
        if (editingId) {
            await DBService.updateStory(editingId, title, content);
        } else {
            await DBService.createStory(notebookId, title, content);
        }
        setTitle('');
        setContent('');
        setEditingId(null);
        loadData();
    };

    const handleEdit = (story: VocabStory) => {
        setEditingId(story.id);
        setTitle(story.title);
        setContent(story.content);
        setViewMode(false);
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Hikayeyi silmek istiyor musunuz?')) return;
        await DBService.deleteStory(id);
        setStories(stories.filter(s => s.id !== id));
    };

    const speak = (text: string) => {
        if ('speechSynthesis' in window) {
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.lang = 'en-US';
            window.speechSynthesis.speak(utterance);
        }
    };

    // Helper to render interactive text
    const renderInteractiveContent = (text: string) => {
        // Basic tokenization by space and punctuation
        const tokens = text.split(/(\s+|[.,!?;])/);
        return tokens.map((token, i) => {
            // Clean token for matching
            const cleanToken = token.replace(/[.,!?;]/g, '').toLowerCase().trim();
            const match = words.find(w => w.term.toLowerCase() === cleanToken);

            if (match) {
                return (
                    <span
                        key={i}
                        className="text-blue-600 font-bold cursor-pointer hover:bg-blue-100 rounded px-0.5 transition relative group"
                        onClick={() => speak(match.term)}
                    >
                        {token}
                        {/* Tooltip for Translation */}
                        <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-slate-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-10 transition">
                            {match.definition}
                        </span>
                    </span>
                );
            }
            return <span key={i}>{token}</span>;
        });
    };

    return (
        <div className="grid md:grid-cols-2 gap-6 h-[600px]">
            {/* Left: Story List & Editor */}
            <div className="flex flex-col gap-4 h-full">
                {/* Editor */}
                <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex-1 flex flex-col">
                    <input
                        type="text"
                        placeholder="Hikaye Başlığı"
                        className="w-full text-lg font-bold mb-4 p-2 border-b border-transparent focus:border-blue-500 outline-none"
                        value={title}
                        onChange={e => setTitle(e.target.value)}
                    />
                    <textarea
                        className="w-full flex-1 p-2 resize-none outline-none text-slate-700 leading-relaxed"
                        placeholder="Hikayeni buraya yaz... Kullandığın kelimeler otomatik olarak vurgulanacak."
                        value={content}
                        onChange={e => setContent(e.target.value)}
                    />
                    <div className="flex justify-end pt-4">
                        <button
                            onClick={handleSave}
                            disabled={!title || !content}
                            className="bg-green-600 text-white px-6 py-2 rounded-lg font-bold hover:bg-green-700 disabled:opacity-50 transition"
                        >
                            {editingId ? 'Güncelle' : 'Kaydet'}
                        </button>
                    </div>
                </div>

                {/* List */}
                <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 h-1/3 overflow-auto">
                    <h3 className="font-bold text-slate-700 mb-2 text-sm uppercase">Kayıtlı Hikayeler</h3>
                    <div className="space-y-2">
                        {stories.map(s => (
                            <div key={s.id} className="flex justify-between items-center p-2 hover:bg-slate-50 rounded cursor-pointer group" onClick={() => handleEdit(s)}>
                                <span className="font-medium text-slate-800">{s.title}</span>
                                <button
                                    onClick={(e) => { e.stopPropagation(); handleDelete(s.id); }}
                                    className="text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition"
                                >
                                    <i className="fas fa-trash"></i>
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Right: Interactive Viewer */}
            <div className="bg-slate-50 p-6 rounded-xl border border-slate-200 shadow-inner h-full overflow-auto">
                {title || content ? (
                    <article className="prose prose-slate max-w-none">
                        <h2 className="text-2xl font-bold text-slate-800 mb-4">{title || 'Başlıksız Hikaye'}</h2>
                        <div className="text-lg leading-loose text-slate-700">
                            {renderInteractiveContent(content)}
                        </div>
                    </article>
                ) : (
                    <div className="h-full flex flex-col items-center justify-center text-slate-400">
                        <i className="fas fa-book-reader text-4xl mb-4"></i>
                        <p>Hikayeni yazmaya başla veya soldan bir hikaye seç.</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default StoryMode;
