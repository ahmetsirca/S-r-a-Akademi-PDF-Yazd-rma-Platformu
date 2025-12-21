import React, { useState, useEffect } from 'react';
import { ViewState, PDFBook, AccessKey } from './types';
import { StorageService } from './services/storage';
import AdminDashboard from './components/AdminDashboard';
import UserViewer from './components/UserViewer';

const App: React.FC = () => {
  const [view, setView] = useState<ViewState>('USER_LOGIN');
  const [adminInput, setAdminInput] = useState('');
  const [userKeyInput, setUserKeyInput] = useState('');

  const [activeBook, setActiveBook] = useState<PDFBook | null>(null);
  const [activeKey, setActiveKey] = useState<AccessKey | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // New States for Folder System
  const [folders, setFolders] = useState<import('./types').Folder[]>([]);
  const [folderContent, setFolderContent] = useState<import('./types').FolderContent[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [folderKeyInput, setFolderKeyInput] = useState('');
  // const [selectedContent, setSelectedContent] = useState<import('./types').FolderContent | null>(null); // Unused currently

  // Navigation & Security State
  const [navigationStack, setNavigationStack] = useState<import('./types').Folder[]>([]);
  const [unlockedFolderIds, setUnlockedFolderIds] = useState<string[]>([]);

  useEffect(() => {
    // Initial fetch of data
    fetchInitialData();
  }, []);

  const fetchInitialData = async () => {
    setFolders(await StorageService.getFolders());
  };

  const handleAdminLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (adminInput === StorageService.getAdminPass()) {
      setView('ADMIN_DASHBOARD');
      setAdminInput('');
    } else {
      alert('Hatalı yönetici şifresi');
    }
  };

  const handleFolderClick = async (folder: import('./types').Folder) => {
    // Check if unlocked or requires auth
    // If unlocked, push to stack and view
    if (unlockedFolderIds.includes(folder.id)) {
      setNavigationStack(prev => [...prev, folder]);
      setFolderContent(await StorageService.getFolderContent(folder.id)); // Fetch content for this folder
      setView('USER_FOLDER_VIEW');
    } else {
      // Require Auth
      setSelectedFolderId(folder.id);
      setFolderKeyInput('');
      setView('USER_FOLDER_AUTH');
    }
  };

  const handleFolderLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFolderId) return;

    const keyData = await StorageService.verifyFolderKey(selectedFolderId, folderKeyInput);
    if (keyData) {
      // Success! Unlock ALL folders this key provides access to
      setUnlockedFolderIds(prev => [...new Set([...prev, ...keyData.folderIds])]);

      const folder = folders.find(f => f.id === selectedFolderId);
      if (folder) setNavigationStack(prev => [...prev, folder]);

      setFolderContent(await StorageService.getFolderContent(selectedFolderId));
      setView('USER_FOLDER_VIEW');
    } else {
      alert("Hatalı veya süresi dolmuş şifre!");
    }
  };

  const handleNavigateBack = async () => {
    const newStack = [...navigationStack];
    newStack.pop();
    setNavigationStack(newStack);
    if (newStack.length === 0) {
      setView('USER_LOGIN');
    } else {
      // Refresh content for previous folder
      const prevFolder = newStack[newStack.length - 1];
      setFolderContent(await StorageService.getFolderContent(prevFolder.id));
    }
  };

  const handleUserLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      // Supabase: Verify key directly
      const match = await StorageService.verifyKey(userKeyInput);

      if (match) {
        // Now fetch books asynchronously
        const books = await StorageService.getBooks();
        const book = books.find(b => b.id === match.bookId);

        if (book) {
          setActiveBook(book);
          setActiveKey(match);
          setView('USER_VIEWER');
          setUserKeyInput('');
        } else {
          alert('Bu anahtar için kitap bulunamadı (Silinmiş olabilir).');
        }
      } else {
        alert('Geçersiz Erişim Anahtarı.');
      }
    } catch (err) {
      console.error(err);
      alert('Bir hata oluştu.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleContentClick = (content: import('./types').FolderContent) => {
    if (content.type === 'link') {
      window.open(content.url, '_blank');
    } else {
      // Open PDF in Secure Viewer
      // Mocking a PDFBook object for compatibility
      const mockBook: PDFBook = {
        id: content.id,
        name: content.title,
        collectionId: content.folderId,
        sourceType: 'FILE',
        sourceUrl: content.url,
        createdAt: Date.now()
      };
      // Mock access key (unlimited for folder items)
      const mockKey: AccessKey = {
        id: 'folder-access',
        key: 'folder-key',
        bookId: content.id,
        printLimit: 9999,
        printCount: 0
      };
      setActiveBook(mockBook);
      setActiveKey(mockKey);
      setView('USER_VIEWER');
    }
  };


  return (
    <div className="min-h-screen">
      {/* Nav */}
      {view !== 'USER_VIEWER' && (
        <nav className="p-4 flex justify-between items-center bg-white border-b border-slate-200 sticky top-0 z-50">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => setView('USER_LOGIN')}>
            <div className="bg-blue-600 w-8 h-8 rounded flex items-center justify-center text-white shadow-sm">
              <i className="fas fa-book-open"></i>
            </div>
            <span className="font-bold text-xl text-slate-800 tracking-tight">SIRÇA <span className="text-blue-600">AKADEMİ</span></span>
          </div>
          <div className="flex gap-4">
            <button
              onClick={() => setView('USER_LOGIN')}
              className={`text-sm font-medium transition ${view === 'USER_LOGIN' || view === 'USER_FOLDER_VIEW' ? 'text-blue-600' : 'text-slate-500 hover:text-slate-800'}`}
            >
              Kullanıcı Girişi
            </button>
            <button
              onClick={() => setView('ADMIN_LOGIN')}
              className={`text-sm font-medium transition ${view === 'ADMIN_LOGIN' ? 'text-blue-600' : 'text-slate-500 hover:text-slate-800'}`}
            >
              Yönetici Paneli
            </button>
          </div>
        </nav>
      )}

      {/* Render View */}
      <main>
        {view === 'USER_LOGIN' && (
          <>
            <div className="max-w-4xl mx-auto mt-12 grid md:grid-cols-2 gap-8 px-4">
              {/* Left: Access Key Login */}
              <div className="bg-white p-8 rounded-2xl shadow-xl border border-slate-100 h-fit">
                <div className="text-center mb-8">
                  <div className="bg-blue-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                    <i className="fas fa-key text-2xl text-blue-600"></i>
                  </div>
                  <h1 className="text-2xl font-bold text-slate-800">Kitabını Aç</h1>
                  <p className="text-slate-500 mt-2">Size verilen erişim anahtarını girin.</p>
                </div>
                <form onSubmit={handleUserLogin} className="space-y-6">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">Erişim Anahtarı</label>
                    <input
                      type="password"
                      className="w-full p-4 border rounded-xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 transition"
                      placeholder="••••••••"
                      value={userKeyInput}
                      onChange={(e) => setUserKeyInput(e.target.value)}
                      required
                    />
                  </div>
                  <button
                    disabled={isLoading}
                    className="w-full py-4 bg-blue-600 text-white rounded-xl font-bold text-lg hover:bg-blue-700 shadow-lg shadow-blue-200 transition-all active:scale-[0.98] disabled:opacity-70 disabled:cursor-not-allowed"
                  >
                    {isLoading ? 'Yükleniyor...' : 'PDF\'e Eriş'}
                  </button>
                </form>
                <div className="mt-8 pt-8 border-t border-slate-100 flex items-center justify-center gap-2 text-slate-400 text-sm">
                  <i className="fas fa-shield-alt"></i>
                  <span>Güvenli, sadece yazdırılabilir ortam</span>
                </div>
              </div>

              {/* Right: Derslerim (Folders) */}
              <div>
                <div className="mb-6 flex items-center gap-2">
                  <i className="fas fa-chalkboard-teacher text-blue-600 text-2xl"></i>
                  <h2 className="text-2xl font-bold text-slate-800">Derslerim</h2>
                </div>

                {folders.length === 0 ? (
                  <div className="bg-slate-50 rounded-2xl p-8 text-center border border-slate-200 border-dashed">
                    <p className="text-slate-400">Henüz ders klasörü eklenmemiş.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Only Show Root Folders (parentId is null or 'root' if we used that, assuming null for root) */}
                    {folders.filter(f => !f.parentId).map(f => (
                      <div
                        key={f.id}
                        onClick={() => handleFolderClick(f)}
                        className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 cursor-pointer hover:shadow-md hover:border-blue-300 transition group"
                      >
                        <div className="flex justify-between items-center">
                          <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center group-hover:bg-blue-600 group-hover:text-white transition">
                              <i className="fas fa-folder text-xl"></i>
                            </div>
                            <div>
                              <h3 className="font-bold text-lg text-slate-800">{f.title}</h3>
                              <p className="text-xs text-slate-500">Giriş Yapmak İçin Tıklayın</p>
                            </div>
                          </div>
                          <i className="fas fa-chevron-right text-slate-300 "></i>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Social Media Links - Horizontal Bar */}
            <div className="max-w-4xl mx-auto mt-12 mb-20 px-4">
              <div className="bg-white rounded-full shadow-sm border border-slate-200 p-4 flex justify-around items-center">
                <span className="font-bold text-slate-400 text-sm hidden md:block">BİZİ TAKİP EDİN</span>
                <div className="flex gap-6">
                  <a href="https://www.youtube.com/@komiserimpaemisyon" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-slate-600 hover:text-red-600 transition font-medium">
                    <i className="fab fa-youtube text-2xl"></i> <span className="hidden sm:inline">YouTube</span>
                  </a>
                  <a href="https://www.instagram.com/komiserimpaemisyon/?igsh=MWJkNGpweTY0YWo4cw%3D%3D#" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-slate-600 hover:text-pink-600 transition font-medium">
                    <i className="fab fa-instagram text-2xl"></i> <span className="hidden sm:inline">Instagram</span>
                  </a>
                  <a href="https://t.me/+CTjT_YdxM3tkYWE0" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-slate-600 hover:text-blue-500 transition font-medium">
                    <i className="fab fa-telegram-plane text-2xl"></i> <span className="hidden sm:inline">Telegram</span>
                  </a>
                </div>
              </div>
            </div>
          </>
        )}

        {view === 'USER_FOLDER_AUTH' && selectedFolderId && (
          <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
            <div className="bg-white max-w-md w-full p-8 rounded-3xl shadow-xl">
              <button onClick={() => setView('USER_LOGIN')} className="absolute top-8 left-8 text-slate-400 hover:text-slate-600 mb-6 flex items-center gap-2">
                <i className="fas fa-arrow-left"></i> Geri
              </button>
              <div className="text-center mb-6">
                <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-4">
                  <i className="fas fa-lock text-3xl"></i>
                </div>
                <h3 className="text-xl font-bold text-slate-800">Klasör Şifresi</h3>
                <p className="text-sm text-slate-500">"{folders.find(f => f.id === selectedFolderId)?.title}" klasörünü (ve yetkili olduğunuz diğer klasörleri) görüntülemek için şifrenizi giriniz.</p>
              </div>
              <form onSubmit={handleFolderLogin}>
                <input
                  type="password"
                  autoFocus
                  className="w-full text-center text-2xl tracking-widest p-3 border-b-2 border-slate-200 focus:border-blue-600 outline-none font-mono mb-6"
                  placeholder="******"
                  value={folderKeyInput}
                  onChange={(e) => setFolderKeyInput(e.target.value)}
                />
                <button className="w-full bg-blue-600 text-white py-3 rounded-xl font-bold hover:bg-blue-700 transition">Giriş Yap</button>
              </form>
            </div>
          </div>
        )}

        {view === 'USER_FOLDER_VIEW' && navigationStack.length > 0 && (
          <div className="min-h-screen bg-slate-50">
            <div className="max-w-7xl mx-auto p-4 py-8">
              {/* Header with Breadcrumb */}
              <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 mb-6 flex items-center gap-4">
                <button onClick={handleNavigateBack} className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center hover:bg-slate-200 transition">
                  <i className="fas fa-arrow-left"></i>
                </button>
                <div className="flex items-center gap-2 text-lg font-bold text-slate-700 overflow-x-auto">
                  <span onClick={() => { setNavigationStack([]); setView('USER_LOGIN'); }} className="cursor-pointer hover:text-blue-600 text-slate-400">Derslerim</span>
                  {navigationStack.map((f, i) => (
                    <React.Fragment key={f.id}>
                      <i className="fas fa-chevron-right text-sm text-slate-300"></i>
                      <span onClick={() => {
                        // Navigate to this level
                        setNavigationStack(prev => prev.slice(0, i + 1));
                      }} className={`cursor-pointer ${i === navigationStack.length - 1 ? 'text-slate-800' : 'text-slate-400 hover:text-blue-600'}`}>{f.title}</span>
                    </React.Fragment>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                {/* Subfolders */}
                {folders.filter(f => f.parentId === navigationStack[navigationStack.length - 1].id && unlockedFolderIds.includes(f.id)).map(f => (
                  <button key={f.id} onClick={() => handleFolderClick(f)} className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 hover:border-blue-300 flex items-center gap-3 text-left group">
                    <i className="fas fa-folder text-2xl text-yellow-400 group-hover:scale-110 transition"></i>
                    <span className="font-bold text-slate-700 group-hover:text-blue-600">{f.title}</span>
                  </button>
                ))}
              </div>
              {folders.filter(f => f.parentId === navigationStack[navigationStack.length - 1].id && unlockedFolderIds.includes(f.id)).length > 0 && <hr className="my-8 border-slate-200" />}

              {/* Files */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {folderContent.filter(c => c.folderId === navigationStack[navigationStack.length - 1].id).map(item => (
                  <div key={item.id} onClick={() => handleContentClick(item)} className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 hover:shadow-md cursor-pointer group transition">
                    <div className="flex items-start gap-4">
                      <div className={`w-12 h-12 rounded-lg flex items-center justify-center text-white text-xl ${item.type === 'pdf' ? 'bg-red-500' : 'bg-blue-500'}`}>
                        <i className={`fas ${item.type === 'pdf' ? 'fa-file-pdf' : 'fa-link'}`}></i>
                      </div>
                      <div>
                        <h4 className="font-bold text-slate-800 group-hover:text-blue-600 line-clamp-2">{item.title}</h4>
                        <span className="text-xs text-slate-400 mt-1 block">{new Date(item.createdAt).toLocaleDateString('tr-TR')}</span>
                      </div>
                    </div>
                  </div>
                ))}
                {folderContent.filter(c => c.folderId === navigationStack[navigationStack.length - 1].id).length === 0 && folders.filter(f => f.parentId === navigationStack[navigationStack.length - 1].id && unlockedFolderIds.includes(f.id)).length === 0 && (
                  <div className="col-span-3 text-center text-slate-400 py-12 bg-white rounded-xl border border-dashed border-slate-200">
                    Bu klasörde henüz içerik yok.
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {view === 'ADMIN_LOGIN' && (
          <div className="max-w-md mx-auto mt-20 p-8 bg-white rounded-2xl shadow-xl border border-slate-100">
            <div className="text-center mb-8">
              <div className="bg-slate-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                <i className="fas fa-user-shield text-2xl text-slate-700"></i>
              </div>
              <h1 className="text-2xl font-bold text-slate-800">Yönetici Girişi</h1>
              <p className="text-slate-500 mt-2">Kütüphane ve anahtarları yönetin.</p>
            </div>
            <form onSubmit={handleAdminLogin} className="space-y-6">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Şifre</label>
                <input
                  type="password"
                  className="w-full p-4 border rounded-xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 transition"
                  placeholder="Yönetici şifresi"
                  value={adminInput}
                  onChange={(e) => setAdminInput(e.target.value)}
                  required
                />
              </div>
              <button className="w-full py-4 bg-slate-800 text-white rounded-xl font-bold text-lg hover:bg-slate-900 shadow-lg shadow-slate-200 transition-all">
                Panale Gir
              </button>
            </form>
          </div>
        )}

        {view === 'ADMIN_DASHBOARD' && (
          <AdminDashboard onLogout={() => setView('ADMIN_LOGIN')} />
        )}

        {view === 'USER_VIEWER' && activeBook && activeKey && (
          <UserViewer
            book={activeBook}
            accessKey={activeKey}
            onExit={() => { setView('USER_LOGIN'); setActiveBook(null); setActiveKey(null); }}
          />
        )}
      </main>

      {/* Footer with credit */}
      {
        view !== 'USER_VIEWER' && (
          <footer className="mt-20 text-center pb-8 px-4">
            <p className="text-slate-800 font-bold mb-1">SIRÇA AKADEMİ (KOMİSERİM PAEMİSYON)</p>
            <p className="text-blue-600 font-medium mb-4">Uygulama Şuheda SIRÇA tarafından yapılmıştır.</p>
            <p className="text-slate-400 text-xs">© 2025 • Güvenli Belge Dağıtım Sistemi</p>
          </footer>
        )
      }
    </div >
  );
};

export default App;
