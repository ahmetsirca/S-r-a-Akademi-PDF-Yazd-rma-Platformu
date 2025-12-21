import React, { useState, useEffect, useRef } from 'react';
import { PDFBook, AccessKey } from '../types';
import { StorageService } from '../services/storage';

interface UserViewerProps {
  book: PDFBook;
  accessKey: AccessKey;
  onExit: () => void;
}

const UserViewer: React.FC<UserViewerProps> = ({ book, accessKey, onExit }) => {
  const [currentKey, setCurrentKey] = useState(accessKey);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const printFrameRef = useRef<HTMLIFrameElement>(null);

  // Load Content (Blob for File, Embed URL for Link)
  useEffect(() => {
    const loadContent = async () => {
      if (book.sourceType === 'FILE' && book.pdfData) {
        try {
          // If it's a data URI (base64)
          const res = await fetch(book.pdfData);
          const blob = await res.blob();
          const url = URL.createObjectURL(blob);
          setPdfUrl(url);
        } catch (e) {
          console.error("PDF Blob oluşturma hatası:", e);
          // Fallback to data URI directly if blob fails
          setPdfUrl(book.pdfData || null);
        }
      } else if (book.sourceType === 'LINK' && book.sourceUrl) {
        let url = book.sourceUrl;
        // Google Drive Embed Logic - Convert to preview mode for better UX
        if (url.includes('drive.google.com') && (url.includes('/view') || url.includes('/edit'))) {
          url = url.replace(/\/view.*/, '/preview').replace(/\/edit.*/, '/preview');
        }
        setPdfUrl(url);
      }
    };
    loadContent();

    return () => {
      if (pdfUrl && book.sourceType === 'FILE') URL.revokeObjectURL(pdfUrl);
    };
  }, [book]);

  const handlePrint = async () => {
    if (currentKey.printCount >= currentKey.printLimit) {
      alert("Yazdırma limitine (2 kez) ulaştınız.");
      return;
    }

    if (printFrameRef.current) {
      try {
        printFrameRef.current.contentWindow?.focus();
        printFrameRef.current.contentWindow?.print();

        await StorageService.updateKeyCount(currentKey.id);
        // Refresh local state
        const updatedKeys = await StorageService.getKeys();
        const match = updatedKeys.find(k => k.id === currentKey.id);
        if (match) setCurrentKey(match);
      } catch (e) {
        console.error("Yazdırma hatası", e);
        alert("Yazdırma başlatılamadı. Tarayıcı ayarlarını kontrol edin.");
      }
    }
  };

  // Block basic keyboard shortcuts for saving and printing
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Prevent Save (Ctrl+S)
      if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        alert("İndirme işlemi devre dışı bırakılmıştır.");
      }
      // Intercept Print (Ctrl+P)
      if ((e.ctrlKey || e.metaKey) && (e.key === 'p' || e.key === 'P')) {
        e.preventDefault();
        handlePrint();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentKey]);

  return (
    <div
      className="fixed inset-0 bg-slate-900 flex flex-col z-50"
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* Viewer Header */}
      <div className="bg-slate-800 p-4 flex justify-between items-center border-b border-slate-700 shadow-lg">
        <div className="flex items-center gap-4">
          <button onClick={onExit} className="text-white hover:bg-slate-700 p-2 rounded-lg transition">
            <i className="fas fa-arrow-left"></i>
          </button>
          <h2 className="text-white font-semibold truncate max-w-[200px] md:max-w-md">{book.name}</h2>
        </div>

        <div className="flex items-center gap-4">
          <div className="hidden md:flex flex-col items-end">
            <span className="text-slate-400 text-xs">Yazdırma Kotası</span>
            <span className={`text-sm font-bold ${currentKey.printCount >= currentKey.printLimit ? 'text-red-400' : 'text-green-400'}`}>
              {currentKey.printCount} / {currentKey.printLimit} Kullanıldı
            </span>
          </div>
          <button
            onClick={handlePrint}
            disabled={currentKey.printCount >= currentKey.printLimit}
            className={`flex items-center gap-2 px-6 py-2 rounded-full font-bold transition ${currentKey.printCount >= currentKey.printLimit
              ? 'bg-slate-700 text-slate-500 cursor-not-allowed'
              : 'bg-blue-600 text-white hover:bg-blue-700'
              }`}
          >
            <i className="fas fa-print"></i>
            {currentKey.printCount >= currentKey.printLimit ? 'Limit Doldu' : 'Kitabı Yazdır'}
          </button>
        </div>
      </div>

      {/* PDF Content Area */}
      <div className="flex-1 relative overflow-hidden bg-slate-200 flex justify-center">
        {pdfUrl ? (
          <>
            {/* Display Frame */}
            <iframe
              src={book.sourceType === 'LINK' ? pdfUrl : `${pdfUrl}#toolbar=0&navpanes=0&scrollbar=1&view=FitH`}
              className="w-full h-full shadow-2xl"
              style={{ border: 'none' }}
              title="PDF Viewer"
              allow="autoplay" // Might be needed for some drive features
            />

            {/* Hidden Print Frame */}
            <iframe
              ref={printFrameRef}
              src={pdfUrl}
              title="print-frame"
              style={{
                position: 'absolute',
                width: '0px',
                height: '0px',
                opacity: 0,
                pointerEvents: 'none',
                border: 'none'
              }}
            />
          </>
        ) : (
          <div className="flex items-center justify-center h-full text-slate-500">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-slate-700 mb-4 mx-auto"></div>
              <p>İçerik Yükleniyor...</p>
            </div>
          </div>
        )}

        {/* Transparent Security Overlay */}
        <div
          className="absolute inset-0 pointer-events-none"
          onContextMenu={(e) => e.preventDefault()}
        >
          <div className="w-full h-full flex flex-wrap gap-20 p-20 overflow-hidden opacity-5 select-none justify-center content-center">
            {Array.from({ length: 20 }).map((_, i) => (
              <span key={i} className="text-slate-900 text-2xl font-bold -rotate-45 whitespace-nowrap">
                SADECE OKUNABİLİR - KOPYALANAMAZ
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Mobile Footer Info */}
      <div className="md:hidden bg-slate-800 p-2 text-center text-xs text-slate-400">
        Kota: {currentKey.printCount} / {currentKey.printLimit}
      </div>
    </div>
  );
};

export default UserViewer;
