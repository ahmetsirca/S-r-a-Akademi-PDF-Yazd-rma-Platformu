import React, { useState, useEffect, useRef } from 'react';
import { VocabStory, VocabWord } from '../types';
import { DBService } from '../services/db';
import { supabase } from '../services/supabase';
import { jsPDF } from 'jspdf';
import { Document, Packer, Paragraph, HeadingLevel } from 'docx';
import { saveAs } from 'file-saver';

// Sub-component for Interactive Sentence
const InteractiveSentence: React.FC<{
    text: string,
    words: VocabWord[],
    speak: (t: string) => void,
    autoRead: boolean,
    onWordClick: (text: string, x: number, y: number) => void,
    sourceLang?: string
}> = ({ text, words, speak, autoRead, onWordClick, sourceLang = 'en' }) => {
    const [translation, setTranslation] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    const handleTranslate = async (e: React.MouseEvent) => {
        e.stopPropagation();

        // Auto-read if enabled
        if (autoRead) {
            speak(text);
        }

        if (translation) {
            setTranslation(null); // Toggle off
            return;
        }
        setLoading(true);
        try {
            // Translate from sourceLang (or auto) to TR
            // If source is TR, maybe translate to EN? 
            // User request implies "Show me Turkish translation" mostly.
            // But if text is TR, user likely wants EN?
            // Let's assume standard behavior: Translate to TR unless source is TR, then EN.
            let pair = `${sourceLang}|tr`;
            if (sourceLang === 'tr') pair = 'tr|en';

            const res = await fetch(`https://api.mymemory.translated.net/get?q=${text.replace(/[.!?]/g, '')}&langpair=${pair}`);
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

    // Improved Match Logic with Suffix Support
    const findMatch = (rawToken: string) => {
        const clean = rawToken.replace(/[.,!?;:()"']/g, '').trim();
        if (!clean) return null;

        const lower = clean.toLocaleLowerCase('tr-TR');
        const enLower = clean.toLowerCase();

        // 1. Exact Match
        let match = words.find(w => w.term.toLowerCase() === lower || w.term.toLowerCase() === enLower);
        if (match) return match;

        // 2. English Suffix Check (Simple)
        match = words.find(w => {
            const term = w.term.toLowerCase();
            if (enLower === term + 's') return true;
            if (enLower === term + 'es') return true;
            if (enLower === term + 'd') return true;
            if (enLower === term + 'ed') return true;
            if (enLower === term + 'ing') return true;
            if (enLower === term + 'ly') return true;
            return false;
        });

        return match;
    };

    const renderTokens = () => {
        const tokens = text.split(/(\s+|[.,!?;])/);
        return tokens.map((token, i) => {
            // Only search for matches if we are in Original mode or if words match the current view lang?
            // For now search always.
            const match = findMatch(token);

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
            // Make non-matched words clickable for popover
            if (token.trim() && !/^[.,!?;:()"'\s]+$/.test(token)) {
                return (
                    <span
                        key={i}
                        className="hover:text-blue-500 hover:bg-yellow-100 transition cursor-pointer select-none"
                        onClick={(e) => {
                            e.stopPropagation();
                            onWordClick(token.replace(/[.,!?;:()"']/g, ''), e.clientX, e.clientY);
                        }}
                    >
                        {token}
                    </span>
                );
            }
            return <span key={i} className="text-slate-700">{token.replace(/\n/g, '')}</span>;
        });
    };

    return (
        <span
            className="hover:bg-yellow-50/50 rounded transition duration-300 relative inline"
            onClick={handleTranslate} // Keep fallback sentence click
        >
            {renderTokens()}

            {/* Explicit Translation Trigger Icon */}
            <span
                className="inline-flex items-center justify-center w-10 h-10 ml-2 bg-indigo-600 text-white rounded-full cursor-pointer hover:bg-indigo-700 transition shadow-lg z-20 select-none active:scale-95"
                style={{ verticalAlign: 'middle', display: 'inline-flex' }}
                onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleTranslate(e);
                }}
                title="Bu cümleyi çevir"
            >
                <span className="text-sm font-bold">
                    {sourceLang === 'tr' ? 'EN' : 'TR'}
                </span>
            </span>

            {(translation || loading) && (
                <span className="block my-2 p-3 bg-indigo-50 text-indigo-800 text-lg font-sans rounded-r-xl border-l-4 border-indigo-500 animate-scale-in select-text cursor-auto shadow-sm" onClick={e => e.stopPropagation()}>
                    {loading ? <i className="fas fa-spinner fa-spin text-indigo-400"></i> : <><i className="fas fa-language mr-2 text-indigo-400"></i> {translation}</>}
                </span>
            )}
            {" "}
        </span>
    );
};

interface StoryModeProps {
    notebookId: string;
}

const StoryMode: React.FC<StoryModeProps> = ({ notebookId }) => {
    const [stories, setStories] = useState<VocabStory[]>([]);
    const [words, setWords] = useState<VocabWord[]>([]);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [title, setTitle] = useState('');
    const [content, setContent] = useState('');

    // Viewer Language State
    const [viewLang, setViewLang] = useState<'original' | 'en' | 'de' | 'fr' | 'tr'>('original');
    const [translatedContent, setTranslatedContent] = useState<string | null>(null);
    const [isTranslatingStory, setIsTranslatingStory] = useState(false);

    // Selection Popover State
    const [popover, setPopover] = useState<{ x: number, y: number, text: string } | null>(null);
    const [translation, setTranslation] = useState<string | null>(null);
    const viewerRef = useRef<HTMLDivElement>(null);

    // Notebook Selection State
    const [allNotebooks, setAllNotebooks] = useState<{ id: string, title: string }[]>([]);
    const [targetNotebookId, setTargetNotebookId] = useState<string>(notebookId);

    // Feature State
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [showShareMenu, setShowShareMenu] = useState(false);
    const [isViewerEditing, setIsViewerEditing] = useState(false);

    // Mobile View State
    const [mobileView, setMobileView] = useState<'list' | 'viewer'>('list');

    // TTS State
    const [readingSpeed, setReadingSpeed] = useState(1.0);
    const [autoRead, setAutoRead] = useState(false);
    const [isReadingStory, setIsReadingStory] = useState(false);
    const synthesisRef = useRef<SpeechSynthesisUtterance | null>(null);

    useEffect(() => {
        loadData();
        loadNotebooks();
    }, [notebookId]);

    // DEEP LINKING: Check URL on mount
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const storyId = params.get('story');
        if (storyId && stories.length > 0) {
            const found = stories.find(s => s.id === storyId);
            if (found) {
                handleEdit(found, false); // Don't scroll, just open
            }
        }
    }, [stories]); // Run when stories load

    // DEEP LINKING: Update URL when opening story
    useEffect(() => {
        const url = new URL(window.location.href);
        if (editingId) {
            url.searchParams.set('story', editingId);
        } else {
            url.searchParams.delete('story');
        }
        window.history.replaceState({}, '', url.toString());
    }, [editingId]);

    // TTS SPEED: Restart if speed changes while reading
    useEffect(() => {
        if (isReadingStory) {
            // Restart with new speed
            window.speechSynthesis.cancel();
            speak(translatedContent || content);
        }
    }, [readingSpeed]);

    // When changing view lang, translate full story
    useEffect(() => {
        const fetchTranslation = async () => {
            if (viewLang === 'original') {
                setTranslatedContent(null);
                return;
            }
            if (!content) return;

            setIsTranslatingStory(true);
            try {
                // Split logic roughly:
                const cleanText = content.replace(/\n/g, ' ');
                // Use a larger chunk size but for safety lets fetch sentence by sentence or blocks
                // API MyMemory Limit: 500 chars/req strict.
                // We need to chunk it.

                const sentences = cleanText.match(/[^\.!\?]+[\.!\?]+|[^\.!\?]+$/g) || [cleanText];

                // Batch requests
                // Note: Heavy usage might hit limits.
                const translatedSentences = await Promise.all(
                    sentences.map(async (s) => {
                        if (s.length < 2) return s;
                        try {
                            // Assume source is auto (or we guess 'tr' if user said "I write TR")
                            // We translate TO matching viewLang
                            const res = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(s)}&langpair=Autodetect|${viewLang}`);
                            const json = await res.json();
                            return json.responseData.translatedText || s;
                        } catch (e) {
                            return s;
                        }
                    })
                );

                setTranslatedContent(translatedSentences.join(' '));

            } catch (e) {
                console.error("Story translation error", e);
            } finally {
                setIsTranslatingStory(false);
            }
        };

        // Debounce or just run?
        fetchTranslation();

    }, [viewLang]); // Only run when viewLang changes

    const loadNotebooks = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
            const nbs = await DBService.getNotebooks(user.id);
            setAllNotebooks(nbs);
            setTargetNotebookId(notebookId);
        }
    };

    // Clear popover on click outside
    useEffect(() => {
        const handleClick = () => {
            setPopover(null);
            setShowShareMenu(false);
        };
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
        if (!title.trim() || !content.trim()) {
            alert("Lütfen hem 'Hikaye Başlığı' hem de 'Hikaye İçeriği' alanlarını doldurunuz.");
            return;
        }
        let success = false;
        try {
            if (editingId) {
                const res = await DBService.updateStory(editingId, title, content);
                success = !!res;
            } else {
                const res = await DBService.createStory(notebookId, title, content);
                success = !!res;
            }

            if (success) {
                setIsViewerEditing(false);
                setViewLang('original'); // Reset view on save
                loadData();
                setMobileView('viewer'); // Switch to viewer on save
            }
        } catch (e: any) {
            alert(`Hata: ${e.message}`);
        }
    };

    const handleEdit = (story: VocabStory, scrollTo = true) => {
        setEditingId(story.id);
        setTitle(story.title);
        setContent(story.content);
        setMobileView('viewer'); // Switch to viewer
        if (scrollTo) window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Hikayeyi silmek istiyor musunuz?')) return;
        await DBService.deleteStory(id);
        const newStories = stories.filter(s => s.id !== id);
        setStories(newStories);
        if (editingId === id) {
            setEditingId(null);
            setTitle('');
            setContent('');
            setMobileView('list');
        }
    };

    // Word Interaction
    const handleMouseUp = () => {
        // Logic moved to InteractiveSentence's onWordClick mostly, 
        // but here we can keep selection logic for non-tokenized parts if needed.
    };

    const handleAddWord = async () => {
        if (!popover) return;
        // Add to vocab
        // Source depends on viewLang!
        // If viewLang is DE, we are adding a DE word.
        const lang = viewLang === 'original' ? 'en' : viewLang; // Default to en if original?

        await DBService.addNotebookWord(notebookId, popover.text, translation || '', lang);
        setPopover(null);
        setTranslation(null);
        loadData();
        alert("Kelime eklendi!");
    };

    const handleTranslateWord = async () => {
        if (!popover) return;
        setTranslation('Çevriliyor...');
        try {
            // Translate the clicked word from [CurrentLang] to TR
            let src = viewLang === 'original' ? 'en' : viewLang;
            if (viewLang === 'tr') src = 'tr'; // if viewing in TR, maybe translate to EN?
            const pair = src === 'tr' ? 'tr|en' : `${src}|tr`;

            const res = await fetch(`https://api.mymemory.translated.net/get?q=${popover.text}&langpair=${pair}`);
            const data = await res.json();
            if (data.responseData.translatedText) {
                setTranslation(data.responseData.translatedText);
            }
        } catch (e) {
            setTranslation('Hata.');
        }
    };

    const handleReadWholeStory = () => {
        if (isReadingStory) {
            window.speechSynthesis.cancel();
            setIsReadingStory(false);
            return;
        }

        const textToRead = translatedContent || content;
        if (!textToRead) return;

        speak(textToRead);
        setIsReadingStory(true);
    };

    const exportPDF = () => {
        const doc = new jsPDF();
        doc.text(title, 10, 10);
        doc.text(content, 10, 20); // TODO: Wrap text
        doc.save(`${title}.pdf`);
    };

    const exportWord = () => {
        const doc = new Document({
            sections: [{
                properties: {},
                children: [
                    new Paragraph({ text: title, heading: HeadingLevel.HEADING_1 }),
                    new Paragraph({ text: content })
                ],
            }],
        });
        Packer.toBlob(doc).then(blob => {
            saveAs(blob, `${title}.docx`);
        });
    };

    const shareStory = (platform: string) => {
        // DEEP LINKING: Use URL which now has ?story=ID
        const url = window.location.href;
        const text = `Hikaye: ${title}\n\n${content}\n\nOku: ${url}`;

        if (platform === 'twitter') window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`);
        if (platform === 'whatsapp') window.open(`https://wa.me/?text=${encodeURIComponent(text)}`);
        if (platform === 'telegram') window.open(`https://t.me/share/url?url=${url}&text=${encodeURIComponent(text)}`);
        if (platform === 'copy') {
            // Copy URL only or full text? User requested "Link paylaşma".
            // Let's copy the URL primarily for sharing context.
            navigator.clipboard.writeText(url);
            alert("Hikaye Linki Kopyalandı!");
        }
        setShowShareMenu(false);
    };

    const speak = (text: string) => {
        if ('speechSynthesis' in window) {
            // Cancel current speaking if any
            window.speechSynthesis.cancel();

            const u = new SpeechSynthesisUtterance(text);
            u.rate = readingSpeed; // Use the user's selected speed

            // Determine language based on current view
            let lang = 'en-US';
            if (viewLang === 'de') lang = 'de-DE';
            else if (viewLang === 'fr') lang = 'fr-FR';
            else if (viewLang === 'tr') lang = 'tr-TR';
            // If original, we default to EN, but ideally should match notebook lang potentially? 
            // For now assuming Original = English as per app context.

            u.lang = lang;

            u.onend = () => setIsReadingStory(false); // Update state when done

            window.speechSynthesis.speak(u);
        }
    };

    return (
        <div className={`flex flex-col md:flex-row gap-6 ${isFullscreen ? 'h-screen' : 'h-[calc(100vh-200px)]'}`}>

            {/* Popover */}
            {popover && (() => {
                const arrowStyle: React.CSSProperties = {
                    position: 'absolute',
                    width: '0',
                    height: '0',
                    borderLeft: '8px solid transparent',
                    borderRight: '8px solid transparent',
                    borderTop: '8px solid white',
                    bottom: '-8px',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    filter: 'drop-shadow(0 2px 1px rgba(0,0,0,0.05))'
                };

                const popoverStyle: React.CSSProperties = {
                    position: 'fixed',
                    left: popover.x,
                    top: popover.y - 10,
                    transform: 'translate(-50%, -100%)',
                    zIndex: 9999
                };

                return (
                    <div className="bg-white rounded-lg shadow-xl border border-slate-200 p-3 flex flex-col gap-2 min-w-[160px] animate-scale-in" style={popoverStyle} onMouseDown={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                            <span className="font-bold text-slate-800">{popover.text}</span>
                            <button onClick={() => setPopover(null)} className="text-slate-400 hover:text-slate-600"><i className="fas fa-times"></i></button>
                        </div>
                        <div className="flex gap-2">
                            <button
                                onClick={handleTranslateWord}
                                className="bg-blue-600 hover:bg-blue-500 px-3 py-1 rounded text-sm flex items-center gap-2 text-white"
                            >
                                <i className="fas fa-language"></i> Çevir
                            </button>
                            <button
                                onClick={handleAddWord}
                                className="bg-green-600 hover:bg-green-500 px-3 py-1 rounded text-sm flex items-center gap-2 text-white"
                            >
                                <i className="fas fa-plus"></i> Ekle
                            </button>
                        </div>
                        {translation && (
                            <div className="text-xs text-center border-t border-slate-100 pt-2 mt-1 w-full text-slate-700 font-medium">
                                {translation}
                            </div>
                        )}
                        <div style={arrowStyle}></div>
                    </div>
                );
            })()}

            {/* Left: Story List & Editor */}
            {/* MOBILE LAYOUT: Show only if in 'list' mode OR strictly on desktop (hidden on mobile if viewer active) */}
            <div className={`flex flex-col gap-4 h-full ${isFullscreen ? 'hidden' : 'w-full md:w-1/3 min-h-[400px]'} ${mobileView === 'viewer' ? 'hidden md:flex' : 'flex'}`}>
                {/* Editor */}
                <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex-1 flex flex-col">
                    <div className="flex justify-between items-center mb-4">
                        <input
                            type="text"
                            placeholder="Hikaye Başlığı"
                            className="w-full text-lg font-bold p-2 border-b border-transparent focus:border-blue-500 outline-none"
                            value={title}
                            onChange={e => setTitle(e.target.value)}
                        />
                        {editingId && (
                            <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-1 rounded ml-2 whitespace-nowrap">
                                Düzenleniyor
                            </span>
                        )}
                    </div>

                    <textarea
                        className="w-full flex-1 p-2 resize-none outline-none text-slate-700 leading-relaxed min-h-[200px]"
                        placeholder="Hikayeni buraya yaz..."
                        value={content}
                        onChange={e => setContent(e.target.value)}
                    />
                    <div className="flex justify-between pt-4">
                        {editingId && (
                            <button
                                onClick={() => { setEditingId(null); setTitle(''); setContent(''); setMobileView('list'); }}
                                className="text-slate-500 text-sm hover:underline"
                            >
                                Yeni Hikaye
                            </button>
                        )}
                        <div className="flex-1"></div>
                        <button
                            id="save-btn"
                            onClick={handleSave}
                            className={`bg-green-600 text-white px-6 py-2 rounded-lg font-bold hover:bg-green-700 transition ${(!title || !content) ? 'opacity-70' : 'opacity-100'}`}
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
                            <div key={s.id} className={`flex justify-between items-center p-2 rounded cursor-pointer group transition ${editingId === s.id ? 'bg-blue-50 border border-blue-200' : 'hover:bg-slate-50'}`} onClick={() => handleEdit(s)}>
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

            {/* Right: Interactive Viewer / Editor */}
            {/* MOBILE LAYOUT: Show only if in 'viewer' mode OR desktop */}
            <div
                ref={viewerRef}
                className={`bg-slate-50 p-4 rounded-xl border border-slate-200 shadow-inner overflow-hidden flex flex-col 
                ${isFullscreen ? 'fixed inset-0 z-50 bg-slate-50 p-0 rounded-none' : 'flex-1 h-full min-h-[400px]'}
                ${mobileView === 'viewer' ? 'flex' : 'hidden md:flex'}
                `}
            >
                {/* Toolbar */}
                <div className={`flex justify-end gap-2 mb-4 border-b border-slate-200 pb-2 ${isFullscreen ? 'p-4 bg-white shadow-sm' : ''}`}>

                    {/* MOBILE BACK BUTTON */}
                    <button
                        className="md:hidden mr-2 text-slate-500 hover:text-blue-600"
                        onClick={() => setMobileView('list')}
                        title="Listeye Dön"
                    >
                        <i className="fas fa-arrow-left"></i>
                    </button>

                    {/* Language Switcher */}
                    {!isViewerEditing && (
                        <div className="flex items-center gap-1 mr-auto bg-white rounded-lg p-1 border border-slate-200 overflow-x-auto max-w-[200px] md:max-w-none no-scrollbar">
                            {[
                                { id: 'original', label: 'Orijinal' },
                                { id: 'en', label: '🇬🇧 EN' },
                                { id: 'de', label: '🇩🇪 DE' },
                                { id: 'fr', label: '🇫🇷 FR' },
                                { id: 'tr', label: '🇹🇷 TR' }
                            ].map(opt => (
                                <button
                                    key={opt.id}
                                    onClick={() => setViewLang(opt.id as any)}
                                    className={`px-3 py-1 rounded text-xs font-bold transition whitespace-nowrap ${viewLang === opt.id ? 'bg-slate-800 text-white' : 'text-slate-500 hover:bg-slate-100'}`}
                                >
                                    {opt.label}
                                </button>
                            ))}
                        </div>
                    )}

                    {/* EDIT CONTROLS */}
                    {isViewerEditing ? (
                        <>
                            <button
                                id="fullscreen-save-btn"
                                onClick={handleSave}
                                className="bg-green-600 hover:bg-green-700 text-white px-4 py-1 rounded text-sm font-bold flex items-center gap-2 animate-pulse"
                            >
                                <i className="fas fa-save"></i> Kaydet
                            </button>
                            <button onClick={() => setIsViewerEditing(false)} className="text-slate-500 hover:text-slate-700 px-3 py-1 rounded hover:bg-slate-200 transition">
                                İptal
                            </button>
                            <div className="w-px bg-slate-300 mx-1 h-6 self-center"></div>
                        </>
                    ) : (
                        <button onClick={() => setIsViewerEditing(true)} className="text-slate-400 hover:text-blue-600 p-2 rounded hover:bg-blue-50 transition" title="Düzenle">
                            <i className="fas fa-pen"></i>
                        </button>
                    )}

                    {/* TTS Controls */}
                    <div className="flex items-center gap-2 border-r border-slate-300 pr-2 mr-2">
                        <button
                            onClick={handleReadWholeStory}
                            className={`p-2 rounded transition ${isReadingStory ? 'text-red-600 bg-red-50 hover:bg-red-100' : 'text-slate-500 hover:text-green-600 hover:bg-green-50'}`}
                            title={isReadingStory ? "Okumayı Durdur" : "Tüm Hikayeyi Oku"}
                        >
                            <i className={`fas ${isReadingStory ? 'fa-stop-circle' : 'fa-play-circle'} text-lg`}></i>
                        </button>

                        <div className="flex flex-col items-center gap-0 w-24">
                            <span className="text-[10px] text-slate-400 font-bold uppercase">Hız: {readingSpeed}x</span>
                            <input
                                type="range"
                                min="0.5"
                                max="1.5"
                                step="0.1"
                                value={readingSpeed}
                                onChange={(e) => setReadingSpeed(parseFloat(e.target.value))}
                                className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                            />
                        </div>

                        <button
                            onClick={() => setAutoRead(!autoRead)}
                            className={`p-2 rounded transition text-xs font-bold flex flex-col items-center leading-none ${autoRead ? 'text-blue-600 bg-blue-50' : 'text-slate-400 hover:bg-slate-50'}`}
                            title="Cümleye tıklayınca otomatik oku"
                        >
                            <i className={`fas ${autoRead ? 'fa-check-square' : 'fa-square'} mb-1`}></i>
                            <span className="hidden md:inline">Oto-Ses</span>
                        </button>
                    </div>

                    <div className="relative">
                        <button
                            onClick={(e) => { e.stopPropagation(); setShowShareMenu(!showShareMenu); }}
                            className="text-slate-400 hover:text-blue-600 p-2 rounded hover:bg-blue-50 transition" title="Paylaş">
                            <i className="fas fa-share-alt"></i>
                        </button>

                        {/* Share Menu */}
                        {showShareMenu && (
                            <div className="absolute right-0 top-full mt-2 w-40 bg-white shadow-xl rounded-xl border border-slate-100 z-50 p-1 flex flex-col animate-fade-in" onMouseDown={e => e.stopPropagation()}>
                                <button onClick={() => shareStory('twitter')} className="px-3 py-2 text-left hover:bg-slate-50 rounded text-sm font-bold text-slate-700 flex items-center gap-2">
                                    <i className="fab fa-twitter text-blue-400"></i> X / Twitter
                                </button>
                                <button onClick={() => shareStory('whatsapp')} className="px-3 py-2 text-left hover:bg-slate-50 rounded text-sm font-bold text-slate-700 flex items-center gap-2">
                                    <i className="fab fa-whatsapp text-green-500"></i> WhatsApp
                                </button>
                                <button onClick={() => shareStory('telegram')} className="px-3 py-2 text-left hover:bg-slate-50 rounded text-sm font-bold text-slate-700 flex items-center gap-2">
                                    <i className="fab fa-telegram text-blue-500"></i> Telegram
                                </button>
                                <button onClick={() => shareStory('copy')} className="px-3 py-2 text-left hover:bg-slate-50 rounded text-sm font-bold text-slate-700 flex items-center gap-2">
                                    <i className="fas fa-link text-slate-500"></i> Linki Kopyala
                                </button>
                            </div>
                        )}
                    </div>

                    <button onClick={exportPDF} className="text-slate-400 hover:text-red-600 p-2 rounded hover:bg-red-50 transition" title="PDF İndir">
                        <i className="fas fa-file-pdf"></i>
                    </button>
                    <button onClick={exportWord} className="text-slate-400 hover:text-blue-700 p-2 rounded hover:bg-blue-50 transition" title="Word İndir">
                        <i className="fas fa-file-word"></i>
                    </button>
                    <div className="w-px bg-slate-300 mx-1 h-6 self-center"></div>
                    <button onClick={() => setIsFullscreen(!isFullscreen)} className="text-slate-400 hover:text-slate-800 p-2 rounded hover:bg-slate-200 transition" title="Tam Ekran">
                        <i className={`fas ${isFullscreen ? 'fa-compress' : 'fa-expand'}`}></i>
                    </button>
                </div>

                {/* Book Page Container */}
                <div className="flex-1 overflow-auto flex justify-center items-start pb-10">
                    {title || content ? (
                        <article className={`bg-white shadow-sm border border-slate-100 p-8 md:p-12 max-w-[800px] w-full mx-auto transition-all ${isFullscreen ? 'shadow-2xl my-4 min-h-[calc(100vh-100px)]' : 'min-h-full'}`}>

                            {isViewerEditing ? (
                                // EDIT MODE IN VIEWER
                                <div className="flex flex-col h-full gap-4">
                                    <input
                                        type="text"
                                        placeholder="Hikaye Başlığı"
                                        className="w-full text-3xl font-bold text-slate-800 text-center font-serif tracking-wide border-b border-dashed border-slate-300 pb-2 focus:border-blue-500 outline-none bg-transparent"
                                        value={title}
                                        onChange={e => setTitle(e.target.value)}
                                    />
                                    <textarea
                                        className="w-full flex-1 p-2 resize-none outline-none text-xl leading-loose text-slate-800 font-serif bg-transparent"
                                        placeholder="Hikayeni buraya yaz..."
                                        value={content}
                                        onChange={e => setContent(e.target.value)}
                                    />
                                </div>
                            ) : (
                                // READ MODE
                                <>
                                    <div className="mb-4 text-center">
                                        <h2 className="text-3xl font-bold text-slate-800 font-serif tracking-wide">{title || 'Başlıksız Hikaye'}</h2>
                                        <p className="text-xs text-slate-400 mt-2">Cümlelerin üzerine tıklayarak çevirisini görebilirsiniz.</p>
                                    </div>

                                    {isTranslatingStory ? (
                                        <div className="flex flex-col items-center justify-center py-20 gap-4 text-slate-400">
                                            <i className="fas fa-circle-notch fa-spin text-4xl text-blue-500"></i>
                                            <p>Hikaye Çevriliyor...</p>
                                        </div>
                                    ) : (
                                        <div className="text-xl leading-loose text-slate-800 font-serif break-words text-justify">
                                            {(() => {
                                                const activeText = (viewLang !== 'original' && translatedContent) ? translatedContent : content;
                                                const sentences = activeText.match(/[^\.!\?]+[\.!\?]+|[^\.!\?]+$/g) || [activeText];

                                                // Filter words based on viewLang?
                                                // If viewLang is DE, show DE words. If Original/EN, show EN words.
                                                // Default logic:
                                                const targetLangForWords = viewLang === 'original' ? 'en' : viewLang;
                                                const activeWords = words.filter(w => (w.language || 'en') === targetLangForWords);

                                                return sentences.map((sentence, index) => (
                                                    <InteractiveSentence
                                                        key={index}
                                                        text={sentence}
                                                        words={activeWords}
                                                        speak={speak}
                                                        autoRead={autoRead}
                                                        onWordClick={(text, x, y) => {
                                                            setPopover({ x, y, text });
                                                            setTranslation(null);
                                                        }}
                                                        sourceLang={viewLang === 'original' ? 'en' : viewLang}
                                                    />
                                                ));
                                            })()}
                                        </div>
                                    )}
                                </>
                            )}

                        </article>
                    ) : (
                        <div className="h-full flex flex-col items-center justify-center text-slate-400">
                            <button onClick={() => setIsViewerEditing(true)} className="flex flex-col items-center gap-2 hover:text-blue-600 transition">
                                <i className="fas fa-plus-circle text-4xl mb-2"></i>
                                <span>Yeni Hikaye Yaz</span>
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default StoryMode;
