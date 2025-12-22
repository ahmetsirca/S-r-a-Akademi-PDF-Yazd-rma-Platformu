import React, { useState, useEffect, useRef } from 'react';
import { PDFBook, AccessKey } from '../types';
import { StorageService } from '../services/storage';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/esm/Page/AnnotationLayer.css';
import 'react-pdf/dist/esm/Page/TextLayer.css';
// import '../index.css'; // Removed: Tailwind is loaded via CDN

// Set worker source - using static file for robustness
pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@4.4.168/build/pdf.worker.min.mjs`;

import { DBService } from '../services/db';
import { AuthService } from '../services/auth';



// Types for Annotation
interface AnnotationPath {
  points: { x: number, y: number }[];
  type: 'PEN' | 'HIGHLIGHTER';
  color: string;
  width: number;
}

interface SinglePDFPageProps {
  pageNumber: number;
  scale: number;
  width: number;
  toolMode: 'CURSOR' | 'PEN' | 'HIGHLIGHTER' | 'ERASER';
  penColor: string;
  annotations: AnnotationPath[];
  onAnnotationAdd: (page: number, path: AnnotationPath) => void;
  onPageLoad: (page: number, height: number) => void;
}

const SinglePDFPage: React.FC<SinglePDFPageProps> = ({ pageNumber, scale, width, toolMode, penColor, annotations, onAnnotationAdd, onPageLoad }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawing = useRef(false);
  const currentPath = useRef<{ x: number, y: number }[]>([]);

  // Draw Logic specific to this page
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
    if (toolMode === 'CURSOR') return;
    isDrawing.current = true;
    const p = getPoint(e);
    currentPath.current = [p];
  };

  const draw = (e: any) => {
    if (!isDrawing.current || toolMode === 'CURSOR') return;
    if (e.cancelable) e.preventDefault();

    const p = getPoint(e);
    currentPath.current.push(p);

    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        // Live Rendering Preview
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        if (toolMode === 'HIGHLIGHTER') {
          ctx.globalAlpha = 0.3; // Transparent
          ctx.lineWidth = 20;
          ctx.strokeStyle = penColor === '#000000' ? '#FFFF00' : penColor; // Default to yellow if black is selected/default
          ctx.globalCompositeOperation = 'multiply';
        } else {
          ctx.globalAlpha = 1.0;
          ctx.lineWidth = 3;
          ctx.strokeStyle = penColor;
          ctx.globalCompositeOperation = 'source-over';
        }

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

    if (currentPath.current.length > 0) {
      onAnnotationAdd(pageNumber, {
        points: currentPath.current,
        type: toolMode === 'HIGHLIGHTER' ? 'HIGHLIGHTER' : 'PEN',
        color: toolMode === 'HIGHLIGHTER' && penColor === '#000000' ? '#FFFF00' : penColor,
        width: toolMode === 'HIGHLIGHTER' ? 20 : 3
      });
    }
    currentPath.current = [];
  };

  // Re-render canvas when annotations change
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Sync canvas size with parent if needed
    if (canvas.parentElement && canvas.width !== canvas.parentElement.clientWidth) {
      canvas.width = canvas.parentElement.clientWidth;
      canvas.height = canvas.parentElement.clientHeight;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    annotations.forEach(ann => {
      if (ann.points.length < 2) return;

      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      if (ann.type === 'HIGHLIGHTER') {
        ctx.globalAlpha = 0.3;
        ctx.lineWidth = ann.width || 20;
        ctx.strokeStyle = ann.color;
        ctx.globalCompositeOperation = 'multiply';
      } else {
        ctx.globalAlpha = 1.0;
        ctx.lineWidth = ann.width || 3;
        ctx.strokeStyle = ann.color;
        ctx.globalCompositeOperation = 'source-over';
      }

      ctx.beginPath();
      ctx.moveTo(ann.points[0].x, ann.points[0].y);
      for (let i = 1; i < ann.points.length; i++) ctx.lineTo(ann.points[i].x, ann.points[i].y);
      ctx.stroke();
    });
  }, [annotations, scale, width]);

  const handlePageLoadSuccess = (page: any) => {
    const renderedHeight = page.originalHeight * (width / page.originalWidth);
    onPageLoad(pageNumber, renderedHeight);
  };

  return (
    <div className="relative shadow-lg group w-full" style={{ minHeight: width * 1.4 }}>
      <Page
        pageNumber={pageNumber}
        width={width}
        // scale={scale} // Removed scale prop here to let width drive the sizing completely, as we manage scale via width prop in UserViewer
        renderAnnotationLayer={false}
        renderTextLayer={true}
        onLoadSuccess={handlePageLoadSuccess}
        loading={<div className="bg-white animate-pulse w-full" style={{ height: width * 1.41 }} />}
      />
      {/* Canvas moved outside Page component to ensure it sits on top of TextLayer */}
      <canvas
        ref={canvasRef}
        className={`absolute inset-0 z-[100] ${toolMode === 'CURSOR' ? 'pointer-events-none' : 'cursor-crosshair touch-none'}`}
        onMouseDown={startDrawing}
        onMouseMove={draw}
        onMouseUp={stopDrawing}
        onMouseLeave={stopDrawing}
        onTouchStart={startDrawing}
        onTouchMove={draw}
        onTouchEnd={stopDrawing}
      />
    </div>
  );
};


interface UserViewerProps {
  book: PDFBook;
  accessKey?: AccessKey;
  isDeviceVerified?: boolean;
  onExit: () => void;
}

const UserViewer: React.FC<UserViewerProps> = ({ book, accessKey, isDeviceVerified = true, onExit }) => {
  const [currentKey, setCurrentKey] = useState<AccessKey | undefined>(accessKey);
  const [userPermission, setUserPermission] = useState<import('../types').UserPermission | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [numPages, setNumPages] = useState<number | null>(null);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [scale, setScale] = useState(1.0);

  // Pro Toolbar State
  const [toolMode, setToolMode] = useState<'CURSOR' | 'PEN' | 'HIGHLIGHTER' | 'ERASER'>('CURSOR');
  const [penColor, setPenColor] = useState('#EF4444'); // Red default

  const [annotations, setAnnotations] = useState<Record<number, AnnotationPath[]>>({});

  // Virtualization State
  const [pageHeights, setPageHeights] = useState<Record<number, number>>({});

  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState<number>(window.innerWidth);

  // Persistence (Last Page)
  useEffect(() => {
    const saved = localStorage.getItem(`sirca_lp_${book.id}`);
    if (saved) { /* ... handled in onLoadSuccess ... */ }
  }, [book.id]);

  // Init Logic
  useEffect(() => {
    // Check if Google User
    const sess = AuthService.loadSession();
    if (sess) {
      setUserId(sess.id);
      DBService.getUserPermissions(sess.id).then(setUserPermission);
      DBService.logActivity(sess.id, 'VIEW_FILE', book.id, `Opened ${book.name}`);
    }
  }, [book.id]);

  useEffect(() => {
    if (currentPage > 0) localStorage.setItem(`sirca_lp_${book.id}`, currentPage.toString());
  }, [currentPage, book.id]);

  // Persistence (Annotations)
  useEffect(() => {
    const savedNotes = localStorage.getItem(`sirca_notes_${book.id}`);
    if (savedNotes) { try { setAnnotations(JSON.parse(savedNotes)); } catch (e) { } }
  }, [book.id]);

  useEffect(() => {
    if (Object.keys(annotations).length > 0) localStorage.setItem(`sirca_notes_${book.id}`, JSON.stringify(annotations));
  }, [annotations, book.id]);

  const addAnnotation = (page: number, path: AnnotationPath) => {
    setAnnotations(prev => ({
      ...prev,
      [page]: [...(prev[page] || []), path]
    }));
  };

  const undoAnnotation = () => {
    setAnnotations(prev => {
      const paths = prev[currentPage] || [];
      if (paths.length === 0) return prev;
      return { ...prev, [currentPage]: paths.slice(0, -1) };
    });
  };

  const clearPage = () => {
    if (confirm('Şu anki sayfa temizlensin mi?')) setAnnotations(prev => ({ ...prev, [currentPage]: [] }));
  };

  // Responsive Width
  useEffect(() => {
    const updateWidth = () => {
      if (containerRef.current) setContainerWidth(containerRef.current.clientWidth);
    };
    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    if (containerRef.current) observer.observe(containerRef.current);
    window.addEventListener('resize', updateWidth);
    return () => { observer.disconnect(); window.removeEventListener('resize', updateWidth); }
  }, []);

  const handlePageLoad = (page: number, height: number) => {
    setPageHeights(prev => ({ ...prev, [page]: height }));
  };

  // PDF Loading
  useEffect(() => {
    const loadContent = async () => {
      if (book.sourceType === 'FILE' && book.pdfData) {
        try {
          const res = await fetch(book.pdfData);
          const blob = await res.blob();
          const url = URL.createObjectURL(blob);
          setPdfUrl(url);
        } catch (e) {
          setPdfUrl(book.pdfData || null);
        }
      } else {
        setPdfUrl(book.sourceUrl || book.pdfData || null);
      }
    };
    loadContent();
    return () => { if (pdfUrl && book.sourceType === 'FILE') URL.revokeObjectURL(pdfUrl); };
  }, [book]);

  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
    const saved = localStorage.getItem(`sirca_lp_${book.id}`);
    if (saved) {
      const p = parseInt(saved);
      if (p > 1 && p <= numPages) {
        // Delay scroll to allow render
        setTimeout(() => {
          const el = document.getElementById(`page-${p}`);
          if (el) el.scrollIntoView();
        }, 800);
      }
    }
  };

  // Intersection Observer
  useEffect(() => {
    if (!numPages) return;
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const id = entry.target.id;
          const num = parseInt(id.replace('page-', ''));
          if (!isNaN(num)) setCurrentPage(num);
        }
      });
    }, { threshold: 0.1, rootMargin: "-10% 0px -10% 0px" }); // Improved margin for better trigger

    for (let i = 1; i <= numPages; i++) {
      const el = document.getElementById(`page-${i}`);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [numPages, pdfUrl]); // Note: dependency on 'pdfUrl' to re-attach if doc reloads, but persistent divs mean we are safe mostly. 
  // However, if we scroll fast, new divs are already there. The problem is if React unmounts/remounts the wrapper.
  // With the map below, the KEY is stable, so wrapper is stable.

  const handleZoom = (delta: number) => {
    setScale(prev => Math.min(Math.max(0.5, prev + delta), 3.0));
  };

  const handleWheel = (e: React.WheelEvent) => {
    // Zoom on Ctrl + Wheel
    if (e.ctrlKey) {
      if (e.deltaY < 0) handleZoom(0.1);
      else handleZoom(-0.1);
      return;
    }
  };

  const [isPrinting, setIsPrinting] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);

  const handlePrint = async () => {
    let canPrint = false;
    if (userPermission) { canPrint = userPermission.canPrint; }
    else if (currentKey) { canPrint = (currentKey.printLimit > currentKey.printCount); }

    if (!canPrint) { alert("Yazdırma izniniz yok."); return; }

    setIsPrinting(true);
    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    iframe.src = pdfUrl!;
    document.body.appendChild(iframe);

    iframe.onload = () => {
      iframe.contentWindow?.print();
      setTimeout(() => {
        document.body.removeChild(iframe);
        setIsPrinting(false);
        setShowSuccessModal(true);
        if (!userPermission && currentKey) StorageService.updateKeyCount(currentKey.id);
      }, 1000);
    };
  };

  // Focus Protection
  const [isFocused, setIsFocused] = useState(true);
  useEffect(() => {
    const onBlur = () => setIsFocused(false);
    const onFocus = () => setIsFocused(true);
    window.addEventListener('blur', onBlur);
    window.addEventListener('focus', onFocus);
    return () => { window.removeEventListener('blur', onBlur); window.removeEventListener('focus', onFocus); };
  }, []);

  // Block Right Click and Ctrl+P
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'p' || e.key === 'P')) {
        e.preventDefault();
        alert('Yazdırma işlemi sadece buton üzerinden yapılabilir.');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Calculate generic page width/height for placeholders
  const getPageWidth = () => containerWidth > 0 ? Math.min(containerWidth - 32, 1000) : 800;
  // Apply zoom to width? No, width prop handles it usually, but let's be consistent.
  // If we pass 'width' to Page, 'scale' is often secondary. 
  // For 'react-pdf', if width is given, it scales to that width. 
  // If we want to Zoom *in*, we should increase the passed WIDTH.
  const renderedWidth = getPageWidth() * scale;
  const estimatedHeight = renderedWidth * 1.414;

  return (
    <div
      className={`fixed inset-0 bg-slate-900 flex flex-col z-50 select-none ${!isFocused ? 'blur-xl' : ''}`}
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* CSS to ensure Drawing Canvas is always interactive and Text Layer doesn't block it */}


      {/* Sidebar Toolbar */}
      <div className="absolute top-1/2 left-4 md:flex flex-col gap-2 bg-slate-800 border border-slate-600 rounded-xl p-2 hidden transform -translate-y-1/2 shadow-2xl z-[60]">
        <button onClick={() => setToolMode('CURSOR')}
          className={`p-3 rounded-lg transition ${toolMode === 'CURSOR' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-700'}`} title="Seçim / İmleç">
          <i className="fas fa-mouse-pointer"></i>
        </button>

        <div className="w-full h-px bg-slate-700 my-1"></div>

        <button onClick={() => setToolMode('PEN')}
          className={`p-3 rounded-lg transition ${toolMode === 'PEN' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-700'}`} title="Kalem">
          <i className="fas fa-pen"></i>
        </button>

        <button onClick={() => setToolMode('HIGHLIGHTER')}
          className={`p-3 rounded-lg transition ${toolMode === 'HIGHLIGHTER' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-700'}`} title="Vurgulayıcı">
          <i className="fas fa-highlighter"></i>
        </button>

        <button onClick={undoAnnotation}
          className="p-3 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition" title="Geri Al">
          <i className="fas fa-undo"></i>
        </button>
        <button onClick={clearPage}
          className="p-3 rounded-lg text-red-400 hover:text-red-300 hover:bg-red-900/30 transition" title="Sayfayı Temizle">
          <i className="fas fa-trash"></i>
        </button>

        <div className="w-full h-px bg-slate-700 my-1"></div>

        {/* Colors */}
        <div className="flex flex-col gap-2 items-center p-1">
          <button onClick={() => setPenColor('#EF4444')} className={`w-6 h-6 rounded-full bg-red-500 border-2 ${penColor === '#EF4444' ? 'border-white' : 'border-transparent'}`} />
          <button onClick={() => setPenColor('#3B82F6')} className={`w-6 h-6 rounded-full bg-blue-500 border-2 ${penColor === '#3B82F6' ? 'border-white' : 'border-transparent'}`} />
          <button onClick={() => setPenColor('#000000')} className={`w-6 h-6 rounded-full bg-black border-2 border-slate-500 ${penColor === '#000000' ? 'scale-110' : ''}`} />
          <button onClick={() => setPenColor('#10B981')} className={`w-6 h-6 rounded-full bg-green-500 border-2 ${penColor === '#10B981' ? 'border-white' : 'border-transparent'}`} />
        </div>
      </div>

      {/* Top Header */}
      <div className="bg-slate-800 p-4 flex justify-between items-center border-b border-slate-700 shadow-lg shrink-0 z-[60]">
        <div className="flex items-center gap-4">
          <button onClick={onExit} className="text-white hover:bg-slate-700 p-2 rounded"><i className="fas fa-arrow-left"></i></button>
          <h2 className="text-white font-bold truncate max-w-[150px] md:max-w-md">{book.name}</h2>
        </div>
        <div className="flex items-center gap-2">
          <div className="bg-slate-700 rounded flex items-center mr-2">
            <button onClick={() => handleZoom(-0.2)} className="p-2 text-white"><i className="fas fa-minus"></i></button>
            <span className="text-white text-sm w-12 text-center">{Math.round(scale * 100)}%</span>
            <button onClick={() => handleZoom(0.2)} className="p-2 text-white"><i className="fas fa-plus"></i></button>
          </div>

          {/* Mobile Tool Toggle */}
          <div className="md:hidden flex bg-slate-700 rounded-lg p-1">
            <button onClick={() => setToolMode('CURSOR')} className={`p-2 rounded ${toolMode === 'CURSOR' ? 'bg-slate-500 text-white' : 'text-slate-400'}`}><i className="fas fa-mouse-pointer"></i></button>
            <button onClick={() => setToolMode('PEN')} className={`p-2 rounded ${toolMode === 'PEN' ? 'bg-slate-500 text-white' : 'text-slate-400'}`}><i className="fas fa-pen"></i></button>
            <button onClick={() => setToolMode('HIGHLIGHTER')} className={`p-2 rounded ${toolMode === 'HIGHLIGHTER' ? 'bg-slate-500 text-white' : 'text-slate-400'}`}><i className="fas fa-highlighter"></i></button>
          </div>

          <button onClick={handlePrint} className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 ml-2">
            <i className="fas fa-print"></i>
          </button>
        </div>
      </div>

      {/* Scrollable Content */}
      <div ref={containerRef} className="flex-1 overflow-auto bg-slate-500 relative flex flex-col items-center pt-8 pb-24" onWheel={handleWheel}>
        {!isFocused && <div className="fixed inset-0 z-[100] bg-black/50 text-white flex items-center justify-center text-2xl font-bold">Odaklanın</div>}

        {pdfUrl ? (
          <Document file={pdfUrl} onLoadSuccess={onDocumentLoadSuccess} loading={<div className="text-white">Yükleniyor...</div>}>
            {numPages && Array.from(new Array(numPages)).map((_, index) => {
              const pageNum = index + 1;
              // Virtualization: Only render pages around the current one
              // A buffer of 2 above and 2 below is good. 5 pages total.
              const isVisible = Math.abs(pageNum - currentPage) <= 2;
              const height = pageHeights[pageNum] || estimatedHeight;

              return (
                <div key={`page-wrapper-${pageNum}`} id={`page-${pageNum}`} className="mb-4 transition-all duration-300" style={{ minHeight: height, width: renderedWidth }}>
                  {isVisible ? (
                    <SinglePDFPage
                      pageNumber={pageNum}
                      scale={scale} // We handle scale in width calc, but passing scale ensures react-pdf knows
                      width={renderedWidth}
                      toolMode={toolMode}
                      penColor={penColor}
                      annotations={annotations[pageNum] || []}
                      onAnnotationAdd={addAnnotation}
                      onPageLoad={handlePageLoad}
                    />
                  ) : (
                    <div className="bg-slate-400/20 rounded-lg animate-pulse flex items-center justify-center text-slate-400 font-bold text-2xl" style={{ height: height, width: renderedWidth }}>
                      {pageNum}
                    </div>
                  )}
                </div>
              );
            })}
          </Document>
        ) : <div className="text-white">Dosya hazırlanıyor...</div>}
      </div>

      {/* Floating Page Indicator */}
      <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 bg-slate-800/90 text-white px-4 py-2 rounded-full shadow-xl pointer-events-none z-50">
        {currentPage} / {numPages || '-'}
      </div>

      {/* Mobile Floating Colors (Only when drawing) */}
      {toolMode !== 'CURSOR' && (
        <div className="md:hidden fixed bottom-20 left-1/2 transform -translate-x-1/2 flex gap-3 bg-slate-800 p-2 rounded-xl shadow-xl z-50">
          <button onClick={() => setPenColor('#EF4444')} className={`w-8 h-8 rounded-full bg-red-500 border-2 ${penColor === '#EF4444' ? 'border-white' : 'border-transparent'}`} />
          <button onClick={() => setPenColor('#3B82F6')} className={`w-8 h-8 rounded-full bg-blue-500 border-2 ${penColor === '#3B82F6' ? 'border-white' : 'border-transparent'}`} />
          <button onClick={() => setPenColor('#000000')} className={`w-8 h-8 rounded-full bg-black border-2 border-slate-500 ${penColor === '#000000' ? 'border-white' : 'border-transparent'}`} />
          <div className="w-px h-8 bg-slate-600 mx-1"></div>
          <button onClick={undoAnnotation} className="text-slate-300 p-1"><i className="fas fa-undo"></i></button>
        </div>
      )}

      {/* Success Modal */}
      {showSuccessModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80">
          <div className="bg-white p-8 rounded-xl text-center">
            <i className="fas fa-check-circle text-5xl text-green-500 mb-4"></i>
            <h3 className="text-xl font-bold mb-4">Yazdırıldı</h3>
            <button onClick={onExit} className="bg-slate-900 text-white px-6 py-2 rounded">Tamam</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserViewer;
