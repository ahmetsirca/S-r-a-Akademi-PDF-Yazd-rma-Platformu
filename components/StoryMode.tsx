import React, { useState, useEffect, useRef } from 'react';
import { VocabStory, VocabWord } from '../types';
import { DBService } from '../services/db';
import { jsPDF } from 'jspdf';
import { Document, Packer, Paragraph, TextRun, HeadingLevel } from 'docx';
import { saveAs } from 'file-saver';

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

    // Feature State
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [showShareMenu, setShowShareMenu] = useState(false);

    useEffect(() => {
        loadData();
    }, [notebookId]);

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
                if (btn) {
                    const originalText = btn.innerText;
                    btn.innerText = 'Kaydedildi! ✓';
                    btn.style.backgroundColor = '#16a34a'; // green-600
                    setTimeout(() => {
                        btn.innerText = originalText;
                        btn.style.backgroundColor = '';
                    }, 2000);
                }
                if (!editingId) {
                    // Only clear if not editing, OR if we want to reset after update?
                    // User might want to keep editing after save.
                    // Let's keep it for now but maybe change UX later.
                    // Actually usually after save we want to keep editing the same doc.
                }
                // setEditingId(null); // Keep in edit mode after save
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
        // Scroll to editor on mobile
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
            window.speechSynthesis.speak(utterance);
        }
    };

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
        const shareText = `"${title}" - Sırça Akademi'de yazdığım hikayeyi oku!`;
        const shareUrl = window.location.href; // Or a specific public link if available later

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
            {popover && (
                <div
                    className="fixed z-[9999] bg-slate-800 text-white p-2 rounded-lg shadow-xl flex flex-col items-center gap-2 transform -translate-x-1/2 -translate-y-full animate-fade-in"
                    // Use pageX/Y if absolute to document, but for fixed we need clientX.
                    // Previously logic might be flawed for fixed.
                    // For simplicity let's stick to calculated logic but ensure z-index is high.
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

            {/* Right: Interactive Viewer */}
            <div
                ref={viewerRef}
                onMouseUp={handleMouseUp}
                className={`bg-slate-100/50 p-4 rounded-xl border border-slate-200 shadow-inner overflow-hidden flex flex-col ${isFullscreen ? 'fixed inset-0 z-50 bg-slate-100 p-0 rounded-none' : 'h-full min-h-[400px]'}`}
            >
                {/* Toolbar */}
                <div className={`flex justify-end gap-2 mb-4 border-b border-slate-200 pb-2 ${isFullscreen ? 'p-4 bg-white shadow-sm' : ''}`}>
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
                <div className="flex-1 overflow-auto flex justify-center pb-10">
                    {title || content ? (
                        <article className={`bg-white shadow-sm border border-slate-100 p-8 md:p-12 max-w-[800px] w-full mx-auto transition-all ${isFullscreen ? 'shadow-2xl my-4 min-h-[calc(100vh-100px)]' : 'min-h-full'}`}>
                            <h2 className="text-3xl font-bold text-slate-800 mb-8 text-center font-serif tracking-wide border-b border-slate-100 pb-4">{title || 'Başlıksız Hikaye'}</h2>
                            <div className="text-xl leading-loose text-slate-800 font-serif break-words">
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
        </div>
    );
};

export default StoryMode;
