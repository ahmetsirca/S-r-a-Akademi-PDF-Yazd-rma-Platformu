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

  const handlePrint = async () => {
    if (currentKey.printCount >= currentKey.printLimit) {
      alert("Yazdırma limitine (2 kez) ulaştınız.");
      return;
    }

    setIsPrinting(true);

    try {
      // Create a hidden iframe
      const iframe = document.createElement('iframe');
      iframe.style.position = 'absolute';
      iframe.style.width = '0px';
      iframe.style.height = '0px';
      iframe.style.border = 'none';
      iframe.style.visibility = 'hidden'; // Ensure it's not visible

      // If pdfUrl is a blob URL, this works great. 
      // If it's a remote URL, it might simply download depending on browser/headers.
      // But for this platform, we assume it's viewable.
      iframe.src = pdfUrl!;

      document.body.appendChild(iframe);

      // Secure Logout Hook
      const performSecureLogout = () => {
        // Remove iframe to clean up
        if (document.body.contains(iframe)) {
          document.body.removeChild(iframe);
        }

        onExit(); // Immediate Logout

        // Hint to user why they were logged out
        setTimeout(() => {
          // alert("GÜVENLİK UYARISI: Yazdırma işlemi tamamlandı. Oturum kapatılıyor."); 
        }, 100);
      };

      // Wait for iframe to load the PDF
      iframe.onload = () => {
        if (!iframe.contentWindow) {
          setIsPrinting(false);
          return;
        }

        const printWindow = iframe.contentWindow;
        printWindow.focus(); // Required for some browsers

        // Strict Security Mechanism
        // We attach listeners BEFORE printing
        const mediaQueryList = printWindow.matchMedia('print');
        mediaQueryList.addListener((mql) => {
          if (!mql.matches) {
            performSecureLogout();
          }
        });

        printWindow.onafterprint = performSecureLogout;

        // Execute Print
        try {
          printWindow.print();
        } catch (e) {
          console.error("Print call failed", e);
          performSecureLogout(); // Fail safe
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

  return (
    <div
      className="fixed inset-0 bg-slate-900 flex flex-col z-50 select-none"
      onContextMenu={(e) => { e.preventDefault(); return false; }}
      onDragStart={(e) => e.preventDefault()}
    >
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
    </div>
  );
};

export default UserViewer;
