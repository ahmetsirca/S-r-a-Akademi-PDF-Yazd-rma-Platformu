import React, { useState, useEffect, useRef } from 'react';
import { PDFBook, AccessKey } from '../types';
import { StorageService } from '../services/storage';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/esm/Page/AnnotationLayer.css';
import 'react-pdf/dist/esm/Page/TextLayer.css';
// import '../index.css'; // Removed: Tailwind is loaded via CDN

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
  const [scale, setScale] = useState(1.0);
  const [drawMode, setDrawMode] = useState(false);
  const scrollTimeout = useRef<any>(null);
  const [annotations, setAnnotations] = useState<Record<number, { x: number, y: number }[][]>>({});
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState<number>(window.innerWidth);
  const isDrawing = useRef(false);
  const currentPath = useRef<{ x: number, y: number }[]>([]);

  // Persistence
  useEffect(() => {
    const saved = localStorage.getItem(`sirca_lp_${book.id}`);
    if (saved) {
      const p = parseInt(saved);
      if (p > 0) setPageNumber(p);
    }
  }, [book.id]);

  useEffect(() => {
    if (pageNumber > 0) localStorage.setItem(`sirca_lp_${book.id}`, pageNumber.toString());
  }, [pageNumber, book.id]);

  // Persistence (Annotations)
  useEffect(() => {
    const savedNotes = localStorage.getItem(`sirca_notes_${book.id}`);
    if (savedNotes) { try { setAnnotations(JSON.parse(savedNotes)); } catch (e) { } }
  }, [book.id]);

  useEffect(() => {
    if (Object.keys(annotations).length > 0) localStorage.setItem(`sirca_notes_${book.id}`, JSON.stringify(annotations));
  }, [annotations, book.id]);

  // Drawing Logic
  const getPoint = (e: any) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return {
      x: (clientX - rect.left) * (canvas.width / rect.width),
      y: (clientY - rect.top) * (canvas.height / rect.height)
    };
  };

  const startDrawing = (e: any) => {
    if (!drawMode) return;
    isDrawing.current = true;
    const p = getPoint(e);
    currentPath.current = [p];
    if (e.type === 'touchstart') {
      document.body.style.overflow = 'hidden';
      // Prevent default to stop scrolling
      // e.preventDefault(); // Don't prevent default here, let touch-action handle it
    }
  };

  const draw = (e: any) => {
    if (!isDrawing.current || !drawMode) return;
    const p = getPoint(e);
    currentPath.current.push(p);

    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = 'rgba(255, 0, 0, 0.6)';
        ctx.beginPath();
        const prev = currentPath.current[currentPath.current.length - 2] || p;
        ctx.moveTo(prev.x, prev.y);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
      }
    }
  };

  const stopDrawing = () => {
    if (!isDrawing.current) return;
    isDrawing.current = false;
    document.body.style.overflow = '';

    // Capture path data BEFORE resetting ref to avoid async state issues
    const completedPath = currentPath.current;

    if (completedPath.length > 0) {
      setAnnotations(prev => ({
        ...prev,
        [pageNumber]: [...(prev[pageNumber] || []), completedPath]
      }));
    }
    currentPath.current = [];
  };

  // Redraw Canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    if (parent) { canvas.width = parent.clientWidth; canvas.height = parent.clientHeight; }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const paths = annotations[pageNumber] || [];
    ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = 'rgba(255, 0, 0, 0.6)';

    paths.forEach(path => {
      if (path.length < 2) return;
      ctx.beginPath();
      ctx.moveTo(path[0].x, path[0].y);
      for (let i = 1; i < path.length; i++) ctx.lineTo(path[i].x, path[i].y);
      ctx.stroke();
    });
  }, [pageNumber, annotations, drawMode, numPages]);

  const undoAnnotation = () => {
    setAnnotations(prev => {
      const paths = prev[pageNumber] || [];
      if (paths.length === 0) return prev;
      return { ...prev, [pageNumber]: paths.slice(0, -1) };
    });
  };


  const clearPage = () => {
    if (confirm('Sayfa temizlensin mi?')) setAnnotations(prev => ({ ...prev, [pageNumber]: [] }));
  };

  // Responsive Width Handler
  useEffect(() => {
    const updateWidth = () => {
      if (containerRef.current) {
        setContainerWidth(containerRef.current.clientWidth);
      }
    };

    // Initial check
    updateWidth();

    // Resize observer is better than window resize for specific elements
    const observer = new ResizeObserver(() => {
      updateWidth();
    });

    if (containerRef.current) observer.observe(containerRef.current);

    window.addEventListener('resize', updateWidth); // Fallback/Additional check
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateWidth);
    }
  }, []);
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
    // Do not reset pageNumber here if we loaded from persistence
    // But verify bounds
    setPageNumber(prev => prev > numPages ? 1 : prev);
  };

  const changePage = (offset: number) => {
    setPageNumber(prev => Math.min(Math.max(1, prev + offset), numPages || 1));
  };

  const handleZoom = (delta: number) => {
    setScale(prev => Math.min(Math.max(0.5, prev + delta), 3.0));
  };

  const handleWheel = (e: React.WheelEvent) => {
    if (drawMode) return;

    // Zoom on Ctrl + Wheel
    if (e.ctrlKey) {
      if (e.deltaY < 0) handleZoom(0.1);
      else handleZoom(-0.1);
      return;
    }

    if (scrollTimeout.current) return;

    if (e.deltaY > 50) {
      // Wheel down - check if at bottom? No, wheel is usually explicit page turn request in this context
      // But let's respect native scroll if content overflows. 
      // Actually per requirement: "Scroll to bottom then go next" is better for mobile touch, 
      // but wheel on desktop might want explicit paging.
      // Keeping existing wheel logic for desktop but adding scroll listener for mobile/touch.
      changePage(1);
      blockScroll();
    } else if (e.deltaY < -50) {
      changePage(-1);
      blockScroll();
    }
  };

  // Scroll to Advance (Mobile/Touch) - DISABLED per user request
  // const handleScroll = (e: React.UIEvent<HTMLDivElement>) => { ... }

  const blockScroll = () => {
    scrollTimeout.current = setTimeout(() => {
      scrollTimeout.current = null;
    }, 300);
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
      style={{ overscrollBehavior: 'none' }} // Prevent pull-to-refresh / swipe-to-back
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
          {/* Zoom Controls */}
          <div className="flex bg-slate-700 rounded-lg mr-4 items-center overflow-hidden">
            <button onClick={() => handleZoom(-0.2)} className="p-2 text-white hover:bg-slate-600 px-3 border-r border-slate-600"><i className="fas fa-search-minus"></i></button>
            <span className="px-2 text-center text-white text-xs min-w-[3rem]">{Math.round(scale * 100)}%</span>
            <button onClick={() => handleZoom(0.2)} className="p-2 text-white hover:bg-slate-600 px-3 border-l border-slate-600"><i className="fas fa-search-plus"></i></button>
          </div>

          {/* Pagination Controls - Hidden on Mobile */}
          <div className="hidden md:flex bg-slate-700 rounded-lg overflow-hidden mr-4">
            <button
              disabled={pageNumber <= 1}
              onClick={() => changePage(-1)}
              className="p-2 text-white hover:bg-slate-600 disabled:opacity-30 px-3"
            >
              <i className="fas fa-chevron-left"></i>
            </button>
            <form onSubmit={(e) => { e.preventDefault(); }} className="flex items-center">
              <input
                type="number"
                min={1}
                max={numPages || 1}
                value={pageNumber}
                onChange={(e) => {
                  const val = parseInt(e.target.value);
                  if (val >= 1 && val <= (numPages || 1)) setPageNumber(val);
                }}
                className="w-16 px-2 py-2 text-center bg-slate-800 text-white font-mono border-l border-r border-slate-600 outline-none focus:bg-slate-700 appearance-none"
              />
            </form>
            <button
              disabled={pageNumber >= (numPages || 1)}
              onClick={() => changePage(1)}
              className="p-2 text-white hover:bg-slate-600 disabled:opacity-30 px-3"
            >
              <i className="fas fa-chevron-right"></i>
            </button>
          </div>

          {/* Draw Controls - Hidden on Mobile (Moved to Bottom) */}
          {drawMode && (
            <div className="hidden md:flex bg-slate-700 rounded-lg mr-2 overflow-hidden">
              <button onClick={undoAnnotation} className="p-2 text-white hover:bg-slate-600 px-3 border-r border-slate-600" title="Geri Al"><i className="fas fa-undo"></i></button>
              <button onClick={clearPage} className="p-2 text-red-400 hover:bg-slate-600 px-3" title="Temizle"><i className="fas fa-trash"></i></button>
            </div>
          )}

          {/* Draw Toggle */}
          {/* Draw Toggle (Desktop only - Mobile has floating bar) */}
          <button
            onClick={() => setDrawMode(!drawMode)}
            className={`hidden md:block p-2 rounded-lg mr-4 transition ${drawMode ? 'bg-yellow-500 text-slate-900 border-2 border-yellow-600' : 'text-slate-400 hover:text-white hover:bg-slate-700'}`}
            title="Çizim Modu"
          >
            <i className="fas fa-pen"></i>
          </button>

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
      <div
        ref={containerRef}
        className="flex-1 relative bg-slate-500 overflow-auto flex justify-center p-4 outline-none pb-24" // Added pb-24 for mobile nav space
        style={{ overscrollBehavior: 'none' }}
        onWheel={handleWheel}
      // onScroll={handleScroll} // Disabled per request
      >
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
                scale={scale} // Scale is now relative to the fit-width
                width={containerWidth ? Math.min(containerWidth - 32, 1200) : undefined} // Fit width minus padding, capped at 1200px
                renderAnnotationLayer={false}
                renderTextLayer={true}
                className="shadow-2xl relative"
              >
                <canvas
                  ref={canvasRef}
                  className={`absolute inset-0 z-50 ${drawMode ? 'cursor-crosshair' : 'pointer-events-none'}`}
                  onMouseDown={startDrawing}
                  onMouseMove={draw}
                  onMouseUp={stopDrawing}
                  onMouseLeave={stopDrawing}
                  onTouchStart={startDrawing}
                  onTouchMove={draw}
                  onTouchEnd={stopDrawing}
                  style={{ touchAction: drawMode ? 'none' : 'auto' }}
                />
              </Page>
            </Document>


          </>
        ) : (
          <div className="flex items-center justify-center h-full text-slate-200">
            Yükleniyor...
          </div>
        )}
      </div>

      {/* Mobile Bottom Navigation & Toolbar Container */}
      {/* Logic: 
          - If DrawMode is ON: Show Sketch Tools
          - If DrawMode is OFF: Show Page Navigation (Prev/Next/Input)
          - Toggle Button is always visible
      */}
      {/* Mobile Bottom Navigation & Toolbar Container */}
      <div className="fixed bottom-0 left-0 w-full pointer-events-none z-[60] flex flex-col items-center justify-end pb-6">

        {/* Navigation Bar (Visible only when NOT drawing) */}
        {!drawMode && (
          <div className="pointer-events-auto bg-slate-800/90 backdrop-blur-md border border-slate-600 p-2 rounded-2xl shadow-xl flex items-center gap-4 animate-slide-up mb-2">
            <button
              disabled={pageNumber <= 1}
              onClick={() => changePage(-1)}
              className="p-3 text-white hover:bg-slate-700 rounded-xl disabled:opacity-30 transition hover:scale-110 active:scale-95"
            >
              <i className="fas fa-chevron-left text-xl"></i>
            </button>
            <div className="flex flex-col items-center">
              <span className="text-[10px] text-slate-400 uppercase tracking-wider font-bold">Sayfa</span>
              <input
                type="number"
                min={1}
                max={numPages || 1}
                value={pageNumber}
                onChange={(e) => {
                  const val = parseInt(e.target.value);
                  if (val >= 1 && val <= (numPages || 1)) setPageNumber(val);
                }}
                className="w-12 bg-transparent text-center text-white font-bold text-lg outline-none"
              />
            </div>
            <button
              disabled={pageNumber >= (numPages || 1)}
              onClick={() => changePage(1)}
              className="p-3 text-white hover:bg-slate-700 rounded-xl disabled:opacity-30 transition hover:scale-110 active:scale-95"
            >
              <i className="fas fa-chevron-right text-xl"></i>
            </button>
          </div>
        )}

        {/* Drawing Tools (Undo/Clear) - Visible ONLY when drawing */}
        {drawMode && (
          <div className="pointer-events-auto bg-slate-800/90 backdrop-blur-md border border-slate-600 p-2 rounded-full shadow-2xl flex items-center gap-2 animate-slide-up mb-2">
            <button
              onClick={undoAnnotation}
              className="w-12 h-12 rounded-full flex items-center justify-center text-slate-300 hover:bg-slate-700 hover:text-white transition active:scale-95 bg-slate-700/50"
              title="Geri Al"
            >
              <i className="fas fa-undo"></i>
            </button>
            <div className="w-px h-8 bg-slate-600 mx-1"></div>
            <button
              onClick={clearPage}
              className="w-12 h-12 rounded-full flex items-center justify-center text-red-400 hover:bg-red-500/20 transition active:scale-95 bg-red-500/10"
              title="Temizle"
            >
              <i className="fas fa-trash"></i>
            </button>
          </div>
        )}
      </div>

      {/* Floating Action Button (FAB) for Draw Toggle - Always visible, Bottom-Right */}
      <button
        onClick={() => setDrawMode(!drawMode)}
        className={`fixed bottom-24 right-6 w-16 h-16 rounded-full flex items-center justify-center text-2xl shadow-2xl z-[70] transition-all duration-300 active:scale-90 ${drawMode
          ? 'bg-yellow-500 text-slate-900 border-4 border-slate-900 rotate-0'
          : 'bg-indigo-600 text-white hover:bg-indigo-500 rotate-0'
          }`}
        title={drawMode ? "Çizimi Bitir" : "Çizimi Başlat"}
      >
        <i className={`fas ${drawMode ? 'fa-check' : 'fa-pen'}`}></i>
      </button>

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
