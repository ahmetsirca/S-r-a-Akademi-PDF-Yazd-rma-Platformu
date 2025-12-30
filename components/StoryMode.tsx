import React, { useState, useEffect, useRef } from 'react';
import { VocabStory, VocabWord } from '../types';
import { DBService } from '../services/db';
import { supabase } from '../services/supabase';
import { jsPDF } from 'jspdf';
import { Document, Packer, Paragraph, HeadingLevel } from 'docx';
import { saveAs } from 'file-saver';

// Sub-component for Interactive Sentence (Moved to top or bottom, fine at top for usage)
// Sub-component for Interactive Sentence
const InteractiveSentence: React.FC<{
    text: string,
    words: VocabWord[],
    speak: (t: string) => void,
    autoRead: boolean,
    onWordClick: (text: string, x: number, y: number) => void // New Prop
}> = ({ text, words, speak, autoRead, onWordClick }) => {
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

    // Improved Match Logic with Suffix Support
    const findMatch = (rawToken: string) => {
        const clean = rawToken.replace(/[.,!?;:()"']/g, '').trim();
        if (!clean) return null;

        const lower = clean.toLocaleLowerCase('tr-TR');
        const enLower = clean.toLowerCase();

        // 1. Exact Match
        let match = words.find(w => w.term.toLowerCase() === lower || w.term.toLowerCase() === enLower);
        if (match) return match;

        // 2. English Suffix Check
        match = words.find(w => {
            const term = w.term.toLowerCase();
            if (enLower === term + 's') return true;
            if (enLower === term + 'es') return true;
            if (enLower === term + 'd') return true;
            if (enLower === term + 'ed') return true;
            if (enLower === term + 'ing') return true;
            if (enLower === term + 'ly') return true;
            if (enLower === term + 'ies') return true;
            if (enLower.endsWith('ies') && term.endsWith('y')) {
                if (enLower.slice(0, -3) === term.slice(0, -1)) return true;
            }
            return false;
        });

        return match;
    };

    const renderTokens = () => {
        const tokens = text.split(/(\s+|[.,!?;])/);
        return tokens.map((token, i) => {
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
            // Only make "word-like" tokens clickable
            if (token.trim() && !/^[.,!?;:()"'\s]+$/.test(token)) {
                return (
                    <span
                        key={i}
                        className="hover:text-blue-500 hover:bg-yellow-100 transition cursor-pointer select-none"
                        onClick={(e) => {
                            e.stopPropagation();
                            // Use e.clientX/Y for fixed calculation in StoryMode proper
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

            {/* Explicit Translation Trigger Icon - Mobile Friendly Target */}
            <span
                className="inline-flex items-center justify-center w-6 h-6 ml-1 bg-indigo-100 text-indigo-600 rounded-full cursor-pointer hover:bg-indigo-200 transition text-xs align-middle shadow-sm z-10 active:scale-95"
                onClick={(e) => {
                    e.stopPropagation(); // Prevent double trigger
                    handleTranslate(e);
                }}
                title="Bu cümleyi çevir"
            >
                <i className="fas fa-language"></i>
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

    // TTS State
    const [readingSpeed, setReadingSpeed] = useState(1.0);
    const [autoRead, setAutoRead] = useState(false);
    const [isReadingStory, setIsReadingStory] = useState(false);
    const synthesisRef = useRef<SpeechSynthesisUtterance | null>(null);

    useEffect(() => {
        loadData();
        loadNotebooks();
    }, [notebookId]);

    const loadNotebooks = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
            const nbs = await DBService.getNotebooks(user.id);
            setAllNotebooks(nbs);
            setTargetNotebookId(notebookId); // Reset to current when notebook changes
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

        console.log(`[StoryMode] Attempting save. NotebookID: ${notebookId}, Title: ${title}`);

        if (!notebookId) {
            alert("HATA: Defter ID bulunamadı (notebookId is null). Lütfen sayfayı yenileyip tekrar deneyin.");
            return;
        }

        try {
            if (editingId) {
                console.log("Updating story...", editingId);
                const res = await DBService.updateStory(editingId, title, content);
                success = !!res;
            } else {
                console.log("Creating new story...");
                const res = await DBService.createStory(notebookId, title, content);

                // Detailed Debug Check
                if (!res) {
                    throw new Error("DBService.createStory returned null without throwing. Check console or network tab.");
                }
                success = true;
            }

            if (success) {
                // Visual feedback
                const btn = document.getElementById('save-btn');
                const fullscreenBtn = document.getElementById('fullscreen-save-btn');

                const showSuccess = (element: HTMLElement | null) => {
                    if (element) {
                        const originalText = element.innerText;
                        element.innerText = 'Kaydedildi! ✓';
                        const originalBg = element.style.backgroundColor;
                        element.style.backgroundColor = '#16a34a';
                        setTimeout(() => {
                            element.innerText = originalText;
                            element.style.backgroundColor = originalBg;
                        }, 2000);
                    }
                };

                showSuccess(btn);
                showSuccess(fullscreenBtn);

                if (!editingId) {
                    // Only clear if not editing, OR if we want to reset after update?
                    // User might want to keep editing after save.
                    // Let's keep it for now but maybe change UX later.
                    // Actually usually after save we want to keep editing the same doc.
                }
                setIsViewerEditing(false); // Exit edit mode after save
                loadData();
            }
        } catch (e: any) {
            console.error("Save Story Error Detail:", e);

            // Analyze Error Message for common Supabase/Postgres codes
            const msg = e.message || JSON.stringify(e);

            if (msg.includes("row level security") || msg.includes("policy")) {
                alert("İZİN HATASI: Veritabanı güvenlik politikası (RLS) yazmayı engelliyor.\n\nÇÖZÜM: 'repair_vocab_permissions.sql' dosyasını çalıştırın.");
            } else if (msg.includes("foreign key constraint") || msg.includes("violates foreign key")) {
                alert(`VERİ TUTARSIZLIĞI HATASI:\n\nBu hikayeyi eklemeye çalıştığınız Defter (ID: ${notebookId}) veritabanında bulunamadı.\n\nBu durum, defteri sildiyseniz veya senkronizasyon hatası olduysa yaşanır. Lütfen ana sayfaya dönüp tekrar deneyin.`);
            } else {
                alert(`TEKNİK HATA OLUŞTU:\n\nMesaj: ${msg}\n\nLütfen bu hatayı geliştiriciye iletin.`);
            }
        }
    };

    const handleEdit = (story: VocabStory) => {
        setEditingId(story.id);
        setTitle(story.title);
        setContent(story.content);
        // Scroll to editor on mobile (or open viewer if fullscreen logic was different, but here standard)
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Hikayeyi silmek istiyor musunuz?')) return;
        await DBService.deleteStory(id);
        setStories(stories.filter(s => s.id !== id));
        if (editingId === id) {
            setEditingId(null);
            setTitle('');
            setContent('');
        }
    };

    const speak = (text: string) => {
        if ('speechSynthesis' in window) {
            window.speechSynthesis.cancel(); // Stop previous
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.lang = 'en-US';
            utterance.rate = readingSpeed;
            window.speechSynthesis.speak(utterance);
        }
    };

    const handleReadWholeStory = () => {
        if (isReadingStory) {
            window.speechSynthesis.cancel();
            setIsReadingStory(false);
            return;
        }

        if (!content) return;

        setIsReadingStory(true);
        const utterance = new SpeechSynthesisUtterance(content);
        utterance.lang = 'en-US';
        utterance.rate = readingSpeed;
        utterance.onend = () => setIsReadingStory(false);
        utterance.onerror = () => setIsReadingStory(false);

        synthesisRef.current = utterance;
        window.speechSynthesis.speak(utterance);
    };

    // Stop speaking when unmounting
    useEffect(() => {
        return () => {
            window.speechSynthesis.cancel();
        };
    }, []);

    // --- EXPORT FEATURES ---
    const exportPDF = () => {
        const doc = new jsPDF();

        // Font setup (Basic, for serious Turkish support need custom font in jsPDF but default supports basics usually)
        doc.setFont("helvetica", "bold");
        doc.setFontSize(20);
        doc.text(title || 'Adsız Hikaye', 105, 20, { align: 'center' });

        doc.setFont("helvetica", "normal");
        doc.setFontSize(12);

        const splitText = doc.splitTextToSize(content, 170);
        doc.text(splitText, 20, 40);

        doc.save(`${title || 'hikaye'}.pdf`);
    };

    const exportWord = () => {
        const doc = new Document({
            sections: [{
                properties: {},
                children: [
                    new Paragraph({
                        text: title || 'Adsız Hikaye',
                        heading: HeadingLevel.HEADING_1,
                    }),
                    new Paragraph({
                        text: content,
                        spacing: { before: 400 }
                    }),
                ],
            }],
        });

        Packer.toBlob(doc).then(blob => {
            saveAs(blob, `${title || 'hikaye'}.docx`);
        });
    };

    const shareStory = (platform: string) => {
        if (!editingId && !title) {
            alert("Paylaşmak için önce bir hikaye seçin veya kaydedin.");
            return;
        }
        // Use editingId if available, otherwise we can't share a new unsaved story.
        // If editingId is null, user is writing a NEW story.
        if (!editingId) {
            alert("Lütfen önce hikayeyi kaydedin.");
            return;
        }

        const shareText = `"${title}" - Sırça Akademi'de yazdığım hikayeyi oku!`;
        const shareUrl = `${window.location.origin}/#/story/${editingId}`;

        let url = '';
        switch (platform) {
            case 'twitter':
                url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`;
                break;
            case 'whatsapp':
                url = `https://wa.me/?text=${encodeURIComponent(shareText + ' ' + shareUrl)}`;
                break;
            case 'telegram':
                url = `https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(shareText)}`;
                break;
            case 'copy':
                navigator.clipboard.writeText(`${shareText} ${shareUrl}`);
                alert("Link kopyalandı!");
                return;
        }

        if (url) window.open(url, '_blank');
        setShowShareMenu(false);
    };


    // Handle Text Selection (Disabled in Edit Mode)
    const handleMouseUp = (e: React.MouseEvent) => {
        if (isViewerEditing) return; // Retrieve normal text behavior when editing

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
                text: selection.toString() // Standard coordinate, will be fixed by viewer
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

    const handleAddWord = async () => {
        if (!popover || !notebookId) return;
        const term = popover.text.trim();
        if (!term) return;

        // Auto translate for definition
        let def = '...';
        try {
            const res = await fetch(`https://api.mymemory.translated.net/get?q=${term}&langpair=en|tr`);
            const data = await res.json();
            if (data.responseData.translatedText) {
                def = data.responseData.translatedText;
            }
        } catch (e) {
            console.error("Trans fail", e);
        }

        // Use targetNotebookId instead of prop
        const res = await DBService.addNotebookWord(targetNotebookId, term, def);
        if (res) {
            // Optimistically update highlighting IF we added to the CURRENT notebook
            if (targetNotebookId === notebookId) {
                setWords(prev => [res, ...prev]);
            }
            setPopover(null);

            // Show toast
            const toast = document.createElement('div');
            toast.className = 'fixed bottom-4 right-4 bg-green-600 text-white px-4 py-2 rounded shadow-lg z-50 animate-fade-in';
            toast.innerText = `"${term}" eklendi!`;
            document.body.appendChild(toast);
            setTimeout(() => toast.remove(), 2000);
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
        <div className={`grid md:grid-cols-2 gap-6 relative transition-all duration-300 ${isFullscreen ? 'fixed inset-0 z-50 bg-white p-6' : 'h-auto md:h-[600px]'}`}>
            {/* Popover */}
            {popover && !isViewerEditing && (() => {
                // Smart Positioning Logic
                const screenW = window.innerWidth;
                const isRightEdge = popover.x > screenW * 0.6; // If click is in the right 40%
                const isLeftEdge = popover.x < screenW * 0.4;  // If click is in the left 40%

                let containerStyle: React.CSSProperties = { top: popover.y };
                let containerClass = "fixed z-[9999] bg-slate-800 text-white p-2 rounded-lg shadow-xl flex flex-col items-center gap-2 animate-fade-in";
                let arrowStyle: React.CSSProperties = {};
                let arrowClass = "absolute top-full border-8 border-transparent border-t-slate-800";

                if (isRightEdge) {
                    // Align to Right
                    containerStyle = { ...containerStyle, right: Math.max(10, screenW - popover.x - 100), left: 'auto', transform: 'translateY(-100%)' };
                    // Wait, popover.y is usually top coordinate, we want it ABOVE the word? 
                    // Previous logic: transform -translate-y-full (which is present in class lists usually or managed manually)
                    // Let's check original generic style: transform -translate-x-1/2 -translate-y-full

                    // Let's stick to standard "left" clamping
                    // Clamp Left: min(max(10, x - width/2), screenW - width - 10)
                    // But width is dynamic.

                    // Simpler Relative Approach:
                    containerStyle = { ...containerStyle, top: popover.y, transform: 'translateY(-100%)' };
                    // We will set LEFT and avoid translate-x for edge cases

                    containerStyle.right = '10px';
                    containerStyle.left = 'auto';

                    // Arrow needs to point to popover.x
                    // Popover is at Right 10px. Width is approx 200px?
                    // We can calc arrow offset from RIGHT.
                    // ArrowRight = ScreenWidth - PopoverX.
                    arrowStyle = { right: (screenW - popover.x - 10) + 'px' };
                    arrowClass += " right-0"; // Reset left
                } else if (isLeftEdge) {
                    containerStyle = { ...containerStyle, top: popover.y, transform: 'translateY(-100%)' };
                    containerStyle.left = '10px';
                    containerStyle.right = 'auto';

                    // Arrow Left = PopoverX - 10px
                    arrowStyle = { left: (popover.x - 10) + 'px' };
                } else {
                    // Center (Default)
                    containerStyle = { ...containerStyle, left: popover.x, top: popover.y, transform: 'translate(-50%, -100%)' };
                    arrowClass += " left-1/2 -translate-x-1/2";
                }

                return (
                    <div
                        className={containerClass}
                        style={containerStyle}
                        onMouseDown={(e) => e.stopPropagation()}
                    >
                        {/* Notebook Selector */}
                        {allNotebooks.length > 0 && (
                            <select
                                value={targetNotebookId}
                                onChange={e => setTargetNotebookId(e.target.value)}
                                className="bg-slate-700 text-xs border border-slate-600 rounded p-1 mb-2 w-full outline-none text-white max-w-[200px]"
                                onClick={e => e.stopPropagation()}
                            >
                                {allNotebooks.map(nb => (
                                    <option key={nb.id} value={nb.id}>{nb.title}</option>
                                ))}
                            </select>
                        )}

                        <div className="flex gap-2">
                            <button
                                onClick={() => speak(popover.text)}
                                className="bg-slate-700 hover:bg-slate-600 px-3 py-1 rounded text-sm flex items-center gap-2"
                            >
                                <i className="fas fa-volume-up"></i>
                            </button>
                            <button
                                onClick={handleTranslateSelection}
                                className="bg-blue-600 hover:bg-blue-500 px-3 py-1 rounded text-sm flex items-center gap-2"
                            >
                                <i className="fas fa-language"></i> Çevir
                            </button>
                            <button
                                onClick={handleAddWord}
                                className="bg-green-600 hover:bg-green-500 px-3 py-1 rounded text-sm flex items-center gap-2"
                            >
                                <i className="fas fa-plus"></i> Ekle
                            </button>
                        </div>
                        {translation && (
                            <div className="text-xs text-center border-t border-slate-600 pt-2 mt-1 w-full max-w-[200px]">
                                {translation}
                            </div>
                        )}
                        {/* Triangle */}
                        <div className={arrowClass} style={arrowStyle}></div>
                    </div>
                );
            })()}

            {/* Left: Story List & Editor */}
            <div className={`flex flex-col gap-4 h-full ${isFullscreen ? 'hidden' : 'min-h-[400px]'}`}>
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
                        placeholder="Hikayeni buraya yaz... Kullandığın kelimeler otomatik olarak vurgulanacak."
                        value={content}
                        onChange={e => setContent(e.target.value)}
                    />
                    <div className="flex justify-between pt-4">
                        {editingId && (
                            <button
                                onClick={() => { setEditingId(null); setTitle(''); setContent(''); }}
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
            <div
                ref={viewerRef}
                onMouseUp={handleMouseUp}
                className={`bg-slate-100/50 p-4 rounded-xl border border-slate-200 shadow-inner overflow-hidden flex flex-col ${isFullscreen ? 'fixed inset-0 z-50 bg-slate-100 p-0 rounded-none' : 'h-full min-h-[400px]'}`}
            >
                {/* Toolbar */}
                <div className={`flex justify-end gap-2 mb-4 border-b border-slate-200 pb-2 ${isFullscreen ? 'p-4 bg-white shadow-sm' : ''}`}>

                    {/* EDIT CONTROLS IN VIEWER */}
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
                            <span>Oto-Ses</span>
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
                                        <p className="text-xs text-slate-400 mt-2">Cümlelerin üzerine tıklayarak Türkçe çevirisini görebilirsiniz.</p>
                                    </div>

                                    <div
                                        className="text-xl leading-loose text-slate-800 font-serif break-words text-justify"
                                    // Specific handler for sentence clicks to avoid conflict with text selection
                                    // We use logic: if selection exists, popover shows. If click without selection, sentence translation shows.
                                    >
                                        {(() => {
                                            // Split by sentence terminators but keep them
                                            // Regex lookbehind/lookahead might be complex for split, so we use a simple match
                                            // Split by (. ! ?) but keep delimiter
                                            const sentences = content.match(/[^\.!\?]+[\.!\?]+|[^\.!\?]+$/g) || [content];

                                            // State for toggled translations is needed per sentence?
                                            // We can't use useState inside mapping. 
                                            // We need a wrapper component or manage a list of "expandedSentenceIndices" in parent.
                                            // Let's use a parent state: `const [expandedSentences, setExpandedSentences] = useState<number[]>([]);`
                                            // But wait, I can't add state inside this render block.
                                            // I need to refactor this render logic OR use a small sub-component.
                                            // For speed/simplicity in this file, I'll use a sub-component defined outside or just manage state in StoryMode.

                                            return sentences.map((sentence, index) => (
                                                <InteractiveSentence
                                                    key={index}
                                                    text={sentence}
                                                    words={words}
                                                    speak={speak}
                                                    autoRead={autoRead}
                                                    onWordClick={(text, x, y) => {
                                                        // Explicit interaction override
                                                        setPopover({ x, y, text });
                                                        setTranslation(null);
                                                    }}
                                                />
                                            ));
                                        })()}
                                    </div>
                                </>
                            )}

                        </article>
                    ) : (
                        <div className="h-full flex flex-col items-center justify-center text-slate-400">
                            {/* ... Empty state ... */}
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


