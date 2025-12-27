import React, { useState, useEffect, useRef } from 'react';
import { PDFBook, AccessKey } from '../types';
import { StorageService } from '../services/storage';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/esm/Page/AnnotationLayer.css';
import 'react-pdf/dist/esm/Page/TextLayer.css';
// import '../index.css'; // Removed: Tailwind is loaded via CDN

// Set worker source - Use Vite's explicit URL import for perfect pathing
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker;

import { DBService } from '../services/db';
import { AuthService } from '../services/auth';

// Types for Annotation
interface AnnotationPath {
  points: { x: number, y: number }[];
  type: 'PEN' | 'HIGHLIGHTER' | 'ERASER';
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
  devicePixelRatio?: number;
}

const SinglePDFPage: React.FC<SinglePDFPageProps> = ({ pageNumber, scale, width, toolMode, penColor, annotations, onAnnotationAdd, onPageLoad, devicePixelRatio }) => {
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

        if (toolMode === 'ERASER') {
          ctx.globalAlpha = 1.0;
          ctx.globalCompositeOperation = 'destination-out';
          ctx.lineWidth = 20;
          ctx.strokeStyle = 'rgba(0,0,0,1)';
        } else if (toolMode === 'HIGHLIGHTER') {
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
        type: toolMode === 'ERASER' ? 'ERASER' : (toolMode === 'HIGHLIGHTER' ? 'HIGHLIGHTER' : 'PEN'),
        color: toolMode === 'HIGHLIGHTER' && penColor === '#000000' ? '#FFFF00' : penColor,
        width: toolMode === 'HIGHLIGHTER' || toolMode === 'ERASER' ? 20 : 3
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

      if (ann.type === 'ERASER') {
        ctx.globalAlpha = 1.0;
        ctx.globalCompositeOperation = 'destination-out';
        ctx.lineWidth = ann.width || 20;
        ctx.strokeStyle = 'rgba(0,0,0,1)';
      } else if (ann.type === 'HIGHLIGHTER') {
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
        scale={scale}
        devicePixelRatio={devicePixelRatio} // Apply cap
        renderAnnotationLayer={false}
        renderTextLayer={true}
        onLoadSuccess={handlePageLoadSuccess}
        onRenderError={(err) => console.error(`Page ${pageNumber} Render Error:`, err)}
        loading={<div className="bg-white animate-pulse w-full" style={{ height: width * 1.41 }} />}
        error={<div className="flex items-center justify-center text-red-400 h-96">Sayfa Yüklenemedi</div>}
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
  // New Props for external control
  allowPrint?: boolean;
  onPrintDecrement?: () => void;
}

const UserViewer: React.FC<UserViewerProps> = ({ book, accessKey, isDeviceVerified = true, onExit, allowPrint = false, onPrintDecrement }) => {
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

  // Auto-switch color for Highlighter
  useEffect(() => {
    if (toolMode === 'HIGHLIGHTER') {
      setPenColor('#F59E0B'); // Switch to Yellow
    } else if (toolMode === 'PEN' && penColor === '#F59E0B') {
      setPenColor('#EF4444'); // Switch back to Red if coming from Highlighter
    }
  }, [toolMode]);

  const [annotations, setAnnotations] = useState<Record<number, AnnotationPath[]>>({});
  const [loadError, setLoadError] = useState(false);

  // Memoize options to prevent unnecessary re-renders of Document
  const options = React.useMemo(() => ({
    cMapUrl: '/cmaps/',
    cMapPacked: true,
    standardFontDataUrl: '/standard_fonts/'
  }), []);

  useEffect(() => {
    console.log('UserViewer MOUNTED');
    console.log('Book:', book);
    console.log('PDF URL:', pdfUrl);
    console.log('NumPages:', numPages);
  }, [book, pdfUrl, numPages]);

  // Virtualization State
  const [pageHeights, setPageHeights] = useState<Record<number, number>>({});

  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState<number>(window.innerWidth);

  // Mobile UI & Fullscreen State
  const [showControls, setShowControls] = useState(true);
  const lastScrollY = useRef(0);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch((err) => {
        console.error(`Error attempting to enable fullscreen: ${err.message}`);
      });
      setIsFullscreen(true);
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
        setIsFullscreen(false);
      }
    }
  };

  // Scroll Handler for Auto-Hiding UI
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const currentScrollY = e.currentTarget.scrollTop;

    // Threshold to prevent jitter
    if (Math.abs(currentScrollY - lastScrollY.current) > 10) {
      if (currentScrollY > lastScrollY.current && currentScrollY > 50) {
        // Scrolling Down - Hide
        setShowControls(false);
      } else {
        // Scrolling Up - Show
        setShowControls(true);
      }
      lastScrollY.current = currentScrollY;
    }
  };

  // Toggle controls on tap (if not drawing)
  const handleContentClick = () => {
    if (toolMode === 'CURSOR') {
      setShowControls(prev => !prev);
    }
  };

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

  /* Fix: Use callback to prevent infinite render loop */
  const handlePageLoad = React.useCallback((page: number, height: number) => {
    setPageHeights(prev => {
      // Use Math.round to ignore microscopic float differences (e.g. 800.00000001 vs 800)
      if (prev[page] && Math.round(prev[page]) === Math.round(height)) return prev;
      return { ...prev, [page]: height };
    });
  }, []);

  // PDF Loading
  useEffect(() => {
    if (book.sourceType === 'FILE' && book.pdfData) {
      // Direct URL is better for caching and memory
      setPdfUrl(book.pdfData);
    } else {
      setPdfUrl(book.sourceUrl || book.pdfData || null);
    }
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
  }, [numPages, pdfUrl]);

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
    let limitMessage = "";

    // 1. Check Database Permissions (logged in user)
    if (userPermission) {
      const globalCanPrint = userPermission.canPrint;
      const fileLimit = userPermission.printLimits?.[book.id];

      // If specific limit exists, it takes precedence
      if (fileLimit !== undefined) {
        if (fileLimit > 0) {
          canPrint = true;
          limitMessage = `Kalan yazdırma hakkınız: ${fileLimit}`;
        } else {
          // Explicit block via limit
          limitMessage = "Bu dosya için yazdırma limitiniz doldu.";
        }
      } else if (globalCanPrint) {
        canPrint = true;
      } else {
        // If not permitted, set message (but don't block yet, other methods might allow)
        // limitMessage = "Yazdırma izniniz yok."; 
      }
    }

    // 2. Check Legacy Access Key (Additive)
    if (!canPrint && currentKey) {
      if (currentKey.printLimit > currentKey.printCount) {
        canPrint = true;
        limitMessage = ""; // Clear rejection message if allowed
      } else {
        limitMessage = "Anahtar yazdırma limitiniz doldu.";
      }
    }

    // 3. New Prop Override (Additive)
    // This allows Folder Keys or App.tsx calculated permissions to override rejection
    if (!canPrint && allowPrint) {
      canPrint = true;
      limitMessage = ""; // Clear rejection message
    }

    if (!canPrint) { alert(limitMessage || "Yazdırma izniniz yok."); return; }

    if (limitMessage && !confirm(`${limitMessage} Yazdırmak istiyor musunuz?`)) return;

    if (!pdfUrl) return;

    setIsPrinting(true);

    try {
      // PROFESSIONAL PRINTING METHOD: Fetch > Blob > Iframe
      const response = await fetch(pdfUrl);
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);

      const iframe = document.createElement('iframe');
      iframe.style.display = 'none';
      iframe.src = blobUrl;
      document.body.appendChild(iframe);

      iframe.onload = () => {
        // Delay needed for Chrome/Firefox to render Blob URL in iframe before print
        setTimeout(() => {
          iframe.contentWindow?.print();
          setTimeout(() => {
            document.body.removeChild(iframe);
            URL.revokeObjectURL(blobUrl);
            setIsPrinting(false);
          }, 10000); // 10s wait for print interaction

          setShowSuccessModal(true);

          if (userPermission && userId) {
            DBService.decrementPrintLimit(userId, book.id);
            setUserPermission(prev => {
              if (!prev || !prev.printLimits) return prev;
              const current = prev.printLimits[book.id];
              if (typeof current === 'number') {
                return { ...prev, printLimits: { ...prev.printLimits, [book.id]: Math.max(0, current - 1) } };
              }
              return prev;
            });
          } else if (!userPermission && currentKey) {
            StorageService.updateKeyCount(currentKey.id);
          } else if (onPrintDecrement) {
            onPrintDecrement();
          }

        }, 500);
      };
    } catch (e) {
      console.error("Print Error:", e);
      alert("Yazdırma sırasında bir hata oluştu.");
      setIsPrinting(false);
    }
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
  const renderedWidth = getPageWidth() * scale;
  const estimatedHeight = renderedWidth * 1.414;

  return (
    <div
      className={`fixed top-0 left-0 w-full h-[100dvh] bg-slate-900 flex flex-col z-50 select-none ${!isFocused ? 'blur-xl' : ''}`}
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* Sidebar Toolbar - Desktop */}
      <div className={`absolute top-1/2 left-4 md:flex flex-col gap-2 bg-slate-800 border border-slate-600 rounded-xl p-2 hidden transform -translate-y-1/2 shadow-2xl z-[60] transition-opacity duration-300 ${showControls ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}>
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

        <button onClick={() => setToolMode('ERASER')}
          className={`p-3 rounded-lg transition ${toolMode === 'ERASER' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-700'}`} title="Silgi">
          <i className="fas fa-eraser"></i>
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
      <div className={`bg-slate-800 p-4 flex justify-between items-center border-b border-slate-700 shadow-lg shrink-0 z-[60] transition-transform duration-300 absolute w-full md:relative ${showControls ? 'translate-y-0' : '-translate-y-full md:translate-y-0'}`}>
        <div className="flex items-center gap-4">
          <button onClick={onExit} className="text-white hover:bg-slate-700 p-2 rounded"><i className="fas fa-arrow-left"></i></button>
          <h2 className="text-white font-bold truncate max-w-[150px] md:max-w-md">{book.name}</h2>
        </div>
        <div className="flex items-center gap-2">
          {/* Fullscreen Toggle (Mobile/Desktop) */}
          <button onClick={toggleFullscreen} className="bg-slate-700 text-white p-2 rounded hover:bg-slate-600 hidden md:block" title="Tam Ekran">
            <i className={`fas ${isFullscreen ? 'fa-compress' : 'fa-expand'}`}></i>
          </button>

          <div className="bg-slate-700 rounded flex items-center mr-2">
            <button onClick={() => handleZoom(-0.2)} className="p-2 text-white"><i className="fas fa-minus"></i></button>
            <span className="text-white text-sm w-12 text-center">{Math.round(scale * 100)}%</span>
            <button onClick={() => handleZoom(0.2)} className="p-2 text-white"><i className="fas fa-plus"></i></button>
          </div>

          <button onClick={handlePrint} className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 ml-2">
            <i className="fas fa-print"></i>
          </button>
        </div>
      </div>

      {/* Scrollable Content */}
      <div
        ref={containerRef}
        className="flex-1 overflow-auto bg-slate-500 relative flex flex-col items-center pt-20 pb-20 md:pt-8 md:pb-8 transition-all duration-300"
        onWheel={handleWheel}
        onScroll={handleScroll}
        onClick={handleContentClick}
      >
        {!isFocused && <div className="fixed inset-0 z-[100] bg-black/50 text-white flex items-center justify-center text-2xl font-bold">Odaklanın</div>}

        {pdfUrl ? (
          // Error Fallback: If React-PDF fails, show native Iframe
          loadError ? (
            <div className="w-full h-full flex flex-col items-center justify-center p-4">
              <div className="bg-red-500/10 text-red-400 p-4 rounded-lg mb-4 text-center">
                <p className="font-bold">Gelişmiş görüntüleyici açılamadı.</p>
                <p className="text-sm">Standart görüntüleyiciye geçiliyor...</p>
              </div>
              <iframe
                src={pdfUrl}
                className="w-full h-[80vh] bg-white rounded-lg shadow-xl"
                title="PDF Viewer"
              />
            </div>
          ) : (
            <Document
              key={pdfUrl} // Force remount if URL changes
              file={pdfUrl}
              options={options}
              onLoadSuccess={onDocumentLoadSuccess}
              onLoadError={(err) => {
                console.error("PDF Load Error:", err);
                // Switch to generic iframe fallback instead of just alerting
                setLoadError(true);
              }}
              loading={<div className="text-white text-center mt-20"><i className="fas fa-spinner fa-spin text-4xl mb-4"></i><p>Dosya Hazırlanıyor...</p></div>}
              error={null} // Handle error manually via state
            >
              {numPages && Array.from(new Array(numPages)).map((_, index) => {
                const pageNum = index + 1;
                // Virtualization: Only render pages around the current one
                const isVisible = Math.abs(pageNum - currentPage) <= 2;
                const height = pageHeights[pageNum] || estimatedHeight;

                return (
                  <div key={`page-wrapper-${pageNum}`} id={`page-${pageNum}`} className="mb-4 transition-all duration-300" style={{ minHeight: height, width: renderedWidth }}>
                    {isVisible ? (
                      <SinglePDFPage
                        pageNumber={pageNum}
                        scale={scale}
                        width={renderedWidth}
                        toolMode={toolMode}
                        penColor={penColor}
                        annotations={annotations[pageNum] || []}
                        onAnnotationAdd={addAnnotation}
                        onPageLoad={handlePageLoad}
                        devicePixelRatio={Math.min(window.devicePixelRatio || 1, 2)} // Cap DPI to 2 to prevent mobile canvas crash
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
          )
        ) : <div className="text-white">Dosya hazırlanıyor...</div>}
      </div>

      {/* Mobile Bottom Toolbar (Unified) - Increased Z-Index to prevent Canvas blockage */}
      <div className={`md:hidden fixed bottom-0 left-0 right-0 bg-slate-900 border-t border-slate-700 p-2 z-[150] pb-6 transition-transform duration-300 ${showControls ? 'translate-y-0' : 'translate-y-full'}`}>
        <div className="flex justify-between items-center px-4">
          {/* Tools */}
          <div className="flex gap-2">
            <button
              onClick={() => setToolMode('CURSOR')}
              className={`flex flex-col items-center p-2 rounded-lg transition ${toolMode === 'CURSOR' ? 'text-blue-500 bg-blue-500/10' : 'text-slate-400'}`}
            >
              <i className="fas fa-mouse-pointer text-xl mb-1"></i>
              <span className="text-[10px]">Seç</span>
            </button>
            <button
              onClick={() => setToolMode('PEN')}
              className={`flex flex-col items-center p-2 rounded-lg transition ${toolMode === 'PEN' ? 'text-blue-500 bg-blue-500/10' : 'text-slate-400'}`}
            >
              <i className="fas fa-pen text-xl mb-1"></i>
              <span className="text-[10px]">Kalem</span>
            </button>
            <button
              onClick={() => setToolMode('HIGHLIGHTER')}
              className={`flex flex-col items-center p-2 rounded-lg transition ${toolMode === 'HIGHLIGHTER' ? 'text-blue-500 bg-blue-500/10' : 'text-slate-400'}`}
            >
              <i className="fas fa-highlighter text-xl mb-1"></i>
              <span className="text-[10px]">Fosforlu</span>
            </button>
            <button
              onClick={() => setToolMode('ERASER')}
              className={`flex flex-col items-center p-2 rounded-lg transition ${toolMode === 'ERASER' ? 'text-blue-500 bg-blue-500/10' : 'text-slate-400'}`}
            >
              <i className="fas fa-eraser text-xl mb-1"></i>
              <span className="text-[10px]">Silgi</span>
            </button>
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <button onClick={toggleFullscreen} className="p-3 text-slate-300 active:text-white bg-slate-800 rounded-lg"><i className={`fas ${isFullscreen ? 'fa-compress' : 'fa-expand'}`}></i></button>
            <button onClick={undoAnnotation} className="p-3 text-slate-300 active:text-white"><i className="fas fa-undo text-lg"></i></button>
            <div className="w-px h-8 bg-slate-700 mx-1 self-center"></div>
            {/* Active Color Preview */}
            <div className="relative group">
              <button
                className="w-10 h-10 rounded-full border-2 border-white shadow-sm flex items-center justify-center"
                style={{ backgroundColor: penColor }}
                onClick={() => {
                  // Cycle colors
                  const colors = ['#EF4444', '#3B82F6', '#000000', '#10B981'];
                  const idx = colors.indexOf(penColor);
                  setPenColor(colors[(idx + 1) % colors.length]);
                }}
              >
              </button>
            </div>
          </div>
        </div>

        {/* Expanded Colors (Visible if Pen/Highlighter Active) */}
        {(toolMode === 'PEN' || toolMode === 'HIGHLIGHTER') && (
          <div className="flex justify-center gap-4 mt-3 pb-2 border-t border-slate-800 pt-2">
            {['#EF4444', '#3B82F6', '#000000', '#10B981', '#F59E0B'].map(c => (
              <button
                key={c}
                onClick={() => setPenColor(c)}
                className={`w-8 h-8 rounded-full shadow-lg transform transition ${penColor === c ? 'scale-125 border-2 border-white' : 'scale-100 border border-transparent'}`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        )}
      </div>

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
