import React, { useState, useEffect, useRef } from 'react';
import { PDFBook, AccessKey } from '../types';
import { StorageService } from '../services/storage';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/esm/Page/AnnotationLayer.css';
import 'react-pdf/dist/esm/Page/TextLayer.css';

// Set worker source - using static file for robustness
pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

interface UserViewerProps {
  book: PDFBook;
  accessKey: AccessKey;
  onExit: () => void;
}

const UserViewer: React.FC<UserViewerProps> = ({ book, accessKey, onExit }) => {
  const [currentKey, setCurrentKey] = useState(accessKey);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [numPages, setNumPages] = useState<number | null>(null);
  const [pageNumber, setPageNumber] = useState<number>(1);


  // Load Content
  useEffect(() => {
    const loadContent = async () => {
      if (book.sourceType === 'FILE' && book.pdfData) {
        try {
          const res = await fetch(book.pdfData);
          const blob = await res.blob();
          const url = URL.createObjectURL(blob);
          setPdfUrl(url);
        } catch (e) {
          console.error("PDF Blob oluşturma hatası:", e);
          setPdfUrl(book.pdfData || null);
        }
      } else if (book.sourceType === 'LINK' && book.sourceUrl) {
        // Direct links might fail with react-pdf if CORS is not enabled on source
        // But for now we try.
        setPdfUrl(book.sourceUrl);
      }
    };
    loadContent();

    return () => {
      if (pdfUrl && book.sourceType === 'FILE') URL.revokeObjectURL(pdfUrl);
    };
  }, [book]);

  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
    setPageNumber(1);
  };

  const changePage = (offset: number) => {
    setPageNumber(prev => Math.min(Math.max(1, prev + offset), numPages || 1));
  };

  const [isPrinting, setIsPrinting] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);

  const handlePrint = async () => {
    if (currentKey.printCount >= currentKey.printLimit) {
      alert("Yazdırma limitine (2 kez) ulaştınız.");
      return;
    }

    setIsPrinting(true);

    try {
      // Create a hidden iframe
      const iframe = document.createElement('iframe');
      iframe.style.position = 'fixed';
      iframe.style.top = '-10000px';
      iframe.style.left = '-10000px';
      iframe.style.width = '1px';
      iframe.style.height = '1px';
      iframe.style.border = 'none';
      // iframe.style.visibility = 'hidden'; // Removed to avoid browser blocking
      iframe.style.visibility = 'visible'; // Must be visible to print in some browsers, but off-screen

      // If pdfUrl is a blob URL, this works great. 
      // If it's a remote URL, it might simply download depending on browser/headers.
      // But for this platform, we assume it's viewable.
      iframe.src = pdfUrl!;

      document.body.appendChild(iframe);

      // Success Modal State - Defined at component level, but we modify logic here
      // We need to use a ref or state outside to trigger re-render
      // Since handlePrint is async, better to use state.

      const performSecureLogout = () => {
        // Clean up frame
        if (document.body.contains(iframe)) {
          document.body.removeChild(iframe);
        }

        setIsPrinting(false);
        // INSTEAD of immediate exit, show modal
        setShowSuccessModal(true);
      };

      // Wait for iframe to load the PDF
      iframe.onload = () => {
        if (!iframe.contentWindow) {
          setIsPrinting(false);
          return;
        }

        const printWindow = iframe.contentWindow;
        printWindow.focus();

        const mediaQueryList = printWindow.matchMedia('print');
        mediaQueryList.addListener((mql) => {
          if (!mql.matches) {
            performSecureLogout();
          }
        });

        printWindow.onafterprint = performSecureLogout;

        try {
          printWindow.print();
        } catch (e) {
          console.error("Print call failed", e);
          performSecureLogout();
        }
      };

      // Update limits
      await StorageService.updateKeyCount(currentKey.id);
      const updatedKeys = await StorageService.getKeys();
      const match = updatedKeys.find(k => k.id === currentKey.id);
      if (match) setCurrentKey(match);

    } catch (e) {
      console.error("Yazdırma hatası:", e);
      alert("Yazdırma işlemi başlatılamadı.");
      setIsPrinting(false);
    }
  };

  // Block keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Prevent Save
      if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        return;
      }

      // Prevent Print (System)
      if ((e.ctrlKey || e.metaKey) && (e.key === 'p' || e.key === 'P')) {
        e.preventDefault();
        handlePrint(); // Redirect to our secure print
        return;
      }

      // Prevent Copy
      if ((e.ctrlKey || e.metaKey) && (e.key === 'c' || e.key === 'C')) {
        e.preventDefault();
        return;
      }

      // Prevent Inspect / DevTools
      if (
        e.key === 'F12' ||
        ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'I' || e.key === 'i' || e.key === 'J' || e.key === 'j')) ||
        ((e.ctrlKey || e.metaKey) && (e.key === 'u' || e.key === 'U'))
      ) {
        e.preventDefault();
        return;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentKey]);

  // Focus Protection
  const [isFocused, setIsFocused] = useState(true);

  useEffect(() => {
    const onBlur = () => setIsFocused(false);
    const onFocus = () => setIsFocused(true);
    window.addEventListener('blur', onBlur);
    window.addEventListener('focus', onFocus);
    return () => {
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  return (
    <div
      className={`fixed inset-0 bg-slate-900 flex flex-col z-50 select-none transition-all duration-300 ${!isFocused ? 'blur-xl opacity-50 grayscale' : ''}`}
      onContextMenu={(e) => { e.preventDefault(); return false; }}
      onDragStart={(e) => e.preventDefault()}
    >
      <style>{`
        @media print {
          body > *:not(iframe) {
            display: none !important;
          }
          body::before {
            content: "Bu belge korumalıdır. Sadece sistem üzerinden yazdırılabilir.";
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            font-size: 24px;
            color: #ccc;
          }
        }
      `}</style>
      {/* Header */}
      <div className="bg-slate-800 p-4 flex justify-between items-center border-b border-slate-700 shadow-lg shrink-0">
        <div className="flex items-center gap-4">
          <button onClick={onExit} className="text-white hover:bg-slate-700 p-2 rounded-lg transition">
            <i className="fas fa-arrow-left"></i>
          </button>
          <div className="flex flex-col">
            <h2 className="text-white font-semibold truncate max-w-[200px] md:max-w-md">{book.name}</h2>
            {numPages && (
              <span className="text-xs text-slate-400">
                Sayfa {pageNumber} / {numPages}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-4">
          {/* Pagination Controls */}
          <div className="flex bg-slate-700 rounded-lg overflow-hidden mr-4">
            <button
              disabled={pageNumber <= 1}
              onClick={() => changePage(-1)}
              className="p-2 text-white hover:bg-slate-600 disabled:opacity-30 px-3"
            >
              <i className="fas fa-chevron-left"></i>
            </button>
            <span className="px-3 py-2 text-white font-mono border-l border-r border-slate-600 flex items-center">
              {pageNumber}
            </span>
            <button
              disabled={pageNumber >= (numPages || 1)}
              onClick={() => changePage(1)}
              className="p-2 text-white hover:bg-slate-600 disabled:opacity-30 px-3"
            >
              <i className="fas fa-chevron-right"></i>
            </button>
          </div>

          <div className="hidden md:flex flex-col items-end">
            <span className="text-slate-400 text-xs">Kota</span>
            <span className={`text-sm font-bold ${currentKey.printCount >= currentKey.printLimit ? 'text-red-400' : 'text-green-400'}`}>
              {currentKey.printCount}/{currentKey.printLimit}
            </span>
          </div>
          <button
            onClick={handlePrint}
            disabled={currentKey.printCount >= currentKey.printLimit || isPrinting}
            className={`flex items-center gap-2 px-6 py-2 rounded-full font-bold transition ${currentKey.printCount >= currentKey.printLimit || isPrinting
              ? 'bg-slate-700 text-slate-500 cursor-not-allowed'
              : 'bg-blue-600 text-white hover:bg-blue-700'
              }`}
          >
            <i className={`fas ${isPrinting ? 'fa-spinner fa-spin' : 'fa-print'}`}></i>
            {isPrinting ? 'Yazdırılıyor...' : (currentKey.printCount >= currentKey.printLimit ? 'Doldu' : 'Yazdır')}
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 relative bg-slate-500 overflow-auto flex justify-center p-4">
        {!isFocused && (
          <div className="absolute inset-0 z-[60] flex items-center justify-center bg-black/50 text-white font-bold text-2xl">
            Görüntülemek için pencereye odaklanın
          </div>
        )}
        {pdfUrl ? (
          <>
            <Document
              file={pdfUrl}
              onLoadSuccess={onDocumentLoadSuccess}
              loading={<div className="text-white mt-10">Kitap Yükleniyor...</div>}
              error={<div className="text-red-300 mt-10">Kitap yüklenemedi.</div>}
              className="shadow-2xl"
            >
              <Page
                pageNumber={pageNumber}
                renderAnnotationLayer={false}
                renderTextLayer={false}
                height={window.innerHeight * 0.85}
                className="shadow-2xl"
              />
            </Document>


          </>
        ) : (
          <div className="flex items-center justify-center h-full text-slate-200">
            Yükleniyor...
          </div>
        )}
      </div>

      {/* Success Modal */}
      {
        showSuccessModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-4">
            <div className="bg-white rounded-2xl p-8 max-w-lg text-center shadow-2xl animate-bounce-in">
              <div className="bg-green-100 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6">
                <i className="fas fa-check text-4xl text-green-600"></i>
              </div>
              <h2 className="text-2xl font-bold text-slate-800 mb-4">İşlem Başarılı</h2>
              <p className="text-slate-600 text-lg mb-6 leading-relaxed">
                Tebrikler, yazdırma işlemi gerçekleşmiştir.
                <br />
                <span className="font-bold text-red-500 block mt-2">
                  UYARI: PDF kitapların çoğaltılması yasal yükümlülükler doğurmaktadır.
                </span>
              </p>
              <button
                onClick={onExit}
                className="w-full py-4 bg-slate-900 text-white rounded-xl font-bold text-lg hover:bg-slate-800 transition"
              >
                Tamam, Oturumu Kapat
              </button>
            </div>
          </div>
        )
      }
    </div >
  );
};

export default UserViewer;
