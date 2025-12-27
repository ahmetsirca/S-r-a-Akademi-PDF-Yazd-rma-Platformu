import React, { useState, useEffect } from 'react';
import { VocabNotebook } from '../types';
import { DBService } from '../services/db';
import WordList from './WordList';
import StoryMode from './StoryMode';
import FlashcardMode from './FlashcardMode';
import { jsPDF } from 'jspdf';
import { Document, Packer, Paragraph, TextRun, HeadingLevel } from 'docx';
import { saveAs } from 'file-saver';

interface VocabularyNotebookProps {
    userId: string;
    onClose: () => void;
}

const VocabularyNotebook: React.FC<VocabularyNotebookProps> = ({ userId, onClose }) => {
    const [notebooks, setNotebooks] = useState<VocabNotebook[]>([]);
    const [currentNotebook, setCurrentNotebook] = useState<VocabNotebook | null>(null);
    const [viewMode, setViewMode] = useState<'WORDS' | 'STORY' | 'FLASHCARD'>('WORDS');
    const [loading, setLoading] = useState(true);

    // notebook title editing
    const [editingNotebookId, setEditingNotebookId] = useState<string | null>(null);
    const [editTitle, setEditTitle] = useState('');

    useEffect(() => {
        loadNotebooks();
    }, [userId]);

    const loadNotebooks = async () => {
        setLoading(true);
        const data = await DBService.getNotebooks(userId);
        setNotebooks(data);
        setLoading(false);
    };

    const handleCreateNotebook = async () => {
        const title = prompt("Yeni Defter İsmi:");
        if (!title) return;
        const parentId = currentNotebook ? currentNotebook.id : null;
        const res = await DBService.createNotebook(userId, title, parentId);
        if (res) loadNotebooks();
    };

    const handleDeleteNotebook = async (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (!confirm("Defteri ve içindeki her şeyi silmek istediğinize emin misiniz?")) return;
        await DBService.deleteNotebook(id);
        loadNotebooks();
    };

    const handleRename = async (id: string) => {
        if (!editTitle.trim()) return;
        await DBService.updateNotebook(id, editTitle);
        setEditingNotebookId(null);
        loadNotebooks();
    };

    const exportPDF = async () => {
        if (!currentNotebook) return;
        const words = await DBService.getNotebookWords(currentNotebook.id);
        const doc = new jsPDF();

        // Set font to support Turkish characters if possible, standard font might have issues
        // For simplicity, we use standard font but might miss some chars. Ideally import a Unicode font.
        // doc.addFont(...) 

        doc.setFontSize(18);
        doc.text(currentNotebook.title, 10, 10);

        doc.setFontSize(12);
        let y = 30;

        words.forEach((w, i) => {
            if (y > 280) { doc.addPage(); y = 20; }
            doc.text(`${i + 1}. ${w.term} - ${w.definition}`, 10, y);
            y += 10;
        });

        doc.save(`${currentNotebook.title}_Kelime_Defteri.pdf`);
    };

    const exportWord = async () => {
        if (!currentNotebook) return;
        const words = await DBService.getNotebookWords(currentNotebook.id);

        const doc = new Document({
            sections: [{
                properties: {},
                children: [
                    new Paragraph({
                        text: currentNotebook.title,
                        heading: HeadingLevel.HEADING_1,
                    }),
                    ...words.map(w => new Paragraph({
                        children: [
                            new TextRun({ text: w.term, bold: true }),
                            new TextRun({ text: ` - ${w.definition}` }),
                        ],
                        spacing: { after: 200 }
                    }))
                ],
            }],
        });

        const blob = await Packer.toBlob(doc);
        saveAs(blob, (`${currentNotebook.title}_Kelime_Defteri.docx`));
    };


    // Filter notebooks: If currentNotebook is null, show root notebooks. Else show children.
    const visibleNotebooks = notebooks.filter(n =>
        currentNotebook
            ? n.parentId === currentNotebook.id
            : n.parentId === null
    );

    return (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-slate-50 w-full max-w-6xl h-[85vh] rounded-3xl shadow-2xl flex overflow-hidden animate-scale-in">

                {/* Sidebar */}
                <div className="w-64 bg-white border-r border-slate-200 flex flex-col">
                    <div className="p-4 border-b border-slate-100 bg-slate-50">
                        <button onClick={onClose} className="text-slate-400 hover:text-slate-600 mb-4 flex items-center gap-2 text-sm font-bold">
                            <i className="fas fa-arrow-left"></i> Geri Dön
                        </button>
                        <h2 className="font-bold text-slate-800 text-lg">Kelime Defterim</h2>
                    </div>

                    <div className="flex-1 overflow-auto p-2 space-y-1">
                        <button
                            onClick={() => setCurrentNotebook(null)}
                            className={`w-full text-left p-3 rounded-lg font-bold flex items-center gap-3 transition ${!currentNotebook ? 'bg-blue-50 text-blue-600' : 'text-slate-600 hover:bg-slate-50'}`}
                        >
                            <i className="fas fa-home"></i> Ana Sayfa
                        </button>
                        {/* Note: We rely on the Drill-down view in the main content for Sub-notebooks instead of a full tree here to keep UI clean */}
                    </div>

                    <div className="p-4 border-t border-slate-100">
                        <button onClick={handleCreateNotebook} className="w-full bg-indigo-600 text-white py-2 rounded-lg font-bold hover:bg-indigo-700 transition">
                            <i className="fas fa-plus mr-2"></i> Yeni Defter
                        </button>
                    </div>
                </div>

                {/* Main Content */}
                <div className="flex-1 flex flex-col bg-slate-50 overflow-hidden">
                    {/* Header */}
                    <div className="bg-white p-6 border-b border-slate-200 shadow-sm flex justify-between items-center">
                        <div>
                            {currentNotebook ? (
                                <div className="flex items-center gap-2">
                                    <button onClick={() => setCurrentNotebook(notebooks.find(n => n.id === currentNotebook.parentId) || null)} className="text-slate-400 hover:text-blue-600">
                                        <i className="fas fa-chevron-left"></i>
                                    </button>
                                    <h1 className="text-2xl font-bold text-slate-800">{currentNotebook.title}</h1>
                                    <span className="text-xs px-2 py-1 bg-blue-100 text-blue-600 rounded-full font-bold">Defter</span>
                                </div>
                            ) : (
                                <h1 className="text-2xl font-bold text-slate-800">Defterlerim</h1>
                            )}
                        </div>

                        {currentNotebook && (
                            <div className="flex items-center gap-2">
                                {/* View Toggles */}
                                <div className="bg-slate-100 p-1 rounded-lg flex mr-4">
                                    <button
                                        onClick={() => setViewMode('WORDS')}
                                        className={`px-4 py-2 rounded-md text-sm font-bold transition ${viewMode === 'WORDS' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                                    >
                                        <i className="fas fa-list mr-2"></i> Kelimeler
                                    </button>
                                    <button
                                        onClick={() => setViewMode('STORY')}
                                        className={`px-4 py-2 rounded-md text-sm font-bold transition ${viewMode === 'STORY' ? 'bg-white text-purple-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                                    >
                                        <i className="fas fa-book-reader mr-2"></i> Hikaye
                                    </button>
                                    <button
                                        onClick={() => setViewMode('FLASHCARD')}
                                        className={`px-4 py-2 rounded-md text-sm font-bold transition ${viewMode === 'FLASHCARD' ? 'bg-white text-green-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                                    >
                                        <i className="fas fa-layer-group mr-2"></i> Kartlar
                                    </button>
                                </div>

                                {/* Exports */}
                                <div className="dropdown relative group">
                                    <button className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center text-slate-600 hover:bg-slate-200">
                                        <i className="fas fa-download"></i>
                                    </button>
                                    <div className="absolute right-0 top-full mt-2 w-48 bg-white rounded-xl shadow-xl border border-slate-100 hidden group-hover:block z-50 p-2">
                                        <button onClick={exportPDF} className="w-full text-left px-4 py-2 hover:bg-slate-50 rounded-lg text-slate-700 font-medium">
                                            <i className="fas fa-file-pdf text-red-500 mr-2"></i> PDF İndir
                                        </button>
                                        <button onClick={exportWord} className="w-full text-left px-4 py-2 hover:bg-slate-50 rounded-lg text-slate-700 font-medium">
                                            <i className="fas fa-file-word text-blue-500 mr-2"></i> Word İndir
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Body */}
                    <div className="flex-1 overflow-auto p-8">
                        {loading ? (
                            <div className="flex items-center justify-center h-full text-slate-400">Yükleniyor...</div>
                        ) : !currentNotebook ? (
                            /* Root View: Show Notebooks Grid */
                            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-6">
                                {visibleNotebooks.map(n => (
                                    <div
                                        key={n.id}
                                        onClick={() => setCurrentNotebook(n)}
                                        className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 cursor-pointer hover:shadow-md hover:border-blue-400 transition group relative"
                                    >
                                        {/* Edit Title Overlay */}
                                        {editingNotebookId === n.id ? (
                                            <div className="absolute inset-0 bg-white p-4 z-10 rounded-2xl flex flex-col justify-center" onClick={e => e.stopPropagation()}>
                                                <input
                                                    autoFocus
                                                    className="w-full border-b-2 border-blue-500 outline-none p-1 font-bold text-slate-800 mb-2"
                                                    value={editTitle}
                                                    onChange={e => setEditTitle(e.target.value)}
                                                />
                                                <div className="flex gap-2">
                                                    <button onClick={() => handleRename(n.id)} className="bg-blue-600 text-white px-3 py-1 rounded text-xs">Kaydet</button>
                                                    <button onClick={() => setEditingNotebookId(null)} className="bg-slate-200 text-slate-600 px-3 py-1 rounded text-xs">İptal</button>
                                                </div>
                                            </div>
                                        ) : null}

                                        <div className="flex justify-between items-start mb-4">
                                            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-2xl shadow-sm transition group-hover:scale-110 ${n.parentId ? 'bg-purple-100 text-purple-600' : 'bg-blue-100 text-blue-600'}`}>
                                                <i className={`fas ${n.parentId ? 'fa-book-open' : 'fa-book'}`}></i>
                                            </div>
                                            <div className="flex gap-1">
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); setEditingNotebookId(n.id); setEditTitle(n.title); }}
                                                    className="w-8 h-8 rounded-full hover:bg-slate-100 text-slate-400 hover:text-blue-500 transition"
                                                >
                                                    <i className="fas fa-pen"></i>
                                                </button>
                                                <button
                                                    onClick={(e) => handleDeleteNotebook(n.id, e)}
                                                    className="w-8 h-8 rounded-full hover:bg-red-50 text-slate-400 hover:text-red-500 transition"
                                                >
                                                    <i className="fas fa-trash"></i>
                                                </button>
                                            </div>
                                        </div>
                                        <h3 className="font-bold text-lg text-slate-800 group-hover:text-blue-600 transition truncate" title={n.title}>{n.title}</h3>
                                        <p className="text-xs text-slate-400 mt-1">{new Date(n.createdAt).toLocaleDateString('tr-TR')}</p>
                                    </div>
                                ))}

                                {/* Create Card */}
                                <button
                                    onClick={handleCreateNotebook}
                                    className="bg-slate-100 border-2 border-dashed border-slate-300 rounded-2xl p-6 flex flex-col items-center justify-center text-slate-400 hover:text-blue-600 hover:border-blue-400 hover:bg-blue-50 transition"
                                >
                                    <i className="fas fa-plus-circle text-4xl mb-2"></i>
                                    <span className="font-bold">Yeni Defter Oluştur</span>
                                </button>
                            </div>
                        ) : (
                            /* Inside a Notebook Container */
                            <div className="max-w-5xl mx-auto">
                                {/* Check for Sub-notebooks inside this notebook */}
                                {visibleNotebooks.length > 0 && viewMode === 'WORDS' && (
                                    <div className="mb-8">
                                        <h3 className="font-bold text-slate-400 text-sm uppercase mb-4 flex justify-between items-center">
                                            <span>Alt Defterler</span>
                                            <button onClick={handleCreateNotebook} className="text-blue-600 hover:underline text-xs"><i className="fas fa-plus"></i> Ekle</button>
                                        </h3>
                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                            {visibleNotebooks.map(n => (
                                                <div key={n.id} onClick={() => setCurrentNotebook(n)} className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 cursor-pointer hover:border-blue-400 group">
                                                    <div className="flex items-center gap-3">
                                                        <i className="fas fa-book-open text-purple-500"></i>
                                                        <span className="font-bold text-slate-700 truncate">{n.title}</span>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                        <hr className="my-8 border-slate-200" />
                                    </div>
                                )}

                                {viewMode === 'WORDS' ? (
                                    <WordList notebookId={currentNotebook.id} />
                                ) : viewMode === 'FLASHCARD' ? (
                                    <FlashcardMode notebookId={currentNotebook.id} />
                                ) : (
                                    <StoryMode notebookId={currentNotebook.id} />
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default VocabularyNotebook;
