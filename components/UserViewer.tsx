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

  // Helper to render page to image
  const renderPageToImage = async (pdfDoc: any, pageNum: number): Promise<string> => {
    const page = await pdfDoc.getPage(pageNum);
    const viewport = page.getViewport({ scale: 2.0 }); // 2x scale for better print quality
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.height = viewport.height;
    canvas.width = viewport.width;

    if (!context) throw new Error("Canvas context failed");

    await page.render({
      canvasContext: context,
      viewport: viewport
    }).promise;

    return canvas.toDataURL('image/jpeg', 0.85);
  };

  const handlePrint = async () => {
    if (currentKey.printCount >= currentKey.printLimit) {
      alert("Yazdırma limitine (2 kez) ulaştınız.");
      return;
    }

    // 1. Open Print Window IMMEDIATELY (Synchronous) to avoid Popup Blocker
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert("Pop-up engelleyiciyi kapatıp tekrar deneyin.");
      return;
    }

    setIsPrinting(true);

    // 2. Set Initial Content (Loading)
    printWindow.document.write(`
      <html>
        <head>
          <title>Hazırlanıyor...</title>
          <style>
              body { font-family: sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; background: #f1f5f9; color: #334155; }
              .loader { border: 5px solid #e2e8f0; border-top: 5px solid #3b82f6; border-radius: 50%; width: 50px; height: 50px; animation: spin 1s linear infinite; margin-bottom: 20px; }
              @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
          </style>
        </head>
        <body>
          <div class="loader"></div>
          <h2>Yazdırma Önizlemesi Hazırlanıyor...</h2>
          <p>Lütfen bekleyiniz, sayfalar işleniyor.</p>
        </body>
      </html>
    `);
    printWindow.document.close(); // Close after initial write

    try {
      // 3. Load the PDF Document
      const loadingTask = pdfjs.getDocument(pdfUrl!);
      const pdfDoc = await loadingTask.promise;
      const totalPages = pdfDoc.numPages;
      const imageUrls: string[] = [];

      // 4. Render all pages as images
      for (let i = 1; i <= totalPages; i++) {
        // Update loading text in the popup if possible
        if (printWindow && !printWindow.closed) {
          printWindow.document.body.querySelector('p')!.textContent = `Sayfa ${i} / ${totalPages} işleniyor...`;
        }
        const dataUrl = await renderPageToImage(pdfDoc, i);
        imageUrls.push(dataUrl);
      }

      if (printWindow.closed) {
        setIsPrinting(false);
        return;
      }

      // 5. Build Print Content (Images Only)
      const htmlContent = `
        <html>
          <head>
            <title>Yazdır</title>
            <style>
              body { margin: 0; padding: 0; }
              img { width: 100%; height: auto; display: block; break-after: page; }
              @media print {
                @page { margin: 0; }
                body { margin: 1.6cm; }
              }
            </style>
          </head>
          <body>
            ${imageUrls.map(url => `<img src="${url}" />`).join('')}
          </body>
        </html>
      `;

      // Clear previous content and write new
      printWindow.document.open();
      printWindow.document.write(htmlContent);
      printWindow.document.close();

      // 6. Secure Logout Hook
      const performSecureLogout = () => {
        printWindow.close(); // Force close the print window
        onExit(); // Immediate Logout
        // We use a small timeout to allow UI update before alert, but the state change is immediate
        setTimeout(() => {
          //alert("GÜVENLİK UYARISI: Yazdırma işlemi sonrası oturum otomatik olarak kapatılmıştır.");
        }, 100);
      };

      // 7. Wait for images to load then Print
      printWindow.onload = () => {
        printWindow.focus();

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
        printWindow.print();

        // Fallback: If for some reason listeners fail or dialogue blocks indefinetely,
        // we can't easily detect "cancel" vs "save" without these events.
        // But the onafterprint is consistent across modern browsers.
      };

      // Update limits
      await StorageService.updateKeyCount(currentKey.id);
      const updatedKeys = await StorageService.getKeys();
      const match = updatedKeys.find(k => k.id === currentKey.id);
      if (match) setCurrentKey(match);

    } catch (e) {
      console.error("Yazdırma hazırlığı sırasında hata:", e);
      alert("Yazdırma işlemi hazırlanırken bir hata oluştu.");
      if (printWindow) printWindow.close();
    } finally {
      setIsPrinting(false);
    }
  };

  // Block keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
      }
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
      className="fixed inset-0 bg-slate-900 flex flex-col z-50 select-none"
      onContextMenu={(e) => { e.preventDefault(); return false; }}
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
            {isPrinting ? 'Hazırlanıyor...' : (currentKey.printCount >= currentKey.printLimit ? 'Doldu' : 'Yazdır')}
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
