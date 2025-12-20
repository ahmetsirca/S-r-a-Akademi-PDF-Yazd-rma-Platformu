
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
  const printFrameRef = useRef<HTMLIFrameElement>(null);

  const handlePrint = () => {
    if (currentKey.printCount >= currentKey.printLimit) {
      alert("You have reached your print limit (2 times).");
      return;
    }

    // Direct printing from hidden iframe for clean result
    if (printFrameRef.current) {
        try {
            printFrameRef.current.contentWindow?.print();
            StorageService.updateKeyCount(currentKey.id);
            // Refresh local state
            const updatedKeys = StorageService.getKeys();
            const match = updatedKeys.find(k => k.id === currentKey.id);
            if (match) setCurrentKey(match);
        } catch (e) {
            console.error("Print failed", e);
            alert("Printing failed. Please ensure your browser allows printing.");
        }
    }
  };

  // Block basic keyboard shortcuts for saving
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        alert("Downloading is disabled.");
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
    <div className="fixed inset-0 bg-slate-900 flex flex-col z-50">
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
             <span className="text-slate-400 text-xs">Print Quota</span>
             <span className={`text-sm font-bold ${currentKey.printCount >= currentKey.printLimit ? 'text-red-400' : 'text-green-400'}`}>
                {currentKey.printCount} / {currentKey.printLimit} Used
             </span>
          </div>
          <button 
            onClick={handlePrint}
            disabled={currentKey.printCount >= currentKey.printLimit}
            className={`flex items-center gap-2 px-6 py-2 rounded-full font-bold transition ${
              currentKey.printCount >= currentKey.printLimit 
              ? 'bg-slate-700 text-slate-500 cursor-not-allowed' 
              : 'bg-blue-600 text-white hover:bg-blue-700'
            }`}
          >
            <i className="fas fa-print"></i>
            {currentKey.printCount >= currentKey.printLimit ? 'Limit Reached' : 'Print Book'}
          </button>
        </div>
      </div>

      {/* PDF Content Area */}
      <div className="flex-1 relative overflow-hidden bg-slate-950 flex justify-center">
        {/* We use an object tag with parameters to disable toolbars and downloading as much as possible */}
        <object
          data={`${book.pdfData}#toolbar=0&navpanes=0&scrollbar=0`}
          type="application/pdf"
          className="w-full h-full max-w-5xl shadow-2xl"
          onContextMenu={(e) => e.preventDefault()}
        >
          <div className="flex flex-col items-center justify-center h-full text-white p-8 text-center">
            <i className="fas fa-file-pdf text-6xl text-slate-700 mb-4"></i>
            <p className="text-xl">Unable to display PDF directly in this browser.</p>
            <p className="text-slate-400 mt-2">Use the "Print Book" button above to access the content.</p>
          </div>
        </object>

        {/* Hidden printing iframe */}
        <iframe 
            ref={printFrameRef}
            src={book.pdfData}
            style={{ display: 'none', position: 'absolute', width: 0, height: 0 }}
        />
        
        {/* Anti-selection overlay for basic protection */}
        <div className="absolute inset-0 pointer-events-none select-none opacity-10 flex flex-wrap gap-20 p-20 overflow-hidden">
            {Array.from({length: 50}).map((_, i) => (
                <span key={i} className="text-white text-lg rotate-45">SECURE VIEW ONLY</span>
            ))}
        </div>
      </div>
      
      {/* Mobile Footer Info */}
      <div className="md:hidden bg-slate-800 p-2 text-center text-xs text-slate-400">
          Print Quota: {currentKey.printCount} / {currentKey.printLimit} Used
      </div>
    </div>
  );
};

export default UserViewer;
