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
  width: number;       // The High-Res Render Width
  height?: number;     // The Visual Height (for clipping)
  displayScale: number; // The CSS Scale Factor
  toolMode: 'CURSOR' | 'PEN' | 'HIGHLIGHTER' | 'ERASER';
  penColor: string;
  annotations: AnnotationPath[];
  onAnnotationAdd: (page: number, path: AnnotationPath) => void;
  onPageLoad: (page: number, height: number) => void;
  devicePixelRatio?: number;
}

const SinglePDFPage: React.FC<SinglePDFPageProps> = ({ pageNumber, width, height, displayScale, toolMode, penColor, annotations, onAnnotationAdd, onPageLoad, devicePixelRatio }) => {
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
  }, [annotations, width, displayScale]);

  const handlePageLoadSuccess = (page: any) => {
    // page.originalHeight/Width are PDF points
    // We rendered at 'width' pixels.
    // Height in pixels:
    const renderedHeight = page.originalHeight * (width / page.originalWidth);
    onPageLoad(pageNumber, renderedHeight);
  };

  // We define the layout size (Visual) and the Render size (Internal)
  // width = Internal Render Width (High Res)
  // displayScale = scaling down/up to fit screen
  // Layout Width = width * displayScale

  return (
    <div className="relative shadow-lg group origin-top-left bg-white overflow-hidden"
      style={{
        width: width * displayScale,
        height: height ? height : undefined // Strictly enforce height if provided
      }}>

      {/* High-Res Content Container with Transform */}
      <div
        className="origin-top-left"
        style={{
          width: width,
          height: width * 1.414, // Force internal layout height roughly
          transform: `scale(${displayScale})`
        }}
      >
        <Page
          pageNumber={pageNumber}
          width={width}
          scale={1.0} // Render at exactly 'width'
          devicePixelRatio={devicePixelRatio}
          renderAnnotationLayer={false}
          renderTextLayer={true}
          onLoadSuccess={handlePageLoadSuccess}
          onRenderError={(err) => console.error(`Page ${pageNumber} Render Error:`, err)}
          loading={<div className="bg-white w-full" style={{ height: width * 1.41 }} />} // Removed pulse for stability
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
  const contentRef = useRef<HTMLDivElement>(null); // NEW: For CSS Transform
  const [containerWidth, setContainerWidth] = useState<number>(window.innerWidth);

  // --- SEARCH STATE ---
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<number[]>([]); // Page numbers
  const [currentSearchIndex, setCurrentSearchIndex] = useState(0);
  const [isSearching, setIsSearching] = useState(false);

  // --- PAGE JUMP STATE ---
  const [isJumpOpen, setIsJumpOpen] = useState(false);
  const [jumpTarget, setJumpTarget] = useState("");

  // --- PINCH ZOOM STATE (Advanced Focal Point) ---
  const touchStartDist = useRef<number | null>(null);
  const touchStartScale = useRef<number>(1);
  const touchFocalPoint = useRef<{ x: number, y: number, scrollX: number, scrollY: number } | null>(null);

  // Helper: Distance between two touches
  const getTouchDist = (e: React.TouchEvent) => {
    if (e.touches.length < 2) return null;
    const dx = e.touches[0].clientX - e.touches[1].clientX;
    const dy = e.touches[0].clientY - e.touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const getTouchCenter = (e: React.TouchEvent) => {
    if (e.touches.length < 2) return null;
    return {
      x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
      y: (e.touches[0].clientY + e.touches[1].clientY) / 2
    };
  };

  const onTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && containerRef.current) {
      const dist = getTouchDist(e);
      const center = getTouchCenter(e);

      if (dist && center) {
        touchStartDist.current = dist;
        touchStartScale.current = scale;
        // Capture center relative to the container VIEWPORT (not content)
        // actually for transform origin we need it relative to content usually, or rely on translate.
        // Simplified approach: Use CSS Matrix or Transform Origin on the fly.

        // Let's store the raw client coordinates and scroll pos
        touchFocalPoint.current = {
          x: center.x,
          y: center.y,
          scrollX: containerRef.current.scrollLeft, // Usually 0 for flexcol, but good to have
          scrollY: containerRef.current.scrollTop
        };

        // Disable transitions during pinch for 0 latency
        if (contentRef.current) {
          contentRef.current.style.transition = 'none';
        }
      }
    }
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && touchStartDist.current && touchFocalPoint.current && contentRef.current && containerRef.current) {
      e.preventDefault(); // Prevent native browser scaling
      const dist = getTouchDist(e);
      if (dist) {
        const ratio = dist / touchStartDist.current;
        const newTempScale = Math.min(Math.max(0.5, touchStartScale.current * ratio), 3.0);
        const actualRatio = newTempScale / touchStartScale.current;

        // Visual Feedback via CSS only (Performant)
        // We want to scale around the focal point.
        // focal point in screen pixels: touchFocalPoint.current.x, y
        // container bounding rect
        const rect = containerRef.current.getBoundingClientRect();

        // focal relative to container
        const fx = touchFocalPoint.current.x - rect.left;
        const fy = touchFocalPoint.current.y - rect.top;

        // focal relative to content (which is scrolled)
        const contentFx = fx + touchFocalPoint.current.scrollX;
        const contentFy = fy + touchFocalPoint.current.scrollY;

        // Apply Transform
        // 1. Translate so focal point is at origin: translate(-contentFx, -contentFy)
        // 2. Scale
        // 3. Translate back: translate(contentFx, contentFy)
        // But we are moving the DIV. The div is normally at (0,0) offset by scroll.
        // Since we are NOT changing scroll yet, the div is visually at -scrollTop.

        // Simpler: transform-origin at contentFx, contentFy
        contentRef.current.style.transformOrigin = `${contentFx}px ${contentFy}px`;
        contentRef.current.style.transform = `scale(${actualRatio})`;
      }
    }
  };

  const onTouchEnd = () => {
    if (touchStartDist.current && touchFocalPoint.current && contentRef.current && containerRef.current) {
      // Commit the change
      const currentTransform = contentRef.current.style.transform;
      const match = currentTransform.match(/scale\((.+)\)/);
      const cssRatio = match ? parseFloat(match[1]) : 1;

      const oldScale = touchStartScale.current;
      const newScale = Math.min(Math.max(0.5, oldScale * cssRatio), 3.0);

      // Valid Ratio applied
      const ratio = newScale / oldScale;

      // Reset CSS
      contentRef.current.style.transition = '';
      contentRef.current.style.transform = '';
      contentRef.current.style.transformOrigin = '';

      // Update State
      if (newScale !== oldScale) {
        setScale(newScale);

        // ADJUST SCROLL to keep partial stability
        // Formula: newScroll = (oldScroll + focal) * ratio - focal

        const rect = containerRef.current.getBoundingClientRect();
        const fx = touchFocalPoint.current.x - rect.left;
        const fy = touchFocalPoint.current.y - rect.top;

        const oldScrollTop = touchFocalPoint.current.scrollY;
        const oldScrollLeft = touchFocalPoint.current.scrollX;

        // New scroll positions
        let newScrollTop = (oldScrollTop + fy) * ratio - fy;
        const newScrollLeft = (oldScrollLeft + fx) * ratio - fx;

        // REMOVED STRICT BOUNDARY CLAMPING for vertical scroll freedom
        // But we might want some horizontal clamping if needed?
        // Layout 'w-fit mx-auto' handles horizontal centering effectively.
        // Vertical, we just let it be.

        // Apply Scroll immediately
        containerRef.current.scrollTop = newScrollTop;
        containerRef.current.scrollLeft = newScrollLeft;
      }

      touchStartDist.current = null;
      touchFocalPoint.current = null;
    }
  };

  // --- SEARCH LOGIC ---
  const [pdfDocument, setPdfDocument] = useState<any>(null); // Store ref to PDF doc

  const performSearch = async () => {
    if (!query || !pdfDocument || !numPages) return;
    setIsSearching(true);
    setSearchResults([]);
    setCurrentSearchIndex(0);

    const queryLower = query.toLowerCase();
    const results: number[] = [];

    try {
      // Chunked Search to prevent UI freeze
      const batchSize = 10;
      for (let i = 1; i <= numPages; i += batchSize) {
        const promises = [];
        for (let j = 0; j < batchSize && i + j <= numPages; j++) {
          promises.push(pdfDocument.getPage(i + j).then((page: any) =>
            page.getTextContent().then((content: any) => ({
              pageNum: i + j,
              text: content.items.map((item: any) => item.str).join(' ').toLowerCase()
            }))
          ));
        }
        const chunkResults = await Promise.all(promises);
        chunkResults.forEach(res => {
          if (res.text.includes(queryLower)) results.push(res.pageNum);
        });
      }

      setSearchResults(results);
      if (results.length > 0) {
        jumpToPage(results[0]);
      } else {
        alert("Sonuç bulunamadı.");
      }
    } catch (err) {
      console.error("Search Error:", err);
    } finally {
      setIsSearching(false);
    }
  };

  const nextResult = () => {
    if (searchResults.length === 0) return;
    const newIndex = (currentSearchIndex + 1) % searchResults.length;
    setCurrentSearchIndex(newIndex);
    jumpToPage(searchResults[newIndex]);
  };

  const prevResult = () => {
    if (searchResults.length === 0) return;
    const newIndex = (currentSearchIndex - 1 + searchResults.length) % searchResults.length;
    setCurrentSearchIndex(newIndex);
    jumpToPage(searchResults[newIndex]);
  };

  // Variable alias for UI
  const query = searchQuery;

  // --- SCROLL / JUMP LOGIC ---
  const jumpToPage = (pageNum: number) => {
    // 1. Update state to ensure virtualization renders the content
    setCurrentPage(pageNum);

    // 2. Perform Scroll
    // Use timeout to allow React to update the virtualization window if needed
    // Although the "wrapper" is always there, fast scrolling needs the browser to catch up
    setTimeout(() => {
      const el = document.getElementById(`page-${pageNum}`);
      if (el) {
        // block: 'start' aligns it to top. 
        // We use check visibility or just force it.
        el.scrollIntoView({ behavior: 'auto', block: 'start' });
      }
    }, 50);
  };

  const handleJumpSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const p = parseInt(jumpTarget);
    if (!isNaN(p) && p >= 1 && p <= (numPages || 1)) {
      setIsJumpOpen(false);
      setJumpTarget("");
      jumpToPage(p);
    } else {
      alert("Geçersiz sayfa numarası.");
    }
  };

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

  // Scroll-based Page Detection (Replaces IntersectionObserver for robustness)
  const updateCurrentPage = () => {
    if (!containerRef.current || !numPages) return;

    // Calculate the "center" of the view
    const container = containerRef.current;
    const viewTop = container.scrollTop;
    const viewHeight = container.clientHeight;
    const viewCenter = viewTop + (viewHeight / 2);

    // Simple heuristic: Iterate pages to find which one contains the center point
    // Optimization: Since pages are ordered, we can stop once we pass the range
    // Or simpler: Check all, it's cheap for < 500 element references

    let bestPage = currentPage;
    let minDist = Infinity;

    // Optimization: Search neighborhood of current page first? 
    // No, just full scan is fine for typical PDF sizes (DOM access is fast enough)
    // Actually, getting offsetTop triggers reflow if layout changed.
    // To avoid layout thrashing, rely on the fact that container is scrolling.

    // Better strategy: just loop all.
    for (let i = 1; i <= numPages; i++) {
      const el = document.getElementById(`page-${i}`);
      if (el) {
        const top = el.offsetTop;
        const bottom = top + el.clientHeight;

        // Check if center line is within this page
        if (viewCenter >= top && viewCenter <= bottom) {
          bestPage = i;
          break;
        }

        // Fallback: simple closest distance to center
        const dist = Math.abs((top + el.clientHeight / 2) - viewCenter);
        if (dist < minDist) {
          minDist = dist;
          bestPage = i;
        }
      }
    }

    if (bestPage !== currentPage) {
      setCurrentPage(bestPage);
    }
  };

  // Ref to store the requestAnimationFrame ID
  const rAFRef = useRef<number | null>(null);

  // Scroll Handler for Auto-Hiding UI AND Page Tracking
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const currentScrollY = e.currentTarget.scrollTop;

    // 1. UI Auto-Hide
    if (Math.abs(currentScrollY - lastScrollY.current) > 10) {
      if (currentScrollY > lastScrollY.current && currentScrollY > 50) {
        setShowControls(false);
      } else {
        setShowControls(true);
      }
      lastScrollY.current = currentScrollY;
    }

    // 2. Update Page Tracking (Throttled via RequestAnimationFrame)
    if (rAFRef.current === null) { // Only schedule if not already scheduled
      rAFRef.current = requestAnimationFrame(() => {

        // --- SCROLL TRAP REMOVED ---
        // User requested ability to scroll to other pages while zoomed.
        // We only track the current page for virtualization purposes.

        updateCurrentPage();
        rAFRef.current = null; // Reset the ref after execution
      });
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
        // Delay needed for initial render cycle
        setTimeout(() => jumpToPage(p), 500);
      }
    }
  };

  // REMOVED IntersectionObserver - Replaced by Scroll Tracking in handleScroll

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
  // RENDER SCALE: Increased to 3.0x (Ultra Quality) to handle zoom up to 300% without blur.
  const RENDER_QUALITY = 3.0;
  const getPageWidth = () => containerWidth > 0 ? Math.min(containerWidth - 32, 1000) : 800;

  // The actual pixels we render into the canvas (High Res)
  // We cap at 4096px which is safe for almost all mobile browsers (Max Texture Size)
  const renderedWidth = Math.min(getPageWidth() * RENDER_QUALITY, 4096);

  // The CSS scale applied to show the user the correct size
  // Formula: UserScale / (RenderedWidth / PageWidth)
  // Roughly: UserScale / RENDER_QUALITY (if not capped)
  const effectiveRenderScale = renderedWidth / getPageWidth();
  const displayScale = scale / effectiveRenderScale;

  // Layout Height for Virtualization (This must match the VISUAL height in DOM)
  // pageHeights stores the HIGH RES height (from onPageLoad)
  // So visual height = highResHeight * displayScale

  const estimatedHeight = (renderedWidth * 1.414) * displayScale;

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

          <button onClick={() => setIsSearchOpen(!isSearchOpen)} className="text-slate-300 hover:text-white p-2 rounded">
            <i className="fas fa-search"></i>
          </button>

          <h2 className="text-white font-bold truncate max-w-[100px] md:max-w-md hidden md:block">{book.name}</h2>
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

      {/* Search Bar - Slides down under header */}
      <div className={`absolute top-[70px] left-0 right-0 bg-slate-800 p-2 z-[55] flex items-center gap-2 justify-center transition-all duration-300 shadow-md ${isSearchOpen ? 'translate-y-0 opacity-100' : '-translate-y-10 opacity-0 pointer-events-none'}`}>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Ara..."
          className="bg-slate-700 text-white px-3 py-1 rounded w-40 md:w-64 focus:outline-none focus:ring-1 focus:ring-blue-500"
          onKeyDown={(e) => e.key === 'Enter' && performSearch()}
        />
        <button onClick={() => performSearch()} className="text-white p-2">
          {isSearching ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-search"></i>}
        </button>
        {searchResults.length > 0 && (
          <span className="text-white text-xs">{currentSearchIndex + 1} / {searchResults.length}</span>
        )}
        <button onClick={prevResult} disabled={searchResults.length === 0} className="text-white p-2 disabled:opacity-30"><i className="fas fa-chevron-left"></i></button>
        <button onClick={nextResult} disabled={searchResults.length === 0} className="text-white p-2 disabled:opacity-30"><i className="fas fa-chevron-right"></i></button>
        <button onClick={() => setIsSearchOpen(false)} className="text-slate-400 p-2"><i className="fas fa-times"></i></button>
      </div>

      {/* Page Jump Modal */}
      {isJumpOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50" onClick={() => setIsJumpOpen(false)}>
          <div className="bg-slate-800 p-6 rounded-xl shadow-2xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-white font-bold mb-4">Sayfaya Git</h3>
            <form onSubmit={handleJumpSubmit} className="flex gap-2">
              <input
                type="number"
                min={1}
                max={numPages || 1}
                value={jumpTarget}
                onChange={(e) => setJumpTarget(e.target.value)}
                className="bg-slate-700 text-white p-2 rounded w-24 text-center"
                autoFocus
              />
              <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded font-bold">Git</button>
            </form>
          </div>
        </div>
      )}

      {/* Scrollable Content with Touch Events */}
      <div
        ref={containerRef}
        className="flex-1 overflow-auto bg-slate-500 relative flex flex-col pt-20 pb-20 md:pt-8 md:pb-8 transition-all duration-300 overscroll-none touch-pan-x touch-pan-y"
        onWheel={handleWheel}
        onScroll={handleScroll}
        onClick={handleContentClick}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        <div ref={contentRef} className="flex flex-col min-w-full items-stretch transition-transform duration-75 origin-top-left"> {/* Inner Wrapper for Transform */}
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
                key={pdfDocument ? 'loaded' : pdfUrl} // Simple key
                file={pdfUrl}
                options={options}
                onLoadSuccess={(pdf) => {
                  setPdfDocument(pdf); // Save doc ref for search
                  onDocumentLoadSuccess({ numPages: pdf.numPages });
                }}
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
                  // Virtualization: Window size 10 to ensure pages are always ready
                  const isVisible = Math.abs(pageNum - currentPage) <= 10;

                  // Height Logic: pageHeights has High-Res Height. Convert to Visual.
                  const highResHeight = pageHeights[pageNum];
                  const visualHeight = highResHeight ? highResHeight * displayScale : estimatedHeight;

                  // Zoom Isolation Style
                  // If zoomed, hide others or dim them.
                  const isZoomed = scale > 1.05;
                  const isCurrent = pageNum === currentPage;

                  const wrapperStyle = isZoomed && isCurrent
                    ? "shadow-[0_0_100px_rgba(0,0,0,0.5)] z-10"
                    : "opacity-100"; // Removed dimming to allow seeing neighbor pages

                  return (
                    <div
                      key={pageNum}
                      id={`page-${pageNum}`}
                      className={`relative w-fit mx-auto transition-all duration-300 mb-1 pdf-page-wrapper ${wrapperStyle}`}
                      style={{ minHeight: visualHeight }}
                    >
                      {isVisible ? (
                        <SinglePDFPage
                          pageNumber={pageNum}
                          width={renderedWidth} // Pass Fixed High-Res Width
                          height={visualHeight} // Pass Visual Height for clipping
                          displayScale={displayScale} // Pass CSS Scale
                          toolMode={toolMode}
                          penColor={penColor}
                          annotations={annotations[pageNum] || []}
                          onAnnotationAdd={addAnnotation}
                          onPageLoad={handlePageLoad}
                          devicePixelRatio={1} // Cap to 1 since we handle scaling manually via width
                        />
                      ) : (
                        <div className="bg-slate-400/20 rounded-lg animate-pulse flex items-center justify-center text-slate-400 font-bold text-2xl" style={{ height: visualHeight, width: renderedWidth * displayScale }}>
                          {pageNum}
                        </div>
                      )}
                    </div>
                  );
                })}
              </Document>
            )
          ) : <div className="text-white">Dosya hazırlanıyor...</div>}
          <div className="absolute inset-x-0 top-0 h-2 bg-gradient-to-b from-black/20 to-transparent pointer-events-none md:hidden" /> {/* Mobile shadow hint */}
        </div> {/* End Inner Wrapper */}
      </div>

      {/* Current Page Indicator / Jump Trigger */}
      <div className="absolute bottom-16 left-1/2 transform -translate-x-1/2 bg-slate-800/90 px-4 py-2 rounded-full text-white text-sm font-bold shadow-lg z-[160] transition-opacity duration-300 backdrop-blur-sm cursor-pointer hover:bg-slate-700"
        onClick={() => { setIsJumpOpen(true); setJumpTarget(currentPage.toString()); }}
        style={{ opacity: showControls ? 1 : 0, pointerEvents: showControls ? 'auto' : 'none' }}>
        {currentPage} / {numPages || '-'}
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
