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

    // Selection Popover State
    const [popover, setPopover] = useState<{ x: number, y: number, text: string } | null>(null);
    const [translation, setTranslation] = useState<string | null>(null);
    const viewerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        loadData();
    }, [notebookId]);

    // Clear popover on click outside
    useEffect(() => {
        const handleClick = () => setPopover(null);
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, []);

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
        let success = false;

        if (editingId) {
            success = await DBService.updateStory(editingId, title, content);
        } else {
            const res = await DBService.createStory(notebookId, title, content);
            success = !!res;
        }

        if (success) {
            // Visual feedback
            const btn = document.getElementById('save-btn');
            if (btn) {
                const originalText = btn.innerText;
                btn.innerText = 'Kaydedildi! ✓';
                btn.style.backgroundColor = '#16a34a'; // green-600
                setTimeout(() => {
                    btn.innerText = originalText;
                    btn.style.backgroundColor = '';
                }, 2000);
            }
            setTitle('');
            setContent('');
            setEditingId(null);
            loadData();
        }
    };

    const handleEdit = (story: VocabStory) => {
        setEditingId(story.id);
        setTitle(story.title);
        setContent(story.content);
        // Scroll to editor on mobile
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Hikayeyi silmek istiyor musunuz?')) return;
        await DBService.deleteStory(id);
        setStories(stories.filter(s => s.id !== id));
    };

    const speak = (text: string) => {
        if ('speechSynthesis' in window) {
            window.speechSynthesis.cancel(); // Stop previous
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.lang = 'en-US';
            window.speechSynthesis.speak(utterance);
        }
    };

    // Handle Text Selection
    const handleMouseUp = (e: React.MouseEvent) => {
        e.stopPropagation(); // Prevent document click handler
        const selection = window.getSelection();
        if (!selection || selection.toString().trim().length === 0) {
            return;
        }

        // Check if selection is inside viewer
        if (viewerRef.current && viewerRef.current.contains(selection.anchorNode)) {
            const range = selection.getRangeAt(0);
            const rect = range.getBoundingClientRect();

            setPopover({
                x: rect.left + (rect.width / 2),
                y: rect.top - 10,
                text: selection.toString()
            });
            setTranslation(null);
        }
    };

    const handleTranslateSelection = async (e: React.MouseEvent) => {
        e.stopPropagation(); // Prevent closing
        if (!popover) return;
        try {
            const res = await fetch(`https://api.mymemory.translated.net/get?q=${popover.text}&langpair=en|tr`);
            const data = await res.json();
            if (data.responseData.translatedText) {
                setTranslation(data.responseData.translatedText);
            }
        } catch (err) {
            setTranslation("Çeviri hatası");
        }
    };

    // Helper to render interactive text
    const renderInteractiveContent = (text: string) => {
        const tokens = text.split(/(\s+|[.,!?;])/);
        return tokens.map((token, i) => {
            const cleanToken = token.replace(/[.,!?;]/g, '').toLowerCase().trim();
            const match = words.find(w => w.term.toLowerCase() === cleanToken);

            if (match) {
                return (
                    <span
                        key={i}
                        className="text-blue-600 font-bold cursor-pointer hover:bg-blue-100 rounded px-0.5 transition relative group"
                        onClick={(e) => { e.stopPropagation(); speak(match.term); }}
                    >
                        {token}
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
        <div className="grid md:grid-cols-2 gap-6 h-auto md:h-[600px] relative">
            {/* Popover */}
            {popover && (
                <div
                    className="fixed z-[9999] bg-slate-800 text-white p-2 rounded-lg shadow-xl flex flex-col items-center gap-2 transform -translate-x-1/2 -translate-y-full animate-fade-in"
                    style={{ left: popover.x, top: popover.y }}
                    onMouseDown={(e) => e.stopPropagation()} // Prevent close on interaction
                >
                    <div className="flex gap-2">
                        <button
                            onClick={() => speak(popover.text)}
                            className="bg-slate-700 hover:bg-slate-600 px-3 py-1 rounded text-sm flex items-center gap-2"
                        >
                            <i className="fas fa-volume-up"></i> Dinle
                        </button>
                        <button
                            onClick={handleTranslateSelection}
                            className="bg-blue-600 hover:bg-blue-500 px-3 py-1 rounded text-sm flex items-center gap-2"
                        >
                            <i className="fas fa-language"></i> Çevir
                        </button>
                    </div>
                    {translation && (
                        <div className="text-xs text-center border-t border-slate-600 pt-2 mt-1 w-full max-w-[200px]">
                            {translation}
                        </div>
                    )}
                    {/* Triangle */}
                    <div className="absolute top-full left-1/2 -translate-x-1/2 border-8 border-transparent border-t-slate-800"></div>
                </div>
            )}

            {/* Left: Story List & Editor */}
            <div className="flex flex-col gap-4 h-full min-h-[400px]">
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
                        className="w-full flex-1 p-2 resize-none outline-none text-slate-700 leading-relaxed min-h-[200px]"
                        placeholder="Hikayeni buraya yaz... Kullandığın kelimeler otomatik olarak vurgulanacak."
                        value={content}
                        onChange={e => setContent(e.target.value)}
                    />
                    <div className="flex justify-end pt-4">
                        <button
                            id="save-btn"
                            onClick={handleSave}
                            disabled={!title || !content}
                            className="bg-green-600 text-white px-6 py-2 rounded-lg font-bold hover:bg-green-700 disabled:opacity-50 transition"
                        >
                            {editingId ? 'Güncelle' : 'Kaydet'}
                        </button>
                    </div>
                </div>

                {/* List */}
                <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 h-1/3 min-h-[150px] overflow-auto">
                    <h3 className="font-bold text-slate-700 mb-2 text-sm uppercase">Kayıtlı Hikayeler</h3>
                    <div className="space-y-2">
                        {stories.map(s => (
                            <div key={s.id} className="flex justify-between items-center p-2 hover:bg-slate-50 rounded cursor-pointer group" onClick={() => handleEdit(s)}>
                                <span className="font-medium text-slate-800 truncate flex-1">{s.title}</span>
                                <button
                                    onClick={(e) => { e.stopPropagation(); handleDelete(s.id); }}
                                    className="text-slate-300 hover:text-red-500 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition px-2"
                                >
                                    <i className="fas fa-trash"></i>
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Right: Interactive Viewer */}
            <div
                ref={viewerRef}
                onMouseUp={handleMouseUp}
                className="bg-slate-50 p-6 rounded-xl border border-slate-200 shadow-inner h-full min-h-[400px] overflow-auto select-text"
            >
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
                        <p className="text-center px-4">Hikayeni yazmaya başla veya soldan bir hikaye seç. <br /><span className="text-xs mt-2 block opacity-70">Çevirmek veya dinlemek için metni seçin.</span></p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default StoryMode;
